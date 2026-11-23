import { config } from '../config';
import pg from 'pg';

export const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 10, connectionTimeoutMillis: 10_000, });

pool.on('error', (err) => {
  console.error('Error en una conexión inactiva del pool:', err.message);
});