import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import AnalyticsLog from '../src/analytics-log.js';
import { RunMetrics } from '../src/metrics-types.js';

describe('AnalyticsLog', () => {
  let tmpDir: string;
  let analyticsLog: AnalyticsLog;

  beforeEach(() => {
    tmpDir = path.join(__dirname, `test-analytics-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    analyticsLog = new AnalyticsLog(tmpDir);
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should append run to log', () => {
    const metrics: RunMetrics = {
      executionId: 'exec-1',
      goal: 'Test goal',
      startTime: '2026-01-01T00:00:00.000Z',
      endTime: '2026-01-01T00:05:00.000Z',
      totalTimeMs: 300000,
      waveCount: 2,
      stepCount: 4,
      commitCount: 8,
      verificationsPassed: 4,
      verificationsFailed: 0,
      recoveryEvents: [],
      agentsUsed: ['AgentA', 'AgentB']
    };

    analyticsLog.appendRun(metrics);

    const logPath = path.join(tmpDir, 'analytics.json');
    assert.ok(fs.existsSync(logPath));

    const content = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    assert.strictEqual(content.length, 1);
    assert.strictEqual(content[0].schemaVersion, 1);
    assert.strictEqual(content[0].metrics.executionId, 'exec-1');
  });

  it('should append multiple runs', () => {
    const metrics1: RunMetrics = {
      executionId: 'exec-1',
      goal: 'Goal 1',
      startTime: '2026-01-01T00:00:00.000Z',
      endTime: '2026-01-01T00:05:00.000Z',
      totalTimeMs: 300000,
      waveCount: 1,
      stepCount: 2,
      commitCount: 4,
      verificationsPassed: 2,
      verificationsFailed: 0,
      recoveryEvents: [],
      agentsUsed: ['AgentA']
    };

    const metrics2: RunMetrics = {
      executionId: 'exec-2',
      goal: 'Goal 2',
      startTime: '2026-01-02T00:00:00.000Z',
      endTime: '2026-01-02T00:03:00.000Z',
      totalTimeMs: 180000,
      waveCount: 1,
      stepCount: 1,
      commitCount: 2,
      verificationsPassed: 1,
      verificationsFailed: 0,
      recoveryEvents: [],
      agentsUsed: ['AgentB']
    };

    analyticsLog.appendRun(metrics1);
    analyticsLog.appendRun(metrics2);

    const entries = analyticsLog.getAllRuns();
    assert.strictEqual(entries.length, 2);
  });

  it('should get recent runs in reverse order', () => {
    for (let i = 1; i <= 5; i++) {
      const metrics: RunMetrics = {
        executionId: `exec-${i}`,
        goal: `Goal ${i}`,
        startTime: `2026-01-0${i}T00:00:00.000Z`,
        endTime: `2026-01-0${i}T00:05:00.000Z`,
        totalTimeMs: 300000,
        waveCount: 1,
        stepCount: 1,
        commitCount: 1,
        verificationsPassed: 1,
        verificationsFailed: 0,
        recoveryEvents: [],
        agentsUsed: ['Agent']
      };
      analyticsLog.appendRun(metrics);
    }

    const recent = analyticsLog.getRecentRuns(3);
    assert.strictEqual(recent.length, 3);
    assert.strictEqual(recent[0].metrics.executionId, 'exec-5');
    assert.strictEqual(recent[1].metrics.executionId, 'exec-4');
    assert.strictEqual(recent[2].metrics.executionId, 'exec-3');
  });

  it('should return empty array when log does not exist', () => {
    const runs = analyticsLog.getRecentRuns();
    assert.strictEqual(runs.length, 0);
  });

  it('should handle corrupted log file', () => {
    const logPath = path.join(tmpDir, 'analytics.json');
    fs.writeFileSync(logPath, 'invalid json{{{', 'utf8');

    const runs = analyticsLog.getRecentRuns();
    assert.strictEqual(runs.length, 0);
  });

  it('should compare with history', () => {
    // Add historical runs
    for (let i = 1; i <= 3; i++) {
      const metrics: RunMetrics = {
        executionId: `exec-${i}`,
        goal: `Goal ${i}`,
        startTime: `2026-01-0${i}T00:00:00.000Z`,
        endTime: `2026-01-0${i}T00:05:00.000Z`,
        totalTimeMs: 300000, // 5 minutes
        waveCount: 1,
        stepCount: 1,
        commitCount: 10,
        verificationsPassed: 5,
        verificationsFailed: 0,
        recoveryEvents: [],
        agentsUsed: ['Agent']
      };
      analyticsLog.appendRun(metrics);
    }

    // Current run
    const currentMetrics: RunMetrics = {
      executionId: 'exec-current',
      goal: 'Current goal',
      startTime: '2026-01-04T00:00:00.000Z',
      endTime: '2026-01-04T00:03:00.000Z',
      totalTimeMs: 180000, // 3 minutes (40% faster)
      waveCount: 1,
      stepCount: 1,
      commitCount: 12, // +2 commits
      verificationsPassed: 5,
      verificationsFailed: 0,
      recoveryEvents: [],
      agentsUsed: ['Agent']
    };

    const comparison = analyticsLog.compareWithHistory(currentMetrics, 3);
    
    assert.ok(comparison);
    assert.strictEqual(comparison.current.executionId, 'exec-current');
    assert.strictEqual(comparison.averageHistorical.totalTimeMs, 300000);
    assert.strictEqual(comparison.averageHistorical.commitCount, 10);
    assert.ok(comparison.delta.timePercent < 0); // Faster
    assert.ok(comparison.delta.commitCountDiff > 0); // More commits
  });

  it('should return null when no history available', () => {
    const currentMetrics: RunMetrics = {
      executionId: 'exec-first',
      goal: 'First run',
      startTime: '2026-01-01T00:00:00.000Z',
      endTime: '2026-01-01T00:05:00.000Z',
      totalTimeMs: 300000,
      waveCount: 1,
      stepCount: 1,
      commitCount: 5,
      verificationsPassed: 1,
      verificationsFailed: 0,
      recoveryEvents: [],
      agentsUsed: ['Agent']
    };

    const comparison = analyticsLog.compareWithHistory(currentMetrics, 5);
    assert.strictEqual(comparison, null);
  });

  it('should calculate verification pass rate correctly', () => {
    // Add runs with different pass rates
    const metrics1: RunMetrics = {
      executionId: 'exec-1',
      goal: 'Goal 1',
      startTime: '2026-01-01T00:00:00.000Z',
      endTime: '2026-01-01T00:05:00.000Z',
      totalTimeMs: 300000,
      waveCount: 1,
      stepCount: 1,
      commitCount: 5,
      verificationsPassed: 8,
      verificationsFailed: 2, // 80% pass rate
      recoveryEvents: [],
      agentsUsed: ['Agent']
    };

    const metrics2: RunMetrics = {
      executionId: 'exec-2',
      goal: 'Goal 2',
      startTime: '2026-01-02T00:00:00.000Z',
      endTime: '2026-01-02T00:05:00.000Z',
      totalTimeMs: 300000,
      waveCount: 1,
      stepCount: 1,
      commitCount: 5,
      verificationsPassed: 9,
      verificationsFailed: 1, // 90% pass rate
      recoveryEvents: [],
      agentsUsed: ['Agent']
    };

    analyticsLog.appendRun(metrics1);
    analyticsLog.appendRun(metrics2);

    // Current: 100% pass rate
    const current: RunMetrics = {
      executionId: 'exec-current',
      goal: 'Current',
      startTime: '2026-01-03T00:00:00.000Z',
      endTime: '2026-01-03T00:05:00.000Z',
      totalTimeMs: 300000,
      waveCount: 1,
      stepCount: 1,
      commitCount: 5,
      verificationsPassed: 10,
      verificationsFailed: 0,
      recoveryEvents: [],
      agentsUsed: ['Agent']
    };

    const comparison = analyticsLog.compareWithHistory(current, 2);
    
    assert.ok(comparison);
    // Average pass rate: (0.8 + 0.9) / 2 = 0.85 (85%)
    assert.ok(comparison.averageHistorical.verificationPassRate > 0.84);
    assert.ok(comparison.averageHistorical.verificationPassRate < 0.86);
    // Current pass rate: 1.0 (100%)
    // Delta: 1.0 - 0.85 = 0.15 (15% improvement)
    assert.ok(comparison.delta.passRateDiff > 0.14);
    assert.ok(comparison.delta.passRateDiff < 0.16);
  });
});
