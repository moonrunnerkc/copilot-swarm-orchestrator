/**
 * Type definitions for productivity analytics and personalization
 * Phase 5: Track run metrics, learn preferences, enable auto-tuning
 */

/**
 * Metrics captured from a single orchestrator run
 */
export interface RunMetrics {
  executionId: string;
  goal: string;
  startTime: string;
  endTime: string;
  totalTimeMs: number;
  waveCount: number;
  stepCount: number;
  commitCount: number;
  verificationsPassed: number;
  verificationsFailed: number;
  recoveryEvents: RecoveryEvent[];
  agentsUsed: string[];
}

/**
 * A recovery event where failure led to replan/retry and eventual success
 */
export interface RecoveryEvent {
  stepNumber: number;
  agentName: string;
  failedAt: string;
  recoveredAt: string;
  recoveryMethod: 'retry' | 'replan' | 'rollback' | 'manual';
}

/**
 * A single entry in the analytics log
 */
export interface AnalyticsEntry {
  schemaVersion: number;
  timestamp: string;
  metrics: RunMetrics;
}

/**
 * User preferences and learned behaviors
 */
export interface UserProfile {
  schemaVersion: number;
  preferences: {
    commitStyle?: 'conventional' | 'imperative' | 'descriptive' | 'mixed';
    agentPriorities?: Record<string, number>; // agent name -> priority (1-10)
    preferredModel?: string;
    verbosity?: 'minimal' | 'normal' | 'detailed';
  };
  learnedBehaviors?: {
    averageRunTime?: number;
    mostUsedAgents?: string[];
    commitFrequency?: number; // commits per step
  };
}

/**
 * Comparison result between current and historical runs
 */
export interface MetricsComparison {
  current: RunMetrics;
  averageHistorical: {
    totalTimeMs: number;
    commitCount: number;
    verificationPassRate: number;
  };
  delta: {
    timePercent: number; // positive = slower, negative = faster
    commitCountDiff: number;
    passRateDiff: number;
  };
}
