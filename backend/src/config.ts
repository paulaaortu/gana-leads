import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'Falta DATABASE_URL (ver .env.example)'),
  PORT: z.coerce.number().int().positive().default(3000),
});

export const config = schema.parse(process.env);