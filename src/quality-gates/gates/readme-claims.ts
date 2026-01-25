import { maybe_read_text } from '../file-utils';
import { GateContext, GateIssue, GateResult, ReadmeClaimsConfig } from '../types';

function file_matches(fileRelPath: string, fileRegex: RegExp): boolean {
  return fileRegex.test(fileRelPath);
}

export async function run_readme_claims_gate(
  ctx: GateContext,
  config: ReadmeClaimsConfig,
  maxFileSizeBytes: number
): Promise<GateResult> {
  const start = Date.now();
  const issues: GateIssue[] = [];

  const readmeFile = ctx.files.find(f => /^readme\.md$/i.test(f.relativePath));
  if (!readmeFile) {
    const durationMs = Date.now() - start;
    return {
      id: 'readme-claims',
      title: 'README claims match implementation',
      status: 'skip',
      durationMs,
      issues: [{ message: 'README.md not found, skipping claim checks' }]
    };
  }

  const readmeText = maybe_read_text(readmeFile, maxFileSizeBytes) || '';

  for (const rule of config.claimRules) {
    const claimRe = new RegExp(rule.readmeRegex, 'i');
    if (!claimRe.test(readmeText)) {
      continue;
    }

    for (const evidence of rule.requiredEvidence) {
      const fileRe = new RegExp(evidence.fileRegex, 'i');
      const contentRe = new RegExp(evidence.contentRegex, 'i');

      const found = ctx.files.some(f => {
        if (!file_matches(f.relativePath, fileRe)) {
          return false;
        }
        const text = f.text;
        if (!text) {
          return false;
        }
        return contentRe.test(text);
      });

      if (!found) {
        issues.push({
          message: `README claim matched (${rule.id}) but evidence not found: /${contentRe.source}/ in files /${fileRe.source}/`,
          filePath: readmeFile.relativePath,
          hint: evidence.note || 'either implement it or remove the claim from README'
        });
      }
    }
  }

  const durationMs = Date.now() - start;
  const status: GateResult['status'] = issues.length > 0 ? 'fail' : 'pass';

  return {
    id: 'readme-claims',
    title: 'README claims match implementation',
    status,
    durationMs,
    issues,
    stats: {
      issues: issues.length
    }
  };
}
