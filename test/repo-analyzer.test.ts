import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import RepoAnalyzer from '../src/repo-analyzer';

describe('RepoAnalyzer', () => {
  let testDir: string;
  let analyzer: RepoAnalyzer;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-test-'));
    analyzer = new RepoAnalyzer();
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should detect TypeScript from .ts files', async () => {
    const srcDir = path.join(testDir, 'src');
    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, 'index.ts'), '// TypeScript');

    const analysis = await analyzer.analyzeRepo(testDir);

    assert.ok(analysis.languages.includes('TypeScript'));
  });

  it('should find build scripts from package.json', async () => {
    const pkg = {
      scripts: {
        build: 'tsc',
        test: 'mocha'
      }
    };
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify(pkg));

    const analysis = await analyzer.analyzeRepo(testDir);

    assert.strictEqual(analysis.buildScripts.length, 1);
    assert.strictEqual(analysis.buildScripts[0].name, 'build');
    assert.strictEqual(analysis.buildScripts[0].command, 'tsc');
  });

  it('should find test scripts from package.json', async () => {
    const pkg = {
      scripts: {
        test: 'mocha dist/test/**/*.test.js'
      }
    };
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify(pkg));

    const analysis = await analyzer.analyzeRepo(testDir);

    assert.strictEqual(analysis.testScripts.length, 1);
    assert.strictEqual(analysis.testScripts[0].framework, 'mocha');
  });

  it('should extract dependencies from package.json', async () => {
    const pkg = {
      dependencies: {
        'express': '^4.18.0'
      },
      devDependencies: {
        'mocha': '^10.0.0'
      }
    };
    fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify(pkg));

    const analysis = await analyzer.analyzeRepo(testDir);

    assert.strictEqual(analysis.dependencies.length, 2);
    const express = analysis.dependencies.find(d => d.name === 'express');
    assert.ok(express);
    assert.strictEqual(express.type, 'production');
  });

  it('should find skipped tests', async () => {
    const testDir2 = path.join(testDir, 'test');
    fs.mkdirSync(testDir2);
    fs.writeFileSync(
      path.join(testDir2, 'example.test.ts'),
      'it.skip("should work", () => {});'
    );

    const analysis = await analyzer.analyzeRepo(testDir);

    const skipped = analysis.techDebtMarkers.filter(m => m.type === 'skipped_test');
    assert.strictEqual(skipped.length, 1);
  });

  it('should find TODO comments', async () => {
    const srcDir = path.join(testDir, 'src');
    fs.mkdirSync(srcDir);
    fs.writeFileSync(
      path.join(srcDir, 'example.ts'),
      '// TODO: Fix this later'
    );

    const analysis = await analyzer.analyzeRepo(testDir);

    const todos = analysis.techDebtMarkers.filter(m => m.type === 'todo_comment');
    assert.strictEqual(todos.length, 1);
  });

  it('should identify missing CI concern', async () => {
    const analysis = await analyzer.analyzeRepo(testDir);

    const ciConcern = analysis.baselineConcerns.find(c => c.type === 'missing_ci');
    assert.ok(ciConcern);
  });
});
