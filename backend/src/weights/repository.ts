import { pool } from '../db/pool';
import { AppError } from '../errors';
import { validateWeights, type Weights } from '../scoring';

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