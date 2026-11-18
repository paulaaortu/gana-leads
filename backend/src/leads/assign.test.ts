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

/** Cliente de API "como" un agente concreto. */
const as = (agentId: number) => {
  const id = String(agentId);
  return {
    create: (body: object) => request(app).post('/api/leads').set('X-Agent-Id', id).send(body),
    get: (leadId: number) => request(app).get(`/api/leads/${leadId}`).set('X-Agent-Id', id),
    patch: (leadId: number, body: object) => request(app).patch(`/api/leads/${leadId}`).set('X-Agent-Id', id).send(body),
    assign: (leadId: number, body: object = {}) => request(app).post(`/api/leads/${leadId}/assign`).set('X-Agent-Id', id).send(body),
    unassign: (leadId: number) => request(app).post(`/api/leads/${leadId}/unassign`).set('X-Agent-Id', id),
  };
};

async function freeLead() {
  const res = await as(2).create({ name: 'Lead Asignacion', phone: '600111222' });
  expect(res.status).toBe(201);
  createdIds.push(res.body.id);
  return res.body as { id: number; version: number };
}

describe('asignar', () => {
  it('un agente se asigna un lead libre a sí mismo', async () => {
    const lead = await freeLead();
    const res = await as(2).assign(lead.id);
    expect(res.status).toBe(200);
    expect(res.body.agent.id).toBe(2);
    expect(res.body.version).toBe(lead.version + 1);
  });

  it('un agente NO puede asignar a otro → 403', async () => {
    const lead = await freeLead();
    const res = await as(2).assign(lead.id, { agentId: 3 });
    expect(res.status).toBe(403);
    expect((await as(2).get(lead.id)).body.agent).toBeNull();
  });

  it('un administrador puede asignar a cualquier agente', async () => {
    const lead = await freeLead();
    const res = await as(ADMIN).assign(lead.id, { agentId: 4 });
    expect(res.status).toBe(200);
    expect(res.body.agent.id).toBe(4);
  });

  it('no se asigna a quien no es agente ni a quien no existe → 400', async () => {
    const lead = await freeLead();
    expect((await as(ADMIN).assign(lead.id, { agentId: ADMIN })).status).toBe(400);
    expect((await as(ADMIN).assign(lead.id)).status).toBe(400); // el admin sin indicar agente se apunta a sí mismo
    const ghost = await as(ADMIN).assign(lead.id, { agentId: 99999 });
    expect(ghost.status).toBe(400);
    expect(ghost.body.error.code).toBe('INVALID_ASSIGNEE');
  });

  it('un lead ya asignado a otro agente → 409 y no cambia', async () => {
    const lead = await freeLead();
    await as(2).assign(lead.id);
    const res = await as(3).assign(lead.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_ASSIGNED');
    expect(res.body.error.details.assignedAgentId).toBe(2);
    expect((await as(3).get(lead.id)).body.agent.id).toBe(2);
  });

  it('repetir la misma asignación es idempotente (200, sin cambiar la versión)', async () => {
    const lead = await freeLead();
    const first = await as(2).assign(lead.id);
    const again = await as(2).assign(lead.id);
    expect(again.status).toBe(200);
    expect(again.body.version).toBe(first.body.version);
  });

  it('CARRERA: cuatro agentes piden el mismo lead a la vez → exactamente uno lo consigue', async () => {
    const lead = await freeLead();
    const agents = [2, 3, 4, 5];
    const results = await Promise.all(agents.map((a) => as(a).assign(lead.id)));

    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409, 409]);
    const winner = agents[results.findIndex((r) => r.status === 200)];
    const final = (await as(ADMIN).get(lead.id)).body;
    expect(final.agent.id).toBe(winner);
    expect(final.version).toBe(lead.version + 1); // solo hubo UNA escritura
  });

  it('lead inexistente → 404; sin identidad → 401', async () => {
    expect((await as(2).assign(999_999_999)).status).toBe(404);
    const anon = await request(app).post('/api/leads/1/assign');
    expect(anon.status).toBe(401);
  });
});

describe('desasignar', () => {
  it('lo puede desasignar el agente asignado', async () => {
    const lead = await freeLead();
    await as(2).assign(lead.id);
    const res = await as(2).unassign(lead.id);
    expect(res.status).toBe(200);
    expect(res.body.agent).toBeNull();
  });

  it('otro agente NO puede desasignarlo → 403 y sigue asignado', async () => {
    const lead = await freeLead();
    await as(2).assign(lead.id);
    expect((await as(3).unassign(lead.id)).status).toBe(403);
    expect((await as(2).get(lead.id)).body.agent.id).toBe(2);
  });

  it('un administrador sí puede desasignarlo', async () => {
    const lead = await freeLead();
    await as(2).assign(lead.id);
    const res = await as(ADMIN).unassign(lead.id);
    expect(res.status).toBe(200);
    expect(res.body.agent).toBeNull();
  });

  it('desasignar un lead ya libre es idempotente', async () => {
    const lead = await freeLead();
    expect((await as(3).unassign(lead.id)).status).toBe(200);
  });
});

describe('interacción con la edición concurrente', () => {
  it('asignar invalida una edición hecha con datos anteriores → 409', async () => {
    const lead = await freeLead(); // versión 1
    await as(3).assign(lead.id);   // versión 2
    const stale = await as(2).patch(lead.id, { version: 1, name: 'Edicion con datos viejos' });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
  });
});

describe('GET /api/agents', () => {
  it('es público y devuelve id, nombre y rol', async () => {
    const res = await request(app).get('/api/agents');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(5);
    expect(res.body.data[0]).toEqual({ id: 1, name: 'Admin', role: 'admin' });
  });
});