import { z } from 'zod';

// La estructura externa se valida aquí; el CONTENIDO de los pesos lo valida validateWeights,
// que devuelve todos los errores juntos (negativos, duplicados, suma...).
export const saveWeightsSchema = z
  .object({
    baseConfigId: z.number().int().positive(),
    weights: z.array(z.unknown()).max(20),
  })
  .strict();

export type SaveWeightsInput = z.infer<typeof saveWeightsSchema>;