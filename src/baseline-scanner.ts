// Scans a git repo before execution to capture existing files.
// Feeds into shared instructions so agents know what not to break.

import { execSync } from 'child_process';

const TEST_PATTERN = /(?:^|\/)(?:test|tests|__tests__|spec)\/|\.(?:test|spec)\.\w+$/i;

// Vendored dependency directories whose test files are irrelevant to the project
const VENDORED_DIRS = /^(?:node_modules|venv|\.venv|env|\.env|\.tox|__pypackages__|bower_components|\.bundle)\//i;
const SITE_PACKAGES = /\/site-packages\//;

export interface BaselineSnapshot {
  allFiles: string[];
  testFiles: string[];
  headCommit: string;
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
    return { allFiles: [], testFiles: [], headCommit: '' };
  }

  // Capture HEAD so quality gates can scope checks to agent-changed files
  let headCommit = '';
  try {
    headCommit = execSync('git rev-parse HEAD', {
      cwd: workingDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch { /* empty repo with no commits yet */ }

  if (!output) return { allFiles: [], testFiles: [], headCommit };

  const allFiles = output.split('\n').filter(f => f.length > 0);
  const testFiles = allFiles.filter(f =>
    TEST_PATTERN.test(f) && !VENDORED_DIRS.test(f) && !SITE_PACKAGES.test(f)
  );
  return { allFiles, testFiles, headCommit };
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
