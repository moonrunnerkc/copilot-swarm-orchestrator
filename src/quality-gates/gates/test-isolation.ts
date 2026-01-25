import { compile_regexes, maybe_read_text } from '../file-utils';
import { GateContext, GateIssue, GateResult, TestIsolationConfig } from '../types';

function is_probably_source_file(relPath: string): boolean {
  return /\.(ts|js|tsx|jsx)$/.test(relPath) && !/\.d\.ts$/.test(relPath);
}

export async function run_test_isolation_gate(
  ctx: GateContext,
  config: TestIsolationConfig,
  maxFileSizeBytes: number
): Promise<GateResult> {
  const start = Date.now();
  const issues: GateIssue[] = [];

  const storeRegexes = compile_regexes(config.mutableStoreRegexes);
  const allowIfFileContains = compile_regexes(config.allowIfFileContainsRegexes);
  const testFileRegexes = config.testFileRegexes.map(r => new RegExp(r, 'i'));
  const allowIfAnyTestContains = compile_regexes(config.allowIfAnyTestContainsRegexes);

  const testTexts: string[] = [];
  for (const file of ctx.files) {
    if (!testFileRegexes.some(r => r.test(file.relativePath))) {
      continue;
    }

    const text = maybe_read_text(file, maxFileSizeBytes);
    if (text) {
      testTexts.push(text);
    }
  }

  const anyTestHasResetHook = testTexts.some(t => allowIfAnyTestContains.some(r => r.test(t)));

  for (const file of ctx.files) {
    if (!is_probably_source_file(file.relativePath)) {
      continue;
    }

    const text = maybe_read_text(file, maxFileSizeBytes);
    if (!text) {
      continue;
    }

    const lines = text.split('\n');

    // scan first ~80 lines for module-scope mutable stores
    const scanLines = lines.slice(0, Math.min(80, lines.length));
    for (let i = 0; i < scanLines.length; i++) {
      const line = scanLines[i] || '';

      if (!storeRegexes.some(r => r.test(line))) {
        continue;
      }

      const allowed = allowIfFileContains.some(r => r.test(text)) || anyTestHasResetHook;
      if (allowed) {
        continue;
      }

      issues.push({
        message: 'mutable module-scope store detected without reset strategy',
        filePath: file.relativePath,
        line: i + 1,
        excerpt: line.trim(),
        hint: 'export a reset hook for tests or reset state in beforeEach()'
      });

      if (issues.length >= 25) {
        break;
      }
    }

    if (issues.length >= 25) {
      break;
    }
  }

  const durationMs = Date.now() - start;
  const status: GateResult['status'] = issues.length > 0 ? 'fail' : 'pass';

  return {
    id: 'test-isolation',
    title: 'Tests are isolated (reset mutable state)',
    status,
    durationMs,
    issues,
    stats: {
      issues: issues.length,
      testFiles: testTexts.length
    }
  };
}
