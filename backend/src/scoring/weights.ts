import { CRITERIA, type CriterionKey, type Weights } from './types';

export type WeightsValidation =
  | { ok: true; weights: Weights }
  | { ok: false; errors: string[] };

export function validateWeights(input: unknown): WeightsValidation {
  const errors: string[] = [];
  if (!Array.isArray(input)) {
    return { ok: false, errors: ['La configuración debe ser una lista de criterios.'] };
  }

  const seen = new Set<string>();
  const result: Partial<Record<CriterionKey, number>> = {};

  for (const item of input) {
    const criterion = (item as { criterion?: unknown })?.criterion;
    const weight = (item as { weight?: unknown })?.weight;

    if (typeof criterion !== 'string' || !(CRITERIA as readonly string[]).includes(criterion)) {
      errors.push(`Criterio desconocido: ${String(criterion)}.`);
      continue;
    }
    if (seen.has(criterion)) {
      errors.push(`Criterio duplicado: ${criterion}.`);
      continue;
    }
    seen.add(criterion);

    if (typeof weight !== 'number' || !Number.isInteger(weight)) {
      errors.push(`El peso de ${criterion} debe ser un número entero.`);
    } else if (weight < 0) {
      errors.push(`El peso de ${criterion} no puede ser negativo.`);
    } else if (weight > 100) {
      errors.push(`El peso de ${criterion} no puede superar 100.`);
    } else {
      result[criterion as CriterionKey] = weight;
    }
  }

  for (const c of CRITERIA) {
    if (!seen.has(c)) errors.push(`Falta el criterio: ${c}.`);
  }

  if (errors.length === 0) {
    const sum = CRITERIA.reduce((acc, c) => acc + result[c]!, 0);
    if (sum !== 100) errors.push(`Los pesos deben sumar exactamente 100 (suman ${sum}).`);
  }

  return errors.length ? { ok: false, errors } : { ok: true, weights: result as Weights };
}