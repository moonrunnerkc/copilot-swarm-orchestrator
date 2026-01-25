import { compile_regexes, is_excluded_by_regex, maybe_read_text } from '../file-utils';
import { GateContext, GateIssue, GateResult, HardcodeConfig } from '../types';

export async function run_hardcoded_config_gate(
  ctx: GateContext,
  config: HardcodeConfig,
  maxFileSizeBytes: number
): Promise<GateResult> {
  const start = Date.now();
  const issues: GateIssue[] = [];

  const banned = compile_regexes(config.bannedLiteralRegexes);
  const allowIfContains = compile_regexes(config.allowIfFileContainsRegexes);
  const exclude = compile_regexes(config.excludeFileRegexes);

  for (const file of ctx.files) {
    if (is_excluded_by_regex(file.relativePath, exclude)) {
      continue;
    }

    const text = maybe_read_text(file, maxFileSizeBytes);
    if (!text) {
      continue;
    }

    for (const re of banned) {
      if (!re.test(text)) {
        continue;
      }

      const allowed = allowIfContains.some(a => a.test(text));
      if (allowed) {
        continue;
      }

      issues.push({
        message: `hardcoded config candidate matched /${re.source}/`,
        filePath: file.relativePath,
        hint: 'move to config/env and reference from code'
      });

      if (issues.length >= 50) {
        break;
      }
    }

    if (issues.length >= 50) {
      break;
    }
  }

  const durationMs = Date.now() - start;
  const status: GateResult['status'] = issues.length > 0 ? 'fail' : 'pass';

  return {
    id: 'hardcoded-config',
    title: 'No obvious hardcoded config',
    status,
    durationMs,
    issues,
    stats: {
      issues: issues.length
    }
  };
}
