import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { run_runtime_checks_gate, RuntimeChecksConfig } from '../src/quality-gates/gates/runtime-checks.js';

describe('RuntimeChecksGate', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = path.join(__dirname, `test-runtime-gate-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  const baseConfig: RuntimeChecksConfig = {
    enabled: true,
    retries: 0,
    runTests: true,
    runLint: true,
    runAudit: true,
    timeoutMs: 30000
  };

  it('should skip when disabled', async () => {
    const result = await run_runtime_checks_gate(tmpDir, { ...baseConfig, enabled: false });
    assert.strictEqual(result.status, 'skip');
    assert.strictEqual(result.issues.length, 0);
  });

  it('should pass when project has no test script', async () => {
    // Project with no package.json at all
    const result = await run_runtime_checks_gate(tmpDir, baseConfig);
    assert.strictEqual(result.status, 'pass');
    assert.strictEqual(result.issues.length, 0);
  });

  it('should pass when test script is a stub', async () => {
    // npm init defaults to 'echo "Error: no test specified" && exit 1'
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'test-project',
        scripts: { test: 'echo "Error: no test specified" && exit 1' }
      }),
      'utf-8'
    );
    const result = await run_runtime_checks_gate(tmpDir, {
      ...baseConfig,
      runLint: false,
      runAudit: false
    });
    // Stub test script is detected and skipped
    assert.strictEqual(result.status, 'pass');
  });

  it('should pass when test script succeeds', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'test-project',
        scripts: { test: 'echo "all tests pass"' }
      }),
      'utf-8'
    );
    const result = await run_runtime_checks_gate(tmpDir, {
      ...baseConfig,
      runLint: false,
      runAudit: false
    });
    assert.strictEqual(result.status, 'pass');
    assert.strictEqual(result.stats?.testsRun, 1);
  });

  it('should fail when test script fails', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'test-project',
        scripts: { test: 'exit 1' }
      }),
      'utf-8'
    );
    const result = await run_runtime_checks_gate(tmpDir, {
      ...baseConfig,
      runLint: false,
      runAudit: false
    });
    assert.strictEqual(result.status, 'fail');
    assert.strictEqual(result.issues.length, 1);
    assert.ok(result.issues[0].message.includes('npm test'));
  });

  it('should skip lint when no eslint config exists', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'test-project' }),
      'utf-8'
    );
    const result = await run_runtime_checks_gate(tmpDir, {
      ...baseConfig,
      runTests: false,
      runAudit: false
    });
    // No eslint config means lint check is skipped, not failed
    assert.strictEqual(result.status, 'pass');
    assert.strictEqual(result.stats?.lintRun, 0);
  });

  it('should report correct gate id and title', async () => {
    const result = await run_runtime_checks_gate(tmpDir, baseConfig);
    assert.strictEqual(result.id, 'runtime-checks');
    assert.ok(result.title.includes('Runtime'));
  });
});
