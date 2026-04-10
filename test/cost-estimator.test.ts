import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { CostEstimator, CostEstimate, MODEL_MULTIPLIERS } from '../src/cost-estimator';
import { ExecutionPlan } from '../src/plan-generator';
import { KnowledgeBaseManager } from '../src/knowledge-base';
import { CostHistoryEvidence } from '../src/metrics-types';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cost-estimator-'));
}

function makeplan(stepCount: number, taskLength: number = 40): ExecutionPlan {
  const steps = Array.from({ length: stepCount }, (_, i) => ({
    stepNumber: i + 1,
    agentName: `Agent${i + 1}`,
    task: 'x'.repeat(taskLength),
    dependencies: i > 0 ? [i] : [],
    expectedOutputs: ['output.ts'],
  }));

  return {
    goal: 'Test goal',
    createdAt: new Date().toISOString(),
    steps,
    metadata: { totalSteps: stepCount },
  };
}

describe('CostEstimator', () => {
  let tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
    tempDirs = [];
  });

  describe('estimate()', () => {
    it('calculates correct totals for a simple plan with 1x model', () => {
      const estimator = new CostEstimator();
      const plan = makeplan(4);
      const result = estimator.estimate(plan, { modelName: 'claude-sonnet-4' });

      assert.strictEqual(result.modelMultiplier, 1);
      assert.strictEqual(result.perStep.length, 4);
      // Per-step: 1 base request (no per-step retry inflation)
      assert.strictEqual(result.perStep[0].estimatedPremiumRequests, 1);
      // Total: 4 base + ceil(4 * 0.15) = 4 + 1 = 5 (no remediation without qualityGatesEnabled)
      assert.strictEqual(result.totalPremiumRequests, 5);
      assert.strictEqual(result.lowEstimate, 4);
      assert.strictEqual(result.remediationBuffer, 0);
    });

    it('applies o3 20x multiplier correctly', () => {
      const estimator = new CostEstimator();
      const plan = makeplan(2);
      const result = estimator.estimate(plan, { modelName: 'o3' });

      assert.strictEqual(result.modelMultiplier, 20);
      // Per-step: 20 base requests
      assert.strictEqual(result.perStep[0].estimatedPremiumRequests, 20);
      // Total: 40 base + ceil(40 * 0.15) = 40 + 6 = 46
      assert.strictEqual(result.totalPremiumRequests, 46);
      assert.strictEqual(result.lowEstimate, 40);
    });

    it('applies o4-mini 5x multiplier', () => {
      const estimator = new CostEstimator();
      const plan = makeplan(3);
      const result = estimator.estimate(plan, { modelName: 'o4-mini' });

      assert.strictEqual(result.modelMultiplier, 5);
      // Per-step: 5 base requests
      assert.strictEqual(result.perStep[0].estimatedPremiumRequests, 5);
    });

    it('defaults unknown models to 1x multiplier', () => {
      const estimator = new CostEstimator();
      const plan = makeplan(1);
      const result = estimator.estimate(plan, { modelName: 'future-model-9000' });

      assert.strictEqual(result.modelMultiplier, 1);
    });

    it('handles empty plan with zero steps', () => {
      const estimator = new CostEstimator();
      const plan = makeplan(0);
      const result = estimator.estimate(plan, { modelName: 'gpt-4o' });

      assert.strictEqual(result.totalPremiumRequests, 0);
      assert.strictEqual(result.perStep.length, 0);
      assert.strictEqual(result.overageCostUSD, 0);
      assert.strictEqual(result.lowEstimate, 0);
      assert.strictEqual(result.highEstimate, 0);
      assert.strictEqual(result.remediationBuffer, 0);
    });

    it('calculates overage cost when estimate exceeds allowance', () => {
      const estimator = new CostEstimator();
      const plan = makeplan(6);
      const result = estimator.estimate(plan, {
        modelName: 'gpt-4o',
        remainingAllowance: 5,
      });

      // Total: 6 base + ceil(6 * 0.15) retry = 7. Overage = (7 - 5) * 0.04 = 0.08
      assert.ok(result.overageCostUSD > 0, 'Should have overage cost');
      assert.strictEqual(result.remainingAllowance, 5);
    });

    it('returns zero overage when within allowance', () => {
      const estimator = new CostEstimator();
      const plan = makeplan(2);
      const result = estimator.estimate(plan, {
        modelName: 'gpt-4o',
        remainingAllowance: 100,
      });

      assert.strictEqual(result.overageCostUSD, 0);
    });

    it('returns zero overage when allowance not specified', () => {
      const estimator = new CostEstimator();
      const plan = makeplan(3);
      const result = estimator.estimate(plan, { modelName: 'gpt-4o' });

      assert.strictEqual(result.overageCostUSD, 0);
      assert.strictEqual(result.remainingAllowance, undefined);
    });

    it('includes prompt token estimates in per-step breakdown', () => {
      const estimator = new CostEstimator();
      const plan = makeplan(1, 200);
      const result = estimator.estimate(plan, { modelName: 'gpt-4o' });

      const step = result.perStep[0];
      // 350 (boilerplate) + ceil(200/4) = 350 + 50 = 400
      assert.strictEqual(step.estimatedPromptTokens, 400);
    });

    it('generates rationale string with model info and retry rate', () => {
      const estimator = new CostEstimator();
      const plan = makeplan(1);
      const result = estimator.estimate(plan, { modelName: 'o3' });

      const rationale = result.perStep[0].rationale;
      assert.ok(rationale.includes('o3'), 'Rationale should name the model');
      assert.ok(rationale.includes('20x'), 'Rationale should include multiplier');
      assert.ok(rationale.includes('15%'), 'Rationale should include retry rate');
    });

    it('increases estimates in fleet mode', () => {
      const estimator = new CostEstimator();
      const plan = makeplan(2);

      const standard = estimator.estimate(plan, { modelName: 'gpt-4o' });
      const fleet = estimator.estimate(plan, { modelName: 'gpt-4o', fleetMode: true });

      assert.ok(
        fleet.totalPremiumRequests > standard.totalPremiumRequests,
        `Fleet (${fleet.totalPremiumRequests}) should exceed standard (${standard.totalPremiumRequests})`,
      );
    });

    it('adds remediation buffer when qualityGatesEnabled is true', () => {
      const estimator = new CostEstimator();
      const plan = makeplan(5);

      const withoutGates = estimator.estimate(plan, { modelName: 'claude-sonnet-4' });
      const withGates = estimator.estimate(plan, { modelName: 'claude-sonnet-4', qualityGatesEnabled: true });

      assert.strictEqual(withoutGates.remediationBuffer, 0);
      assert.ok(withGates.remediationBuffer > 0,
        `Expected remediation buffer > 0 with gates enabled, got ${withGates.remediationBuffer}`);
      // Default rate 0.25: ceil(5 * 0.25 * 1) = 2
      assert.strictEqual(withGates.remediationBuffer, 2);
      assert.ok(withGates.totalPremiumRequests > withoutGates.totalPremiumRequests,
        'Total with gates should exceed total without gates');
    });

    it('applies model multiplier to remediation buffer', () => {
      const estimator = new CostEstimator();
      const plan = makeplan(4);
      const result = estimator.estimate(plan, { modelName: 'o4-mini', qualityGatesEnabled: true });

      // Default rate 0.25: ceil(4 * 0.25 * 5) = ceil(5) = 5
      assert.strictEqual(result.remediationBuffer, 5);
    });

    it('calibrates remediation rate from knowledge base when history exists', () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const kb = new KnowledgeBaseManager(dir);

      // Record structured evidence with remediation data: 5 planned steps, 3 remediations
      const evidence: CostHistoryEvidence = {
        runId: 'test-run-remed',
        estimated: 7,
        actual: 8,
        retries: 0,
        steps: 5,
        model: 'claude-sonnet-4',
        remediationSteps: 3,
      };
      kb.addOrUpdatePattern({
        category: 'cost_history',
        insight: '5 steps, 3 remediation steps',
        confidence: 'high',
        evidence: [JSON.stringify(evidence)],
        impact: 'medium',
      });

      const estimator = new CostEstimator(kb);
      const plan = makeplan(10);
      const result = estimator.estimate(plan, { modelName: 'claude-sonnet-4', qualityGatesEnabled: true });

      // Remediation rate from history: 3/5 = 0.60, capped at 0.50
      // ceil(10 * 0.50 * 1) = 5
      assert.strictEqual(result.remediationBuffer, 5);
    });
  });

  describe('recordActual() and getAccuracy()', () => {
    it('returns 1.0 with no recorded actuals', () => {
      const estimator = new CostEstimator();
      assert.strictEqual(estimator.getAccuracy(), 1.0);
    });

    it('returns perfect accuracy when estimates match actuals', () => {
      const estimator = new CostEstimator();
      estimator.recordActual(1, 2, 2, 0);
      estimator.recordActual(2, 1, 1, 0);

      assert.strictEqual(estimator.getAccuracy(), 1.0);
    });

    it('returns reduced accuracy when estimates differ from actuals', () => {
      const estimator = new CostEstimator();
      // estimated 2 but used 4; estimated 1 but used 3 => totalEst=3, totalAct=7
      estimator.recordActual(1, 2, 4, 1);
      estimator.recordActual(2, 1, 3, 1);

      const accuracy = estimator.getAccuracy();
      // Underestimate: 3/7 ≈ 0.4286
      assert.ok(accuracy > 0.42 && accuracy < 0.44, `Accuracy ${accuracy} should be ~0.4286`);
    });

    it('clamps accuracy near 0 when massively underestimated', () => {
      const estimator = new CostEstimator();
      estimator.recordActual(1, 1, 100, 5);

      const accuracy = estimator.getAccuracy();
      // Underestimate: 1/100 = 0.01
      assert.ok(accuracy < 0.02, `Accuracy ${accuracy} should be near 0 for massive underestimate`);
    });

    it('treats conservative overestimates as acceptable', () => {
      const estimator = new CostEstimator();
      // Estimated 6, actual 3 (typical: per-step ceil + retry buffer, no retries occurred)
      estimator.recordActual(1, 2, 1, 0);
      estimator.recordActual(2, 2, 1, 0);
      estimator.recordActual(3, 2, 1, 0);

      const accuracy = estimator.getAccuracy();
      // Overestimate: 3/6 = 0.50 (not 0.0 like the old formula)
      assert.strictEqual(accuracy, 0.5);
      assert.ok(accuracy > 0, 'Overestimates should not show 0% accuracy');
    });
  });

  describe('knowledge base integration', () => {
    it('uses default retry probability when knowledge base is empty', () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const kb = new KnowledgeBaseManager(dir);
      const estimator = new CostEstimator(kb);
      const plan = makeplan(1);
      const result = estimator.estimate(plan, { modelName: 'gpt-4o' });

      assert.strictEqual(result.perStep[0].retryProbability, 0.15);
    });

    it('works without knowledge base (undefined)', () => {
      const estimator = new CostEstimator(undefined);
      const plan = makeplan(2);
      const result = estimator.estimate(plan, { modelName: 'claude-opus-4' });

      assert.strictEqual(result.perStep.length, 2);
      assert.strictEqual(result.modelMultiplier, 1);
    });

    it('calibrates retry probability from structured CostHistoryEvidence', () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const kb = new KnowledgeBaseManager(dir);

      // Record structured evidence: 10 actual requests, 3 retries
      const evidence: CostHistoryEvidence = {
        runId: 'test-run-1',
        estimated: 8,
        actual: 10,
        retries: 3,
        steps: 5,
        model: 'gpt-4o',
      };
      kb.addOrUpdatePattern({
        category: 'cost_history',
        insight: '5 steps, model gpt-4o, 10 premium requests, 3 retries',
        confidence: 'high',
        evidence: [JSON.stringify(evidence)],
        impact: 'medium',
      });

      const estimator = new CostEstimator(kb);
      const plan = makeplan(1);
      const result = estimator.estimate(plan, { modelName: 'gpt-4o' });

      // 3 retries / 10 actual = 0.30 retry probability
      assert.strictEqual(result.perStep[0].retryProbability, 0.3);
    });

    it('falls back to legacy string parsing for old evidence format', () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const kb = new KnowledgeBaseManager(dir);

      // Legacy format: multiple string entries
      kb.addOrUpdatePattern({
        category: 'cost_history',
        insight: '3 steps, model gpt-4o, 6 premium requests, 1 retries',
        confidence: 'high',
        evidence: ['run:old-run-1', 'estimated:5', 'actual:6'],
        impact: 'medium',
      });

      const estimator = new CostEstimator(kb);
      const plan = makeplan(1);
      const result = estimator.estimate(plan, { modelName: 'gpt-4o' });

      // 1 retry / 6 actual = ~0.167
      const retryProb = result.perStep[0].retryProbability;
      assert.ok(retryProb > 0.16 && retryProb < 0.17,
        `Expected ~0.167, got ${retryProb}`);
    });
  });

  describe('MODEL_MULTIPLIERS', () => {
    it('contains all documented models', () => {
      assert.strictEqual(MODEL_MULTIPLIERS['claude-sonnet-4'], 1);
      assert.strictEqual(MODEL_MULTIPLIERS['claude-opus-4'], 1);
      assert.strictEqual(MODEL_MULTIPLIERS['gpt-4o'], 1);
      assert.strictEqual(MODEL_MULTIPLIERS['o3'], 20);
      assert.strictEqual(MODEL_MULTIPLIERS['o4-mini'], 5);
    });
  });

  describe('zero allowance edge case', () => {
    it('calculates full overage when allowance is zero', () => {
      const estimator = new CostEstimator();
      const plan = makeplan(3);
      const result = estimator.estimate(plan, {
        modelName: 'gpt-4o',
        remainingAllowance: 0,
      });

      // All requests are overage
      assert.ok(result.overageCostUSD > 0);
      assert.strictEqual(
        result.overageCostUSD,
        parseFloat((result.totalPremiumRequests * 0.04).toFixed(2)),
      );
    });
  });
});
