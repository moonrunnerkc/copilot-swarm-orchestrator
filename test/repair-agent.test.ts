import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import RepairAgent, { RepairContext, RepairResult } from '../src/repair-agent';
import { VerificationResult } from '../src/verifier-engine';

describe('RepairAgent', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-agent-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeContext(overrides?: Partial<RepairContext>): RepairContext {
    return {
      stepNumber: 1,
      agentName: 'TestAgent',
      originalTask: 'Implement user login endpoint',
      transcriptPath: path.join(tmpDir, 'share.md'),
      verificationReportPath: path.join(tmpDir, 'verification.md'),
      branchName: 'swarm/test-exec/step-1-testagent-retry1',
      failedChecks: ['[test] Tests must pass - no test output found in transcript'],
      rootCause: 'Tests not executed or failed',
      retryCount: 1,
      ...overrides
    };
  }

  describe('buildRepairPrompt', () => {
    it('should include the original task in the prompt', () => {
      const agent = new RepairAgent(tmpDir);
      const ctx = makeContext();
      const prompt = agent.buildRepairPrompt(ctx);

      assert.ok(prompt.includes('Implement user login endpoint'));
    });

    it('should include failed checks in the prompt', () => {
      const agent = new RepairAgent(tmpDir);
      const ctx = makeContext({
        failedChecks: [
          '[test] Tests must pass - no test output found',
          '[build] Build must succeed - no build output'
        ]
      });
      const prompt = agent.buildRepairPrompt(ctx);

      assert.ok(prompt.includes('[test] Tests must pass'));
      assert.ok(prompt.includes('[build] Build must succeed'));
    });

    it('should include the root cause in the prompt', () => {
      const agent = new RepairAgent(tmpDir);
      const ctx = makeContext({ rootCause: 'Build not executed or failed' });
      const prompt = agent.buildRepairPrompt(ctx);

      assert.ok(prompt.includes('Build not executed or failed'));
    });

    it('should include the retry count in the prompt', () => {
      const agent = new RepairAgent(tmpDir);
      const ctx = makeContext({ retryCount: 2 });
      const prompt = agent.buildRepairPrompt(ctx);

      assert.ok(prompt.includes('Repair attempt 2'));
    });

    it('should include verification report when file exists', () => {
      const reportPath = path.join(tmpDir, 'verification.md');
      fs.writeFileSync(reportPath, '# Verification Report\n\nFailed: test check\n', 'utf8');

      const agent = new RepairAgent(tmpDir);
      const ctx = makeContext({ verificationReportPath: reportPath });
      const prompt = agent.buildRepairPrompt(ctx);

      assert.ok(prompt.includes('VERIFICATION REPORT'));
      assert.ok(prompt.includes('Failed: test check'));
    });

    it('should include prior transcript when file exists', () => {
      const transcriptPath = path.join(tmpDir, 'share.md');
      fs.writeFileSync(transcriptPath, '# Copilot Session\n\nRan npm test\n', 'utf8');

      const agent = new RepairAgent(tmpDir);
      const ctx = makeContext({ transcriptPath });
      const prompt = agent.buildRepairPrompt(ctx);

      assert.ok(prompt.includes('PRIOR SESSION TRANSCRIPT'));
      assert.ok(prompt.includes('Ran npm test'));
    });

    it('should truncate long transcripts to stay within prompt budget', () => {
      const transcriptPath = path.join(tmpDir, 'share.md');
      const longContent = 'x'.repeat(10000);
      fs.writeFileSync(transcriptPath, longContent, 'utf8');

      const agent = new RepairAgent(tmpDir);
      const ctx = makeContext({ transcriptPath });
      const prompt = agent.buildRepairPrompt(ctx);

      // Should truncate to ~6000 chars
      assert.ok(prompt.includes('... (truncated)'));
      assert.ok(prompt.length < longContent.length);
    });

    it('should include repair instructions', () => {
      const agent = new RepairAgent(tmpDir);
      const ctx = makeContext();
      const prompt = agent.buildRepairPrompt(ctx);

      assert.ok(prompt.includes('REPAIR INSTRUCTIONS'));
      assert.ok(prompt.includes('repair:'));
    });

    it('should include REPAIR AGENT header', () => {
      const agent = new RepairAgent(tmpDir);
      const ctx = makeContext();
      const prompt = agent.buildRepairPrompt(ctx);

      assert.ok(prompt.includes('REPAIR AGENT'));
      assert.ok(prompt.includes('Self-Repair Session'));
    });
  });

  describe('estimateTokenCost', () => {
    it('should return 0 for empty string', () => {
      const agent = new RepairAgent(tmpDir);
      assert.strictEqual(agent.estimateTokenCost(''), 0);
    });

    it('should estimate tokens based on character count', () => {
      const agent = new RepairAgent(tmpDir);
      // 400 chars / 4 chars-per-token = 100 tokens
      const text = 'a'.repeat(400);
      assert.strictEqual(agent.estimateTokenCost(text), 100);
    });

    it('should ceil the result', () => {
      const agent = new RepairAgent(tmpDir);
      // 5 chars / 4 = 1.25, ceil = 2
      assert.strictEqual(agent.estimateTokenCost('hello'), 2);
    });
  });

  describe('extractFailedChecks', () => {
    it('should extract failed checks from a verification result', () => {
      const agent = new RepairAgent(tmpDir);
      const result: VerificationResult = {
        stepNumber: 1,
        agentName: 'TestAgent',
        passed: false,
        checks: [
          { type: 'test', description: 'Tests must pass', required: true, passed: false, reason: 'no test output' },
          { type: 'build', description: 'Build must succeed', required: true, passed: true },
          { type: 'commit', description: 'Commits required', required: false, passed: false, reason: 'no commits' }
        ],
        unverifiedClaims: [],
        timestamp: new Date().toISOString(),
        transcriptPath: '/tmp/test.md'
      };

      const checks = agent.extractFailedChecks(result);
      assert.strictEqual(checks.length, 2);
      assert.ok(checks[0].includes('[test]'));
      assert.ok(checks[0].includes('no test output'));
      assert.ok(checks[1].includes('[commit]'));
    });

    it('should include unverified claims', () => {
      const agent = new RepairAgent(tmpDir);
      const result: VerificationResult = {
        stepNumber: 1,
        agentName: 'TestAgent',
        passed: false,
        checks: [],
        unverifiedClaims: ['Added caching layer', 'Improved performance by 50%'],
        timestamp: new Date().toISOString(),
        transcriptPath: '/tmp/test.md'
      };

      const checks = agent.extractFailedChecks(result);
      assert.strictEqual(checks.length, 1);
      assert.ok(checks[0].includes('Unverified claims'));
      assert.ok(checks[0].includes('Added caching layer'));
    });

    it('should return empty array when all checks pass', () => {
      const agent = new RepairAgent(tmpDir);
      const result: VerificationResult = {
        stepNumber: 1,
        agentName: 'TestAgent',
        passed: true,
        checks: [
          { type: 'test', description: 'Tests must pass', required: true, passed: true }
        ],
        unverifiedClaims: [],
        timestamp: new Date().toISOString(),
        transcriptPath: '/tmp/test.md'
      };

      const checks = agent.extractFailedChecks(result);
      assert.strictEqual(checks.length, 0);
    });
  });

  describe('constructor', () => {
    it('should default maxRetries to 3', () => {
      const agent = new RepairAgent(tmpDir);
      // Verify by checking that buildRepairPrompt mentions "of 3"
      const ctx = makeContext({ retryCount: 1 });
      const prompt = agent.buildRepairPrompt(ctx);
      assert.ok(prompt.includes('of 3'));
    });

    it('should accept custom maxRetries', () => {
      const agent = new RepairAgent(tmpDir, 5);
      const ctx = makeContext({ retryCount: 1 });
      const prompt = agent.buildRepairPrompt(ctx);
      assert.ok(prompt.includes('of 5'));
    });
  });

  describe('repair-agent.yaml config', () => {
    // Resolve from workspace root (works whether run from src or dist)
    const projectRoot = path.resolve(__dirname, '..');
    // If running from dist/test, go up one more level
    const root = fs.existsSync(path.join(projectRoot, 'config')) ? projectRoot : path.resolve(projectRoot, '..');

    it('should exist and be valid YAML', () => {
      const configPath = path.join(root, 'config', 'repair-agent.yaml');
      assert.ok(fs.existsSync(configPath), 'config/repair-agent.yaml must exist');

      const yaml = require('js-yaml');
      const content = fs.readFileSync(configPath, 'utf8');
      const parsed = yaml.load(content);

      assert.ok(parsed.agent, 'YAML must have an agent section');
      assert.strictEqual(parsed.agent.name, 'RepairAgent');
      assert.ok(parsed.agent.purpose.length > 0, 'agent must have a purpose');
      assert.ok(Array.isArray(parsed.agent.scope), 'agent must have scope array');
      assert.ok(Array.isArray(parsed.agent.boundaries), 'agent must have boundaries array');
      assert.ok(Array.isArray(parsed.agent.done_definition), 'agent must have done_definition array');
      assert.ok(Array.isArray(parsed.agent.refusal_rules), 'agent must have refusal_rules array');
    });

    it('should have retry configuration', () => {
      const configPath = path.join(root, 'config', 'repair-agent.yaml');
      const yaml = require('js-yaml');
      const content = fs.readFileSync(configPath, 'utf8');
      const parsed = yaml.load(content);

      assert.ok(parsed.retry, 'YAML must have a retry section');
      assert.strictEqual(parsed.retry.maxAttempts, 3);
      assert.ok(typeof parsed.retry.estimatedTokenBudgetPerAttempt === 'number');
    });
  });
});
