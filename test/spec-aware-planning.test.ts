import * as assert from 'assert';
import { ConfigLoader } from '../src/config-loader';
import { PlanGenerator } from '../src/plan-generator';
import { CostEstimator } from '../src/cost-estimator';
import { DEFAULT_QUALITY_GATES_CONFIG } from '../src/quality-gates/default-config';
import { QualityGatesConfig } from '../src/quality-gates/types';
import { buildGateClauses, classifyStep, getGateRequirements, requiresTestStep } from '../src/gate-prompt-builder';

function makeConfig(overrides?: Partial<QualityGatesConfig>): QualityGatesConfig {
  const base = JSON.parse(JSON.stringify(DEFAULT_QUALITY_GATES_CONFIG)) as QualityGatesConfig;
  if (!overrides) return base;
  return { ...base, ...overrides, gates: { ...base.gates, ...(overrides.gates || {}) } };
}

function disableGate(config: QualityGatesConfig, gate: keyof QualityGatesConfig['gates']): QualityGatesConfig {
  return {
    ...config,
    gates: {
      ...config.gates,
      [gate]: { ...config.gates[gate], enabled: false },
    },
  };
}

describe('gate-prompt-builder', () => {
  describe('classifyStep', () => {
    it('classifies TesterElite as test', () => {
      assert.strictEqual(classifyStep('TesterElite'), 'test');
    });

    it('classifies FrontendExpert as frontend', () => {
      assert.strictEqual(classifyStep('FrontendExpert'), 'frontend');
    });

    it('classifies IntegratorFinalizer as documentation', () => {
      assert.strictEqual(classifyStep('IntegratorFinalizer'), 'documentation');
    });

    it('classifies BackendMaster as code-generation', () => {
      assert.strictEqual(classifyStep('BackendMaster'), 'code-generation');
    });

    it('classifies unknown agent as code-generation', () => {
      assert.strictEqual(classifyStep('CustomAgent'), 'code-generation');
    });
  });

  describe('buildGateClauses', () => {
    it('returns empty array when gates are disabled globally', () => {
      const config = makeConfig({ enabled: false });
      assert.strictEqual(buildGateClauses(config).length, 0);
    });

    it('produces clauses for all enabled gates at defaults', () => {
      const config = makeConfig();
      const clauses = buildGateClauses(config);
      assert.ok(clauses.length >= 6, `Expected at least 6 clauses, got ${clauses.length}`);
    });

    it('omits clause for a disabled gate', () => {
      const config = disableGate(makeConfig(), 'accessibility');
      const clauses = buildGateClauses(config);
      const hasAccessibility = clauses.some(c => c.text.includes('ARIA'));
      assert.strictEqual(hasAccessibility, false);
    });
  });

  describe('getGateRequirements', () => {
    it('includes test isolation requirements for TesterElite', () => {
      const config = makeConfig();
      const reqs = getGateRequirements(config, 'TesterElite');
      assert.ok(reqs.includes('independently runnable'), 'Should include test isolation requirement');
    });

    it('includes accessibility requirements for FrontendExpert', () => {
      const config = makeConfig();
      const reqs = getGateRequirements(config, 'FrontendExpert');
      assert.ok(reqs.includes('ARIA'), 'Should include accessibility requirement');
    });

    it('does not include accessibility for BackendMaster', () => {
      const config = makeConfig();
      const reqs = getGateRequirements(config, 'BackendMaster');
      assert.ok(!reqs.includes('ARIA'), 'Backend steps should not get accessibility requirements');
    });

    it('includes scaffold-defaults for all step types', () => {
      const config = makeConfig();
      for (const agent of ['BackendMaster', 'TesterElite', 'FrontendExpert', 'IntegratorFinalizer']) {
        const reqs = getGateRequirements(config, agent);
        assert.ok(reqs.includes('TODO comments'), `${agent} should get scaffold-defaults requirement`);
      }
    });

    it('returns empty string when gates are disabled', () => {
      const config = makeConfig({ enabled: false });
      assert.strictEqual(getGateRequirements(config, 'BackendMaster'), '');
    });

    it('keeps prompt additions concise (under 100 words per gate per step)', () => {
      const config = makeConfig();
      const clauses = buildGateClauses(config);
      for (const clause of clauses) {
        const wordCount = clause.text.split(/\s+/).length;
        assert.ok(wordCount < 100, `Clause "${clause.text.slice(0, 40)}..." has ${wordCount} words, exceeds 100`);
      }
    });
  });

  describe('requiresTestStep', () => {
    it('returns true when testCoverage is enabled', () => {
      assert.strictEqual(requiresTestStep(makeConfig()), true);
    });

    it('returns false when gates are globally disabled', () => {
      assert.strictEqual(requiresTestStep(makeConfig({ enabled: false })), false);
    });

    it('returns false when testCoverage is disabled', () => {
      assert.strictEqual(requiresTestStep(disableGate(makeConfig(), 'testCoverage')), false);
    });
  });
});

describe('spec-aware-planning', () => {
  const configLoader = new ConfigLoader();
  const agents = configLoader.loadAllAgents();

  describe('plan with gate config', () => {
    it('includes coverage requirements in test step prompts when testCoverage enabled', () => {
      const config = makeConfig();
      const generator = new PlanGenerator(agents, config);
      const plan = generator.createPlan('Build a REST API for user management');

      const testStep = plan.steps.find(s => s.agentName === 'TesterElite');
      assert.ok(testStep, 'Plan should have a TesterElite step');
      assert.ok(
        testStep.task.includes('test coverage') || testStep.task.includes('independently runnable'),
        'Test step should include gate-derived requirements'
      );
    });

    it('includes accessibility requirements in frontend steps but not backend', () => {
      const config = makeConfig();
      const generator = new PlanGenerator(agents, config);
      const plan = generator.createPlan('Create a web app with a dashboard');

      const frontendStep = plan.steps.find(s => s.agentName === 'FrontendExpert');
      const backendStep = plan.steps.find(s => s.agentName === 'BackendMaster');

      if (frontendStep) {
        assert.ok(frontendStep.task.includes('ARIA'), 'Frontend step should include accessibility');
      }
      if (backendStep) {
        assert.ok(!backendStep.task.includes('ARIA'), 'Backend step should not include accessibility');
      }
    });

    it('adds explicit test step when testCoverage enabled and none exists', () => {
      // Infrastructure goals typically don't generate TesterElite steps
      const config = makeConfig();
      const generator = new PlanGenerator(agents, config);
      const plan = generator.createPlan('Deploy infrastructure with Terraform');

      const testSteps = plan.steps.filter(s => s.agentName === 'TesterElite');
      assert.ok(testSteps.length > 0, 'Should inject at least one TesterElite step');
    });

    it('does not duplicate test step when one already exists', () => {
      const config = makeConfig();
      const generator = new PlanGenerator(agents, config);
      const plan = generator.createPlan('Build a REST API for user management');

      const testSteps = plan.steps.filter(s => s.agentName === 'TesterElite');
      assert.strictEqual(testSteps.length, 1, 'Should not duplicate existing test step');
    });

    it('plan with all gates at defaults includes baseline requirements', () => {
      const config = makeConfig();
      const generator = new PlanGenerator(agents, config);
      const plan = generator.createPlan('Create a Node.js REST API');

      // At least one step should have gate requirements appended
      const hasGateReqs = plan.steps.some(s => s.task.includes('Quality gate requirements:'));
      assert.ok(hasGateReqs, 'Plan should have gate requirements in at least one step');
    });

    it('plan without gate config has no gate requirements in prompts', () => {
      const generator = new PlanGenerator(agents);
      const plan = generator.createPlan('Create a Node.js REST API');

      const hasGateReqs = plan.steps.some(s => s.task.includes('Quality gate requirements:'));
      assert.ok(!hasGateReqs, 'Plan without gate config should not have gate requirements');
    });
  });
});

describe('cost-estimator gate-aware adjustment', () => {
  it('reduces retry probability by 30% when gateAwarePrompts is true', () => {
    const estimator = new CostEstimator();
    const plan = {
      goal: 'Build API',
      createdAt: new Date().toISOString(),
      steps: [
        { stepNumber: 1, agentName: 'BackendMaster', task: 'Build API', dependencies: [], expectedOutputs: ['API'] },
      ],
    };

    const baseline = estimator.estimate(plan, { modelName: 'claude-sonnet-4' });
    const gateAware = estimator.estimate(plan, { modelName: 'claude-sonnet-4', gateAwarePrompts: true });

    // Gate-aware should have lower retry buffer
    assert.ok(
      gateAware.retryBuffer <= baseline.retryBuffer,
      `Gate-aware retry buffer (${gateAware.retryBuffer}) should be <= baseline (${baseline.retryBuffer})`
    );

    // Per-step retry probability should be reduced
    assert.ok(
      gateAware.perStep[0].retryProbability < baseline.perStep[0].retryProbability,
      'Gate-aware retry probability should be lower than baseline'
    );
  });

  it('does not reduce when gateAwarePrompts is false or absent', () => {
    const estimator = new CostEstimator();
    const plan = {
      goal: 'Build API',
      createdAt: new Date().toISOString(),
      steps: [
        { stepNumber: 1, agentName: 'BackendMaster', task: 'Build API', dependencies: [], expectedOutputs: ['API'] },
      ],
    };

    const without = estimator.estimate(plan, { modelName: 'claude-sonnet-4' });
    const explicit = estimator.estimate(plan, { modelName: 'claude-sonnet-4', gateAwarePrompts: false });

    assert.strictEqual(
      without.perStep[0].retryProbability,
      explicit.perStep[0].retryProbability,
      'Explicit false should match absent'
    );
  });
});
