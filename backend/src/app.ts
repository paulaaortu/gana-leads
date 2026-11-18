import cors from 'cors';
import express from 'express';
import { errorHandler, notFound } from './middleware/errors';
import { healthRouter } from './routes/health';
import { meRouter } from './routes/me';
import { leadsRouter } from './routes/leads';
import { agentsRouter } from './routes/agents';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/health', healthRouter);
  app.use('/api/me', meRouter);
  app.use('/api/leads', leadsRouter);
  app.use('/api/agents', agentsRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}