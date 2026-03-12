/**
 * Steering types for human collaboration in swarm orchestration
 */

export type SteeringCommandType =
  | 'pause'
  | 'resume'
  | 'approve'
  | 'reject'
  | 'prioritize'
  | 'help';

export interface SteeringCommand {
  type: SteeringCommandType;
  timestamp: string;
  userId: string; // 'human' for now, extensible for multi-user
  target?: string; // step number or wave number
  message?: string; // additional context
}

export interface Conflict {
  id: string;
  type: 'verification' | 'merge' | 'plan';
  stepNumber: number;
  agentName: string;
  description: string;
  evidence: string[];
  timestamp: string;
  resolved: boolean;
  resolution?: 'approved' | 'rejected';
  resolvedBy?: string;
  resolvedAt?: string;
}

export interface OrchestratorState {
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  currentWave: number;
  pausedSteps: number[]; // step numbers that are paused
  pendingConflicts: Conflict[];
  steeringHistory: SteeringCommand[];
  readOnly: boolean; // true for shared/observer mode
}

export interface DashboardInputMode {
  mode: 'observe' | 'command' | 'approval';
  prompt: string;
  currentConflict?: Conflict;
}

export const STEERING_COMMANDS = {
  pause: 'Pause current wave execution',
  resume: 'Resume paused execution',
  approve: 'Approve pending conflict',
  reject: 'Reject pending conflict',
  prioritize: 'Reprioritize a specific step',
  help: 'Show available commands'
} as const;

export function parseSteeringCommand(input: string): SteeringCommand | null {
  const trimmed = input.trim().toLowerCase();
  const timestamp = new Date().toISOString();

  if (trimmed === 'pause' || trimmed === 'p') {
    return { type: 'pause', timestamp, userId: 'human' };
  }

  if (trimmed === 'resume' || trimmed === 'r') {
    return { type: 'resume', timestamp, userId: 'human' };
  }

  if (trimmed === 'approve' || trimmed === 'a' || trimmed === 'y') {
    return { type: 'approve', timestamp, userId: 'human' };
  }

  if (trimmed === 'reject' || trimmed === 'n') {
    return { type: 'reject', timestamp, userId: 'human' };
  }

  if (trimmed === 'help' || trimmed === 'h' || trimmed === '?') {
    return { type: 'help', timestamp, userId: 'human' };
  }

  // prioritize command: "prioritize step 3" or "pri 3"
  const prioritizeMatch = trimmed.match(/^(?:prioritize|pri)\s+(?:step\s+)?(\d+)(?:\s+(.+))?/);
  if (prioritizeMatch) {
    return {
      type: 'prioritize',
      timestamp,
      userId: 'human',
      target: prioritizeMatch[1],
      message: prioritizeMatch[2]
    };
  }

  return null;
}

export function formatSteeringCommand(command: SteeringCommand): string {
  const time = new Date(command.timestamp).toLocaleTimeString();
  let desc = `[${time}] ${command.userId}: ${command.type}`;
  
  if (command.target) {
    desc += ` (step ${command.target})`;
  }
  
  if (command.message) {
    desc += ` - ${command.message}`;
  }
  
  return desc;
}
