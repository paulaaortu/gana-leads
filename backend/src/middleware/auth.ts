import type { RequestHandler } from 'express';
import { pool } from '../db/pool';
import { AppError } from '../errors';

export interface Agent {
  id: number;
  name: string;
  role: 'agent' | 'admin';
}

declare global {
  namespace Express {
    interface Request {
      agent?: Agent;
    }
  }
}

/** Autenticación SIMULADA: cabecera X-Agent-Id validada contra la tabla agents. */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const raw = req.header('x-agent-id');
  const id = Number(raw);
  if (!raw || !Number.isInteger(id) || id < 1) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Falta o no es válida la cabecera X-Agent-Id.');
  }
  const { rows } = await pool.query<Agent>('SELECT id, name, role FROM agents WHERE id = $1', [id]);
  if (!rows[0]) throw new AppError(401, 'UNAUTHENTICATED', 'El agente indicado no existe.');
  req.agent = rows[0];
  next();
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (req.agent?.role !== 'admin') {
    throw new AppError(403, 'FORBIDDEN', 'Esta operación requiere rol de administrador.');
  }
  next();
};