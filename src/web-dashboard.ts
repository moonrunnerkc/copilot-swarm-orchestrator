import cors from 'cors';
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { createRunsRouter } from './api/routes/runs';
import MetricsCollector from './metrics-collector';

const DEFAULT_PORT = 3002;

// Loaded once at require time; avoids re-reading on every request
const DASHBOARD_HTML = fs.readFileSync(
  path.join(__dirname, '..', '..', 'templates', 'web-dashboard.html'),
  'utf-8'
);

/**
 * Start the web dashboard server.
 * Serves a single-page app that visualizes swarm execution runs.
 */
export function startWebDashboard(runsDir?: string, port?: number): ReturnType<typeof express.application.listen> {
  const resolvedRunsDir = runsDir || path.join(process.cwd(), 'runs');
  const resolvedPort = port || DEFAULT_PORT;

  const app = express();
  app.use(cors());

  // API routes
  app.use('/api/runs', createRunsRouter(resolvedRunsDir));

  // Audit report endpoint
  app.get('/api/audit/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId;
    const collector = new MetricsCollector(sessionId, '');
    const state = collector.loadSession(sessionId);
    if (!state) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.type('text/markdown').send(collector.generateAuditReport(state));
  });

  // Serve the dashboard HTML at root
  app.get('/', (_req, res) => {
    res.type('html').send(DASHBOARD_HTML);
  });

  const server = app.listen(resolvedPort, () => {
    console.log(`Swarm Web Dashboard running at http://${process.env.DASHBOARD_HOST || 'localhost'}:${resolvedPort}`);
    console.log(`Watching runs directory: ${resolvedRunsDir}`);
  });

  return server;
}

// Allow running directly: node dist/src/web-dashboard.js [port] [runsDir]
if (require.main === module) {
  const port = parseInt(process.argv[2] || '', 10) || DEFAULT_PORT;
  const runsDir = process.argv[3] || path.join(process.cwd(), 'runs');
  startWebDashboard(runsDir, port);
}

export default startWebDashboard;
