import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { FleetWrapper } from '../src/fleet-wrapper';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-wrapper-'));
}

describe('FleetWrapper', () => {
  let tempDirs: string[] = [];

  afterEach(() => {
    FleetWrapper.resetCache();
    for (const dir of tempDirs) {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
    tempDirs = [];
  });

  describe('wrapPrompt()', () => {
    it('prepends /fleet to a simple prompt', () => {
      const wrapped = FleetWrapper.wrapPrompt('Build a REST API');
      assert.strictEqual(wrapped, '/fleet Build a REST API');
    });

    it('handles empty prompt', () => {
      const wrapped = FleetWrapper.wrapPrompt('');
      assert.strictEqual(wrapped, '/fleet ');
    });

    it('preserves prompt content exactly', () => {
      const prompt = 'Create auth module with JWT tokens, rate limiting, and session management';
      const wrapped = FleetWrapper.wrapPrompt(prompt);
      assert.strictEqual(wrapped, `/fleet ${prompt}`);
    });
  });

  describe('versionSupportsFleet()', () => {
    it('returns true for version at the minimum (0.0.412)', () => {
      assert.strictEqual(FleetWrapper.versionSupportsFleet('0.0.412'), true);
    });

    it('returns true for version above minimum', () => {
      assert.strictEqual(FleetWrapper.versionSupportsFleet('0.0.500'), true);
    });

    it('returns true for major version bump', () => {
      assert.strictEqual(FleetWrapper.versionSupportsFleet('1.0.0'), true);
    });

    it('returns false for version below minimum', () => {
      assert.strictEqual(FleetWrapper.versionSupportsFleet('0.0.411'), false);
    });

    it('returns false for much older version', () => {
      assert.strictEqual(FleetWrapper.versionSupportsFleet('0.0.100'), false);
    });

    it('extracts version from prefixed output', () => {
      assert.strictEqual(FleetWrapper.versionSupportsFleet('copilot version 0.0.415'), true);
    });

    it('returns false for garbage input', () => {
      assert.strictEqual(FleetWrapper.versionSupportsFleet('not a version'), false);
    });

    it('returns false for empty string', () => {
      assert.strictEqual(FleetWrapper.versionSupportsFleet(''), false);
    });
  });

  describe('isFleetAvailable()', () => {
    it('returns a boolean indicating fleet support', () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const result = FleetWrapper.isFleetAvailable(dir);
      assert.strictEqual(typeof result, 'boolean');
    });

    it('caches the result across calls', () => {
      const dir = tmpDir();
      tempDirs.push(dir);
      const first = FleetWrapper.isFleetAvailable(dir);
      const second = FleetWrapper.isFleetAvailable(dir);
      assert.strictEqual(first, second);
    });

    it('returns consistent result after cache reset', () => {
      // Verify resetCache doesn't corrupt state
      FleetWrapper.resetCache();
      const result = typeof FleetWrapper.isFleetAvailable(process.cwd());
      assert.strictEqual(result, 'boolean');
    });
  });

  describe('estimateSubagentCount()', () => {
    it('returns 1 for simple single-focus task', () => {
      const count = FleetWrapper.estimateSubagentCount('Add a login button');
      assert.strictEqual(count, 1);
    });

    it('returns 2 for task with one multi-indicator', () => {
      const count = FleetWrapper.estimateSubagentCount('Update all components to use new theme');
      assert.strictEqual(count, 2);
    });

    it('returns 3+ for task with multiple multi-indicators', () => {
      const count = FleetWrapper.estimateSubagentCount(
        'Refactor services and endpoints across modules',
      );
      assert.ok(count >= 3, `Expected >= 3 for multi-indicator task, got ${count}`);
    });

    it('returns 4 for highly complex multi-part task', () => {
      const count = FleetWrapper.estimateSubagentCount(
        'Update all files across modules to fix components and services',
      );
      assert.strictEqual(count, 4);
    });

    it('detects comma-separated items as complexity', () => {
      const count = FleetWrapper.estimateSubagentCount(
        'Fix auth, database, caching, and logging',
      );
      // 4 comma segments -> returns 3
      assert.ok(count >= 2, `Expected >= 2 for comma list, got ${count}`);
    });

    it('returns at least 1 for any input', () => {
      assert.ok(FleetWrapper.estimateSubagentCount('') >= 1);
      assert.ok(FleetWrapper.estimateSubagentCount('x') >= 1);
    });
  });
});
