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

import { buildTestCommand } from '../src/quality-gates/gates/runtime-checks.js';

describe('buildTestCommand', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(__dirname, 'test-build-cmd-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns npm test for projects without package.json', () => {
    assert.strictEqual(buildTestCommand(tmpDir), 'npm test');
  });

  it('returns npm test for projects with a generic test script', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      scripts: { test: 'echo "tests pass"' }
    }));
    assert.strictEqual(buildTestCommand(tmpDir), 'npm test');
  });

  it('appends Jest ignore patterns for Jest projects', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      scripts: { test: 'jest' }
    }));
    const cmd = buildTestCommand(tmpDir);
    assert.ok(cmd.includes('--testPathIgnorePatterns=runs/'));
    assert.ok(cmd.includes('--testPathIgnorePatterns=coverage/'));
  });

  it('scopes node --test to tests/ directory when it exists', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      scripts: { test: 'node --test' }
    }));
    fs.mkdirSync(path.join(tmpDir, 'tests'));
    const cmd = buildTestCommand(tmpDir);
    assert.strictEqual(cmd, "node --test 'tests/**/*.test.js'");
  });

  it('scopes node --test to test/ directory when it exists', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      scripts: { test: 'node --test' }
    }));
    fs.mkdirSync(path.join(tmpDir, 'test'));
    const cmd = buildTestCommand(tmpDir);
    assert.strictEqual(cmd, "node --test 'test/**/*.test.js'");
  });

  it('scopes node --test to both test dirs when both exist', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      scripts: { test: 'node --test' }
    }));
    fs.mkdirSync(path.join(tmpDir, 'tests'));
    fs.mkdirSync(path.join(tmpDir, 'test'));
    const cmd = buildTestCommand(tmpDir);
    assert.strictEqual(cmd, "node --test 'tests/**/*.test.js' 'test/**/*.test.js'");
  });

  it('does not modify node --test when script already has explicit paths', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      scripts: { test: 'node --test tests/' }
    }));
    fs.mkdirSync(path.join(tmpDir, 'tests'));
    assert.strictEqual(buildTestCommand(tmpDir), 'npm test');
  });

  it('falls back to npm test when node --test has no test directories', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      scripts: { test: 'node --test' }
    }));
    // No tests/ or test/ dir
    assert.strictEqual(buildTestCommand(tmpDir), 'npm test');
  });

  it('detects Jest via package.json jest config field', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
      scripts: { test: 'react-scripts test' },
      jest: { testEnvironment: 'node' }
    }));
    const cmd = buildTestCommand(tmpDir);
    assert.ok(cmd.includes('--testPathIgnorePatterns=runs/'));
  });
});
