export const CRITERIA = [
  'new_customer',
  'commercial_interest',
  'lead_source',
  'seniority',
] as const;
export type CriterionKey = (typeof CRITERIA)[number];

/** Pesos en % enteros. Tras validar: no negativos, sin duplicados, suma exacta 100. */
export type Weights = Record<CriterionKey, number>;

/** Lo mínimo que necesita el motor. Todo opcional a posta: pueden faltar los datos. */
export interface LeadScoringInput {
  isNewCustomer?: boolean | null;
  interest?: string | null;
  source?: string | null;
  createdAt?: Date | string | null;
}

export type RatingReason = 'ok' | 'missing' | 'invalid';
export type Priority = 'alta' | 'media' | 'baja';

export interface BreakdownItem {
  criterion: CriterionKey;
  rating: number;        // valoración normalizada 0-100
  weight: number;        // % vigente
  contribution: number;  // rating × weight / 100
  reason: RatingReason;  // para explicar en la UI si el dato faltaba o era inválido
}

export interface ScoreResult {
  score: number;         // 0-100, con 2 decimales
  priority: Priority;
  breakdown: BreakdownItem[];
}