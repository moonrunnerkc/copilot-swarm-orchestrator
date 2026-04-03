import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SwarmOrchestrator, SwarmExecutionContext, ParallelStepResult } from '../src/swarm-orchestrator';
import { ExecutionPlan, PlanStep } from '../src/plan-generator';
import { VerificationResult, VerificationCheck } from '../src/verifier-engine';
import { AgentProfile } from '../src/config-loader';
import { CriticResult } from '../src/types';

/**
 * Tests for SwarmOrchestrator's pure/nearly-pure private methods.
 * We access private methods via (instance as any) since they contain
 * the core algorithmic logic worth unit-testing in isolation.
 */

function makePlan(steps: Partial<PlanStep>[]): ExecutionPlan {
  return {
    goal: 'test goal',
    createdAt: new Date().toISOString(),
    steps: steps.map((s, i) => ({
      stepNumber: s.stepNumber ?? i + 1,
      agentName: s.agentName ?? 'backend_master',
      task: s.task ?? `step ${i + 1} task`,
      dependencies: s.dependencies ?? [],
      expectedOutputs: s.expectedOutputs ?? [],
    })),
    metadata: { totalSteps: steps.length },
  };
}

function makeAgent(name: string): AgentProfile {
  return {
    name,
    purpose: 'test agent',
    scope: ['src/'],
    boundaries: ['do not touch config/'],
    done_definition: ['tests pass'],
    refusal_rules: [],
    output_contract: { transcript: 'transcript.md', artifacts: [] },
  };
}

function makeCheck(type: VerificationCheck['type'], passed: boolean, reason?: string): VerificationCheck {
  const check: VerificationCheck = {
    type,
    description: `${type} check`,
    required: true,
    passed,
  };
  if (reason !== undefined) {
    check.reason = reason;
  }
  return check;
}

function makeVerificationResult(stepNumber: number, checks: VerificationCheck[]): VerificationResult {
  return {
    stepNumber,
    agentName: 'backend_master',
    passed: checks.every(c => c.passed),
    checks,
    unverifiedClaims: [],
    timestamp: new Date().toISOString(),
    transcriptPath: '/tmp/transcript.md',
  };
}

function makeStepResult(stepNumber: number, verification?: VerificationResult): ParallelStepResult {
  const result: ParallelStepResult = {
    stepNumber,
    agentName: 'backend_master',
    status: 'completed',
    sessionResult: { exitCode: 0, output: 'done', error: '' } as any,
  };
  if (verification !== undefined) {
    result.verificationResult = verification;
  }
  return result;
}

describe('SwarmOrchestrator', () => {
  let testDir: string;
  let orchestrator: any; // typed as any for private method access

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-orch-test-'));
    orchestrator = new SwarmOrchestrator(testDir);
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('generateExecutionId', () => {
    it('produces a string starting with "swarm-"', () => {
      const id: string = orchestrator.generateExecutionId();
      assert.ok(id.startsWith('swarm-'), `Expected id to start with "swarm-", got: ${id}`);
    });

    it('includes ISO date in the suffix', () => {
      const id: string = orchestrator.generateExecutionId();
      const suffix = id.replace('swarm-', '');
      // Verify it parses back to a valid date when separators are restored
      const restored = suffix.replace(/-(\d{2})-(\d{2})-(\d{3})Z$/, ':$1:$2.$3Z');
      const parsed = new Date(restored);
      assert.ok(!isNaN(parsed.getTime()), `Could not parse date from "${restored}"`);
    });

    it('contains an ISO timestamp fragment', () => {
      const id: string = orchestrator.generateExecutionId();
      // After "swarm-", the rest should look like a date: digits and dashes
      const suffix = id.replace('swarm-', '');
      assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(suffix), `Expected ISO date prefix in "${suffix}"`);
    });
  });

  describe('buildDependencyGraph', () => {
    it('returns a Map with step numbers as keys', () => {
      const plan = makePlan([
        { stepNumber: 1, dependencies: [] },
        { stepNumber: 2, dependencies: [1] },
        { stepNumber: 3, dependencies: [1, 2] },
      ]);

      const graph: Map<number, number[]> = orchestrator.buildDependencyGraph(plan);
      assert.strictEqual(graph.size, 3);
      assert.deepStrictEqual(graph.get(1), []);
      assert.deepStrictEqual(graph.get(2), [1]);
      assert.deepStrictEqual(graph.get(3), [1, 2]);
    });

    it('handles empty plan', () => {
      const plan = makePlan([]);
      const graph: Map<number, number[]> = orchestrator.buildDependencyGraph(plan);
      assert.strictEqual(graph.size, 0);
    });

    it('handles single step with no dependencies', () => {
      const plan = makePlan([{ stepNumber: 1, dependencies: [] }]);
      const graph: Map<number, number[]> = orchestrator.buildDependencyGraph(plan);
      assert.strictEqual(graph.size, 1);
      assert.deepStrictEqual(graph.get(1), []);
    });
  });

  describe('identifyExecutionWaves', () => {
    it('puts independent steps in first wave', () => {
      const graph = new Map<number, number[]>();
      graph.set(1, []);
      graph.set(2, []);
      graph.set(3, []);

      const waves: number[][] = orchestrator.identifyExecutionWaves(graph);
      assert.strictEqual(waves.length, 1);
      assert.deepStrictEqual(waves[0].sort(), [1, 2, 3]);
    });

    it('creates sequential waves for linear dependencies', () => {
      const graph = new Map<number, number[]>();
      graph.set(1, []);
      graph.set(2, [1]);
      graph.set(3, [2]);

      const waves: number[][] = orchestrator.identifyExecutionWaves(graph);
      assert.strictEqual(waves.length, 3);
      assert.deepStrictEqual(waves[0], [1]);
      assert.deepStrictEqual(waves[1], [2]);
      assert.deepStrictEqual(waves[2], [3]);
    });

    it('handles diamond dependency pattern', () => {
      // 1 -> 2, 1 -> 3, 2 -> 4, 3 -> 4
      const graph = new Map<number, number[]>();
      graph.set(1, []);
      graph.set(2, [1]);
      graph.set(3, [1]);
      graph.set(4, [2, 3]);

      const waves: number[][] = orchestrator.identifyExecutionWaves(graph);
      assert.strictEqual(waves.length, 3);
      assert.deepStrictEqual(waves[0], [1]);
      assert.deepStrictEqual(waves[1].sort(), [2, 3]);
      assert.deepStrictEqual(waves[2], [4]);
    });

    it('throws on circular dependencies', () => {
      const graph = new Map<number, number[]>();
      graph.set(1, [2]);
      graph.set(2, [1]);

      assert.throws(() => {
        orchestrator.identifyExecutionWaves(graph);
      }, /[Cc]ircular/);
    });

    it('handles empty graph', () => {
      const graph = new Map<number, number[]>();
      const waves: number[][] = orchestrator.identifyExecutionWaves(graph);
      assert.strictEqual(waves.length, 0);
    });

    it('handles mixed parallel and sequential', () => {
      // 1 -> 3, 2 -> 3, 3 -> 4, 3 -> 5
      const graph = new Map<number, number[]>();
      graph.set(1, []);
      graph.set(2, []);
      graph.set(3, [1, 2]);
      graph.set(4, [3]);
      graph.set(5, [3]);

      const waves: number[][] = orchestrator.identifyExecutionWaves(graph);
      assert.strictEqual(waves.length, 3);
      assert.deepStrictEqual(waves[0].sort(), [1, 2]);
      assert.deepStrictEqual(waves[1], [3]);
      assert.deepStrictEqual(waves[2].sort(), [4, 5]);
    });
  });

  describe('buildSwarmPrompt', () => {
    it('includes step number, agent name, and task', () => {
      const plan = makePlan([{ stepNumber: 1, task: 'implement user auth' }]);
      const agent = makeAgent('backend_master');
      const context: Partial<SwarmExecutionContext> = { plan };

      const prompt: string = orchestrator.buildSwarmPrompt(
        plan.steps[0], agent, context, ''
      );

      assert.ok(prompt.includes('Step 1/1'));
      assert.ok(prompt.includes('backend_master'));
      assert.ok(prompt.includes('implement user auth'));
    });

    it('includes dependency context when provided', () => {
      const plan = makePlan([{ stepNumber: 2, task: 'add tests' }]);
      const agent = makeAgent('test_agent');
      const context: Partial<SwarmExecutionContext> = { plan };
      const depContext = 'Step 1 created src/auth.ts with login() function';

      const prompt: string = orchestrator.buildSwarmPrompt(
        plan.steps[0], agent, context, depContext
      );

      assert.ok(prompt.includes('DEPENDENCY CONTEXT'));
      assert.ok(prompt.includes('src/auth.ts'));
    });

    it('omits dependency context section when empty', () => {
      const plan = makePlan([{ stepNumber: 1, task: 'setup project' }]);
      const agent = makeAgent('backend_master');
      const context: Partial<SwarmExecutionContext> = { plan };

      const prompt: string = orchestrator.buildSwarmPrompt(
        plan.steps[0], agent, context, ''
      );

      assert.ok(!prompt.includes('DEPENDENCY CONTEXT'));
    });

    it('includes agent scope and boundaries', () => {
      const plan = makePlan([{ stepNumber: 1, task: 'work' }]);
      const agent = makeAgent('backend_master');
      const context: Partial<SwarmExecutionContext> = { plan };

      const prompt: string = orchestrator.buildSwarmPrompt(
        plan.steps[0], agent, context, ''
      );

      assert.ok(prompt.includes('- src/'), 'prompt should list agent scope items');
      assert.ok(prompt.includes('- do not touch config/'), 'prompt should list agent boundaries');
      assert.ok(prompt.includes('- tests pass'), 'prompt should list done definition');
    });

    it('includes branch isolation warning', () => {
      const plan = makePlan([{ stepNumber: 1, task: 'work' }]);
      const agent = makeAgent('backend_master');
      const context: Partial<SwarmExecutionContext> = { plan };

      const prompt: string = orchestrator.buildSwarmPrompt(
        plan.steps[0], agent, context, ''
      );

      assert.ok(prompt.includes('Do NOT run git checkout'));
    });
  });

  describe('runCriticReview', () => {
    it('returns score 100 and approve when all checks pass', () => {
      const plan = makePlan([{ stepNumber: 1, expectedOutputs: ['file.ts'] }]);
      const checks = [makeCheck('test', true), makeCheck('build', true)];
      const results = [makeStepResult(1, makeVerificationResult(1, checks))];
      const context: Partial<SwarmExecutionContext> = { plan };

      const critic: CriticResult = orchestrator.runCriticReview(results, context, plan);
      assert.strictEqual(critic.score, 100);
      assert.strictEqual(critic.recommendation, 'approve');
      assert.strictEqual(critic.flags.length, 0);
    });

    it('deducts for failed test checks', () => {
      const plan = makePlan([{ stepNumber: 1, expectedOutputs: [] }]);
      const checks = [makeCheck('test', false, 'npm test failed')];
      const results = [makeStepResult(1, makeVerificationResult(1, checks))];
      const context: Partial<SwarmExecutionContext> = { plan };

      const critic: CriticResult = orchestrator.runCriticReview(results, context, plan);
      assert.ok(critic.score < 100);
      assert.ok(critic.flags.length > 0);
      assert.ok(critic.flags[0].includes('test'));
    });

    it('deducts more heavily for build failures than lint', () => {
      const plan = makePlan([
        { stepNumber: 1, expectedOutputs: [] },
        { stepNumber: 2, expectedOutputs: [] },
      ]);

      const buildFail = [makeCheck('build', false, 'tsc failed')];
      const lintFail = [makeCheck('lint', false, 'eslint warning')];

      const buildResults = [makeStepResult(1, makeVerificationResult(1, buildFail))];
      const lintResults = [makeStepResult(2, makeVerificationResult(2, lintFail))];

      const buildCritic: CriticResult = orchestrator.runCriticReview(buildResults, {}, plan);
      const lintCritic: CriticResult = orchestrator.runCriticReview(lintResults, {}, plan);

      // Build weight=25 vs lint weight=5
      assert.ok(buildCritic.score < lintCritic.score,
        `Build score ${buildCritic.score} should be lower than lint score ${lintCritic.score}`);
    });

    it('recommends reject for score below 60', () => {
      const plan = makePlan([{ stepNumber: 1, expectedOutputs: [] }]);
      // 3 test failures (20 each = 60 points) + 1 build = 25 => score ~15
      const checks = [
        makeCheck('test', false), makeCheck('test', false), makeCheck('test', false),
        makeCheck('build', false),
      ];
      const results = [makeStepResult(1, makeVerificationResult(1, checks))];

      const critic: CriticResult = orchestrator.runCriticReview(results, {}, plan);
      assert.strictEqual(critic.recommendation, 'reject');
      assert.ok(critic.score < 60);
    });

    it('recommends revise for score between 60 and 100 with flags', () => {
      const plan = makePlan([{ stepNumber: 1, expectedOutputs: [] }]);
      const checks = [makeCheck('lint', false, 'minor warning')]; // only -5
      const results = [makeStepResult(1, makeVerificationResult(1, checks))];

      const critic: CriticResult = orchestrator.runCriticReview(results, {}, plan);
      assert.strictEqual(critic.recommendation, 'revise');
      assert.ok(critic.score >= 60);
    });

    it('clamps score to 0-100 range', () => {
      const plan = makePlan([{ stepNumber: 1, expectedOutputs: [] }]);
      // Many failures to drive score well below 0
      const checks: VerificationCheck[] = [];
      for (let i = 0; i < 10; i++) {
        checks.push(makeCheck('build', false));
      }
      const results = [makeStepResult(1, makeVerificationResult(1, checks))];

      const critic: CriticResult = orchestrator.runCriticReview(results, {}, plan);
      assert.strictEqual(critic.score, 0);
    });

    it('flags missing session output when expectedOutputs exist', () => {
      const plan = makePlan([{ stepNumber: 1, expectedOutputs: ['index.ts'] }]);
      const result: ParallelStepResult = {
        stepNumber: 1,
        agentName: 'backend_master',
        status: 'completed',
        // no sessionResult
      };

      const critic: CriticResult = orchestrator.runCriticReview([result], {}, plan);
      assert.ok(critic.flags.some(f => f.includes('no session output')));
    });

    it('handles empty results array', () => {
      const plan = makePlan([]);
      const critic: CriticResult = orchestrator.runCriticReview([], {}, plan);
      assert.strictEqual(critic.score, 100);
      assert.strictEqual(critic.recommendation, 'approve');
    });
  });

  describe('buildRemediationStep', () => {
    function makeContext(): SwarmExecutionContext {
      return {
        plan: makePlan([]),
        runDir: '/tmp/run',
        executionId: 'test-id',
        startTime: new Date().toISOString(),
        results: [],
        contextBroker: {} as any,
        mainBranch: 'main',
        qualityGatesTriggered: {
          duplicateRefactorAdded: false,
          readmeTruthAdded: false,
          scaffoldFixAdded: false,
          configFixAdded: false,
          accessibilityFixAdded: false,
          testCoverageFixAdded: false,
        },
      };
    }

    it('returns null when gate result is undefined', () => {
      const context = makeContext();
      const agents = new Map([['integrator_finalizer', makeAgent('integrator_finalizer')]]);
      const result = orchestrator.buildRemediationStep(
        undefined, true, 'duplicateRefactorAdded', context, agents, 'fix dupes', 'warn', 1, 'backend_master'
      );
      assert.strictEqual(result, null);
    });

    it('returns null when gate did not fail', () => {
      const context = makeContext();
      const agents = new Map([['integrator_finalizer', makeAgent('integrator_finalizer')]]);
      const result = orchestrator.buildRemediationStep(
        { status: 'pass' }, true, 'duplicateRefactorAdded', context, agents, 'fix dupes', 'warn', 1, 'backend_master'
      );
      assert.strictEqual(result, null);
    });

    it('returns null when config is not enabled', () => {
      const context = makeContext();
      const agents = new Map([['integrator_finalizer', makeAgent('integrator_finalizer')]]);
      const result = orchestrator.buildRemediationStep(
        { status: 'fail' }, false, 'duplicateRefactorAdded', context, agents, 'fix', 'warn', 1, 'backend_master'
      );
      assert.strictEqual(result, null);
    });

    it('returns null when already triggered', () => {
      const context = makeContext();
      context.qualityGatesTriggered!.duplicateRefactorAdded = true;
      const agents = new Map([['integrator_finalizer', makeAgent('integrator_finalizer')]]);
      const result = orchestrator.buildRemediationStep(
        { status: 'fail' }, true, 'duplicateRefactorAdded', context, agents, 'fix', 'warn', 1, 'backend_master'
      );
      assert.strictEqual(result, null);
    });

    it('returns remediation step with integrator_finalizer preferred', () => {
      const context = makeContext();
      const agents = new Map([
        ['integrator_finalizer', makeAgent('integrator_finalizer')],
        ['backend_master', makeAgent('backend_master')],
      ]);
      const result = orchestrator.buildRemediationStep(
        { status: 'fail' }, true, 'duplicateRefactorAdded', context, agents,
        'Refactor duplicate code', 'Warning: duplicates found', 3, 'backend_master'
      );
      assert.ok(result);
      assert.strictEqual(result.agent, 'integrator_finalizer');
      assert.strictEqual(result.task, 'Refactor duplicate code');
      assert.strictEqual(result.afterStep, 3);
    });

    it('falls back to specified agent when integrator not available', () => {
      const context = makeContext();
      const agents = new Map([['backend_master', makeAgent('backend_master')]]);
      const result = orchestrator.buildRemediationStep(
        { status: 'fail' }, true, 'scaffoldFixAdded', context, agents,
        'Fix scaffold', 'Warning', 2, 'backend_master'
      );
      assert.ok(result);
      assert.strictEqual(result.agent, 'backend_master');
    });

    it('sets the triggered flag on context', () => {
      const context = makeContext();
      const agents = new Map([['backend_master', makeAgent('backend_master')]]);
      orchestrator.buildRemediationStep(
        { status: 'fail' }, true, 'readmeTruthAdded', context, agents,
        'Fix README', 'Warning', 1, 'backend_master'
      );
      assert.strictEqual(context.qualityGatesTriggered!.readmeTruthAdded, true);
    });
  });
});
