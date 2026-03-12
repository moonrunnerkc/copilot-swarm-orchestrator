// Author: Bradley R. Kinnard
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import RepairAgent, { FailureClass } from '../src/repair-agent';

/**
 * Upgrade 9: Failure-Classified Repair
 * Tests classifyFailure, getRepairStrategy, and the updated buildRepairPrompt.
 */
describe('Upgrade 9: Failure-Classified Repair', () => {
  let tmpDir: string;
  let agent: RepairAgent;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-classify-'));
    agent = new RepairAgent(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('classifyFailure', () => {
    it('[build] tagged checks produce build-failure', () => {
      const checks = [
        '[build] Build must succeed - tsc exited with code 2',
        '[build] Another build issue',
      ];
      assert.strictEqual(agent.classifyFailure(checks, ''), 'build-failure');
    });

    it('[test] tagged checks produce test-failure', () => {
      const checks = [
        '[test] Tests must pass - 3 of 12 failed',
        '[test] Test assertion error in user.test.ts',
      ];
      assert.strictEqual(agent.classifyFailure(checks, ''), 'test-failure');
    });

    it('mixed [build] and [test] with more builds defaults to build-failure', () => {
      const checks = [
        '[build] Build failed',
        '[build] Compilation error',
        '[test] 1 test failed',
      ];
      assert.strictEqual(agent.classifyFailure(checks, ''), 'build-failure');
    });

    it('mixed equal counts with build present defaults to build-failure', () => {
      const checks = [
        '[build] Build failed',
        '[test] Tests failed',
      ];
      assert.strictEqual(agent.classifyFailure(checks, ''), 'build-failure');
    });

    it('general when no tagged checks', () => {
      const checks = ['[lint] 2 warnings', '[commit] No commits detected'];
      assert.strictEqual(agent.classifyFailure(checks, ''), 'general');
    });

    it('timeout from rootCause string', () => {
      const checks = ['[test] Tests must pass'];
      const rootCause = 'Session timed out after 300s';
      assert.strictEqual(agent.classifyFailure(checks, rootCause), 'timeout');
    });

    it('timeout from "timeout" keyword in rootCause', () => {
      assert.strictEqual(agent.classifyFailure([], 'timeout exceeded'), 'timeout');
    });

    it('missing-artifact from "not found" in checks', () => {
      const checks = ['[build] File dist/index.js not found'];
      assert.strictEqual(agent.classifyFailure(checks, ''), 'missing-artifact');
    });

    it('missing-artifact from "not created" in checks', () => {
      const checks = ['[build] Expected output file was not created'];
      assert.strictEqual(agent.classifyFailure(checks, ''), 'missing-artifact');
    });

    it('dependency-error from "module not found"', () => {
      const checks = ['[build] Error: module not found: lodash'];
      assert.strictEqual(agent.classifyFailure(checks, ''), 'dependency-error');
    });

    it('dependency-error from "package" keyword', () => {
      const checks = ['[build] Missing package express'];
      assert.strictEqual(agent.classifyFailure(checks, ''), 'dependency-error');
    });

    it('timeout takes priority over other classifications', () => {
      const checks = ['[build] Build failed', '[test] Tests failed'];
      assert.strictEqual(agent.classifyFailure(checks, 'timed out'), 'timeout');
    });
  });

  describe('getRepairStrategy', () => {
    const classes: FailureClass[] = [
      'build-failure', 'test-failure', 'missing-artifact',
      'dependency-error', 'timeout', 'general'
    ];

    it('each class returns distinct instruction text', () => {
      const strategies = classes.map(c => agent.getRepairStrategy(c));
      const unique = new Set(strategies);
      assert.strictEqual(unique.size, classes.length, 'all strategies must be distinct');
    });

    it('build-failure mentions compiler/bundler', () => {
      const s = agent.getRepairStrategy('build-failure');
      assert.ok(s.includes('compiler/bundler'));
    });

    it('test-failure mentions failing test names', () => {
      const s = agent.getRepairStrategy('test-failure');
      assert.ok(s.includes('failing test'));
    });

    it('missing-artifact mentions files not created', () => {
      const s = agent.getRepairStrategy('missing-artifact');
      assert.ok(s.includes('not created'));
    });

    it('dependency-error mentions dependencies', () => {
      const s = agent.getRepairStrategy('dependency-error');
      assert.ok(s.includes('dependencies'));
    });

    it('timeout mentions simplify', () => {
      const s = agent.getRepairStrategy('timeout');
      assert.ok(s.includes('Simplify'));
    });

    it('general includes numbered instructions', () => {
      const s = agent.getRepairStrategy('general');
      assert.ok(s.includes('1.'));
    });
  });

  describe('buildRepairPrompt with classification', () => {
    function makeContext(overrides?: Record<string, unknown>) {
      return {
        stepNumber: 1,
        agentName: 'TestAgent',
        originalTask: 'Build the REST API',
        transcriptPath: path.join(tmpDir, 'share.md'),
        verificationReportPath: path.join(tmpDir, 'verification.md'),
        branchName: 'swarm/test/step-1-testagent',
        failedChecks: ['[test] Tests must pass - 2 assertions failed'],
        rootCause: 'Test assertions failed',
        retryCount: 1,
        ...overrides
      };
    }

    it('output includes FAILURE CLASSIFICATION section', () => {
      const prompt = agent.buildRepairPrompt(makeContext() as any);
      assert.ok(prompt.includes('FAILURE CLASSIFICATION: test-failure'));
    });

    it('test-failure prompt includes focused test check list', () => {
      const prompt = agent.buildRepairPrompt(makeContext({
        failedChecks: [
          '[test] user.test.ts: expected 200, got 404',
          '[test] auth.test.ts: token validation failed',
        ],
        rootCause: 'tests failed'
      }) as any);
      assert.ok(prompt.includes('Failing test checks:'));
      assert.ok(prompt.includes('user.test.ts'));
      assert.ok(prompt.includes('auth.test.ts'));
    });

    it('build-failure prompt includes build error list', () => {
      const prompt = agent.buildRepairPrompt(makeContext({
        failedChecks: [
          '[build] src/api.ts(12,5): error TS2304',
          '[build] src/db.ts(8,1): error TS2307',
        ],
        rootCause: 'compilation failed'
      }) as any);
      assert.ok(prompt.includes('FAILURE CLASSIFICATION: build-failure'));
      assert.ok(prompt.includes('Build errors:'));
      assert.ok(prompt.includes('src/api.ts'));
    });

    it('timeout prompt does not include test/build focused lists', () => {
      const prompt = agent.buildRepairPrompt(makeContext({
        failedChecks: ['[test] timeout exceeded'],
        rootCause: 'Session timed out'
      }) as any);
      assert.ok(prompt.includes('FAILURE CLASSIFICATION: timeout'));
      assert.ok(!prompt.includes('Failing test checks:'));
      assert.ok(!prompt.includes('Build errors:'));
    });

    it('still includes original task and repair agent header', () => {
      const prompt = agent.buildRepairPrompt(makeContext() as any);
      assert.ok(prompt.includes('REPAIR AGENT'));
      assert.ok(prompt.includes('Build the REST API'));
    });

    it('still includes repair commit instructions', () => {
      const prompt = agent.buildRepairPrompt(makeContext() as any);
      assert.ok(prompt.includes('repair:'));
    });
  });
});
