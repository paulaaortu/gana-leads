import { z } from 'zod';

export const LEAD_STATUSES = ['nuevo', 'en_gestion', 'contactado', 'cerrado'] as const;
export const INTERESTS = ['low', 'medium', 'high'] as const;
export const SOURCES = ['referral', 'web', 'event', 'cold'] as const;

const nameField = z.string().trim().min(1, 'El nombre es obligatorio.').max(120, 'El nombre es demasiado largo.');

// Se normaliza (se quitan espacios, puntos, guiones y paréntesis) y luego se valida.
const phoneField = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s.\-()]/g, ''))
  .pipe(z.string().regex(/^\+?\d{7,15}$/, 'Teléfono no válido: entre 7 y 15 dígitos, con + inicial opcional.'));

export const idParamSchema = z.object({
  id: z.string().regex(/^\d{1,15}$/, 'Identificador no válido.').transform(Number),
});

// .strict(): cualquier campo no listado (score, status, agentId, createdAt...) → 400.
export const createLeadSchema = z
  .object({
    name: nameField,
    phone: phoneField,
    isNewCustomer: z.boolean().nullable().optional(),
    interest: z.enum(INTERESTS).nullable().optional(),
    source: z.enum(SOURCES).nullable().optional(),
  })
  .strict();

export const updateLeadSchema = z
  .object({
    version: z.number().int().positive(),
    name: nameField.optional(),
    phone: phoneField.optional(),
    isNewCustomer: z.boolean().nullable().optional(),
    interest: z.enum(INTERESTS).nullable().optional(),
    source: z.enum(SOURCES).nullable().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).some((k) => k !== 'version'), {
    message: 'No hay ningún campo que modificar.',
  });

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
export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;