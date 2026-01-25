import * as assert from 'assert';
import * as path from 'path';

import { load_quality_gates_config, run_quality_gates } from '../src/quality-gates';

function fixture(rel: string): string {
  return path.join(process.cwd(), 'test', 'fixtures', rel);
}

describe('QualityGates', () => {
  it('passes on 3 sample templates', async () => {
    const roots = [
      fixture('generated/todo-app'),
      fixture('generated/api-server'),
      fixture('generated/saas-mvp')
    ];

    for (const root of roots) {
      const cfg = load_quality_gates_config(root);
      const result = await run_quality_gates(root, cfg);
      assert.strictEqual(result.passed, true, `expected gates to pass for ${root}`);
    }
  });

  it('fails on a known bad scaffold fixture', async () => {
    const root = fixture('bad-scaffold');
    const cfg = load_quality_gates_config(root);
    const result = await run_quality_gates(root, cfg);

    assert.strictEqual(result.passed, false);

    const failed = result.results.filter(r => r.status === 'fail').map(r => r.id);
    // make sure our core gates trip
    assert.ok(failed.includes('scaffold-defaults'));
    assert.ok(failed.includes('hardcoded-config'));
    assert.ok(failed.includes('readme-claims'));
    assert.ok(failed.includes('test-isolation'));
  });
});
