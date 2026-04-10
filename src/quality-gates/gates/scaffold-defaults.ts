import { maybe_read_text } from '../file-utils';
import { GateContext, GateIssue, GateResult, ScaffoldDefaultsConfig } from '../types';

// Artifacts that should never be tracked. Each entry maps a file pattern
// (tested against relativePath) to the gitignore entry that would exclude it.
// Only flagged when the artifact is actually present in the project file list,
// so the check produces zero false positives on clean repos.
const GITIGNORE_ARTIFACT_RULES: Array<{
  filePattern: RegExp;
  gitignoreEntry: string;
  hint: string;
}> = [
  { filePattern: /^\.coverage$/, gitignoreEntry: '.coverage', hint: 'pytest coverage data binary' },
  { filePattern: /\.pyc$/, gitignoreEntry: '*.pyc', hint: 'compiled Python bytecode' },
  { filePattern: /(^|\/)__pycache__\//, gitignoreEntry: '__pycache__/', hint: 'Python bytecode cache directory' },
  { filePattern: /^\.env$/, gitignoreEntry: '.env', hint: 'environment secrets file' },
  { filePattern: /(^|\/)node_modules\//, gitignoreEntry: 'node_modules/', hint: 'npm dependency tree' },
  { filePattern: /^dist\//, gitignoreEntry: 'dist/', hint: 'build output directory' },
  { filePattern: /^\.DS_Store$/, gitignoreEntry: '.DS_Store', hint: 'macOS Finder metadata' },
  { filePattern: /^Thumbs\.db$/, gitignoreEntry: 'Thumbs.db', hint: 'Windows thumbnail cache' },
  { filePattern: /\.sqlite3?$/, gitignoreEntry: '*.sqlite3', hint: 'SQLite database file (should not be tracked)' },
];

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

  // Gitignore completeness: when .gitignore exists, check that tracked files
  // don't include artifacts that should be excluded. Only flags artifacts
  // actually present in the project, not hypothetical ones.
  const gitignore = ctx.files.find(f => f.relativePath === '.gitignore');
  if (gitignore) {
    const gitignoreText = maybe_read_text(gitignore, maxFileSizeBytes) || '';
    const gitignoreLines = gitignoreText.split('\n').map(l => l.trim());

    for (const rule of GITIGNORE_ARTIFACT_RULES) {
      const artifactPresent = ctx.files.some(f => rule.filePattern.test(f.relativePath));
      if (!artifactPresent) continue;

      // Check whether gitignore already covers this artifact.
      // Simple substring match on the entry (e.g. ".coverage" appears in a line).
      // Not full gitignore glob semantics, but catches standard entries.
      const covered = gitignoreLines.some(line =>
        line === rule.gitignoreEntry ||
        line === '/' + rule.gitignoreEntry ||
        (rule.gitignoreEntry.startsWith('*') && line === rule.gitignoreEntry)
      );

      if (!covered) {
        issues.push({
          message: `tracked artifact should be in .gitignore: ${rule.gitignoreEntry}`,
          filePath: '.gitignore',
          hint: rule.hint,
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
