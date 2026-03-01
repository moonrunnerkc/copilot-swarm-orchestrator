import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { GateResult, GateIssue } from '../types';

export interface RuntimeChecksConfig {
  enabled: boolean;
  /** Number of retry attempts for each check (0 = no retries) */
  retries: number;
  /** Run `npm test` or equivalent */
  runTests: boolean;
  /** Run `npx eslint .` if eslint config exists */
  runLint: boolean;
  /** Run `npm audit --audit-level=moderate` */
  runAudit: boolean;
  /** Timeout per command in ms (default 120000) */
  timeoutMs: number;
}

interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  command: string;
}

/**
 * Execute a shell command with retry support.
 * Returns success/failure with captured output. Does not throw.
 */
function runCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
  retries: number
): CommandResult {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const stdout = execSync(command, {
        cwd,
        encoding: 'utf-8',
        timeout: timeoutMs,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, CI: 'true', FORCE_COLOR: '0' }
      });
      return { success: true, stdout, stderr: '', command };
    } catch (err: unknown) {
      const execErr = err as { stdout?: string; stderr?: string; status?: number };
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) {
        return {
          success: false,
          stdout: String(execErr.stdout || ''),
          stderr: String(execErr.stderr || ''),
          command
        };
      }
      // Brief pause before retry (1s, 2s)
      const delay = (attempt + 1) * 1000;
      execSync(`sleep ${delay / 1000}`, { stdio: 'pipe' });
    }
  }
  // Unreachable, but TypeScript needs it
  return { success: false, stdout: '', stderr: '', command };
}

/**
 * Detect whether the project has a test script in package.json.
 */
function hasScript(projectRoot: string, scriptName: string): boolean {
  const pkgPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const script = pkg.scripts?.[scriptName];
    // Treat missing or stub scripts as absent
    return !!script && !script.includes('no test specified');
  } catch {
    return false;
  }
}

/**
 * Detect whether eslint config exists in the project.
 */
function hasEslintConfig(projectRoot: string): boolean {
  const candidates = [
    '.eslintrc',
    '.eslintrc.js',
    '.eslintrc.cjs',
    '.eslintrc.json',
    '.eslintrc.yml',
    '.eslintrc.yaml',
    'eslint.config.js',
    'eslint.config.mjs',
    'eslint.config.cjs',
    'eslint.config.ts'
  ];
  for (const name of candidates) {
    if (fs.existsSync(path.join(projectRoot, name))) return true;
  }
  // Check package.json eslintConfig field
  const pkgPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.eslintConfig) return true;
    } catch { /* ignore parse errors */ }
  }
  return false;
}

/**
 * Runtime quality gate: executes the project's own test suite, linter,
 * and security audit to validate the generated code actually works.
 *
 * Skipped checks (missing test script, no eslint config) are not failures.
 */
export async function run_runtime_checks_gate(
  projectRoot: string,
  config: RuntimeChecksConfig
): Promise<GateResult> {
  const start = Date.now();
  const id = 'runtime-checks';
  const title = 'Runtime Checks (tests, lint, audit)';

  if (!config.enabled) {
    return { id, title, status: 'skip', durationMs: 0, issues: [] };
  }

  const issues: GateIssue[] = [];
  const stats: Record<string, number> = { testsRun: 0, lintRun: 0, auditRun: 0 };

  // --- npm test ---
  if (config.runTests) {
    if (hasScript(projectRoot, 'test')) {
      const result = runCommand('npm test', projectRoot, config.timeoutMs, config.retries);
      stats.testsRun = 1;
      if (!result.success) {
        const excerpt = (result.stderr || result.stdout).split('\n').slice(-15).join('\n').trim();
        issues.push({
          message: '`npm test` failed',
          hint: 'Fix failing tests before merge.',
          excerpt: excerpt.substring(0, 500)
        });
      }
    }
  }

  // --- eslint ---
  if (config.runLint) {
    if (hasEslintConfig(projectRoot)) {
      const result = runCommand('npx eslint . --max-warnings=0', projectRoot, config.timeoutMs, config.retries);
      stats.lintRun = 1;
      if (!result.success) {
        const excerpt = (result.stdout || result.stderr).split('\n').slice(0, 20).join('\n').trim();
        issues.push({
          message: '`npx eslint .` reported errors',
          hint: 'Fix lint errors before merge.',
          excerpt: excerpt.substring(0, 500)
        });
      }
    }
  }

  // --- npm audit ---
  if (config.runAudit) {
    if (fs.existsSync(path.join(projectRoot, 'package-lock.json')) ||
        fs.existsSync(path.join(projectRoot, 'package.json'))) {
      const result = runCommand(
        'npm audit --audit-level=moderate --omit=dev',
        projectRoot,
        config.timeoutMs,
        config.retries
      );
      stats.auditRun = 1;
      if (!result.success) {
        const excerpt = (result.stdout || result.stderr).split('\n').slice(0, 15).join('\n').trim();
        issues.push({
          message: '`npm audit` found moderate+ vulnerabilities',
          hint: 'Run `npm audit fix` or address manually.',
          excerpt: excerpt.substring(0, 500)
        });
      }
    }
  }

  const durationMs = Date.now() - start;
  const status = issues.length > 0 ? 'fail' : 'pass';

  return { id, title, status, durationMs, issues, stats };
}
