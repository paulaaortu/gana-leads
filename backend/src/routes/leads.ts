import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { listLeads } from '../leads/repository';
import { listQuerySchema } from '../leads/schemas';
import { createLead, getLeadDetail, updateLead } from '../leads/repository';
import { createLeadSchema, idParamSchema, updateLeadSchema } from '../leads/schemas';


export const leadsRouter = Router();

leadsRouter.use(authenticate);

leadsRouter.get('/', async (req, res) => {
  const query = listQuerySchema.parse(req.query); // ZodError → 400 por el manejador central
  res.json(await listLeads(query, new Date()));
});

leadsRouter.get('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await getLeadDetail(id, new Date()));
});

leadsRouter.post('/', async (req, res) => {
  const body = createLeadSchema.parse(req.body);
  const lead = await createLead(body);
  res.status(201).location(`/api/leads/${lead.id}`).json(lead);
});

leadsRouter.patch('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const body = updateLeadSchema.parse(req.body);
  res.json(await updateLead(id, body));
});