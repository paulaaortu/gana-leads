import { Router } from 'express';
import { pool } from '../db/pool';
import { AppError } from '../errors';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
  } catch {
    throw new AppError(503, 'DB_UNAVAILABLE', 'La base de datos no responde.');
  }
  res.json({ status: 'ok', db: 'up' });
});