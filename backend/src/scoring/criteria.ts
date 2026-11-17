import type { CriterionKey, LeadScoringInput, RatingReason } from './types';

export interface Rating {
  value: number; // siempre un número finito entre 0 y 100
  reason: RatingReason;
}

/* ── REGLAS DE NEGOCIO ─────────────────────────
 * Dato ausente (null/undefined/'') → valoración 0, reason 'missing'.
 * Dato inválido (fuera del dominio) → valoración 0, reason 'invalid'.
 * Es una penalización deliberada por falta de información. Nunca hay excepción ni NaN.
 */
export const INTEREST_RATINGS: Record<string, number> = { low: 0, medium: 50, high: 100 };
export const SOURCE_RATINGS: Record<string, number> = { referral: 100, web: 70, event: 50, cold: 20 };
/** Antigüedad: lineal de 0 a 100 entre 0 y SENIORITY_CAP_DAYS días enteros; más allá, 100. */
export const SENIORITY_CAP_DAYS = 90;
/* ─────────────────────────────────────────────────────────────────────────── */

const MISSING: Rating = { value: 0, reason: 'missing' };
const INVALID: Rating = { value: 0, reason: 'invalid' };
const MS_PER_DAY = 86_400_000;

export function rateNewCustomer(lead: LeadScoringInput): Rating {
  const v = lead.isNewCustomer;
  if (v === null || v === undefined) return MISSING;
  if (typeof v !== 'boolean') return INVALID;
  return { value: v ? 100 : 0, reason: 'ok' };
}

function rateFromTable(raw: unknown, table: Record<string, number>): Rating {
  if (raw === null || raw === undefined || raw === '') return MISSING;
  if (typeof raw !== 'string' || !Object.hasOwn(table, raw)) return INVALID;
  return { value: table[raw]!, reason: 'ok' };
}

export const rateInterest = (lead: LeadScoringInput) => rateFromTable(lead.interest, INTEREST_RATINGS);
export const rateSource = (lead: LeadScoringInput) => rateFromTable(lead.source, SOURCE_RATINGS);

export function rateSeniority(lead: LeadScoringInput, now: Date): Rating {
  const raw = lead.createdAt;
  if (raw === null || raw === undefined) return MISSING;
  const created = raw instanceof Date ? raw : new Date(raw);
  const ms = created.getTime();
  if (Number.isNaN(ms)) return INVALID;

  // Días ENTEROS: el score solo cambia una vez al día, no a cada segundo.
  // Fechas futuras cuentan como 0 días.
  const days = Math.max(0, Math.floor((now.getTime() - ms) / MS_PER_DAY));
  const value = Math.min(100, (days / SENIORITY_CAP_DAYS) * 100);
  return { value, reason: 'ok' };
}

export function rateCriterion(criterion: CriterionKey, lead: LeadScoringInput, now: Date): Rating {
  switch (criterion) {
    case 'new_customer': return rateNewCustomer(lead);
    case 'commercial_interest': return rateInterest(lead);
    case 'lead_source': return rateSource(lead);
    case 'seniority': return rateSeniority(lead, now);
  }
}