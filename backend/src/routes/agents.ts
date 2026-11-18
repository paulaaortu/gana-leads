import { Router } from 'express';
import { pool } from '../db/pool';

export const agentsRouter = Router();

// PÚBLICO a propósito: forma parte de la simulación de login. La pantalla inicial lista
// los "usuarios" disponibles para elegir uno. Con autenticación real no existiría.
agentsRouter.get('/', async (_req, res) => {
  const { rows } = await pool.query('SELECT id, name, role FROM agents ORDER BY id');
  res.json({ data: rows });
});