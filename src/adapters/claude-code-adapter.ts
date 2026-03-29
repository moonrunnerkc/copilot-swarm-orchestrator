// Claude Code CLI adapter: spawns `claude` with --dangerously-skip-permissions
// for non-interactive use. No transcript sharing; stdout/stderr captured directly.

import { spawn, SpawnOptions } from 'child_process';
import { AgentAdapter, AgentResult, AgentSpawnOptions } from './agent-adapter';

// Claude Code can spend several minutes on internal reasoning and multi-file
// operations without producing stdout, unlike streaming CLI tools.
const STALL_TIMEOUT_MS = 600_000;

export class ClaudeCodeAdapter implements AgentAdapter {
  readonly name = 'claude-code';

  async spawn(opts: AgentSpawnOptions): Promise<AgentResult> {
    const startTime = Date.now();
    const args: string[] = ['--dangerously-skip-permissions', '-p', opts.prompt];

    if (opts.model) {
      args.push('--model', opts.model);
    }

    const result = await this.runProcess('claude', args, opts.workdir, opts.timeout);
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
