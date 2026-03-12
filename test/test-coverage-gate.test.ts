import * as assert from 'assert';
import { run_test_coverage_gate } from '../src/quality-gates/gates/test-coverage.js';
import { GateContext, TestCoverageConfig, ProjectFile } from '../src/quality-gates/types.js';

const MAX_FILE_SIZE = 1_000_000;

function makeFile(relativePath: string, text: string): ProjectFile {
  return { path: `/fake/${relativePath}`, relativePath, sizeBytes: text.length, text };
}

function makeCtx(files: ProjectFile[]): GateContext {
  return { projectRoot: '/fake', files };
}

function defaultConfig(): TestCoverageConfig {
  return {
    enabled: true,
    entryPointPatterns: [],
    minTestAssertions: 1,
    requireComponentTests: true,
  };
}

describe('TestCoverageGate', () => {

  it('passes when every source file has a corresponding test', async () => {
    const src = makeFile('src/utils.ts', 'export function add(a: number, b: number) { return a + b; }');
    const test = makeFile('test/utils.test.ts', [
      'import { add } from "../src/utils";',
      'assert.strictEqual(add(1, 2), 3);',
    ].join('\n'));
    const ctx = makeCtx([src, test]);

    const result = await run_test_coverage_gate(ctx, defaultConfig(), MAX_FILE_SIZE);
    assert.strictEqual(result.status, 'pass');
    assert.strictEqual(result.issues.length, 0);
    assert.strictEqual(result.id, 'test-coverage');
  });

  it('flags source files without any test coverage', async () => {
    const src = makeFile('src/parser.ts', 'export function parse(input: string) { return JSON.parse(input); }');
    const ctx = makeCtx([src]);

    const result = await run_test_coverage_gate(ctx, defaultConfig(), MAX_FILE_SIZE);
    assert.strictEqual(result.status, 'fail');
    const coverageIssue = result.issues.find(i => i.message.includes('no test coverage'));
    assert.ok(coverageIssue, 'should flag uncovered source file');
    assert.ok(coverageIssue.message.includes('parser.ts'));
  });

  it('accepts coverage via import in a test file', async () => {
    const helper = makeFile('src/math.ts', 'export const multiply = (a: number, b: number) => a * b;');
    const integrationTest = makeFile('test/integration.test.ts', [
      'import { multiply } from "../src/math";',
      'assert.strictEqual(multiply(3, 4), 12);',
    ].join('\n'));
    const ctx = makeCtx([helper, integrationTest]);

    const result = await run_test_coverage_gate(ctx, defaultConfig(), MAX_FILE_SIZE);
    const mathIssue = result.issues.find(i => i.filePath === 'src/math.ts');
    assert.strictEqual(mathIssue, undefined, 'math.ts should be considered covered via import');
  });

  it('flags test stubs with no assertions', async () => {
    const src = makeFile('src/formatter.ts', 'export function format(s: string) { return s.trim(); }');
    const stubTest = makeFile('test/formatter.test.ts', [
      'import { format } from "../src/formatter";',
      'describe("formatter", () => {',
      '  it("should format", () => {',
      '    format("hello");',
      '  });',
      '});',
    ].join('\n'));
    const ctx = makeCtx([src, stubTest]);

    const result = await run_test_coverage_gate(ctx, defaultConfig(), MAX_FILE_SIZE);
    const stubIssue = result.issues.find(i => i.message.includes('assertion'));
    assert.ok(stubIssue, 'should flag test file with no assertions');
    assert.ok(stubIssue.message.includes('0 assertion'));
  });

  it('counts various assertion patterns correctly', async () => {
    const testWithAssertions = makeFile('test/valid.test.ts', [
      'import * as assert from "assert";',
      'assert.strictEqual(1, 1);',
      'assert.deepEqual({a: 1}, {a: 1});',
      'assert.ok(true);',
    ].join('\n'));
    const ctx = makeCtx([testWithAssertions]);

    const result = await run_test_coverage_gate(ctx, defaultConfig(), MAX_FILE_SIZE);
    const stubIssue = result.issues.find(i => i.filePath === 'test/valid.test.ts');
    assert.strictEqual(stubIssue, undefined, 'test with 3 assertions should pass');
  });

  it('flags missing component-level tests in React projects', async () => {
    const component = makeFile('src/App.tsx', [
      'import React from "react";',
      'export function App() { return <div>Hello</div>; }',
    ].join('\n'));
    const unitTest = makeFile('test/App.test.ts', [
      'import { App } from "../src/App";',
      'assert.ok(typeof App === "function");',
    ].join('\n'));
    const ctx = makeCtx([component, unitTest]);

    const result = await run_test_coverage_gate(ctx, defaultConfig(), MAX_FILE_SIZE);
    const componentIssue = result.issues.find(i => i.message.includes('component-level tests'));
    assert.ok(componentIssue, 'should flag React project without component-level tests');
  });

  it('passes when React project has component tests', async () => {
    const component = makeFile('src/App.tsx', [
      'import React from "react";',
      'export function App() { return <div>Hello</div>; }',
    ].join('\n'));
    const componentTest = makeFile('test/App.test.tsx', [
      'import { render, screen } from "@testing-library/react";',
      'import { App } from "../src/App";',
      'render(<App />);',
      'assert.ok(screen.getByText("Hello"));',
    ].join('\n'));
    const ctx = makeCtx([component, componentTest]);

    const result = await run_test_coverage_gate(ctx, defaultConfig(), MAX_FILE_SIZE);
    const componentIssue = result.issues.find(i => i.message.includes('component-level tests'));
    assert.strictEqual(componentIssue, undefined, 'should pass when component test exists');
  });

  it('skips component test check when requireComponentTests is false', async () => {
    const component = makeFile('src/App.tsx', [
      'import React from "react";',
      'export function App() { return <div>Hello</div>; }',
    ].join('\n'));
    const unitTest = makeFile('test/App.test.ts', [
      'import { App } from "../src/App";',
      'assert.ok(typeof App === "function");',
    ].join('\n'));
    const ctx = makeCtx([component, unitTest]);

    const config = defaultConfig();
    config.requireComponentTests = false;
    const result = await run_test_coverage_gate(ctx, config, MAX_FILE_SIZE);
    const componentIssue = result.issues.find(i => i.message.includes('component-level'));
    assert.strictEqual(componentIssue, undefined, 'should not check component tests when disabled');
  });

  it('excludes entry point files from coverage requirement', async () => {
    const main = makeFile('src/main.tsx', 'import React from "react"; ReactDOM.render(<App />, document.getElementById("root"));');
    const index = makeFile('src/index.ts', 'export { App } from "./App";');
    const ctx = makeCtx([main, index]);

    const result = await run_test_coverage_gate(ctx, defaultConfig(), MAX_FILE_SIZE);
    const mainIssue = result.issues.find(i => i.filePath === 'src/main.tsx');
    const indexIssue = result.issues.find(i => i.filePath === 'src/index.ts');
    assert.strictEqual(mainIssue, undefined, 'main.tsx should be excluded as entry point');
    assert.strictEqual(indexIssue, undefined, 'index.ts should be excluded as entry point');
  });

  it('excludes config files from coverage', async () => {
    const viteConfig = makeFile('vite.config.ts', 'export default { plugins: [] };');
    const tsConfig = makeFile('tsconfig.d.ts', 'declare module "*.svg" {}');
    const ctx = makeCtx([viteConfig, tsConfig]);

    const result = await run_test_coverage_gate(ctx, defaultConfig(), MAX_FILE_SIZE);
    assert.strictEqual(result.status, 'pass');
    assert.strictEqual(result.issues.length, 0);
  });

  it('excludes test directory files from source coverage check', async () => {
    const testHelper = makeFile('test/helpers.ts', 'export function setup() {}');
    const ctx = makeCtx([testHelper]);

    const result = await run_test_coverage_gate(ctx, defaultConfig(), MAX_FILE_SIZE);
    assert.strictEqual(result.status, 'pass');
  });

  it('handles custom entry point patterns', async () => {
    const custom = makeFile('src/bootstrap.ts', 'initApp();');
    const config = defaultConfig();
    config.entryPointPatterns = ['^src/bootstrap\\.ts$'];
    const ctx = makeCtx([custom]);

    const result = await run_test_coverage_gate(ctx, config, MAX_FILE_SIZE);
    const bootstrapIssue = result.issues.find(i => i.filePath === 'src/bootstrap.ts');
    assert.strictEqual(bootstrapIssue, undefined, 'custom entry point should be excluded');
  });

  it('respects configurable minTestAssertions', async () => {
    const src = makeFile('src/calc.ts', 'export const sub = (a: number, b: number) => a - b;');
    const test = makeFile('test/calc.test.ts', [
      'import { sub } from "../src/calc";',
      'assert.strictEqual(sub(5, 3), 2);',
    ].join('\n'));
    const ctx = makeCtx([src, test]);

    const config = defaultConfig();
    config.minTestAssertions = 3;
    const result = await run_test_coverage_gate(ctx, config, MAX_FILE_SIZE);
    const assertionIssue = result.issues.find(i => i.message.includes('assertion'));
    assert.ok(assertionIssue, 'should flag test with fewer assertions than minimum');
    assert.ok(assertionIssue.message.includes('minimum is 3'));
  });

  it('handles empty project with no source files', async () => {
    const ctx = makeCtx([]);
    const result = await run_test_coverage_gate(ctx, defaultConfig(), MAX_FILE_SIZE);
    assert.strictEqual(result.status, 'pass');
    assert.strictEqual(result.issues.length, 0);
  });

  it('reports correct stats', async () => {
    const src1 = makeFile('src/a.ts', 'export const a = 1;');
    const src2 = makeFile('src/b.ts', 'export const b = 2;');
    const test1 = makeFile('test/a.test.ts', 'import { a } from "../src/a"; assert.strictEqual(a, 1);');
    const ctx = makeCtx([src1, src2, test1]);

    const result = await run_test_coverage_gate(ctx, defaultConfig(), MAX_FILE_SIZE);
    assert.strictEqual(result.stats?.sourceFiles, 2);
    assert.strictEqual(result.stats?.testFiles, 1);
  });

  it('recognizes expect() and toBe() assertion patterns', async () => {
    const test = makeFile('test/jest-style.test.ts', [
      'expect(1).toBe(1);',
      'expect(true).toEqual(true);',
    ].join('\n'));
    const ctx = makeCtx([test]);

    const result = await run_test_coverage_gate(ctx, defaultConfig(), MAX_FILE_SIZE);
    const assertionIssue = result.issues.find(i => i.filePath === 'test/jest-style.test.ts');
    assert.strictEqual(assertionIssue, undefined, 'should recognize jest-style assertions');
  });

  it('detects non-React project correctly (no component test check)', async () => {
    const src = makeFile('src/server.ts', 'export function startServer() { /* express app */ }');
    // server/ prefix is excluded from coverage, so use a different path
    const handler = makeFile('src/handler.ts', 'export function handle() {}');
    const ctx = makeCtx([src, handler]);

    const result = await run_test_coverage_gate(ctx, defaultConfig(), MAX_FILE_SIZE);
    // Should not flag component tests for non-React project
    const componentIssue = result.issues.find(i => i.message.includes('component-level'));
    assert.strictEqual(componentIssue, undefined, 'non-React project should not require component tests');
  });
});
