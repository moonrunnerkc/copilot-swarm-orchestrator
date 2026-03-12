import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { todoRouter } from './routes/todos';

export function startServer(port: number = 3001): any {
  const app: Express = express();

  app.use(cors());
  app.use(bodyParser.json());

  app.use('/api/todos', todoRouter);

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  const server = app.listen(port, () => {
    console.log(`✓ Todo API server running on port ${port}`);
  });

  return server;
}
