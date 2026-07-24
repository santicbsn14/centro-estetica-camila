import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { crearTurnoSchema } from '@shared/schemas/turno.schema';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      sharedAliasCampos: Object.keys(crearTurnoSchema.shape).length,
    });
  });

  return app;
}
