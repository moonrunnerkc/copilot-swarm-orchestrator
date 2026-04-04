// Scans a git repo before execution to capture existing files.
// Feeds into shared instructions so agents know what not to break.

import { execSync } from 'child_process';

const TEST_PATTERN = /(?:^|\/)(?:test|tests|__tests__|spec)\/|\.(?:test|spec)\.\w+$/i;

export interface BaselineSnapshot {
  allFiles: string[];
  testFiles: string[];
}

/**
 * Run `git ls-files` and split results into test vs non-test.
 * Returns empty lists if the directory isn't a git repo or has no commits.
 */
export function scanBaseline(workingDir: string): BaselineSnapshot {
  let output: string;
  try {
    output = execSync('git ls-files', {
      cwd: workingDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch {
    return { allFiles: [], testFiles: [] };
  }

  if (!output) return { allFiles: [], testFiles: [] };

  const allFiles = output.split('\n').filter(f => f.length > 0);
  const testFiles = allFiles.filter(f => TEST_PATTERN.test(f));
  return { allFiles, testFiles };
}

/**
 * Build preservation rules for .copilot-instructions.md.
 * Lists existing test files and tells agents not to break them.
 */
export function formatPreservationRules(snapshot: BaselineSnapshot): string {
  if (snapshot.allFiles.length === 0) return '';

  const lines: string[] = [
    '## Pre-existing Code',
    `This repository has ${snapshot.allFiles.length} existing file(s).`,
    '- Do NOT modify or delete files outside your assigned scope.',
    '- Do NOT break existing tests. If they fail after your changes, fix the regression before finishing.',
    '- When modifying shared files (e.g., package.json), make only the changes your task requires.',
    '- Run the existing test suite after your changes to confirm nothing is broken.',
    '',
  ];

  if (snapshot.testFiles.length > 0) {
    lines.push('### Protected Test Files');
    lines.push('These tests must continue to pass:');
    for (const f of snapshot.testFiles) {
      lines.push(`- ${f}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
