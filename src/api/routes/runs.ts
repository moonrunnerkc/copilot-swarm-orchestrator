import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

/**
 * API routes for browsing swarm execution runs.
 * Reads from the local runs/ directory.
 */
export function createRunsRouter(runsDir: string): Router {
  const router = Router();

  // List all runs
  router.get('/', (_req: Request, res: Response) => {
    if (!fs.existsSync(runsDir)) {
      res.json([]);
      return;
    }

    const entries = fs.readdirSync(runsDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => {
        const runPath = path.join(runsDir, e.name);
        const planPath = path.join(runPath, 'plan.json');
        let goal = '';
        let steps = 0;
        if (fs.existsSync(planPath)) {
          try {
            const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
            goal = plan.goal || '';
            steps = plan.steps?.length || 0;
          } catch { /* ignore parse errors */ }
        }
        const stat = fs.statSync(runPath);
        return {
          id: e.name,
          goal,
          steps,
          createdAt: stat.birthtime.toISOString(),
          modifiedAt: stat.mtime.toISOString()
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    res.json(entries);
  });

  // Get run details
  router.get('/:runId', (req: Request, res: Response) => {
    const runId = Array.isArray(req.params.runId) ? req.params.runId[0] : req.params.runId;
    const runPath = path.join(runsDir, runId);
    if (!fs.existsSync(runPath)) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    const result: Record<string, any> = { id: runId };

    // Load plan if available
    const planPath = path.join(runPath, 'plan.json');
    if (fs.existsSync(planPath)) {
      try { result.plan = JSON.parse(fs.readFileSync(planPath, 'utf8')); } catch { /* skip */ }
    }

    // Load metrics if available
    const metricsPath = path.join(runPath, 'metrics.json');
    if (fs.existsSync(metricsPath)) {
      try { result.metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8')); } catch { /* skip */ }
    }

    // Load wave analyses
    const waveFiles = fs.readdirSync(runPath).filter(f => f.startsWith('wave-') && f.endsWith('.json'));
    result.waveAnalyses = waveFiles.map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(runPath, f), 'utf8')); } catch { return null; }
    }).filter(Boolean);

    // Load verification reports
    const verifyDir = path.join(runPath, 'verification');
    if (fs.existsSync(verifyDir)) {
      result.verificationReports = fs.readdirSync(verifyDir)
        .filter(f => f.endsWith('.md'))
        .map(f => ({
          name: f,
          content: fs.readFileSync(path.join(verifyDir, f), 'utf8')
        }));
    }

    // Load step transcripts
    const stepsDir = path.join(runPath, 'steps');
    if (fs.existsSync(stepsDir)) {
      result.stepTranscripts = fs.readdirSync(stepsDir)
        .filter(f => fs.statSync(path.join(stepsDir, f)).isDirectory())
        .map(stepDir => {
          const sharePath = path.join(stepsDir, stepDir, 'share.md');
          return {
            step: stepDir,
            transcript: fs.existsSync(sharePath)
              ? fs.readFileSync(sharePath, 'utf8').slice(0, 5000)
              : null
          };
        });
    }

    // Load repair results
    const repairFiles = fs.readdirSync(runPath).filter(f => f.startsWith('repair-') && f.endsWith('.json'));
    if (repairFiles.length > 0) {
      result.repairResults = repairFiles.map(f => {
        try { return JSON.parse(fs.readFileSync(path.join(runPath, f), 'utf8')); } catch { return null; }
      }).filter(Boolean);
    }

    res.json(result);
  });

  return router;
}
