import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import RepairAgent, { RepairContext } from '../src/repair-agent';
import { VerificationCheck, VerificationResult } from '../src/verifier-engine';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'repair-outcome-'));
}

function baseContext(overrides?: Partial<RepairContext>): RepairContext {
  return {
    stepNumber: 1,
    agentName: 'dev',
    originalTask: 'implement feature X',
    transcriptPath: '/tmp/fake-transcript.md',
    verificationReportPath: '/tmp/fake-report.md',
    branchName: 'step-1',
    failedChecks: [],
    rootCause: '',
    retryCount: 1,
    ...overrides,
  };
}

function makeResult(checks: VerificationCheck[], claims?: string[]): VerificationResult {
  return {
    stepNumber: 1,
    agentName: 'dev',
    passed: false,
    checks,
    unverifiedClaims: claims ?? [],
    timestamp: new Date().toISOString(),
    transcriptPath: '/tmp/fake.md',
  };
}

describe('RepairAgent Outcome Integration', () => {
  let tempDirs: string[] = [];

  afterEach(() => {
    for (const d of tempDirs) {
      if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
    }
    tempDirs = [];
  });

  // ── extractFailedChecks ────────────────────────────────────────

  describe('extractFailedChecks with outcome types', () => {
    it('tags build_exec failures as [build]', () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const agent = new RepairAgent(dir);

      const result = makeResult([{
        type: 'build_exec',
        description: 'Build failed (npm run build)',
        required: true,
        passed: false,
        reason: 'exit code 1',
      }]);

      const checks = agent.extractFailedChecks(result);
      assert.strictEqual(checks.length, 1);
      assert.ok(checks[0].startsWith('[build]'));
      assert.ok(checks[0].includes('exit code 1'));
    });

    it('tags test_exec failures as [test]', () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const agent = new RepairAgent(dir);

      const result = makeResult([{
        type: 'test_exec',
        description: 'Tests failed (npm test)',
        required: true,
        passed: false,
        reason: '3 failing',
      }]);

      const checks = agent.extractFailedChecks(result);
      assert.strictEqual(checks.length, 1);
      assert.ok(checks[0].startsWith('[test]'));
      assert.ok(checks[0].includes('3 failing'));
    });

    it('tags file_existence failures as [missing-files]', () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const agent = new RepairAgent(dir);

      const result = makeResult([{
        type: 'file_existence',
        description: 'Expected files exist in worktree',
        required: true,
        passed: false,
        reason: 'Missing files: config.ts, utils.ts',
      }]);

      const checks = agent.extractFailedChecks(result);
      assert.strictEqual(checks.length, 1);
      assert.ok(checks[0].startsWith('[missing-files]'));
      assert.ok(checks[0].includes('config.ts'));
    });

    it('tags git_diff failures as [no-changes]', () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const agent = new RepairAgent(dir);

      const result = makeResult([{
        type: 'git_diff',
        description: 'Agent produced code changes',
        required: true,
        passed: false,
        reason: 'No changes detected since abc12345',
      }]);

      const checks = agent.extractFailedChecks(result);
      assert.strictEqual(checks.length, 1);
      assert.ok(checks[0].startsWith('[no-changes]'));
      assert.ok(checks[0].includes('abc12345'));
    });

    it('preserves original tags for transcript-based check types', () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const agent = new RepairAgent(dir);

      const result = makeResult([
        { type: 'test', description: 'Tests ran', required: true, passed: false, reason: 'No test commands found' },
        { type: 'build', description: 'Build ran', required: true, passed: false, reason: 'No build output' },
        { type: 'commit', description: 'Commits', required: true, passed: false, reason: 'None' },
      ]);

      const checks = agent.extractFailedChecks(result);
      assert.strictEqual(checks.length, 3);
      assert.ok(checks[0].startsWith('[test]'));
      assert.ok(checks[1].startsWith('[build]'));
      assert.ok(checks[2].startsWith('[commit]'));
    });

    it('includes unverified claims alongside outcome checks', () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const agent = new RepairAgent(dir);

      const result = makeResult(
        [{ type: 'git_diff', description: 'Changes', required: true, passed: false, reason: 'none' }],
        ['All tests passed']
      );

      const checks = agent.extractFailedChecks(result);
      assert.strictEqual(checks.length, 2);
      assert.ok(checks[1].includes('Unverified claims'));
    });
  });

  // ── classifyFailure with outcome tags ──────────────────────────

  describe('classifyFailure with outcome tags', () => {
    it('classifies [build] tagged checks as build-failure', () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const agent = new RepairAgent(dir);

      const result = agent.classifyFailure(
        ['[build] Build failed (npm run build) - exit code 1'],
        ''
      );
      assert.strictEqual(result, 'build-failure');
    });

    it('classifies [test] tagged checks as test-failure', () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const agent = new RepairAgent(dir);

      const result = agent.classifyFailure(
        ['[test] Tests failed (npm test) - 2 failing'],
        ''
      );
      assert.strictEqual(result, 'test-failure');
    });

    it('classifies [missing-files] tagged checks as missing-artifact', () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const agent = new RepairAgent(dir);

      const result = agent.classifyFailure(
        ['[missing-files] Expected files exist - Missing files: x.ts'],
        ''
      );
      assert.strictEqual(result, 'missing-artifact');
    });

    it('classifies [no-changes] tagged checks as missing-artifact', () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const agent = new RepairAgent(dir);

      const result = agent.classifyFailure(
        ['[no-changes] Agent produced code changes - No changes detected'],
        ''
      );
      assert.strictEqual(result, 'missing-artifact');
    });
  });

  // ── buildRepairPrompt with failureContext ──────────────────────

  describe('buildRepairPrompt with failureContext', () => {
    it('includes OUTCOME EVIDENCE section when failureContext is provided', () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const agent = new RepairAgent(dir);

      const ctx = baseContext({
        failureContext: '- build_exec: npm run build exited 1\n- file_existence: Missing api.ts',
      });

      const prompt = agent.buildRepairPrompt(ctx);
      assert.ok(prompt.includes('--- OUTCOME EVIDENCE ---'));
      assert.ok(prompt.includes('build_exec'));
      assert.ok(prompt.includes('Missing api.ts'));
    });

    it('omits OUTCOME EVIDENCE section when failureContext is undefined', () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const agent = new RepairAgent(dir);

      const ctx = baseContext({ failureContext: undefined });

      const prompt = agent.buildRepairPrompt(ctx);
      assert.ok(!prompt.includes('OUTCOME EVIDENCE'));
    });

    it('omits OUTCOME EVIDENCE section when failureContext is empty string', () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const agent = new RepairAgent(dir);

      const ctx = baseContext({ failureContext: '' });

      const prompt = agent.buildRepairPrompt(ctx);
      assert.ok(!prompt.includes('OUTCOME EVIDENCE'));
    });

    it('places OUTCOME EVIDENCE before REPAIR INSTRUCTIONS', () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const agent = new RepairAgent(dir);

      const ctx = baseContext({
        failureContext: '- test_exec: 2 failing tests',
      });

      const prompt = agent.buildRepairPrompt(ctx);
      const evidencePos = prompt.indexOf('--- OUTCOME EVIDENCE ---');
      const instructionsPos = prompt.indexOf('--- REPAIR INSTRUCTIONS ---');
      assert.ok(evidencePos < instructionsPos, 'OUTCOME EVIDENCE should come before REPAIR INSTRUCTIONS');
    });

    it('still includes standard sections (original task, failed checks, strategy)', () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const agent = new RepairAgent(dir);

      const ctx = baseContext({
        failedChecks: ['[build] Build failed'],
        rootCause: 'Build not executed or failed',
        failureContext: '- build_exec: compile error',
      });

      const prompt = agent.buildRepairPrompt(ctx);
      assert.ok(prompt.includes('--- ORIGINAL TASK ---'));
      assert.ok(prompt.includes('--- FAILED VERIFICATION CHECKS ---'));
      assert.ok(prompt.includes('--- ROOT CAUSE ---'));
      assert.ok(prompt.includes('--- OUTCOME EVIDENCE ---'));
      assert.ok(prompt.includes('--- REPAIR INSTRUCTIONS ---'));
      assert.ok(prompt.includes('FAILURE CLASSIFICATION'));
    });

    it('includes final-retry urgency message on last attempt', () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const agent = new RepairAgent(dir, 3);

      const ctx = baseContext({ retryCount: 3 });

      const prompt = agent.buildRepairPrompt(ctx);
      assert.ok(prompt.includes('This is the final attempt. Prioritize getting a working result over completeness.'));
    });

    it('omits final-retry urgency message on non-final attempts', () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const agent = new RepairAgent(dir, 3);

      const ctx = baseContext({ retryCount: 1 });

      const prompt = agent.buildRepairPrompt(ctx);
      assert.ok(!prompt.includes('final attempt'));
    });
  });
});
