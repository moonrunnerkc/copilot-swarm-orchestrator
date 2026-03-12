// Author: Bradley R. Kinnard
import { strict as assert } from 'assert';
import { CriticResult } from '../src/types';

/**
 * Upgrade 8: Analysis-Augmented Critic
 * Tests the per-axis weighted scoring that replaced the flat -15 deductions.
 */
describe('Upgrade 8: Analysis-Augmented Critic', () => {
  // replicates runCriticReview scoring logic for isolated testing
  const weights: Record<string, number> = { test: 20, build: 25, lint: 5, commit: 10, claim: 5 };

  function scoreCritic(results: Array<{
    stepNumber: number;
    verificationResult?: {
      checks: Array<{ type: string; passed: boolean; reason?: string }>;
    };
    sessionResult?: unknown;
  }>, steps: Array<{
    stepNumber: number;
    expectedOutputs: string[];
  }>): CriticResult {
    const flags: string[] = [];
    let score = 100;

    for (const result of results) {
      const step = steps.find(s => s.stepNumber === result.stepNumber);
      if (!step) continue;

      if (result.verificationResult) {
        const byType = new Map<string, { passed: number; failed: number; reasons: string[] }>();
        for (const check of result.verificationResult.checks) {
          const entry = byType.get(check.type) || { passed: 0, failed: 0, reasons: [] };
          if (check.passed) entry.passed++;
          else {
            entry.failed++;
            if (check.reason) entry.reasons.push(check.reason);
          }
          byType.set(check.type, entry);
        }

        for (const [type, counts] of byType) {
          if (counts.failed > 0) {
            const deduction = (weights[type] || 10) * counts.failed;
            score -= deduction;
            const total = counts.passed + counts.failed;
            const detail = counts.reasons.length > 0 ? ` (${counts.reasons[0]})` : '';
            flags.push(`step-${result.stepNumber}: ${counts.failed}/${total} ${type} checks failed${detail}`);
          }
        }
      }

      if (step.expectedOutputs.length > 0 && !result.sessionResult) {
        flags.push(`step-${result.stepNumber}: no session output captured`);
        score -= 10;
      }
    }

    score = Math.max(0, Math.min(100, score));
    const recommendation = flags.length === 0 ? 'approve' : score >= 60 ? 'revise' : 'reject';
    return { score, flags, recommendation };
  }

  it('test-only failure scores differently than build-only failure', () => {
    const testFail = scoreCritic([{
      stepNumber: 1,
      verificationResult: { checks: [{ type: 'test', passed: false, reason: 'no output' }] },
      sessionResult: {}
    }], [{ stepNumber: 1, expectedOutputs: [] }]);

    const buildFail = scoreCritic([{
      stepNumber: 1,
      verificationResult: { checks: [{ type: 'build', passed: false, reason: 'compile error' }] },
      sessionResult: {}
    }], [{ stepNumber: 1, expectedOutputs: [] }]);

    assert.strictEqual(testFail.score, 80, 'test failure: 100 - 20 = 80');
    assert.strictEqual(buildFail.score, 75, 'build failure: 100 - 25 = 75');
    assert.notStrictEqual(testFail.score, buildFail.score);
  });

  it('build failure produces higher deduction (-25) than lint failure (-5)', () => {
    const buildResult = scoreCritic([{
      stepNumber: 1,
      verificationResult: { checks: [{ type: 'build', passed: false }] },
      sessionResult: {}
    }], [{ stepNumber: 1, expectedOutputs: [] }]);

    const lintResult = scoreCritic([{
      stepNumber: 1,
      verificationResult: { checks: [{ type: 'lint', passed: false }] },
      sessionResult: {}
    }], [{ stepNumber: 1, expectedOutputs: [] }]);

    assert.strictEqual(buildResult.score, 75);
    assert.strictEqual(lintResult.score, 95);
    assert.ok(buildResult.score < lintResult.score, 'build deduction exceeds lint deduction');
  });

  it('multi-axis failures accumulate correctly', () => {
    const result = scoreCritic([{
      stepNumber: 1,
      verificationResult: {
        checks: [
          { type: 'test', passed: false, reason: 'test timeout' },
          { type: 'build', passed: false, reason: 'tsc error' },
          { type: 'lint', passed: false, reason: '3 warnings' },
          { type: 'commit', passed: false, reason: 'no commits' },
          { type: 'claim', passed: false, reason: 'unverified' },
        ]
      },
      sessionResult: {}
    }], [{ stepNumber: 1, expectedOutputs: [] }]);

    // 100 - 20 (test) - 25 (build) - 5 (lint) - 10 (commit) - 5 (claim) = 35
    assert.strictEqual(result.score, 35);
    assert.strictEqual(result.flags.length, 5);
    assert.strictEqual(result.recommendation, 'reject');
  });

  it('flag strings include check type and count', () => {
    const result = scoreCritic([{
      stepNumber: 3,
      verificationResult: {
        checks: [
          { type: 'test', passed: true },
          { type: 'test', passed: false, reason: 'assertion failed' },
          { type: 'test', passed: false, reason: 'timeout' },
        ]
      },
      sessionResult: {}
    }], [{ stepNumber: 3, expectedOutputs: [] }]);

    assert.strictEqual(result.flags.length, 1);
    assert.ok(result.flags[0].includes('step-3'));
    assert.ok(result.flags[0].includes('2/3'));
    assert.ok(result.flags[0].includes('test checks failed'));
    assert.ok(result.flags[0].includes('assertion failed'));
  });

  it('score clamps to 0 (never negative)', () => {
    const result = scoreCritic([{
      stepNumber: 1,
      verificationResult: {
        checks: [
          { type: 'build', passed: false },
          { type: 'build', passed: false },
          { type: 'build', passed: false },
          { type: 'build', passed: false },
          { type: 'build', passed: false },
        ]
      },
      sessionResult: {}
    }], [{ stepNumber: 1, expectedOutputs: [] }]);

    // 5 * -25 = -125, but clamped to 0
    assert.strictEqual(result.score, 0);
    assert.strictEqual(result.recommendation, 'reject');
  });

  it('score clamps to 100 (all passing)', () => {
    const result = scoreCritic([{
      stepNumber: 1,
      verificationResult: {
        checks: [
          { type: 'test', passed: true },
          { type: 'build', passed: true },
          { type: 'lint', passed: true },
        ]
      },
      sessionResult: {}
    }], [{ stepNumber: 1, expectedOutputs: [] }]);

    assert.strictEqual(result.score, 100);
    assert.strictEqual(result.flags.length, 0);
    assert.strictEqual(result.recommendation, 'approve');
  });

  it('revise recommendation for score between 60 and 99 with flags', () => {
    const result = scoreCritic([{
      stepNumber: 1,
      verificationResult: {
        checks: [
          { type: 'lint', passed: false, reason: 'unused vars' },
          { type: 'test', passed: true },
          { type: 'build', passed: true },
        ]
      },
      sessionResult: {}
    }], [{ stepNumber: 1, expectedOutputs: [] }]);

    assert.strictEqual(result.score, 95);
    assert.strictEqual(result.recommendation, 'revise');
  });

  it('handles steps with no verification result gracefully', () => {
    const result = scoreCritic([{
      stepNumber: 1,
      sessionResult: {}
    }], [{ stepNumber: 1, expectedOutputs: [] }]);

    assert.strictEqual(result.score, 100);
    assert.strictEqual(result.flags.length, 0);
    assert.strictEqual(result.recommendation, 'approve');
  });
});
