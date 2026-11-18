import { pool } from '../db/pool';
import { AppError } from '../errors';
import { priorityFor } from '../scoring';
import type { ListQuery } from './schemas';
import { CFG_CTE, scoreSql } from './scoreSql';

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