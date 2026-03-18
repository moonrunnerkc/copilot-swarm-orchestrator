import * as assert from 'assert';
import { MetaAnalyzer, MetaReviewResult, StepReview, DetectedPattern, KnowledgeUpdate } from '../src/meta-analyzer';
import { ParallelStepResult } from '../src/swarm-orchestrator';
import { VerificationResult, VerificationCheck } from '../src/verifier-engine';
import { ExecutionPlan } from '../src/plan-generator';

function makeCheck(type: VerificationCheck['type'], passed: boolean, reason?: string): VerificationCheck {
  const check: VerificationCheck = { type, description: `${type} check`, required: true, passed };
  if (reason !== undefined) { check.reason = reason; }
  return check;
}

function makeVerification(passed: boolean, checks?: VerificationCheck[], unverifiedClaims?: string[]): VerificationResult {
  return {
    passed,
    stepNumber: 1,
    agentName: 'test-agent',
    checks: checks || [],
    unverifiedClaims: unverifiedClaims || [],
    timestamp: new Date().toISOString(),
    transcriptPath: '/tmp/transcript.md',
  };
}

function makeResult(stepNumber: number, agentName: string, status: 'completed' | 'failed', verificationPassed: boolean, extraChecks?: VerificationCheck[], unverifiedClaims?: string[]): ParallelStepResult {
  return {
    stepNumber,
    agentName,
    status,
    verificationResult: makeVerification(verificationPassed, extraChecks, unverifiedClaims),
  };
}

function makePlan(stepCount: number): ExecutionPlan {
  return {
    goal: 'test goal',
    createdAt: new Date().toISOString(),
    steps: Array.from({ length: stepCount }, (_, i) => ({
      stepNumber: i + 1,
      agentName: `agent-${i + 1}`,
      task: `task ${i + 1}`,
      dependencies: [],
      expectedOutputs: [],
    })),
  };
}

describe('MetaAnalyzer', () => {
  let analyzer: MetaAnalyzer;

  beforeEach(() => {
    analyzer = new MetaAnalyzer();
  });

  describe('analyzeWave', () => {
    it('returns healthy status when all steps pass verification', () => {
      const results: ParallelStepResult[] = [
        makeResult(1, 'agent-1', 'completed', true),
        makeResult(2, 'agent-2', 'completed', true),
      ];
      const plan = makePlan(2);

      const review = analyzer.analyzeWave(0, [1, 2], results, plan, 'exec-1');

      assert.strictEqual(review.overallHealth, 'healthy');
      assert.strictEqual(review.replanNeeded, false);
      assert.strictEqual(review.replanReason, null);
      assert.strictEqual(review.waveAnalyzed, 1);
      assert.strictEqual(review.executionId, 'exec-1');
    });

    it('returns degraded when 20-50% of steps fail', () => {
      const results: ParallelStepResult[] = [
        makeResult(1, 'agent-1', 'completed', true),
        makeResult(2, 'agent-2', 'completed', true),
        makeResult(3, 'agent-3', 'failed', false, [
          makeCheck('test', false, 'no tests'),
        ]),
      ];
      const plan = makePlan(3);

      const review = analyzer.analyzeWave(0, [1, 2, 3], results, plan, 'exec-2');

      // 1/3 = ~33% failure
      assert.strictEqual(review.overallHealth, 'degraded');
      assert.strictEqual(review.replanNeeded, false);
    });

    it('returns critical and requests replan when majority fail', () => {
      const results: ParallelStepResult[] = [
        makeResult(1, 'agent-1', 'failed', false, [
          makeCheck('build', false, 'compile error'),
        ]),
        makeResult(2, 'agent-2', 'failed', false, [
          makeCheck('test', false, 'test failures'),
        ]),
        makeResult(3, 'agent-3', 'completed', true),
      ];
      const plan = makePlan(3);

      const review = analyzer.analyzeWave(1, [1, 2, 3], results, plan, 'exec-3');

      // 2/3 = ~67% failure
      assert.strictEqual(review.overallHealth, 'critical');
      assert.strictEqual(review.replanNeeded, true);
      assert.ok(review.replanReason);
      assert.ok(review.replanReason!.includes('67%'));
    });

    it('generates step reviews with root cause analysis', () => {
      const results: ParallelStepResult[] = [
        makeResult(1, 'agent-1', 'failed', false, [
          makeCheck('test', false, 'no test output'),
        ]),
      ];
      const plan = makePlan(1);
      const review = analyzer.analyzeWave(0, [1], results, plan, 'exec-4');

      assert.strictEqual(review.stepReviews.length, 1);
      const sr = review.stepReviews[0];
      assert.strictEqual(sr.stepNumber, 1);
      assert.strictEqual(sr.verificationPassed, false);
      assert.ok(sr.issues.length > 0);
      assert.ok(sr.rootCause.includes('test') || sr.rootCause.includes('Test'));
    });

    it('generates suggested changes for failed steps', () => {
      const results: ParallelStepResult[] = [
        makeResult(1, 'agent-1', 'failed', false, [
          makeCheck('commit', false, 'no commits'),
        ]),
      ];
      const plan = makePlan(1);
      const review = analyzer.analyzeWave(0, [1], results, plan, 'exec-5');

      assert.ok(review.suggestedChanges.length > 0);
      assert.strictEqual(review.suggestedChanges[0].type, 're-execute');
      assert.strictEqual(review.suggestedChanges[0].targetStep, 1);
    });

    it('handles empty wave gracefully', () => {
      const plan = makePlan(2);
      // No results match the wave steps
      const review = analyzer.analyzeWave(0, [99], [], plan, 'exec-6');
      assert.strictEqual(review.overallHealth, 'healthy');
      assert.strictEqual(review.stepReviews.length, 0);
    });

    it('detects unverified-claims pattern', () => {
      const results: ParallelStepResult[] = [
        makeResult(1, 'agent-1', 'completed', false, [], ['claim A', 'claim B', 'claim C']),
      ];
      const plan = makePlan(1);
      const review = analyzer.analyzeWave(0, [1], results, plan, 'exec-7');

      const claimsPattern = review.detectedPatterns.find(p => p.pattern === 'unverified_claims');
      assert.ok(claimsPattern, 'Should detect unverified_claims pattern');
      assert.strictEqual(claimsPattern!.severity, 'high');
    });

    it('extracts knowledge updates from high-severity patterns', () => {
      const results: ParallelStepResult[] = [
        makeResult(1, 'agent-1', 'completed', false, [], ['a', 'b', 'c']),
      ];
      const plan = makePlan(1);
      const review = analyzer.analyzeWave(0, [1], results, plan, 'exec-8');

      const highSeverity = review.detectedPatterns.filter(p => p.severity === 'high');
      if (highSeverity.length > 0) {
        assert.ok(review.knowledgeUpdates.length > 0, 'High severity patterns should trigger knowledge updates');
        assert.ok(review.knowledgeUpdates[0].confidence === 'high');
      }
    });

    it('determines next actions based on health', () => {
      // Healthy case
      const healthyResults: ParallelStepResult[] = [
        makeResult(1, 'agent-1', 'completed', true),
      ];
      const healthyReview = analyzer.analyzeWave(0, [1], healthyResults, makePlan(1), 'exec-9');
      assert.ok(healthyReview.nextActions.some(a => a.includes('Continue')));
    });
  });

  describe('makeReplanDecision', () => {
    it('returns shouldReplan=false when analysis is healthy', () => {
      const analysis: MetaReviewResult = {
        analysisTimestamp: new Date().toISOString(),
        executionId: 'exec-x',
        waveAnalyzed: 1,
        overallHealth: 'healthy',
        stepReviews: [],
        detectedPatterns: [],
        replanNeeded: false,
        replanReason: null,
        suggestedChanges: [],
        knowledgeUpdates: [],
        nextActions: ['Continue'],
      };

      const decision = analyzer.makeReplanDecision(analysis, makePlan(2), [1]);
      assert.strictEqual(decision.shouldReplan, false);
      assert.strictEqual(decision.preserveHistory, true);
    });

    it('returns shouldReplan=true with steps to retry when critical', () => {
      const analysis: MetaReviewResult = {
        analysisTimestamp: new Date().toISOString(),
        executionId: 'exec-y',
        waveAnalyzed: 1,
        overallHealth: 'critical',
        stepReviews: [],
        detectedPatterns: [],
        replanNeeded: true,
        replanReason: 'Wave 1 failed: 80% of steps did not pass verification',
        suggestedChanges: [
          { type: 're-execute', targetStep: 2, reason: 'Tests failed', details: 'Re-run with test requirement' },
          { type: 're-execute', targetStep: 3, reason: 'Build failed', details: 'Fix build errors' },
        ],
        knowledgeUpdates: [],
        nextActions: ['Trigger full replan'],
      };

      const decision = analyzer.makeReplanDecision(analysis, makePlan(3), [1]);
      assert.strictEqual(decision.shouldReplan, true);
      assert.ok(decision.stepsToRetry);
      assert.deepStrictEqual(decision.stepsToRetry, [2, 3]);
      assert.strictEqual(decision.preserveHistory, true);
    });
  });
});
