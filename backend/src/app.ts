import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { config, corsOrigins } from './config';
import { errorHandler, notFound } from './middleware/errors';
import { healthRouter } from './routes/health';
import { meRouter } from './routes/me';
import { leadsRouter } from './routes/leads';
import { agentsRouter } from './routes/agents';
import { weightsRouter } from './routes/weights';

export function createApp() {
  const app = express();

  app.use(helmet()); // cabeceras de seguridad; además oculta X-Powered-By
  app.use(cors({ origin: corsOrigins })); // lista blanca, no "cualquier origen"

  if (config.NODE_ENV !== 'test') {
    app.use(
      '/api',
      rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 600,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        message: { error: { code: 'RATE_LIMITED', message: 'Demasiadas peticiones. Inténtalo de nuevo en unos minutos.' } },
      }),
    );
  }

  app.use(express.json({ limit: '100kb' }));

  app.use('/api/health', healthRouter);
  app.use('/api/me', meRouter);
  app.use('/api/leads', leadsRouter);
  app.use('/api/agents', agentsRouter);
  app.use('/api/weights', weightsRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}