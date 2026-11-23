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

  it('incluye cabeceras de seguridad y no revela Express', async () => {
    const res = await request(app).get('/api/no-existe');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('CORS: solo responde al origen permitido', async () => {
    const ok = await request(app).get('/api/no-existe').set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const ko = await request(app).get('/api/no-existe').set('Origin', 'http://evil.example');
    expect(ko.headers['access-control-allow-origin']).toBeUndefined();
  });
});