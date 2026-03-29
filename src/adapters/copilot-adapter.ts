// Copilot CLI adapter: spawns `copilot -p` with the same flags and behavior
// as the original SessionExecutor.runCommand path. This is a refactor, not
// new behavior; it preserves the stall detection, line buffering, and heartbeat
// logic from the original implementation.

import { spawn, SpawnOptions } from 'child_process';
import { AgentAdapter, AgentResult, AgentSpawnOptions } from './agent-adapter';

// Maximum seconds of silence before killing a stalled copilot subprocess
const STALL_TIMEOUT_MS = 120_000;

// Copilot CLI outputs these when an agent tries to access paths outside its sandbox
const SCOPE_NOISE_PATTERNS = [
  /Permission denied and could not request permission/i,
  /could not request permission from user/i,
];

function isScopeNoise(line: string): boolean {
  return SCOPE_NOISE_PATTERNS.some(p => p.test(line));
}

export class CopilotAdapter implements AgentAdapter {
  readonly name = 'copilot';

  async spawn(opts: AgentSpawnOptions): Promise<AgentResult> {
    const startTime = Date.now();
    const args: string[] = ['-p', opts.prompt];

    if (opts.model) {
      args.push('--model', opts.model);
    }

    // --allow-all covers tools, paths, and URLs so the subprocess
    // never blocks waiting for interactive approval on stdin.
    args.push('--allow-all');

    if (opts.copilotAgent) {
      args.push('--agent', opts.copilotAgent);
    }

    const result = await this.runProcess('copilot', args, opts.workdir, opts.timeout);
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
        env: {
          ...process.env,
          COPILOT_ALLOW_ALL: 'true',
        },
      };

      const proc = spawn(command, args, spawnOpts);

      // Close stdin so the subprocess never blocks on interactive input
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

      const effectiveStallTimeout = timeout || STALL_TIMEOUT_MS;

      stallCheckInterval = setInterval(() => {
        const silentMs = Date.now() - lastOutputTime;
        if (silentMs >= effectiveStallTimeout) {
          cleanup();
          proc.kill('SIGTERM');
          setTimeout(() => {
            try { proc.kill('SIGKILL'); } catch { /* already dead */ }
          }, 5000);
          if (!resolved) {
            resolved = true;
            const stallSec = Math.round(silentMs / 1000);
            resolve({
              stdout,
              stderr: stderr + `\nProcess killed after ${stallSec}s of no output (stall timeout)`,
              exitCode: 1,
            });
          }
        }
      }, 10_000);

      if (proc.stdout) {
        proc.stdout.on('data', (data) => {
          const text = data.toString();
          stdout += text;
          lastOutputTime = Date.now();
        });
      }

      if (proc.stderr) {
        proc.stderr.on('data', (data) => {
          const text = data.toString();
          // Filter scope enforcement noise from captured stderr
          const lines = text.split('\n');
          const filtered = lines.filter((l: string) => !isScopeNoise(l)).join('\n');
          stderr += filtered;
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
          resolve({
            stdout,
            stderr: stderr + '\n' + err.message,
            exitCode: 1,
          });
        }
      });
    });
  }
}
