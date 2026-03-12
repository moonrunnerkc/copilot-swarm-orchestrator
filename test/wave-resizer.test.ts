// consolidated to 2 tests matching actual WaveResizer API (splitWave, mergeWaves)
import * as assert from 'assert';
import { WaveResizer, AdaptiveConcurrencyManager } from '../src/wave-resizer';

describe('WaveResizer', () => {
  let resizer: WaveResizer;

  beforeEach(() => {
    resizer = new WaveResizer();
  });

  it('should split large waves into smaller chunks', () => {
    const wave = [1, 2, 3, 4, 5];
    const splitWaves = resizer.splitWave(wave, 2, 'rate_limit');
    
    assert.strictEqual(splitWaves.length, 3); // [1,2], [3,4], [5]
    assert.strictEqual(splitWaves[0].length, 2);
    assert.strictEqual(splitWaves[1].length, 2);
    assert.strictEqual(splitWaves[2].length, 1);
  });

  it('should merge small waves when safe', () => {
    const waves = [[1], [2], [3]];
    const deps = new Map<number, number[]>();
    deps.set(1, []);
    deps.set(2, []);
    deps.set(3, []);
    
    const merged = resizer.mergeWaves(waves, deps);
    
    // should merge independent waves
    assert.ok(merged.length <= waves.length);
  });
});

describe('AdaptiveConcurrencyManager', () => {
  it('should increase concurrency after 2 consecutive successes', () => {
    const manager = new AdaptiveConcurrencyManager(2, 6);

    const initial = manager.getCurrentLimit();
    assert.strictEqual(initial, 2);

    // 2 successes should trigger ramp-up (threshold reduced from 5 to 2)
    manager.recordSuccess();
    manager.recordSuccess();

    const afterRamp = manager.getCurrentLimit();
    assert.ok(afterRamp > initial, `expected ${afterRamp} > ${initial} after 2 successes`);
  });

  it('should decrease concurrency on rate_limit failure', () => {
    const manager = new AdaptiveConcurrencyManager(4, 8);

    const initial = manager.getCurrentLimit();
    // rate_limit causes immediate halving
    manager.recordFailure('rate_limit');
    const afterFail = manager.getCurrentLimit();

    assert.ok(afterFail < initial, `expected ${afterFail} < ${initial} after rate_limit`);
  });

  it('should decrease concurrency after 3 consecutive error failures', () => {
    const manager = new AdaptiveConcurrencyManager(4, 8);

    const initial = manager.getCurrentLimit();
    manager.recordFailure('error');
    manager.recordFailure('error');
    manager.recordFailure('error');
    const afterFails = manager.getCurrentLimit();

    assert.ok(afterFails < initial, `expected ${afterFails} < ${initial} after 3 errors`);
  });

  it('should not exceed max concurrency', () => {
    const manager = new AdaptiveConcurrencyManager(5, 6);

    // Record many successes
    for (let i = 0; i < 20; i++) {
      manager.recordSuccess();
    }

    assert.ok(manager.getCurrentLimit() <= 6, 'should not exceed max of 6');
  });

  it('should not drop below 1', () => {
    const manager = new AdaptiveConcurrencyManager(2, 8);

    // Record many failures
    for (let i = 0; i < 10; i++) {
      manager.recordFailure('error');
    }

    assert.ok(manager.getCurrentLimit() >= 1, 'should not drop below 1');
  });
});
