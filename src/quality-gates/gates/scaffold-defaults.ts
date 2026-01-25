import { maybe_read_text } from '../file-utils';
import { GateContext, GateIssue, GateResult, ScaffoldDefaultsConfig } from '../types';

export async function run_scaffold_defaults_gate(
  ctx: GateContext,
  config: ScaffoldDefaultsConfig,
  maxFileSizeBytes: number
): Promise<GateResult> {
  const start = Date.now();
  const issues: GateIssue[] = [];

  const bannedTitle = config.bannedTitleRegexes.map(r => new RegExp(r, 'i'));
  const bannedReadme = config.bannedReadmeRegexes.map(r => new RegExp(r, 'i'));
  const bannedFiles = new Set(config.bannedFiles);

  // banned files present
  for (const file of ctx.files) {
    if (bannedFiles.has(file.relativePath)) {
      issues.push({
        message: `scaffold default file present: ${file.relativePath}`,
        filePath: file.relativePath,
        hint: 'delete it or replace with project-specific asset'
      });
    }
  }

  // index.html title defaults
  const indexHtml = ctx.files.find(f => f.relativePath === 'index.html');
  if (indexHtml) {
    const text = maybe_read_text(indexHtml, maxFileSizeBytes) || '';
    const titleMatch = text.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      const title = titleMatch[1].trim();
      for (const re of bannedTitle) {
        if (re.test(title)) {
          issues.push({
            message: `scaffold default HTML title: "${title}"`,
            filePath: indexHtml.relativePath,
            excerpt: title,
            hint: 'set a real product/app name'
          });
          break;
        }
      }
    }
  }

  // README defaults
  const readme = ctx.files.find(f => /^readme\.md$/i.test(f.relativePath));
  if (readme) {
    const text = maybe_read_text(readme, maxFileSizeBytes) || '';
    for (const re of bannedReadme) {
      if (re.test(text)) {
        issues.push({
          message: `scaffold default README content matched /${re.source}/`,
          filePath: readme.relativePath,
          hint: 'replace scaffold docs with project-specific README'
        });
      }
    }
  }

  const durationMs = Date.now() - start;
  const status: GateResult['status'] = issues.length > 0 ? 'fail' : 'pass';

  return {
    id: 'scaffold-defaults',
    title: 'Scaffold defaults removed',
    status,
    durationMs,
    issues,
    stats: {
      issues: issues.length
    }
  };
}
