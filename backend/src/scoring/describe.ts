import { INTEREST_RATINGS, SENIORITY_CAP_DAYS, SOURCE_RATINGS } from './criteria';
import type { CriterionKey } from './types';

const list = (table: Record<string, number>, names: Record<string, string>) =>
  Object.entries(table)
    .map(([key, value]) => `${names[key] ?? key} ${value}`)
    .join(', ');

/** Etiquetas y reglas legibles de cada criterio, generadas desde las constantes de criteria.ts. */
export const CRITERIA_INFO: Record<CriterionKey, { label: string; rule: string }> = {
  new_customer: { label: 'Cliente nuevo', rule: 'Sí → 100, no → 0.' },
  commercial_interest: {
    label: 'Interés comercial',
    rule: `${list(INTEREST_RATINGS, { low: 'bajo', medium: 'medio', high: 'alto' })}.`,
  },
  lead_source: {
    label: 'Origen del lead',
    rule: `${list(SOURCE_RATINGS, { referral: 'referido', web: 'web', event: 'evento', cold: 'frío' })}.`,
  },
  seniority: {
    label: 'Antigüedad',
    rule: `Lineal en días enteros hasta 100 a los ${SENIORITY_CAP_DAYS} días; fecha futura → 0.`,
  },
};

export const MISSING_DATA_RULE = 'Dato ausente o inválido → 0.';