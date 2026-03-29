// OpenAI Codex CLI adapter: spawns `codex exec` for non-interactive use.
// Uses --dangerously-bypass-approvals-and-sandbox because git worktrees have
// .git references to the parent repo, which --full-auto's sandbox blocks.

import { spawn, SpawnOptions } from 'child_process';
import { AgentAdapter, AgentResult, AgentSpawnOptions } from './agent-adapter';

// Codex can spend significant time on reasoning and file operations
// without producing stdout, similar to Claude Code.
const STALL_TIMEOUT_MS = 600_000;

export class CodexAdapter implements AgentAdapter {
  readonly name = 'codex';

  async spawn(opts: AgentSpawnOptions): Promise<AgentResult> {
    const startTime = Date.now();
    const args: string[] = [
      'exec',
      '--dangerously-bypass-approvals-and-sandbox',
      '-C', opts.workdir,
    ];

    if (opts.model) {
      args.push('-m', opts.model);
    }

    args.push(opts.prompt);

    const result = await this.runProcess('codex', args, opts.workdir, opts.timeout);
    const durationMs = Date.now() - startTime;

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs,
    };
  }

  private runProcess(
    command: string,
    args: string[],
    workdir: string,
    timeout?: number
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      const spawnOpts: SpawnOptions = {
        cwd: workdir,
        env: { ...process.env },
      };

      const proc = spawn(command, args, spawnOpts);

      if (proc.stdin) {
        proc.stdin.end();
      }

      let stdout = '';
      let stderr = '';
      let resolved = false;
      let lastOutputTime = Date.now();
      let stallCheckInterval: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (stallCheckInterval) clearInterval(stallCheckInterval);
      };

      const effectiveTimeout = timeout || STALL_TIMEOUT_MS;

      stallCheckInterval = setInterval(() => {
        const silentMs = Date.now() - lastOutputTime;
        if (silentMs >= effectiveTimeout) {
          cleanup();
          proc.kill('SIGTERM');
          setTimeout(() => {
            try { proc.kill('SIGKILL'); } catch { /* already dead */ }
          }, 5000);
          if (!resolved) {
            resolved = true;
            resolve({
              stdout,
              stderr: stderr + `\nProcess killed after ${Math.round(silentMs / 1000)}s of no output (stall timeout)`,
              exitCode: 1,
            });
          }
        }
      }, 10_000);

      if (proc.stdout) {
        proc.stdout.on('data', (data) => {
          stdout += data.toString();
          lastOutputTime = Date.now();
        });
      }

      if (proc.stderr) {
        proc.stderr.on('data', (data) => {
          stderr += data.toString();
          lastOutputTime = Date.now();
        });
      }

      proc.on('close', (code) => {
        cleanup();
        if (!resolved) {
          resolved = true;
          resolve({ stdout, stderr, exitCode: code || 0 });
        }
      });

      proc.on('error', (err) => {
        cleanup();
        if (!resolved) {
          resolved = true;
          resolve({ stdout, stderr: stderr + '\n' + err.message, exitCode: 1 });
        }
      });
    });
  }
}
