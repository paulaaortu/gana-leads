import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pool } from '../db/pool';

const dir = join(process.cwd(), 'migrations');

await pool.query(
  'CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())'
);

for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  const done = await pool.query('SELECT 1 FROM _migrations WHERE name = $1', [file]);
  if (done.rowCount) continue;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(readFileSync(join(dir, file), 'utf8'));
    await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
    await client.query('COMMIT');
    console.log(`✔ ${file}`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
await pool.end();