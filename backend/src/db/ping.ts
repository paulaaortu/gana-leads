import { pool } from './pool';

const res = await pool.query('SELECT now() AS ahora, version() AS version');
console.log(res.rows[0]);
await pool.end();