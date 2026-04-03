import * as assert from 'assert';
import Spinner, { ProgressTracker } from '../src/spinner';

describe('Spinner', () => {
  let spinner: Spinner;

  afterEach(() => {
    // Ensure no lingering intervals from a test that forgot to stop
    if (spinner) spinner.stop();
  });

  it('should start and stop without errors', () => {
    spinner = new Spinner('Loading...');
    spinner.start();
    spinner.stop();
  });

  it('should be safe to call start twice', () => {
    spinner = new Spinner('Loading...');
    spinner.start();
    spinner.start(); // should be a no-op
    spinner.stop();
  });

  it('should be safe to call stop without start', () => {
    spinner = new Spinner('idle');
    spinner.stop();
    spinner.stop('done');
  });

  it('should accept all style options', () => {
    for (const style of ['dots', 'spinner', 'bounce', 'pulse'] as const) {
      const s = new Spinner('test', { style });
      s.start();
      s.stop();
    }
  });

  it('should update message while running', () => {
    spinner = new Spinner('initial');
    spinner.start();
    spinner.update('updated');
    spinner.stop();
  });

  it('should support succeed, fail, warn, and info endings', () => {
    for (const ending of ['succeed', 'fail', 'warn', 'info'] as const) {
      const s = new Spinner('test');
      s.start();
      s[ending]('finished');
    }
  });

  it('should accept prefix option', () => {
    spinner = new Spinner('with prefix', { prefix: '>> ' });
    spinner.start();
    spinner.stop();
  });
});

describe('ProgressTracker', () => {
  let tracker: ProgressTracker;

  afterEach(() => {
    if (tracker) tracker.stopAll();
  });

  it('should track running step count', () => {
    tracker = new ProgressTracker();
    assert.strictEqual(tracker.getRunningCount(), 0);
    tracker.startStep('s1', 'Step 1');
    assert.strictEqual(tracker.getRunningCount(), 1);
    tracker.startStep('s2', 'Step 2');
    assert.strictEqual(tracker.getRunningCount(), 2);
    tracker.completeStep('s1', 'Step 1 done');
    assert.strictEqual(tracker.getRunningCount(), 1);
    tracker.stopAll();
    assert.strictEqual(tracker.getRunningCount(), 0);
  });

  it('should handle completing an unknown step without error', () => {
    tracker = new ProgressTracker();
    tracker.completeStep('does-not-exist', 'no-op');
  });

  it('should handle updating an unknown step without error', () => {
    tracker = new ProgressTracker();
    tracker.updateStep('does-not-exist', 'no-op');
  });

  it('should handle failing a step', () => {
    tracker = new ProgressTracker();
    tracker.startStep('s1', 'Step 1');
    tracker.failStep('s1', 'Step 1 failed');
    assert.strictEqual(tracker.getRunningCount(), 0);
  });

  it('should handle warning a step', () => {
    tracker = new ProgressTracker();
    tracker.startStep('s1', 'Step 1');
    tracker.warnStep('s1', 'Step 1 warning');
    assert.strictEqual(tracker.getRunningCount(), 0);
  });

  it('should support stopAll clearing every active spinner', () => {
    tracker = new ProgressTracker();
    tracker.startStep('a', 'Alpha');
    tracker.startStep('b', 'Bravo');
    tracker.startStep('c', 'Charlie');
    assert.strictEqual(tracker.getRunningCount(), 3);
    tracker.stopAll();
    assert.strictEqual(tracker.getRunningCount(), 0);
  });
});
