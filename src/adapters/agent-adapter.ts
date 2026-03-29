// Unified interface for spawning CLI-based coding agents.
// Each adapter wraps a specific tool (Copilot, Claude Code, Codex)
// behind a common contract so the orchestrator can drive any of them.

export interface AgentResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  shareTranscriptPath?: string | undefined;
}

export interface AgentSpawnOptions {
  prompt: string;
  workdir: string;
  model?: string | undefined;
  timeout?: number | undefined;
  copilotAgent?: string | undefined;
}

export interface AgentAdapter {
  name: string;
  spawn(opts: AgentSpawnOptions): Promise<AgentResult>;
}

// Builds a minimal process.env for agent subprocesses. Only the keys the
// adapter actually needs are forwarded, limiting blast radius if a CLI
// tool is compromised or unexpectedly dumps its environment.
export function buildRestrictedEnv(adapterKeys: string[]): Record<string, string> {
  const env: Record<string, string> = {
    PATH: process.env.PATH || '/usr/bin:/bin',
    HOME: process.env.HOME || '/tmp',
    GIT_AUTHOR_NAME: 'swarm-orchestrator',
    GIT_AUTHOR_EMAIL: 'swarm@localhost',
    GIT_COMMITTER_NAME: 'swarm-orchestrator',
    GIT_COMMITTER_EMAIL: 'swarm@localhost',
  };
  for (const key of adapterKeys) {
    const val = process.env[key];
    if (val) env[key] = val;
  }
  return env;
}
