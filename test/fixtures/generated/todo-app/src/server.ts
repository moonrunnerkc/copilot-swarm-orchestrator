import express from 'express';
import morgan from 'morgan';

export function makeApp() {
  const app = express();

  app.use(morgan('tiny'));

  app.use((req, res, next) => {
    const incoming = req.header('x-correlation-id');
    const correlationId = incoming && incoming.trim() ? incoming.trim() : cryptoRandom();
    res.setHeader('x-correlation-id', correlationId);
    (req as any).correlationId = correlationId;
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  return app;
}

function cryptoRandom(): string {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}
