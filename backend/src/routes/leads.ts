import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { assignLead, listLeads, unassignLead } from '../leads/repository';
import { assignSchema, listQuerySchema } from '../leads/schemas';
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

leadsRouter.post('/:id/assign', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const { agentId } = assignSchema.parse(req.body ?? {});
  // Sin agentId, se asigna a quien hace la petición. La identidad la decide el servidor.
  res.json(await assignLead(id, agentId ?? req.agent!.id, req.agent!));
});

leadsRouter.post('/:id/unassign', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.json(await unassignLead(id, req.agent!));
});

leadsRouter.patch('/:id', async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const body = updateLeadSchema.parse(req.body);
  res.json(await updateLead(id, body));
});