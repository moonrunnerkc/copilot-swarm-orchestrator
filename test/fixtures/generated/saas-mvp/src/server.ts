import express from 'express';

export function makeApp() {
  const app = express();

  app.use((req, _res, next) => {
    // request logging
    // eslint-disable-next-line no-console
    console.log(req.method, req.url);
    next();
  });

  app.use((req, res, next) => {
    const correlationId = req.header('x-correlation-id') || 'cid';
    res.setHeader('x-correlation-id', correlationId);
    (req as any).correlationId = correlationId;
    next();
  });

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  return app;
}
