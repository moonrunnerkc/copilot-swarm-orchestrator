import * as assert from 'assert';
import { QuickFixMode } from '../src/quick-fix-mode';

describe('QuickFixMode', () => {
  // isQuickFixEligible is pure and needs no I/O setup

  describe('isQuickFixEligible', () => {
    let qfm: QuickFixMode;

    before(() => {
      // Constructor instantiates ConfigLoader, SessionExecutor, VerifierEngine
      // but isQuickFixEligible never touches them, so safe to use in-process.
      qfm = new QuickFixMode('/tmp');
    });

    // --- quick-fix eligible patterns ---

    it('marks single file modification as eligible', () => {
      const result = qfm.isQuickFixEligible('fix a single file import issue');
      assert.strictEqual(result.eligible, true);
      assert.strictEqual(result.suggestedAgent, 'backend_master');
      assert.ok(result.reason.includes('Single file'));
    });

    it('marks documentation update as eligible', () => {
      const result = qfm.isQuickFixEligible('update README with new API docs');
      assert.strictEqual(result.eligible, true);
      assert.strictEqual(result.suggestedAgent, 'integrator_finalizer');
      assert.ok(result.reason.includes('Documentation'));
    });

    it('marks typo fix as eligible', () => {
      const result = qfm.isQuickFixEligible('fix typo in header component');
      assert.strictEqual(result.eligible, true);
      assert.strictEqual(result.suggestedAgent, 'integrator_finalizer');
    });

    it('marks adding comments as eligible', () => {
      const result = qfm.isQuickFixEligible('add comments to utility functions');
      assert.strictEqual(result.eligible, true);
      assert.strictEqual(result.suggestedAgent, 'backend_master');
    });

    it('marks removing dead code as eligible', () => {
      const result = qfm.isQuickFixEligible('remove unused code from parser module');
      assert.strictEqual(result.eligible, true);
    });

    it('marks renaming as eligible', () => {
      const result = qfm.isQuickFixEligible('rename function getUserData to fetchUser');
      assert.strictEqual(result.eligible, true);
    });

    it('marks lint fix as eligible', () => {
      const result = qfm.isQuickFixEligible('fix linting errors in config.ts');
      assert.strictEqual(result.eligible, true);
    });

    it('marks dependency update as eligible', () => {
      const result = qfm.isQuickFixEligible('update dependency versions in package.json');
      assert.strictEqual(result.eligible, true);
    });

    it('marks simple bug fix as eligible', () => {
      const result = qfm.isQuickFixEligible('fix simple bug in date formatting');
      assert.strictEqual(result.eligible, true);
    });

    // --- full swarm patterns ---

    it('rejects tasks with 3+ "and" conjunctions', () => {
      const result = qfm.isQuickFixEligible(
        'fix auth and update database and refactor API and add tests'
      );
      assert.strictEqual(result.eligible, false);
      assert.ok(result.reason.includes('"and"'));
    });

    it('allows tasks with 1-2 "and" conjunctions', () => {
      // 1-2 "and"s are ok; the check continues to other patterns
      const result = qfm.isQuickFixEligible('fix auth and update docs');
      // Short task with 1 "and" should still be eligible via the length heuristic
      assert.strictEqual(result.eligible, true);
    });

    it('rejects multiple components tasks', () => {
      const result = qfm.isQuickFixEligible('refactor multiple modules to use new API');
      assert.strictEqual(result.eligible, false);
      assert.ok(result.reason.includes('Multiple components'));
    });

    it('rejects architectural changes', () => {
      const result = qfm.isQuickFixEligible('restructure the codebase for microservices');
      assert.strictEqual(result.eligible, false);
      assert.ok(result.reason.includes('Architectural'));
    });

    it('rejects new feature implementation', () => {
      const result = qfm.isQuickFixEligible('implement a new authentication service');
      assert.strictEqual(result.eligible, false);
      assert.ok(result.reason.includes('feature'));
    });

    it('rejects deployment work', () => {
      const result = qfm.isQuickFixEligible('set up CI/CD pipeline for staging');
      assert.strictEqual(result.eligible, false);
      assert.ok(result.reason.toLowerCase().includes('deployment') || result.reason.toLowerCase().includes('infrastructure'));
    });

    it('rejects comprehensive testing tasks', () => {
      const result = qfm.isQuickFixEligible('add e2e test suite for the user module');
      assert.strictEqual(result.eligible, false);
      assert.ok(result.reason.includes('testing'));
    });

    it('rejects security reviews', () => {
      const result = qfm.isQuickFixEligible('run security audit and vulnerability scan for all endpoints');
      assert.strictEqual(result.eligible, false);
    });

    // --- default heuristic ---

    it('allows short simple tasks via length heuristic', () => {
      const result = qfm.isQuickFixEligible('bump version to 2.0');
      assert.strictEqual(result.eligible, true);
      assert.ok(result.reason.includes('short and simple'));
      assert.strictEqual(result.suggestedAgent, 'backend_master');
    });

    it('rejects long complex tasks', () => {
      // >100 chars AND >15 words, hits feature implementation pattern
      const longTask = 'please create a comprehensive logging system that handles structured output formatting across all service boundaries with proper correlation identifiers for distributed tracing';
      assert.ok(longTask.length > 100);
      assert.ok(longTask.split(' ').length >= 15);
      const result = qfm.isQuickFixEligible(longTask);
      assert.strictEqual(result.eligible, false);
    });

    // --- edge cases ---

    it('handles empty task string', () => {
      const result = qfm.isQuickFixEligible('');
      // Empty string is < 100 chars and < 15 words, so eligible by default
      assert.strictEqual(result.eligible, true);
    });

    it('is case-insensitive for pattern matching', () => {
      const result = qfm.isQuickFixEligible('FIX TYPO in README');
      assert.strictEqual(result.eligible, true);
    });

    it('returns suggestedAgent for eligible tasks', () => {
      const result = qfm.isQuickFixEligible('update changelog');
      assert.strictEqual(result.eligible, true);
      assert.ok(result.suggestedAgent);
    });
  });
});
