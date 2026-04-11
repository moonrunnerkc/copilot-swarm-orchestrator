import * as assert from 'assert';
import { formatSarif } from '../src/sarif-formatter';
import { GateResult, GateStatus } from '../src/quality-gates/types';
import { QualityGatesRunResult } from '../src/quality-gates/gate-runner';

/**
 * Build a minimal GateResult fixture with sensible defaults.
 */
function makeGateResult(overrides: Partial<GateResult> & { id: string; status: GateStatus }): GateResult {
  return {
    title: overrides.id.replace(/-/g, ' '),
    durationMs: 12,
    issues: [],
    ...overrides,
  };
}

function makeRunResult(results: GateResult[], passed?: boolean): QualityGatesRunResult {
  const hasFail = results.some(r => r.status === 'fail');
  return {
    passed: passed !== undefined ? passed : !hasFail,
    results,
    totalDurationMs: results.reduce((s, r) => s + r.durationMs, 0),
  };
}

function parseSarif(json: string): Record<string, unknown> {
  return JSON.parse(json) as Record<string, unknown>;
}

describe('SarifFormatter', () => {
  const toolVersion = '5.0.0';

  describe('SARIF structure', () => {
    it('produces valid SARIF 2.1.0 skeleton with schema and version', () => {
      const run = makeRunResult([
        makeGateResult({ id: 'scaffold-defaults', status: 'pass' }),
      ]);

      const sarif = parseSarif(formatSarif(run, toolVersion));
      assert.strictEqual(
        sarif.$schema,
        'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json'
      );
      assert.strictEqual(sarif.version, '2.1.0');

      const runs = sarif.runs as Array<Record<string, unknown>>;
      assert.strictEqual(runs.length, 1);

      const tool = runs[0].tool as Record<string, unknown>;
      const driver = tool.driver as Record<string, unknown>;
      assert.strictEqual(driver.name, 'swarm-orchestrator');
      assert.strictEqual(driver.version, '5.0.0');
    });

    it('returns empty results array when all gates pass', () => {
      const run = makeRunResult([
        makeGateResult({ id: 'scaffold-defaults', status: 'pass' }),
        makeGateResult({ id: 'duplicate-blocks', status: 'pass' }),
        makeGateResult({ id: 'runtime-checks', status: 'pass' }),
      ]);

      const sarif = parseSarif(formatSarif(run, toolVersion));
      const results = (sarif.runs as Array<Record<string, unknown>>)[0].results as unknown[];
      assert.strictEqual(results.length, 0);
    });
  });

  describe('gate-to-rule mapping', () => {
    const gateIds = [
      'scaffold-defaults',
      'duplicate-blocks',
      'hardcoded-config',
      'readme-claims',
      'test-isolation',
      'test-coverage',
      'accessibility',
      'runtime-checks',
    ];

    for (const gateId of gateIds) {
      it(`maps ${gateId} to SARIF rule swarm/${gateId}`, () => {
        const run = makeRunResult([
          makeGateResult({
            id: gateId,
            status: 'fail',
            issues: [{ message: `violation in ${gateId}`, filePath: 'src/app.ts', line: 10 }],
          }),
        ]);

        const sarif = parseSarif(formatSarif(run, toolVersion));
        const driver = ((sarif.runs as Array<Record<string, unknown>>)[0].tool as Record<string, unknown>).driver as Record<string, unknown>;
        const rules = driver.rules as Array<Record<string, unknown>>;
        assert.strictEqual(rules.length, 1);
        assert.strictEqual(rules[0].id, `swarm/${gateId}`);

        const desc = rules[0].shortDescription as Record<string, string>;
        assert.ok(desc.text.length > 0, 'Rule should have a non-empty description');
      });
    }
  });

  describe('level mapping', () => {
    it('maps fail status to error level', () => {
      const run = makeRunResult([
        makeGateResult({
          id: 'duplicate-blocks',
          status: 'fail',
          issues: [{ message: 'block duplicated 4 times', filePath: 'src/utils.ts', line: 20 }],
        }),
      ]);

      const sarif = parseSarif(formatSarif(run, toolVersion));
      const results = (sarif.runs as Array<Record<string, unknown>>)[0].results as Array<Record<string, unknown>>;
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].level, 'error');
    });

    it('maps skip status with issues to note level', () => {
      const run = makeRunResult([
        makeGateResult({
          id: 'test-coverage',
          status: 'skip',
          issues: [{ message: 'skipped because no test framework detected' }],
        }),
      ]);

      const sarif = parseSarif(formatSarif(run, toolVersion));
      const results = (sarif.runs as Array<Record<string, unknown>>)[0].results as Array<Record<string, unknown>>;
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].level, 'note');
    });

    it('omits pass gates from results entirely', () => {
      const run = makeRunResult([
        makeGateResult({ id: 'scaffold-defaults', status: 'pass' }),
        makeGateResult({
          id: 'duplicate-blocks',
          status: 'fail',
          issues: [{ message: 'dup found', filePath: 'a.ts' }],
        }),
      ]);

      const sarif = parseSarif(formatSarif(run, toolVersion));
      const results = (sarif.runs as Array<Record<string, unknown>>)[0].results as Array<Record<string, unknown>>;
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].ruleId, 'swarm/duplicate-blocks');
    });

    it('omits skip gates that have no issues', () => {
      const run = makeRunResult([
        makeGateResult({ id: 'accessibility', status: 'skip', issues: [] }),
      ]);

      const sarif = parseSarif(formatSarif(run, toolVersion));
      const results = (sarif.runs as Array<Record<string, unknown>>)[0].results as Array<Record<string, unknown>>;
      assert.strictEqual(results.length, 0);
    });
  });

  describe('file locations', () => {
    it('populates region.startLine when issue has a specific line', () => {
      const run = makeRunResult([
        makeGateResult({
          id: 'hardcoded-config',
          status: 'fail',
          issues: [{ message: 'hardcoded port 3000', filePath: 'src/server.ts', line: 42 }],
        }),
      ]);

      const sarif = parseSarif(formatSarif(run, toolVersion));
      const results = (sarif.runs as Array<Record<string, unknown>>)[0].results as Array<Record<string, unknown>>;
      const loc = (results[0].locations as Array<Record<string, unknown>>)[0];
      const phys = loc.physicalLocation as Record<string, unknown>;
      const artifact = phys.artifactLocation as Record<string, string>;
      assert.strictEqual(artifact.uri, 'src/server.ts');
      const region = phys.region as Record<string, number>;
      assert.strictEqual(region.startLine, 42);
    });

    it('omits region when issue has no line number', () => {
      const run = makeRunResult([
        makeGateResult({
          id: 'test-coverage',
          status: 'fail',
          issues: [{ message: 'coverage below threshold', filePath: 'src/index.ts' }],
        }),
      ]);

      const sarif = parseSarif(formatSarif(run, toolVersion));
      const results = (sarif.runs as Array<Record<string, unknown>>)[0].results as Array<Record<string, unknown>>;
      const phys = ((results[0].locations as Array<Record<string, unknown>>)[0]).physicalLocation as Record<string, unknown>;
      assert.strictEqual((phys.artifactLocation as Record<string, string>).uri, 'src/index.ts');
      assert.strictEqual(phys.region, undefined);
    });

    it('uses project root marker when issue has no file path', () => {
      const run = makeRunResult([
        makeGateResult({
          id: 'runtime-checks',
          status: 'fail',
          issues: [{ message: 'npm test failed with exit code 1' }],
        }),
      ]);

      const sarif = parseSarif(formatSarif(run, toolVersion));
      const results = (sarif.runs as Array<Record<string, unknown>>)[0].results as Array<Record<string, unknown>>;
      const phys = ((results[0].locations as Array<Record<string, unknown>>)[0]).physicalLocation as Record<string, unknown>;
      assert.strictEqual((phys.artifactLocation as Record<string, string>).uri, '.');
    });

    it('normalizes backslash paths to forward slashes', () => {
      const run = makeRunResult([
        makeGateResult({
          id: 'scaffold-defaults',
          status: 'fail',
          issues: [{ message: 'TODO found', filePath: 'src\\components\\App.tsx', line: 5 }],
        }),
      ]);

      const sarif = parseSarif(formatSarif(run, toolVersion));
      const results = (sarif.runs as Array<Record<string, unknown>>)[0].results as Array<Record<string, unknown>>;
      const phys = ((results[0].locations as Array<Record<string, unknown>>)[0]).physicalLocation as Record<string, unknown>;
      assert.strictEqual((phys.artifactLocation as Record<string, string>).uri, 'src/components/App.tsx');
    });

    it('strips leading ./ from file paths', () => {
      const run = makeRunResult([
        makeGateResult({
          id: 'hardcoded-config',
          status: 'fail',
          issues: [{ message: 'hardcoded URL', filePath: './src/api.ts', line: 1 }],
        }),
      ]);

      const sarif = parseSarif(formatSarif(run, toolVersion));
      const results = (sarif.runs as Array<Record<string, unknown>>)[0].results as Array<Record<string, unknown>>;
      const phys = ((results[0].locations as Array<Record<string, unknown>>)[0]).physicalLocation as Record<string, unknown>;
      assert.strictEqual((phys.artifactLocation as Record<string, string>).uri, 'src/api.ts');
    });
  });

  describe('multiple issues per gate', () => {
    it('produces one SARIF result per issue within a single gate', () => {
      const run = makeRunResult([
        makeGateResult({
          id: 'duplicate-blocks',
          status: 'fail',
          issues: [
            { message: 'block A duplicated', filePath: 'src/a.ts', line: 10 },
            { message: 'block B duplicated', filePath: 'src/b.ts', line: 30 },
            { message: 'block C duplicated', filePath: 'src/c.ts', line: 50 },
          ],
        }),
      ]);

      const sarif = parseSarif(formatSarif(run, toolVersion));
      const results = (sarif.runs as Array<Record<string, unknown>>)[0].results as Array<Record<string, unknown>>;
      assert.strictEqual(results.length, 3);
      for (const r of results) {
        assert.strictEqual(r.ruleId, 'swarm/duplicate-blocks');
        assert.strictEqual(r.level, 'error');
      }
    });
  });

  describe('gate with fail status but no issues', () => {
    it('produces a single project-level result', () => {
      const run = makeRunResult([
        makeGateResult({
          id: 'runtime-checks',
          status: 'fail',
          title: 'Runtime checks failed',
          issues: [],
        }),
      ]);

      const sarif = parseSarif(formatSarif(run, toolVersion));
      const results = (sarif.runs as Array<Record<string, unknown>>)[0].results as Array<Record<string, unknown>>;
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].ruleId, 'swarm/runtime-checks');
      const msg = results[0].message as Record<string, string>;
      assert.strictEqual(msg.text, 'Runtime checks failed');
    });
  });

  describe('mixed gate statuses', () => {
    it('only includes rules for reportable gates', () => {
      const run = makeRunResult([
        makeGateResult({ id: 'scaffold-defaults', status: 'pass' }),
        makeGateResult({
          id: 'duplicate-blocks',
          status: 'fail',
          issues: [{ message: 'dup', filePath: 'x.ts' }],
        }),
        makeGateResult({ id: 'hardcoded-config', status: 'pass' }),
        makeGateResult({
          id: 'test-isolation',
          status: 'skip',
          issues: [{ message: 'skipped: no test files found' }],
        }),
      ]);

      const sarif = parseSarif(formatSarif(run, toolVersion));
      const runObj = (sarif.runs as Array<Record<string, unknown>>)[0];
      const driver = (runObj.tool as Record<string, unknown>).driver as Record<string, unknown>;
      const rules = driver.rules as Array<Record<string, unknown>>;
      const results = runObj.results as Array<Record<string, unknown>>;

      // Only 2 gates (duplicate-blocks=fail, test-isolation=skip with issues) should have rules
      assert.strictEqual(rules.length, 2);
      const ruleIds = rules.map(r => r.id);
      assert.ok(ruleIds.includes('swarm/duplicate-blocks'));
      assert.ok(ruleIds.includes('swarm/test-isolation'));

      assert.strictEqual(results.length, 2);
    });
  });

  describe('output format', () => {
    it('produces valid JSON', () => {
      const run = makeRunResult([
        makeGateResult({
          id: 'accessibility',
          status: 'fail',
          issues: [{ message: 'missing alt attribute', filePath: 'src/page.html', line: 15 }],
        }),
      ]);

      const output = formatSarif(run, toolVersion);
      assert.doesNotThrow(() => JSON.parse(output));
    });

    it('is pretty-printed with 2-space indentation', () => {
      const run = makeRunResult([
        makeGateResult({ id: 'scaffold-defaults', status: 'pass' }),
      ]);

      const output = formatSarif(run, toolVersion);
      // Pretty-printed JSON has newlines and indentation
      assert.ok(output.includes('\n'));
      assert.ok(output.includes('  "'));
    });
  });
});
