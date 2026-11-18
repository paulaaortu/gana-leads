import { INTEREST_RATINGS, SENIORITY_CAP_DAYS, SOURCE_RATINGS } from '../scoring';

/**
 * Réplica en SQL de computeScore (src/scoring). Se GENERA desde las mismas constantes de
 * criteria.ts para que las reglas vivan en un solo sitio. Las constantes son del código
 * (nunca entrada del usuario), por eso es seguro interpolarlas.
 */
const caseFrom = (column: string, table: Record<string, number>) =>
  `CASE ${column} ${Object.entries(table).map(([k, v]) => `WHEN '${k}' THEN ${v}`).join(' ')} ELSE 0 END`;

/** Pesos activos en una fila. Solo existe si la configuración activa es válida (4 criterios, suma 100). */
export const CFG_CTE = `
cfg AS (
  SELECT c.id,
    max(i.weight) FILTER (WHERE i.criterion = 'new_customer')        AS w_new_customer,
    max(i.weight) FILTER (WHERE i.criterion = 'commercial_interest') AS w_commercial_interest,
    max(i.weight) FILTER (WHERE i.criterion = 'lead_source')         AS w_lead_source,
    max(i.weight) FILTER (WHERE i.criterion = 'seniority')           AS w_seniority
  FROM weight_configs c
  JOIN weight_config_items i ON i.config_id = c.id
  WHERE c.is_active
  GROUP BY c.id
  HAVING count(*) = 4 AND sum(i.weight) = 100
)`;

/** nowParam: placeholder del "ahora" de la petición (p. ej. '$1'). Un único now por petición. */
export const scoreSql = (nowParam: string) => `ROUND((
    (CASE WHEN l.is_new_customer THEN 100 ELSE 0 END) * cfg.w_new_customer
  + (${caseFrom('l.interest', INTEREST_RATINGS)}) * cfg.w_commercial_interest
  + (${caseFrom('l.source', SOURCE_RATINGS)}) * cfg.w_lead_source
  + LEAST(100, GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (${nowParam}::timestamptz - l.created_at)) / 86400)) * 100.0 / ${SENIORITY_CAP_DAYS}) * cfg.w_seniority
) / 100.0, 2)`;