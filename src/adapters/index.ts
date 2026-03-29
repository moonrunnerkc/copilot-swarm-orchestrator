// Resolves adapter name to concrete AgentAdapter instance.
// Central registry; add new adapters here.

import { AgentAdapter } from './agent-adapter';
import { CopilotAdapter } from './copilot-adapter';
import { ClaudeCodeAdapter } from './claude-code-adapter';
import { CodexAdapter } from './codex-adapter';

export { AgentAdapter, AgentResult, AgentSpawnOptions, buildRestrictedEnv } from './agent-adapter';

const ADAPTER_REGISTRY: Record<string, () => AgentAdapter> = {
  'copilot': () => new CopilotAdapter(),
  'claude-code': () => new ClaudeCodeAdapter(),
  'codex': () => new CodexAdapter(),
};

// Each adapter's underlying tool has a different default model.
// Used for cost estimation and reporting when the user hasn't specified --model.
const DEFAULT_MODELS: Record<string, string> = {
  'copilot': 'claude-sonnet-4',
  'claude-code': 'claude-sonnet-4',
  'codex': 'gpt-5.4',
};

const AVAILABLE_NAMES = Object.keys(ADAPTER_REGISTRY);

/**
 * Returns the default model name for a given adapter.
 * Falls back to the adapter's known default rather than assuming claude-sonnet-4.
 */
export function defaultModelForAdapter(adapterName?: string): string {
  if (!adapterName) return DEFAULT_MODELS['copilot'];
  return DEFAULT_MODELS[adapterName] ?? DEFAULT_MODELS['copilot'];
}

export function resolveAdapter(name: string): AgentAdapter {
  const factory = ADAPTER_REGISTRY[name];
  if (!factory) {
    throw new Error(
      `Unknown agent adapter "${name}". Available adapters: ${AVAILABLE_NAMES.join(', ')}`
    );
  }
  return factory();
}
