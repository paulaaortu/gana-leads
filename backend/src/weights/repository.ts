import { pool } from '../db/pool';
import { withTransaction } from '../db/transaction';
import { AppError } from '../errors';
import type { Agent } from '../middleware/auth';
import { CRITERIA, CRITERIA_INFO, MISSING_DATA_RULE, validateWeights, type Weights } from '../scoring';
import type { SaveWeightsInput } from './schemas';

/** Pesos activos ya validados, para calcular puntuaciones. Si están corruptos → 503 predecible. */
export async function loadActiveWeights(): Promise<{ configId: number; weights: Weights }> {
  const { rows } = await pool.query<{ config_id: number; criterion: string; weight: number }>(
    `SELECT c.id AS config_id, i.criterion, i.weight
       FROM weight_configs c JOIN weight_config_items i ON i.config_id = c.id
      WHERE c.is_active`,
  );
  if (rows.length === 0) {
    throw new AppError(503, 'WEIGHTS_CONFIG_INVALID', 'No hay una configuración de pesos activa.');
  }
  const check = validateWeights(rows.map((r) => ({ criterion: r.criterion, weight: r.weight })));
  if (!check.ok) {
    throw new AppError(503, 'WEIGHTS_CONFIG_INVALID', 'La configuración de pesos activa no es válida.', check.errors);
  }
  return { configId: rows[0]!.config_id, weights: check.weights };
}

/**
 * Vista de la configuración activa para la pantalla de administración.
 * A diferencia de loadActiveWeights, NO falla si está corrupta: informa de `valid` y `errors`
 * para que el administrador pueda ver el problema y repararlo.
 */
export async function getWeightsConfig() {
  const { rows } = await pool.query<{
    config_id: number;
    created_at: Date;
    created_by: number | null;
    created_by_name: string | null;
    criterion: string | null;
    weight: number | null;
  }>(
    `SELECT c.id AS config_id, c.created_at, c.created_by, a.name AS created_by_name, i.criterion, i.weight
       FROM weight_configs c
       LEFT JOIN weight_config_items i ON i.config_id = c.id
       LEFT JOIN agents a ON a.id = c.created_by
      WHERE c.is_active`,
  ); // una sola sentencia: instantánea consistente

  const first = rows[0];
  const weights = rows
    .filter((r) => r.criterion !== null)
    .map((r) => ({ criterion: r.criterion as string, weight: r.weight as number }))
    .sort((a, b) => CRITERIA.indexOf(a.criterion as never) - CRITERIA.indexOf(b.criterion as never));

  let valid = false;
  let errors: string[] = ['No hay ninguna configuración de pesos activa.'];
  if (first) {
    const check = validateWeights(weights);
    valid = check.ok;
    errors = check.ok ? [] : check.errors;
  }

  return {
    configId: first?.config_id ?? null,
    createdAt: first?.created_at ?? null,
    createdBy: first?.created_by ? { id: first.created_by, name: first.created_by_name! } : null,
    weights,
    valid,
    errors,
    criteria: CRITERIA.map((criterion) => ({ criterion, ...CRITERIA_INFO[criterion] })),
    missingDataRule: MISSING_DATA_RULE,
  };
}

export async function saveWeights(input: SaveWeightsInput, caller: Agent) {
  // 1. Validar el contenido ANTES de tocar nada. Todos los errores juntos.
  const check = validateWeights(input.weights);
  if (!check.ok) {
    throw new AppError(400, 'INVALID_WEIGHTS', 'La configuración de pesos no es válida.', check.errors);
  }
  const { weights } = check;

  await withTransaction(async (client) => {
    // 2. Cerrojo de transacción: dos guardados simultáneos se atienden uno detrás de otro.
    //    Se libera solo al terminar (COMMIT o ROLLBACK).
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('weight_configs'))`);

    // 3. Bloqueo optimista: ¿sigue activa la configuración sobre la que se basó el cliente?
    //    Esta lectura ya ve lo que haya confirmado quien tenía el cerrojo antes.
    const active = await client.query<{ id: number }>('SELECT id FROM weight_configs WHERE is_active');
    const currentId = active.rows[0]?.id ?? null;
    if (currentId !== null && currentId !== input.baseConfigId) {
      throw new AppError(
        409,
        'CONFIG_CONFLICT',
        'Otro administrador ha cambiado los pesos desde que abriste la pantalla. Recarga y revisa los cambios.',
        { currentConfigId: currentId },
      );
    }

    // 4. Cambio atómico: desactivar la anterior y activar la nueva en la MISMA transacción.
    //    (Si no hay ninguna activa —configuración corrupta— se permite crear la primera.)
    if (currentId !== null) {
      await client.query('UPDATE weight_configs SET is_active = false WHERE id = $1', [currentId]);
    }
    const created = await client.query<{ id: number }>(
      'INSERT INTO weight_configs (is_active, created_by) VALUES (true, $1) RETURNING id',
      [caller.id],
    );
    await client.query(
      `INSERT INTO weight_config_items (config_id, criterion, weight)
       SELECT $1, c, w FROM unnest($2::text[], $3::int[]) AS t(c, w)`,
      [created.rows[0]!.id, [...CRITERIA], CRITERIA.map((c) => weights[c])],
    );
  });

  return getWeightsConfig();
}