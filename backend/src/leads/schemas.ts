import { z } from 'zod';

export const LEAD_STATUSES = ['nuevo', 'en_gestion', 'contactado', 'cerrado'] as const;

export const listQuerySchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  // un id de agente o la palabra 'unassigned' para los leads sin asignar
  agent: z.union([z.literal('unassigned'), z.coerce.number().int().positive()]).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(['score_desc', 'score_asc']).default('score_desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListQuery = z.infer<typeof listQuerySchema>;