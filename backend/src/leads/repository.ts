import { pool } from '../db/pool';
import { AppError } from '../errors';
import { priorityFor } from '../scoring';
import type { ListQuery } from './schemas';
import { CFG_CTE, scoreSql } from './scoreSql';
import { computeScore } from '../scoring';
import { loadActiveWeights } from '../weights/repository';
import type { CreateLeadInput, UpdateLeadInput } from './schemas';

interface Row {
  id: string;            // BIGSERIAL: pg lo devuelve como string
  name: string;
  phone: string;
  status: string;
  agent_id: number | null;
  agent_name: string | null;
  version: number;
  updated_at: Date;
  score: number;
  config_id: number;
  total: string;         // count(*) también llega como string
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');

export async function listLeads(q: ListQuery, now: Date) {
  const params: unknown[] = [now.toISOString()]; // $1 = "ahora" de la petición
  const p = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  const where: string[] = [];
  if (q.status) where.push(`l.status = ${p(q.status)}`);
  if (q.agent === 'unassigned') where.push('l.agent_id IS NULL');
  else if (q.agent !== undefined) where.push(`l.agent_id = ${p(q.agent)}`);
  if (q.q) {
    const like = p(`%${escapeLike(q.q)}%`);
    where.push(`(l.name ILIKE ${like} ESCAPE '\\' OR l.phone LIKE ${like} ESCAPE '\\')`);
  }

  const direction = q.sort === 'score_asc' ? 'ASC' : 'DESC'; // lista blanca: nunca va texto del usuario
  const limit = p(q.pageSize);
  const offset = p((q.page - 1) * q.pageSize);

  const sql = `
    WITH ${CFG_CTE}
    SELECT l.id, l.name, l.phone, l.status, l.agent_id, a.name AS agent_name,
           l.version, l.updated_at,
           (${scoreSql('$1')})::float8 AS score,
           cfg.id AS config_id,
           count(*) OVER () AS total
      FROM leads l
      CROSS JOIN cfg
      LEFT JOIN agents a ON a.id = l.agent_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY score ${direction}, l.id ASC
     LIMIT ${limit} OFFSET ${offset}`;

  const { rows } = await pool.query<Row>(sql, params);

  if (rows.length === 0) await assertValidActiveConfig();

  return {
    data: rows.map((r) => ({
      id: Number(r.id),
      name: r.name,
      phone: r.phone,
      status: r.status,
      agent: r.agent_id ? { id: r.agent_id, name: r.agent_name! } : null,
      version: r.version,
      updatedAt: r.updated_at,
      score: r.score,
      priority: priorityFor(r.score),
    })),
    page: q.page,
    pageSize: q.pageSize,
    // Si la página pedida está fuera de rango no hay filas y total llega como 0.
    total: Number(rows[0]?.total ?? 0),
    weightsConfigId: rows[0]?.config_id ?? null,
  };
}

/** Si no salió ninguna fila, distingue "no hay leads" de "no hay configuración de pesos válida". */
async function assertValidActiveConfig() {
  const { rowCount } = await pool.query(`WITH ${CFG_CTE} SELECT 1 FROM cfg`);
  if (!rowCount) {
    throw new AppError(503, 'WEIGHTS_CONFIG_INVALID', 'No hay una configuración de pesos activa y válida.');
  }
}

interface LeadRow {
  id: string;
  name: string;
  phone: string;
  status: string;
  agent_id: number | null;
  agent_name: string | null;
  is_new_customer: boolean | null;
  interest: string | null;
  source: string | null;
  created_at: Date;
  updated_at: Date;
  version: number;
}

/** Detalle con puntuación y desglose, calculados con el motor y los pesos activos. */
export async function getLeadDetail(id: number, now: Date) {
  const { rows } = await pool.query<LeadRow>(
    `SELECT l.*, a.name AS agent_name
       FROM leads l LEFT JOIN agents a ON a.id = l.agent_id
      WHERE l.id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) throw new AppError(404, 'LEAD_NOT_FOUND', 'El lead no existe.');

  const { configId, weights } = await loadActiveWeights();
  const result = computeScore(
    { isNewCustomer: row.is_new_customer, interest: row.interest, source: row.source, createdAt: row.created_at },
    weights,
    now,
  );

  return {
    id: Number(row.id),
    name: row.name,
    phone: row.phone,
    status: row.status,
    agent: row.agent_id ? { id: row.agent_id, name: row.agent_name! } : null,
    isNewCustomer: row.is_new_customer,
    interest: row.interest,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
    score: result.score,
    priority: result.priority,
    breakdown: result.breakdown,
    weightsConfigId: configId,
  };
}

/** Estado inicial y agente los fija el servidor: el cliente no decide ni el estado, ni el agente, ni la fecha. */
export async function createLead(input: CreateLeadInput) {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO leads (name, phone, is_new_customer, interest, source)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [input.name, input.phone, input.isNewCustomer ?? null, input.interest ?? null, input.source ?? null],
  );
  return getLeadDetail(Number(rows[0]!.id), new Date());
}

// Lista blanca de columnas editables: los nombres de columna nunca vienen del cliente.
const EDITABLE_COLUMNS = {
  name: 'name',
  phone: 'phone',
  isNewCustomer: 'is_new_customer',
  interest: 'interest',
  source: 'source',
} as const;

export async function updateLead(id: number, input: UpdateLeadInput) {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [key, column] of Object.entries(EDITABLE_COLUMNS)) {
    const value = (input as Record<string, unknown>)[key];
    if (value !== undefined) {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    }
  }
  params.push(id);
  const idParam = `$${params.length}`;
  params.push(input.version);
  const versionParam = `$${params.length}`;

  // Comprobación y escritura en UNA sentencia: atómico, sin ventana de carrera.
  const { rowCount } = await pool.query(
    `UPDATE leads
        SET ${sets.join(', ')}, updated_at = now(), version = version + 1
      WHERE id = ${idParam} AND version = ${versionParam}`,
    params,
  );

  if (!rowCount) {
    // Ninguna fila actualizada: o no existe, o la versión estaba desactualizada.
    const current = await pool.query<{ version: number }>('SELECT version FROM leads WHERE id = $1', [id]);
    if (!current.rowCount) throw new AppError(404, 'LEAD_NOT_FOUND', 'El lead no existe.');
    throw new AppError(
      409,
      'VERSION_CONFLICT',
      'El lead ha sido modificado por otra persona desde que lo abriste. Recarga y vuelve a intentarlo.',
      { currentVersion: current.rows[0]!.version },
    );
  }
  return getLeadDetail(id, new Date());
}