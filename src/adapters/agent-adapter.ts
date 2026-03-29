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
