import 'dotenv/config';
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('Falta DATABASE_URL (ver .env.example)');
}

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_POOLED });