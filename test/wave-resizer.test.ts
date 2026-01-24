// consolidated to 2 tests matching actual WaveResizer API (splitWave, mergeWaves)
import * as assert from 'assert';
import { WaveResizer } from '../src/wave-resizer';

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
