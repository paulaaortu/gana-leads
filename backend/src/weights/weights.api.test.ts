import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { pool } from '../db/pool';

const app = createApp();
const ADMIN = 1;
let originalId: number;
const createdLeadIds: number[] = [];

const as = (agentId: number) => {
  const h = String(agentId);
  return {
    getWeights: () => request(app).get('/api/weights').set('X-Agent-Id', h),
    putWeights: (body: object) => request(app).put('/api/weights').set('X-Agent-Id', h).send(body),
    list: (query = '') => request(app).get(`/api/leads${query}`).set('X-Agent-Id', h),
    getLead: (id: number) => request(app).get(`/api/leads/${id}`).set('X-Agent-Id', h),
    createLead: (body: object) => request(app).post('/api/leads').set('X-Agent-Id', h).send(body),
  };
};

const w = (nuevo: number, interes: number, origen: number, antig: number) => [
  { criterion: 'new_customer', weight: nuevo },
  { criterion: 'commercial_interest', weight: interes },
  { criterion: 'lead_source', weight: origen },
  { criterion: 'seniority', weight: antig },
];

const currentId = async () => (await as(ADMIN).getWeights()).body.configId as number;

beforeAll(async () => {
  originalId = await currentId();
});

// Deja la base como estaba: borra las configuraciones creadas por los tests y reactiva la original.
afterAll(async () => {
  if (createdLeadIds.length) await pool.query('DELETE FROM leads WHERE id = ANY($1::bigint[])', [createdLeadIds]);
  await pool.query('DELETE FROM weight_configs WHERE id > $1', [originalId]);
  await pool.query('UPDATE weight_configs SET is_active = true WHERE id = $1', [originalId]);
  await pool.end();
});

describe('GET /api/weights', () => {
  it('cualquier usuario autenticado la lee: 4 pesos que suman 100 y la descripción de los criterios', async () => {
    const res = await as(2).getWeights();
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.weights).toHaveLength(4);
    expect(res.body.weights.reduce((a: number, x: { weight: number }) => a + x.weight, 0)).toBe(100);
    expect(res.body.criteria).toHaveLength(4);
  });

  it('sin identidad → 401', async () => {
    expect((await request(app).get('/api/weights')).status).toBe(401);
  });
});

describe('PUT /api/weights: permisos', () => {
  it('un agente no puede → 403; sin identidad → 401', async () => {
    const base = await currentId();
    expect((await as(2).putWeights({ baseConfigId: base, weights: w(40, 30, 20, 10) })).status).toBe(403);
    const anon = await request(app).put('/api/weights').send({ baseConfigId: base, weights: w(40, 30, 20, 10) });
    expect(anon.status).toBe(401);
    expect(await currentId()).toBe(base); // nada cambió
  });
});

describe('PUT /api/weights: validación', () => {
  it('guarda una configuración válida como NUEVA versión activa', async () => {
    const base = await currentId();
    const res = await as(ADMIN).putWeights({ baseConfigId: base, weights: w(50, 25, 15, 10) });
    expect(res.status).toBe(200);
    expect(res.body.configId).toBeGreaterThan(base);
    expect(res.body.weights).toEqual(expect.arrayContaining([{ criterion: 'new_customer', weight: 50 }]));
    expect(res.body.createdBy).toEqual({ id: ADMIN, name: 'Admin' });
  });

  it('permite pesos a 0 mientras sumen 100', async () => {
    const res = await as(ADMIN).putWeights({ baseConfigId: await currentId(), weights: w(100, 0, 0, 0) });
    expect(res.status).toBe(200);
  });

  it.each([
    ['un peso negativo', w(-10, 50, 40, 20)],
    ['una suma distinta de 100', w(40, 30, 20, 20)],
    ['un peso decimal', w(40.5, 29.5, 20, 10)],
    ['un criterio duplicado', [...w(40, 30, 20, 10), { criterion: 'seniority', weight: 0 }]],
    ['un criterio que falta', w(40, 30, 30, 0).slice(0, 3)],
    ['un criterio desconocido', [...w(40, 30, 20, 10).slice(0, 3), { criterion: 'inventado', weight: 10 }]],
  ])('rechaza %s → 400 y no cambia nada', async (_nombre, weights) => {
    const base = await currentId();
    const res = await as(ADMIN).putWeights({ baseConfigId: base, weights });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_WEIGHTS');
    expect(res.body.error.details.length).toBeGreaterThan(0);
    expect(await currentId()).toBe(base);
  });

  it('devuelve TODOS los errores a la vez, no solo el primero', async () => {
    const res = await as(ADMIN).putWeights({
      baseConfigId: await currentId(),
      weights: [...w(-10, 30, 20, 10), { criterion: 'seniority', weight: 5 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.length).toBeGreaterThanOrEqual(2);
  });

  it('cuerpo mal formado o con campos extra → 400', async () => {
    const base = await currentId();
    expect((await as(ADMIN).putWeights({ baseConfigId: base, weights: 'no-es-una-lista' })).status).toBe(400);
    expect((await as(ADMIN).putWeights({ weights: w(40, 30, 20, 10) })).status).toBe(400);
    expect((await as(ADMIN).putWeights({ baseConfigId: base, weights: w(40, 30, 20, 10), extra: 1 })).status).toBe(400);
  });
});

describe('PUT /api/weights: bloqueo optimista', () => {
  it('con una base obsoleta → 409 e informa de la configuración actual; no se pisa nada', async () => {
    const base = await currentId();
    const first = await as(ADMIN).putWeights({ baseConfigId: base, weights: w(40, 30, 20, 10) });
    expect(first.status).toBe(200);

    const stale = await as(ADMIN).putWeights({ baseConfigId: base, weights: w(10, 10, 10, 70) });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('CONFIG_CONFLICT');
    expect(stale.body.error.details.currentConfigId).toBe(first.body.configId);

    const now = (await as(ADMIN).getWeights()).body;
    expect(now.configId).toBe(first.body.configId);
    expect(now.weights[0]).toEqual({ criterion: 'new_customer', weight: 40 }); // sigue la del primero
  });

  it('CARRERA: dos guardados simultáneos con la misma base → uno gana, el otro 409, una sola config nueva', async () => {
    const base = await currentId();
    const count = async () => Number((await pool.query('SELECT count(*) FROM weight_configs')).rows[0].count);
    const before = await count();

    const [a, b] = await Promise.all([
      as(ADMIN).putWeights({ baseConfigId: base, weights: w(60, 20, 10, 10) }),
      as(ADMIN).putWeights({ baseConfigId: base, weights: w(10, 10, 20, 60) }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);

    const winner = a.status === 200 ? a : b;
    const now = (await as(ADMIN).getWeights()).body;
    expect(now.configId).toBe(winner.body.configId);
    expect(now.weights).toEqual(winner.body.weights);
    expect(await count()).toBe(before + 1);
    const active = await pool.query('SELECT count(*) FROM weight_configs WHERE is_active');
    expect(Number(active.rows[0].count)).toBe(1); // nunca hay dos activas
  });
});

describe('consistencia de las puntuaciones al cambiar los pesos', () => {
  it('detalle y listado pasan a usar la nueva configuración y lo declaran', async () => {
    const created = await as(2).createLead({ name: 'Lead Pesos', phone: '600111222', isNewCustomer: true });
    expect(created.status).toBe(201);
    createdLeadIds.push(created.body.id);

    const put = await as(ADMIN).putWeights({ baseConfigId: await currentId(), weights: w(100, 0, 0, 0) });
    expect(put.status).toBe(200);

    // Con todo el peso en "cliente nuevo", un cliente nuevo puntúa 100.
    const detail = (await as(2).getLead(created.body.id)).body;
    expect(detail.score).toBe(100);
    expect(detail.priority).toBe('alta');
    expect(detail.weightsConfigId).toBe(put.body.configId);

    const list = (await as(2).list('?pageSize=5')).body;
    expect(list.weightsConfigId).toBe(put.body.configId);
    expect(list.data[0].score).toBe(100);
  });
});

describe('configuración inválida: respuesta predecible', () => {
  it('corrupta → 503 en listado y detalle; el admin la ve como inválida y puede repararla', async () => {
    const lead = await as(2).createLead({ name: 'Lead Config Rota', phone: '600111222' });
    createdLeadIds.push(lead.body.id);

    const ok = await as(ADMIN).putWeights({ baseConfigId: await currentId(), weights: w(40, 30, 20, 10) });
    const brokenId = ok.body.configId as number;
    // Simulamos un fallo externo: alguien borra un criterio a mano en la base de datos.
    await pool.query("DELETE FROM weight_config_items WHERE config_id = $1 AND criterion = 'seniority'", [brokenId]);

    const list = await as(2).list('?pageSize=5');
    expect(list.status).toBe(503);
    expect(list.body.error.code).toBe('WEIGHTS_CONFIG_INVALID');
    expect((await as(2).getLead(lead.body.id)).status).toBe(503);

    const view = await as(ADMIN).getWeights();
    expect(view.status).toBe(200);
    expect(view.body.valid).toBe(false);
    expect(view.body.errors.length).toBeGreaterThan(0);

    const fix = await as(ADMIN).putWeights({ baseConfigId: brokenId, weights: w(40, 30, 20, 10) });
    expect(fix.status).toBe(200);
    expect((await as(2).list('?pageSize=5')).status).toBe(200);
  });
});