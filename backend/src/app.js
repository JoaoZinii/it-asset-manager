import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config.js';
import { createRouter } from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp(service) {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.text({ type: ['text/csv', 'text/plain'], limit: '5mb' })); // importação de CSV
  app.use('/api', createRouter(service));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
