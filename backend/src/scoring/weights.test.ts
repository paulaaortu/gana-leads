import { describe, expect, it } from 'vitest';
import { validateWeights } from './weights';

const valid = [
  { criterion: 'new_customer', weight: 40 },
  { criterion: 'commercial_interest', weight: 30 },
  { criterion: 'lead_source', weight: 20 },
  { criterion: 'seniority', weight: 10 },
];

describe('validateWeights', () => {
  it('acepta la configuración inicial 40/30/20/10', () => {
    expect(validateWeights(valid).ok).toBe(true);
  });

  it('rechaza pesos negativos', () => {
    const r = validateWeights(valid.map((v) => (v.criterion === 'new_customer' ? { ...v, weight: -10 } : v)));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toContain('negativo');
  });

  it('rechaza una suma distinta de 100', () => {
    const r = validateWeights(valid.map((v) => (v.criterion === 'seniority' ? { ...v, weight: 11 } : v)));
    expect(r).toEqual({ ok: false, errors: ['Los pesos deben sumar exactamente 100 (suman 101).'] });
  });

  it('rechaza criterios duplicados', () => {
    const r = validateWeights([...valid, { criterion: 'seniority', weight: 0 }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toContain('duplicado');
  });

  it('rechaza criterios desconocidos y criterios que faltan', () => {
    const r = validateWeights([{ criterion: 'inventado', weight: 100 }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toContain('Falta el criterio');
  });

  it('rechaza decimales, strings, NaN y null', () => {
    for (const bad of [33.3, '40', Number.NaN, null]) {
      const r = validateWeights(valid.map((v) => (v.criterion === 'new_customer' ? { ...v, weight: bad } : v)));
      expect(r.ok).toBe(false);
    }
  });

  it('rechaza entradas que no son una lista', () => {
    expect(validateWeights(undefined).ok).toBe(false);
    expect(validateWeights({}).ok).toBe(false);
  });
});