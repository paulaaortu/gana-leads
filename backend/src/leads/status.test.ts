import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { pool } from '../db/pool';

const app = createApp();
const createdIds: number[] = [];
const ADMIN = 1;

afterAll(async () => {
  if (createdIds.length) await pool.query('DELETE FROM leads WHERE id = ANY($1::bigint[])', [createdIds]);
  await pool.end();
});

const as = (agentId: number) => {
  const h = String(agentId);
  return {
    create: (body: object) => request(app).post('/api/leads').set('X-Agent-Id', h).send(body),
    get: (id: number) => request(app).get(`/api/leads/${id}`).set('X-Agent-Id', h),
    assign: (id: number, body: object = {}) => request(app).post(`/api/leads/${id}/assign`).set('X-Agent-Id', h).send(body),
    unassign: (id: number) => request(app).post(`/api/leads/${id}/unassign`).set('X-Agent-Id', h),
    status: (id: number, body: object) => request(app).patch(`/api/leads/${id}/status`).set('X-Agent-Id', h).send(body),
  };
};

/** Crea un lead y se lo asigna a un agente. Devuelve su id y versión actuales. */
async function leadOwnedBy(agentId: number) {
  const created = await as(2).create({ name: 'Lead Estado', phone: '600111222' });
  expect(created.status).toBe(201);
  createdIds.push(created.body.id);
  const assigned = await as(ADMIN).assign(created.body.id, { agentId });
  expect(assigned.status).toBe(200);
  return { id: created.body.id as number, version: assigned.body.version as number };
}

describe('cambiar estado', () => {
  it('el agente asignado cambia el estado y sube la versión', async () => {
    const lead = await leadOwnedBy(2);
    const res = await as(2).status(lead.id, { status: 'en_gestion', version: lead.version });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('en_gestion');
    expect(res.body.version).toBe(lead.version + 1);
  });

  it('otro agente no puede → 403; un administrador sí', async () => {
    const lead = await leadOwnedBy(2);
    const denied = await as(3).status(lead.id, { status: 'contactado', version: lead.version });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');
    expect((await as(ADMIN).status(lead.id, { status: 'contactado', version: lead.version })).status).toBe(200);
  });

  it('un lead sin asignar solo lo cambia un administrador', async () => {
    const created = await as(2).create({ name: 'Sin dueno', phone: '600111222' });
    createdIds.push(created.body.id);
    const body = { status: 'en_gestion', version: created.body.version };
    expect((await as(2).status(created.body.id, body)).status).toBe(403);
    expect((await as(ADMIN).status(created.body.id, body)).status).toBe(200);
  });

  it('cerrar y reabrir: el agente cierra, solo el admin reabre', async () => {
    const lead = await leadOwnedBy(2);
    const closed = await as(2).status(lead.id, { status: 'cerrado', version: lead.version });
    expect(closed.status).toBe(200);

    const reopenAsAgent = await as(2).status(lead.id, { status: 'nuevo', version: closed.body.version });
    expect(reopenAsAgent.status).toBe(403);
    expect(reopenAsAgent.body.error.code).toBe('REOPEN_FORBIDDEN');

    const reopenAsAdmin = await as(ADMIN).status(lead.id, { status: 'nuevo', version: closed.body.version });
    expect(reopenAsAdmin.status).toBe(200);
    expect(reopenAsAdmin.body.status).toBe('nuevo');
  });

  it('un agente pierde el permiso si el lead se reasigna a otro', async () => {
    const lead = await leadOwnedBy(2);
    await as(ADMIN).unassign(lead.id);
    const reassigned = await as(ADMIN).assign(lead.id, { agentId: 3 });
    const res = await as(2).status(lead.id, { status: 'cerrado', version: reassigned.body.version });
    expect(res.status).toBe(403);
  });

  it('mismo estado → 200 idempotente, sin tocar la versión', async () => {
    const lead = await leadOwnedBy(2);
    const first = await as(2).status(lead.id, { status: 'contactado', version: lead.version });
    const again = await as(2).status(lead.id, { status: 'contactado', version: first.body.version });
    expect(again.status).toBe(200);
    expect(again.body.version).toBe(first.body.version);
  });

  it('con una versión desactualizada → 409 e informa de la versión actual', async () => {
    const lead = await leadOwnedBy(2);
    await as(2).status(lead.id, { status: 'en_gestion', version: lead.version });
    const stale = await as(2).status(lead.id, { status: 'contactado', version: lead.version });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    expect(stale.body.error.details.currentVersion).toBe(lead.version + 1);
    expect((await as(2).get(lead.id)).body.status).toBe('en_gestion');
  });

  it('CARRERA: dos cambios simultáneos con la misma versión → uno gana, el otro recibe 409', async () => {
    const lead = await leadOwnedBy(2);
    const [a, b] = await Promise.all([
      as(2).status(lead.id, { status: 'contactado', version: lead.version }),
      as(ADMIN).status(lead.id, { status: 'cerrado', version: lead.version }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);

    const final = (await as(ADMIN).get(lead.id)).body;
    expect(final.version).toBe(lead.version + 1); // solo hubo UNA escritura
    expect(final.status).toBe(a.status === 200 ? 'contactado' : 'cerrado');
  });

  it('entradas inválidas → 400; inexistente → 404; sin identidad → 401', async () => {
    const lead = await leadOwnedBy(2);
    expect((await as(2).status(lead.id, { status: 'inventado', version: lead.version })).status).toBe(400);
    expect((await as(2).status(lead.id, { status: 'nuevo' })).status).toBe(400);
    expect((await as(2).status(lead.id, { status: 'nuevo', version: lead.version, score: 100 })).status).toBe(400);
    expect((await as(ADMIN).status(999_999_999, { status: 'nuevo', version: 1 })).status).toBe(404);
    const anon = await request(app).patch('/api/leads/1/status').send({ status: 'nuevo', version: 1 });
    expect(anon.status).toBe(401);
  });
});