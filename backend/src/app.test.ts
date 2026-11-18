import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';

const app = createApp();

describe('API básica', () => {
  it('ruta inexistente → 404 con formato uniforme', async () => {
    const res = await request(app).get('/api/no-existe');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('sin X-Agent-Id → 401', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('X-Agent-Id no numérico → 401', async () => {
    const res = await request(app).get('/api/me').set('X-Agent-Id', 'abc');
    expect(res.status).toBe(401);
  });

  it('JSON malformado → 400', async () => {
    const res = await request(app)
      .post('/api/lo-que-sea')
      .set('Content-Type', 'application/json')
      .send('{roto');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});