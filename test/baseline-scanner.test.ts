import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';
import { scanBaseline, formatPreservationRules } from '../src/baseline-scanner';

describe('BaselineScanner', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-scan-'));
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('scanBaseline', () => {
    it('returns empty snapshot for repo with no commits', () => {
      const result = scanBaseline(tmpDir);
      assert.strictEqual(result.allFiles.length, 0);
      assert.strictEqual(result.testFiles.length, 0);
    });

    it('returns empty snapshot for non-git directory', () => {
      const nonGit = fs.mkdtempSync(path.join(os.tmpdir(), 'non-git-'));
      try {
        const result = scanBaseline(nonGit);
        assert.strictEqual(result.allFiles.length, 0);
      } finally {
        fs.rmSync(nonGit, { recursive: true, force: true });
      }
    });

    it('lists tracked files', () => {
      fs.writeFileSync(path.join(tmpDir, 'index.js'), '// app');
      fs.writeFileSync(path.join(tmpDir, 'README.md'), '# hi');
      execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });

      const result = scanBaseline(tmpDir);
      assert.strictEqual(result.allFiles.length, 2);
      assert.ok(result.allFiles.includes('index.js'));
      assert.ok(result.allFiles.includes('README.md'));
      assert.strictEqual(result.testFiles.length, 0);
    });

    it('identifies test files in tests/ directory', () => {
      fs.mkdirSync(path.join(tmpDir, 'tests'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'tests', 'app.test.js'), '// test');
      fs.writeFileSync(path.join(tmpDir, 'src', 'app.js'), '// app');
      execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });

      const result = scanBaseline(tmpDir);
      assert.ok(result.testFiles.includes('tests/app.test.js'));
    });

    it('identifies test files by .test. suffix', () => {
      fs.writeFileSync(path.join(tmpDir, 'calculator.test.js'), '// test');
      fs.writeFileSync(path.join(tmpDir, 'calculator.js'), '// calc');
      execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });

      const result = scanBaseline(tmpDir);
      assert.ok(result.testFiles.includes('calculator.test.js'));
      assert.ok(!result.testFiles.includes('calculator.js'));
    });

    it('identifies test files by .spec. suffix', () => {
      fs.writeFileSync(path.join(tmpDir, 'widget.spec.ts'), '// spec');
      execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });

      const result = scanBaseline(tmpDir);
      assert.ok(result.testFiles.includes('widget.spec.ts'));
    });

    it('does not include untracked files', () => {
      fs.writeFileSync(path.join(tmpDir, 'tracked.js'), '// yes');
      execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });
      fs.writeFileSync(path.join(tmpDir, 'untracked.js'), '// no');

      const result = scanBaseline(tmpDir);
      assert.ok(result.allFiles.includes('tracked.js'));
      assert.ok(!result.allFiles.includes('untracked.js'));
    });

    it('captures HEAD commit sha', () => {
      fs.writeFileSync(path.join(tmpDir, 'app.js'), '// app');
      execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });
      const expectedSha = execSync('git rev-parse HEAD', { cwd: tmpDir, encoding: 'utf-8' }).trim();

      const result = scanBaseline(tmpDir);
      assert.strictEqual(result.headCommit, expectedSha);
      assert.ok(result.headCommit.length >= 7, 'headCommit should be a valid SHA');
    });

    it('returns empty headCommit for repo with no commits', () => {
      // git init creates a repo but HEAD points to nothing until first commit
      const result = scanBaseline(tmpDir);
      assert.strictEqual(result.headCommit, '');
    });

    it('excludes vendored dependency tests from testFiles', () => {
      // Simulate a Python project with venv tracked in git
      const vendoredPaths = [
        'venv/lib/python3.12/site-packages/greenlet/tests/test_gc.py',
        'venv/lib/python3.12/site-packages/pip/_vendor/colorama/tests/ansi_test.py',
        '.venv/lib/python3.12/site-packages/greenlet/tests/test_gc.py',
        'node_modules/@jest/core/tests/run.test.js',
      ];
      const projectTests = [
        'tests/test_api.py',
        'tests/test_health.py',
      ];

      for (const f of [...vendoredPaths, ...projectTests, 'src/app.py']) {
        const fullPath = path.join(tmpDir, f);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, '# placeholder');
      }
      execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });

      const result = scanBaseline(tmpDir);
      // Project tests are included
      assert.ok(result.testFiles.includes('tests/test_api.py'));
      assert.ok(result.testFiles.includes('tests/test_health.py'));
      // Vendored tests are excluded
      for (const v of vendoredPaths) {
        assert.ok(!result.testFiles.includes(v), `should exclude vendored: ${v}`);
      }
      // But vendored files are still in allFiles (tracked by git)
      assert.ok(result.allFiles.length > projectTests.length);
    });
  });

  describe('formatPreservationRules', () => {
    it('returns empty string for empty snapshot', () => {
      const result = formatPreservationRules({ allFiles: [], testFiles: [], headCommit: '' });
      assert.strictEqual(result, '');
    });

    it('includes pre-existing code section header', () => {
      const result = formatPreservationRules({
        allFiles: ['index.js'],
        testFiles: [],
        headCommit: '',
      });
      assert.ok(result.includes('## Pre-existing Code'));
      assert.ok(result.includes('1 existing file'));
    });

    it('lists protected test files', () => {
      const result = formatPreservationRules({
        allFiles: ['src/app.js', 'tests/app.test.js', 'tests/calc.test.js'],
        testFiles: ['tests/app.test.js', 'tests/calc.test.js'],
        headCommit: '',
      });
      assert.ok(result.includes('### Protected Test Files'));
      assert.ok(result.includes('tests/app.test.js'));
      assert.ok(result.includes('tests/calc.test.js'));
    });

    it('includes preservation rule about not breaking tests', () => {
      const result = formatPreservationRules({
        allFiles: ['src/app.js'],
        testFiles: [],
        headCommit: '',
      });
      assert.ok(result.includes('Do NOT break existing tests'));
    });
  });
});
