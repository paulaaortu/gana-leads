import { config } from '../config';
import pg from 'pg';

export const pool = new pg.Pool({ connectionString: config.DATABASE_URL });