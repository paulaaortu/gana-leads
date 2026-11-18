import { pool } from '../db/pool';

// PRNG determinista (mulberry32): misma secuencia en cada ejecución.
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(42);
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
// ~10 % de datos ausentes a propósito, para ejercitar los casos límite del score
const maybe = <T>(v: T): T | null => (rand() < 0.1 ? null : v);

const N = Number(process.argv[2] ?? 500);
if (!Number.isInteger(N) || N < 1) throw new Error('Uso: npm run seed -- <número de leads>');

const NAMES = ['Ana', 'Luis', 'María', 'Carlos', 'Lucía', 'Pablo', 'Elena', 'Javier', 'Sara', 'Diego'];
const SURNAMES = ['Torres', 'Pérez', 'Ruiz', 'García', 'López', 'Martín', 'Sanz', 'Navarro', 'Gil', 'Ortega'];
const STATUSES = ['nuevo', 'nuevo', 'en_gestion', 'contactado', 'cerrado'] as const;

// Agentes con ids fijos (1 = admin, 2-5 = agentes). No se tocan si ya existen.
await pool.query(`
  INSERT INTO agents (id, name, role) VALUES
    (1, 'Admin', 'admin'), (2, 'Agente 01', 'agent'), (3, 'Agente 02', 'agent'),
    (4, 'Agente 03', 'agent'), (5, 'Agente 04', 'agent')
  ON CONFLICT (id) DO NOTHING`);
await pool.query(`SELECT setval(pg_get_serial_sequence('agents', 'id'), (SELECT max(id) FROM agents))`);

// Los leads sí se regeneran. NO se toca weight_configs.
await pool.query('TRUNCATE leads RESTART IDENTITY');

const cols = {
  name: [] as string[], phone: [] as string[], status: [] as string[],
  agent_id: [] as (number | null)[], is_new: [] as (boolean | null)[],
  interest: [] as (string | null)[], source: [] as (string | null)[], created: [] as string[],
};
for (let i = 0; i < N; i++) {
  const status = pick(STATUSES);
  cols.name.push(`${pick(NAMES)} ${pick(SURNAMES)} ${i + 1}`);
  cols.phone.push(`6${String(Math.floor(rand() * 1e8)).padStart(8, '0')}`);
  cols.status.push(status);
  cols.agent_id.push(status === 'nuevo' && rand() < 0.7 ? null : 2 + Math.floor(rand() * 4));
  cols.is_new.push(maybe(rand() < 0.4));
  cols.interest.push(maybe(pick(['low', 'medium', 'high'] as const)));
  cols.source.push(maybe(pick(['referral', 'web', 'event', 'cold'] as const)));
  cols.created.push(new Date(Date.now() - Math.floor(rand() * 180) * 86_400_000).toISOString());
}

// Un único INSERT con arrays (unnest): rápido incluso con miles de filas contra Neon.
await pool.query(
  `INSERT INTO leads (name, phone, status, agent_id, is_new_customer, interest, source, created_at)
   SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::int[], $5::boolean[], $6::text[], $7::text[], $8::timestamptz[])`,
  [cols.name, cols.phone, cols.status, cols.agent_id, cols.is_new, cols.interest, cols.source, cols.created],
);

console.log(`✔ ${N} leads creados (agentes 1-5 disponibles)`);
await pool.end();