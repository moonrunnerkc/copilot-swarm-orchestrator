import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createRunsRouter } from '../src/api/routes/runs';

describe('Web Dashboard', () => {
  let tmpDir: string;
  let runsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-dash-test-'));
    runsDir = path.join(tmpDir, 'runs');
    fs.mkdirSync(runsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('createRunsRouter', () => {
    it('should create a router', () => {
      const router = createRunsRouter(runsDir);
      assert.ok(router, 'Router should be created');
      assert.ok(typeof router === 'function' || typeof router === 'object');
    });
  });

  describe('runs API integration', () => {
    // Use express to test the routes
    let app: any;
    let server: any;
    let port: number;

    beforeEach((done) => {
      const express = require('express');
      app = express();
      app.use('/api/runs', createRunsRouter(runsDir));
      server = app.listen(0, () => {
        port = server.address().port;
        done();
      });
    });

    afterEach((done) => {
      if (server) server.close(done);
      else done();
    });

    it('should return empty array when no runs exist', async () => {
      const res = await fetch(`http://localhost:${port}/api/runs`);
      const data = await res.json();
      assert.ok(Array.isArray(data));
      assert.strictEqual(data.length, 0);
    });

    it('should list runs from the runs directory', async () => {
      // Create a mock run
      const runPath = path.join(runsDir, 'swarm-test-run');
      fs.mkdirSync(runPath, { recursive: true });
      fs.writeFileSync(
        path.join(runPath, 'plan.json'),
        JSON.stringify({ goal: 'Test goal', steps: [{ stepNumber: 1, agentName: 'A', task: 'T', dependencies: [], expectedOutputs: [] }] }),
        'utf8'
      );

      const res = await fetch(`http://localhost:${port}/api/runs`);
      const data = await res.json();
      assert.strictEqual(data.length, 1);
      assert.strictEqual(data[0].id, 'swarm-test-run');
      assert.strictEqual(data[0].goal, 'Test goal');
      assert.strictEqual(data[0].steps, 1);
    });

    it('should return run details', async () => {
      const runPath = path.join(runsDir, 'swarm-detail-run');
      fs.mkdirSync(runPath, { recursive: true });
      fs.writeFileSync(
        path.join(runPath, 'plan.json'),
        JSON.stringify({ goal: 'Detail goal', steps: [] }),
        'utf8'
      );

      const res = await fetch(`http://localhost:${port}/api/runs/swarm-detail-run`);
      const data = await res.json();
      assert.strictEqual(data.id, 'swarm-detail-run');
      assert.ok(data.plan);
      assert.strictEqual(data.plan.goal, 'Detail goal');
    });

    it('should return 404 for non-existent run', async () => {
      const res = await fetch(`http://localhost:${port}/api/runs/nonexistent`);
      assert.strictEqual(res.status, 404);
    });

    it('should include verification reports when present', async () => {
      const runPath = path.join(runsDir, 'swarm-verify-run');
      const verifyDir = path.join(runPath, 'verification');
      fs.mkdirSync(verifyDir, { recursive: true });
      fs.writeFileSync(path.join(runPath, 'plan.json'), JSON.stringify({ goal: 'G', steps: [] }), 'utf8');
      fs.writeFileSync(path.join(verifyDir, 'step-1-verification.md'), '# Step 1\n\nPASSED\n', 'utf8');

      const res = await fetch(`http://localhost:${port}/api/runs/swarm-verify-run`);
      const data = await res.json();
      assert.ok(data.verificationReports);
      assert.strictEqual(data.verificationReports.length, 1);
      assert.ok(data.verificationReports[0].content.includes('PASSED'));
    });

    it('should include step transcripts when present', async () => {
      const runPath = path.join(runsDir, 'swarm-transcript-run');
      const stepsDir = path.join(runPath, 'steps', 'step-1');
      fs.mkdirSync(stepsDir, { recursive: true });
      fs.writeFileSync(path.join(runPath, 'plan.json'), JSON.stringify({ goal: 'G', steps: [] }), 'utf8');
      fs.writeFileSync(path.join(stepsDir, 'share.md'), '# Transcript\n\nDo stuff\n', 'utf8');

      const res = await fetch(`http://localhost:${port}/api/runs/swarm-transcript-run`);
      const data = await res.json();
      assert.ok(data.stepTranscripts);
      assert.strictEqual(data.stepTranscripts.length, 1);
      assert.ok(data.stepTranscripts[0].transcript.includes('Transcript'));
    });
  });

  describe('startWebDashboard module', () => {
    it('should export startWebDashboard function', () => {
      const mod = require('../src/web-dashboard');
      assert.ok(typeof mod.startWebDashboard === 'function');
    });
  });
});
