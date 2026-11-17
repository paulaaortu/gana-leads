import { describe, expect, it } from 'vitest';
import { computeScore, priorityFor } from './score';
import type { Weights } from './types';

const W: Weights = { new_customer: 40, commercial_interest: 30, lead_source: 20, seniority: 10 };
const NOW = new Date('2026-11-17T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const seniorityRating = (createdAt: Date) =>
  computeScore({ createdAt }, W, NOW).breakdown.find((b) => b.criterion === 'seniority')!.rating;

describe('computeScore', () => {
  it('lead perfecto → 100 / alta', () => {
    const r = computeScore({ isNewCustomer: true, interest: 'high', source: 'referral', createdAt: daysAgo(120) }, W, NOW);
    expect(r.score).toBe(100);
    expect(r.priority).toBe('alta');
  });

  it('lead vacío → 0 / baja, sin NaN, con todos los datos marcados como ausentes', () => {
    const r = computeScore({}, W, NOW);
    expect(r.score).toBe(0);
    expect(r.priority).toBe('baja');
    expect(r.breakdown.every((b) => b.reason === 'missing')).toBe(true);
  });

  it('valores inválidos puntúan 0 y se marcan como inválidos', () => {
    const r = computeScore({ interest: 'altísimo', source: 42 as unknown as string, createdAt: 'no-es-fecha' }, W, NOW);
    expect(r.score).toBe(0);
    expect(r.breakdown.filter((b) => b.reason === 'invalid')).toHaveLength(3);
  });

  it('calcula la suma ponderada: 100·0.4 + 50·0.3 + 70·0.2 + 50·0.1 = 74', () => {
    const r = computeScore({ isNewCustomer: true, interest: 'medium', source: 'web', createdAt: daysAgo(45) }, W, NOW);
    expect(r.score).toBe(74);
    expect(r.priority).toBe('media');
  });

  it('el desglose suma la puntuación final (salvo redondeo)', () => {
    const r = computeScore({ isNewCustomer: false, interest: 'high', source: 'event', createdAt: daysAgo(10) }, W, NOW);
    const sum = r.breakdown.reduce((a, b) => a + b.contribution, 0);
    expect(Math.abs(sum - r.score)).toBeLessThan(0.05);
  });

  it('cambiar los pesos cambia el resultado', () => {
    const lead = { isNewCustomer: true, interest: 'low', source: 'cold', createdAt: daysAgo(0) };
    const a = computeScore(lead, W, NOW).score;
    const b = computeScore(lead, { new_customer: 10, commercial_interest: 30, lead_source: 30, seniority: 30 }, NOW).score;
    expect(a).not.toBe(b);
  });

  it('antigüedad: fecha futura = 0 y tope en 100', () => {
    expect(seniorityRating(new Date(NOW.getTime() + 5 * 86_400_000))).toBe(0);
    expect(seniorityRating(daysAgo(10_000))).toBe(100);
  });

  it('antigüedad: cuenta días enteros (45 días y 23 horas = 45 días)', () => {
    expect(seniorityRating(new Date(NOW.getTime() - (45 * 24 + 23) * 3_600_000))).toBe(50);
  });

  it('es determinista: mismos datos y mismo "now" → mismo resultado', () => {
    const lead = { isNewCustomer: true, interest: 'medium', source: 'web', createdAt: daysAgo(33) };
    expect(computeScore(lead, W, NOW)).toEqual(computeScore(lead, W, NOW));
  });
});

describe('priorityFor (umbrales)', () => {
  it.each([
    [100, 'alta'], [75, 'alta'], [74.99, 'media'], [40, 'media'], [39.99, 'baja'], [0, 'baja'],
  ])('%s → %s', (score, expected) => {
    expect(priorityFor(score)).toBe(expected);
  });
});