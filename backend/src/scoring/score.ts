import { rateCriterion } from './criteria';
import {
  CRITERIA, type BreakdownItem, type LeadScoringInput, type Priority, type ScoreResult, type Weights,
} from './types';

export const HIGH_THRESHOLD = 75;
export const MEDIUM_THRESHOLD = 40;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Se decide sobre la puntuación YA redondeada, la que ve el usuario. */
export function priorityFor(score: number): Priority {
  if (score >= HIGH_THRESHOLD) return 'alta';
  if (score >= MEDIUM_THRESHOLD) return 'media';
  return 'baja';
}

/**
 * puntuación = Σ (valoración × peso / 100).
 * Función pura: `now` se inyecta (sin Date.now() oculto) para que sea testeable y determinista.
 */
export function computeScore(lead: LeadScoringInput, weights: Weights, now: Date): ScoreResult {
  let raw = 0;
  const breakdown: BreakdownItem[] = CRITERIA.map((criterion) => {
    const { value, reason } = rateCriterion(criterion, lead, now);
    const weight = weights[criterion];
    raw += (value * weight) / 100;
    return {
      criterion,
      rating: round2(value),
      weight,
      contribution: round2((value * weight) / 100),
      reason,
    };
  });

  const score = round2(Math.min(100, Math.max(0, raw)));
  return { score, priority: priorityFor(score), breakdown };
}