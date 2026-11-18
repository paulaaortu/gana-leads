import { Router } from 'express';
import { authenticate } from '../middleware/auth';

export const meRouter = Router();

meRouter.get('/', authenticate, (req, res) => {
  res.json(req.agent);
});