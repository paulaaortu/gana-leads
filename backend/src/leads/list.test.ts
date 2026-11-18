import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { pool } from '../db/pool';
import { computeScore } from '../scoring';
import { loadActiveWeights } from '../weights/repository';
import { listLeads } from './repository';
import type { ListQuery } from './schemas';

const base = (o: Partial<ListQuery> = {}): ListQuery => ({ sort: 'score_desc', page: 1, pageSize: 20, ...o });
const app = createApp();

afterAll(() => pool.end());

describe('listado de leads (requiere `npm run seed`)', () => {
  it('ordena por score descendente con desempate por id ascendente', async () => {
    const { data } = await listLeads(base({ pageSize: 100 }), new Date());
    expect(data.length).toBeGreaterThan(1);
    for (let i = 1; i < data.length; i++) {
      const a = data[i - 1]!, b = data[i]!;
      expect(a.score > b.score || (a.score === b.score && a.id < b.id)).toBe(true);
    }
  });

  it('el score calculado en SQL coincide con el del motor TypeScript', async () => {
    const { weights } = await loadActiveWeights();
    const now = new Date();
    const first = await listLeads(base({ pageSize: 100 }), now);
    const rows = [...first.data];
    for (let page = 2; rows.length < first.total; page++) {
      rows.push(...(await listLeads(base({ page, pageSize: 100 }), now)).data);
    }
    expect(rows.length).toBe(first.total);

    const { rows: raw } = await pool.query('SELECT id, is_new_customer, interest, source, created_at FROM leads');
    const byId = new Map(raw.map((r) => [Number(r.id), r]));
    for (const r of rows) {
      const l = byId.get(r.id)!;
      const ts = computeScore(
        { isNewCustomer: l.is_new_customer, interest: l.interest, source: l.source, createdAt: l.created_at },
        weights,
        now,
      );
      expect(r.score).toBeCloseTo(ts.score, 2);
      expect(r.priority).toBe(ts.priority);
    }
  });

  it('filtra por estado', async () => {
    const { data, total } = await listLeads(base({ status: 'cerrado', pageSize: 100 }), new Date());
    expect(total).toBeGreaterThan(0);
    expect(data.every((l) => l.status === 'cerrado')).toBe(true);
  });

  it('filtra los leads sin asignar', async () => {
    const { data, total } = await listLeads(base({ agent: 'unassigned', pageSize: 100 }), new Date());
    expect(total).toBeGreaterThan(0);
    expect(data.every((l) => l.agent === null)).toBe(true);
  });

  it('busca por nombre sin distinguir mayúsculas', async () => {
    const { data, total } = await listLeads(base({ q: 'torres', pageSize: 100 }), new Date());
    expect(total).toBeGreaterThan(0);
    expect(data.every((l) => l.name.toLowerCase().includes('torres'))).toBe(true);
  });

  it('los comodines LIKE del usuario se escapan (buscar "%" no devuelve todo)', async () => {
    const { total } = await listLeads(base({ q: '%' }), new Date());
    expect(total).toBe(0);
  });

  it('la paginación no repite ni salta filas', async () => {
    const now = new Date();
    const p1 = await listLeads(base({ page: 1, pageSize: 20 }), now);
    const p2 = await listLeads(base({ page: 2, pageSize: 20 }), now);
    const all = await listLeads(base({ page: 1, pageSize: 40 }), now);
    expect([...p1.data, ...p2.data].map((l) => l.id)).toEqual(all.data.map((l) => l.id));
  });
});

describe('GET /api/leads (HTTP)', () => {
  it('sin identidad → 401', async () => {
    const res = await request(app).get('/api/leads');
    expect(res.status).toBe(401);
  });

  it('pageSize fuera de rango → 400 con detalle', async () => {
    const res = await request(app).get('/api/leads?pageSize=1000').set('X-Agent-Id', '2');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('respuesta válida con la forma esperada', async () => {
    const res = await request(app).get('/api/leads?pageSize=5').set('X-Agent-Id', '2');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(5);
    expect(res.body).toMatchObject({ page: 1, pageSize: 5 });
    expect(['alta', 'media', 'baja']).toContain(res.body.data[0].priority);
  });
});