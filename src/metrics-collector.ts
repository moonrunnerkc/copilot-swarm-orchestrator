import { RunMetrics, RecoveryEvent } from './metrics-types';

/**
 * Collects metrics during orchestrator execution
 * Tracks time, commits, verifications, and recovery events
 */
export default class MetricsCollector {
  private executionId: string;
  private goal: string;
  private startTime: Date;
  private endTime?: Date;
  private waveCount: number = 0;
  private stepCount: number = 0;
  private commitCount: number = 0;
  private verificationsPassed: number = 0;
  private verificationsFailed: number = 0;
  private recoveryEvents: RecoveryEvent[] = [];
  private agentsUsed: Set<string> = new Set();

  constructor(executionId: string, goal: string) {
    this.executionId = executionId;
    this.goal = goal;
    this.startTime = new Date();
  }

  /**
   * Mark start of new wave
   */
  startWave(waveNumber: number): void {
    this.waveCount = Math.max(this.waveCount, waveNumber);
  }

  /**
   * Track step execution
   */
  trackStep(stepNumber: number, agentName: string): void {
    this.stepCount = Math.max(this.stepCount, stepNumber);
    this.agentsUsed.add(agentName);
  }

  /**
   * Track commit produced
   */
  trackCommit(agentName?: string): void {
    this.commitCount++;
    if (agentName) {
      this.agentsUsed.add(agentName);
    }
  }

  /**
   * Track verification result
   */
  trackVerification(passed: boolean): void {
    if (passed) {
      this.verificationsPassed++;
    } else {
      this.verificationsFailed++;
    }
  }

  /**
   * Track recovery event
   */
  trackRecovery(event: RecoveryEvent): void {
    this.recoveryEvents.push(event);
    this.agentsUsed.add(event.agentName);
  }

  /**
   * Mark execution end and finalize metrics
   */
  finalize(): RunMetrics {
    this.endTime = new Date();
    
    return {
      executionId: this.executionId,
      goal: this.goal,
      startTime: this.startTime.toISOString(),
      endTime: this.endTime.toISOString(),
      totalTimeMs: this.endTime.getTime() - this.startTime.getTime(),
      waveCount: this.waveCount,
      stepCount: this.stepCount,
      commitCount: this.commitCount,
      verificationsPassed: this.verificationsPassed,
      verificationsFailed: this.verificationsFailed,
      recoveryEvents: this.recoveryEvents,
      agentsUsed: Array.from(this.agentsUsed).sort()
    };
  }

  /**
   * Get current metrics snapshot (without finalizing)
   */
  getSnapshot(): Partial<RunMetrics> {
    const now = new Date();
    
    return {
      executionId: this.executionId,
      goal: this.goal,
      startTime: this.startTime.toISOString(),
      totalTimeMs: now.getTime() - this.startTime.getTime(),
      waveCount: this.waveCount,
      stepCount: this.stepCount,
      commitCount: this.commitCount,
      verificationsPassed: this.verificationsPassed,
      verificationsFailed: this.verificationsFailed,
      recoveryEvents: this.recoveryEvents,
      agentsUsed: Array.from(this.agentsUsed).sort()
    };
  }
}
