import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { pool } from '../db/pool';

const app = createApp();
const createdIds: number[] = [];

afterAll(async () => {
  if (createdIds.length) await pool.query('DELETE FROM leads WHERE id = ANY($1::bigint[])', [createdIds]);
  await pool.end();
});

const api = {
  create: (body: object) => request(app).post('/api/leads').set('X-Agent-Id', '2').send(body),
  patch: (id: number, body: object) => request(app).patch(`/api/leads/${id}`).set('X-Agent-Id', '2').send(body),
  get: (id: number) => request(app).get(`/api/leads/${id}`).set('X-Agent-Id', '2'),
};

async function newLead(extra: object = {}) {
  const res = await api.create({ name: 'Test Lead', phone: '600 11 22 33', interest: 'low', ...extra });
  expect(res.status).toBe(201);
  createdIds.push(res.body.id);
  return res.body;
}

describe('crear leads', () => {
  it('crea un lead válido: estado nuevo, sin agente, versión 1, con desglose', async () => {
    const lead = await newLead();
    expect(lead).toMatchObject({ status: 'nuevo', agent: null, version: 1, phone: '600112233' });
    expect(lead.breakdown).toHaveLength(4);
    expect(lead.score).toBeGreaterThanOrEqual(0);
  });

  it.each([
    ['score', { score: 100 }],
    ['status', { status: 'cerrado' }],
    ['agentId', { agentId: 3 }],
    ['createdAt', { createdAt: '2020-01-01' }],
    ['version', { version: 99 }],
  ])('rechaza el campo no permitido «%s» (la puntuación no es manipulable)', async (_name, extra) => {
    const res = await api.create({ name: 'Hack', phone: '600111222', ...extra });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rechaza nombre vacío y teléfono inválido', async () => {
    expect((await api.create({ name: '  ', phone: '600111222' })).status).toBe(400);
    expect((await api.create({ name: 'Ok', phone: 'abc' })).status).toBe(400);
  });

  it('rechaza valores fuera de dominio', async () => {
    expect((await api.create({ name: 'Ok', phone: '600111222', interest: 'altisimo' })).status).toBe(400);
  });
});

describe('detalle', () => {
  it('lead inexistente → 404 y id mal formado → 400', async () => {
    expect((await api.get(999_999_999)).status).toBe(404);
    const bad = await request(app).get('/api/leads/abc').set('X-Agent-Id', '2');
    expect(bad.status).toBe(400);
  });

  it('el desglose suma la puntuación', async () => {
    const lead = await newLead({ isNewCustomer: true, source: 'web', interest: 'medium' });
    const sum = lead.breakdown.reduce((a: number, b: { contribution: number }) => a + b.contribution, 0);
    expect(Math.abs(sum - lead.score)).toBeLessThan(0.05);
  });
});

describe('editar leads con bloqueo optimista', () => {
  it('edita con la versión correcta: sube la versión y cambia el score', async () => {
    const lead = await newLead();
    const res = await api.patch(lead.id, { version: lead.version, interest: 'high' });
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(2);
    expect(res.body.score).toBeGreaterThan(lead.score);
  });

  it('con una versión desactualizada → 409 e informa de la versión actual', async () => {
    const lead = await newLead();
    await api.patch(lead.id, { version: 1, name: 'Primera edicion' });
    const stale = await api.patch(lead.id, { version: 1, name: 'Edicion con datos viejos' });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    expect(stale.body.error.details.currentVersion).toBe(2);
    expect((await api.get(lead.id)).body.name).toBe('Primera edicion'); // no se perdió el cambio
  });

  it('dos ediciones simultáneas con la misma versión: exactamente una gana', async () => {
    const lead = await newLead();
    const [a, b] = await Promise.all([
      api.patch(lead.id, { version: 1, name: 'Editor A' }),
      api.patch(lead.id, { version: 1, name: 'Editor B' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const final = (await api.get(lead.id)).body;
    expect(final.version).toBe(2);
    expect(['Editor A', 'Editor B']).toContain(final.name);
  });

  it('null borra el dato; sin cambios o con campos extraños → 400; inexistente → 404', async () => {
    const lead = await newLead({ interest: 'high' });
    const cleared = await api.patch(lead.id, { version: 1, interest: null });
    expect(cleared.body.interest).toBeNull();
    expect(cleared.body.breakdown.find((b: { criterion: string }) => b.criterion === 'commercial_interest').reason).toBe('missing');

    expect((await api.patch(lead.id, { version: 2 })).status).toBe(400);
    expect((await api.patch(lead.id, { version: 2, score: 100 })).status).toBe(400);
    expect((await api.patch(999_999_999, { version: 1, name: 'X' })).status).toBe(404);
  });
});