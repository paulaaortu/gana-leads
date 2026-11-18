import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { listLeads } from '../leads/repository';
import { listQuerySchema } from '../leads/schemas';

export const leadsRouter = Router();

leadsRouter.use(authenticate);

leadsRouter.get('/', async (req, res) => {
  const query = listQuerySchema.parse(req.query); // ZodError → 400 por el manejador central
  res.json(await listLeads(query, new Date()));
});