import express from 'express';
import cors from 'cors';
import * as path from 'path';
import * as fs from 'fs';
import { createRunsRouter } from './api/routes/runs';

const DEFAULT_PORT = 3002;
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Swarm Orchestrator Dashboard</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0d1117; color: #c9d1d9; }
  .header { background: #161b22; border-bottom: 1px solid #30363d; padding: 16px 24px; display: flex; align-items: center; gap: 12px; }
  .header h1 { font-size: 20px; color: #58a6ff; }
  .container { max-width: 1200px; margin: 24px auto; padding: 0 24px; }
  .runs-list { display: grid; gap: 12px; }
  .run-card { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 16px; cursor: pointer; transition: border-color 0.2s; }
  .run-card:hover { border-color: #58a6ff; }
  .run-card h3 { color: #58a6ff; font-size: 14px; margin-bottom: 4px; }
  .run-card p { color: #8b949e; font-size: 13px; }
  .run-card .meta { display: flex; gap: 16px; margin-top: 8px; font-size: 12px; color: #8b949e; }
  .detail { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 20px; }
  .detail h2 { color: #58a6ff; margin-bottom: 12px; }
  .steps { display: grid; gap: 8px; margin-top: 12px; }
  .step { background: #0d1117; border: 1px solid #30363d; border-radius: 4px; padding: 12px; }
  .step .agent { color: #d2a8ff; font-weight: 600; font-size: 13px; }
  .step .task { color: #c9d1d9; font-size: 13px; margin-top: 4px; }
  .back-btn { background: none; border: 1px solid #30363d; color: #58a6ff; padding: 6px 12px; border-radius: 4px; cursor: pointer; margin-bottom: 16px; }
  .back-btn:hover { background: #21262d; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  .badge.pass { background: #238636; color: #fff; }
  .badge.fail { background: #da3633; color: #fff; }
  .transcript { background: #0d1117; border: 1px solid #30363d; border-radius: 4px; padding: 12px; margin-top: 8px; max-height: 300px; overflow-y: auto; font-family: monospace; font-size: 12px; white-space: pre-wrap; color: #8b949e; }
  .empty { text-align: center; padding: 48px; color: #8b949e; }
  .loading { text-align: center; padding: 48px; color: #58a6ff; }
</style>
</head>
<body>
<div class="header">
  <span style="font-size: 24px;">&#x1F41D;</span>
  <h1>Swarm Orchestrator Dashboard</h1>
</div>
<div class="container" id="app">
  <div class="loading">Loading runs...</div>
</div>
<script>
const app = document.getElementById('app');
let currentView = 'list';

async function fetchRuns() {
  const res = await fetch('/api/runs');
  return res.json();
}

async function fetchRun(id) {
  const res = await fetch('/api/runs/' + encodeURIComponent(id));
  return res.json();
}

function renderList(runs) {
  if (runs.length === 0) {
    app.innerHTML = '<div class="empty">No runs found. Execute a swarm plan to see results here.</div>';
    return;
  }
  app.innerHTML = '<h2 style="margin-bottom:16px;color:#c9d1d9;">Execution Runs</h2><div class="runs-list">' +
    runs.map(r => '<div class="run-card" onclick="showRun(\\'' + r.id + '\\')">' +
      '<h3>' + esc(r.id) + '</h3>' +
      '<p>' + esc(r.goal || 'No goal recorded') + '</p>' +
      '<div class="meta"><span>' + r.steps + ' steps</span><span>' + new Date(r.createdAt).toLocaleString() + '</span></div>' +
    '</div>').join('') + '</div>';
}

async function showRun(id) {
  app.innerHTML = '<div class="loading">Loading run details...</div>';
  const data = await fetchRun(id);
  let html = '<button class="back-btn" onclick="init()">Back to runs</button>';
  html += '<div class="detail"><h2>' + esc(id) + '</h2>';
  if (data.plan) {
    html += '<p style="color:#8b949e;margin-bottom:12px;">' + esc(data.plan.goal) + '</p>';
    html += '<h3 style="color:#c9d1d9;margin:12px 0 8px;">Steps</h3><div class="steps">';
    (data.plan.steps || []).forEach(function(s) {
      html += '<div class="step"><span class="agent">[' + esc(s.agentName) + ']</span> Step ' + s.stepNumber;
      if (s.dependencies && s.dependencies.length) html += ' <span style="color:#8b949e;font-size:11px;">deps: ' + s.dependencies.join(', ') + '</span>';
      html += '<div class="task">' + esc(s.task) + '</div></div>';
    });
    html += '</div>';
  }
  if (data.verificationReports && data.verificationReports.length) {
    html += '<h3 style="color:#c9d1d9;margin:16px 0 8px;">Verification Reports</h3>';
    data.verificationReports.forEach(function(r) {
      const passed = r.content.includes('PASSED') || r.content.includes('passed');
      html += '<div class="step"><span class="badge ' + (passed ? 'pass' : 'fail') + '">' + (passed ? 'PASS' : 'FAIL') + '</span> ' + esc(r.name);
      html += '<div class="transcript">' + esc(r.content.slice(0, 2000)) + '</div></div>';
    });
  }
  if (data.stepTranscripts && data.stepTranscripts.length) {
    html += '<h3 style="color:#c9d1d9;margin:16px 0 8px;">Transcripts</h3>';
    data.stepTranscripts.forEach(function(t) {
      html += '<div class="step"><strong>' + esc(t.step) + '</strong>';
      if (t.transcript) html += '<div class="transcript">' + esc(t.transcript.slice(0, 2000)) + '</div>';
      else html += '<p style="color:#8b949e;font-size:12px;">No transcript available</p>';
      html += '</div>';
    });
  }
  html += '</div>';
  app.innerHTML = html;
}

function esc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

async function init() {
  const runs = await fetchRuns();
  renderList(runs);
}
init();
</script>
</body>
</html>`;

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

  // Serve the dashboard HTML at root
  app.get('/', (_req, res) => {
    res.type('html').send(DASHBOARD_HTML);
  });

  const server = app.listen(resolvedPort, () => {
    console.log(`Swarm Web Dashboard running at http://localhost:${resolvedPort}`);
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
