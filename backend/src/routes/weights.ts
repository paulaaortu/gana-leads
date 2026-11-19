import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { getWeightsConfig, saveWeights } from '../weights/repository';
import { saveWeightsSchema } from '../weights/schemas';

export const weightsRouter = Router();

weightsRouter.use(authenticate);

// Leer la configuración puede cualquier usuario autenticado (el desglose ya muestra los pesos).
weightsRouter.get('/', async (_req, res) => {
  res.json(await getWeightsConfig());
});

// Modificarla, solo un administrador. El orden importa: 401 → 403 → 400 → 409.
weightsRouter.put('/', requireAdmin, async (req, res) => {
  const body = saveWeightsSchema.parse(req.body);
  res.json(await saveWeights(body, req.agent!));
});