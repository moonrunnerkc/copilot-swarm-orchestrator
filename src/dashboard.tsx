import React, { useState, useEffect } from 'react';
import { Box, Text, render } from 'ink';
import Spinner from 'ink-spinner';
import { ParallelStepResult } from './swarm-orchestrator';

interface DashboardProps {
  executionId: string;
  goal: string;
  totalSteps: number;
  currentWave: number;
  totalWaves: number;
  results: ParallelStepResult[];
  recentCommits: Array<{ message: string; sha?: string; agent?: string }>;
  prLinks: string[];
  startTime: string;
}

interface StatusIconProps {
  status: ParallelStepResult['status'];
}

const StatusIcon: React.FC<StatusIconProps> = ({ status }) => {
  switch (status) {
    case 'pending':
      return <Text color="gray">⏸</Text>;
    case 'running':
      return <Text color="blue"><Spinner type="dots" /></Text>;
    case 'completed':
      return <Text color="green">✅</Text>;
    case 'failed':
      return <Text color="red">❌</Text>;
    case 'blocked':
      return <Text color="yellow">🚧</Text>;
    default:
      return <Text color="gray">◻</Text>;
  }
};

interface ProgressBarProps {
  completed: number;
  total: number;
  width?: number;
}

const ProgressBar: React.FC<ProgressBarProps> = ({ completed, total, width = 40 }) => {
  const percentage = Math.round((completed / total) * 100);
  const filledWidth = Math.round((completed / total) * width);
  const emptyWidth = width - filledWidth;

  return (
    <Box>
      <Text color="cyan">
        {'█'.repeat(filledWidth)}
        <Text color="gray">{'░'.repeat(emptyWidth)}</Text>
        {' '}
        {percentage}%
      </Text>
    </Box>
  );
};

const SwarmDashboard: React.FC<DashboardProps> = ({
  executionId,
  goal,
  totalSteps,
  currentWave,
  totalWaves,
  results,
  recentCommits,
  prLinks,
  startTime
}) => {
  const [elapsedTime, setElapsedTime] = useState('0s');

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      setElapsedTime(mins > 0 ? `${mins}m ${secs}s` : `${secs}s`);
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  const completedSteps = results.filter(r => r.status === 'completed').length;
  const failedSteps = results.filter(r => r.status === 'failed').length;
  const runningSteps = results.filter(r => r.status === 'running').length;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="magenta">
          🐝 Copilot Swarm Orchestrator - Parallel Execution
        </Text>
      </Box>

      {/* Execution Info */}
      <Box flexDirection="column" marginBottom={1}>
        <Text>
          <Text bold>Goal: </Text>
          <Text color="cyan">{goal}</Text>
        </Text>
        <Text>
          <Text bold>Execution ID: </Text>
          <Text color="gray">{executionId}</Text>
        </Text>
        <Text>
          <Text bold>Elapsed Time: </Text>
          <Text color="yellow">{elapsedTime}</Text>
        </Text>
      </Box>

      {/* Overall Progress */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>Overall Progress:</Text>
        <ProgressBar completed={completedSteps} total={totalSteps} />
        <Text>
          <Text color="green">{completedSteps} completed</Text>
          {' / '}
          <Text color="red">{failedSteps} failed</Text>
          {' / '}
          <Text color="blue">{runningSteps} running</Text>
          {' / '}
          <Text color="gray">{totalSteps} total</Text>
        </Text>
      </Box>

      {/* Wave Progress */}
      <Box marginBottom={1}>
        <Text>
          <Text bold>Wave: </Text>
          <Text color="cyan">
            {currentWave}/{totalWaves}
          </Text>
        </Text>
      </Box>

      {/* Step Status Table */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold underline>
          Agent Status:
        </Text>
        {results.map(result => (
          <Box key={result.stepNumber} marginTop={0}>
            <Box width={3}>
              <StatusIcon status={result.status} />
            </Box>
            <Box width={6}>
              <Text color="gray">Step {result.stepNumber}</Text>
            </Box>
            <Box width={20}>
              <Text color={result.status === 'completed' ? 'green' : 'white'}>
                {result.agentName}
              </Text>
            </Box>
            <Box width={12}>
              <Text color="gray">{result.status}</Text>
            </Box>
            {result.error && (
              <Box>
                <Text color="red">({result.error.substring(0, 30)}...)</Text>
              </Box>
            )}
            {result.verificationResult && !result.verificationResult.passed && (
              <Box>
                <Text color="yellow">(verification failed)</Text>
              </Box>
            )}
          </Box>
        ))}
      </Box>

      {/* Recent Commits */}
      {recentCommits.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold underline>
            Recent Commits (Human-Like History):
          </Text>
          {recentCommits.slice(0, 5).map((commit, idx) => (
            <Box key={idx}>
              <Text color="gray">
                {commit.sha?.substring(0, 7) || 'xxxxxxx'}
              </Text>
              {' '}
              <Text color="white">{commit.message}</Text>
              {commit.agent && (
                <Text color="cyan"> ({commit.agent})</Text>
              )}
            </Box>
          ))}
          {recentCommits.length > 5 && (
            <Text color="gray">... and {recentCommits.length - 5} more commits</Text>
          )}
        </Box>
      )}

      {/* PR Links */}
      {prLinks.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold underline>
            Pull Requests:
          </Text>
          {prLinks.map((link, idx) => (
            <Box key={idx}>
              <Text color="blue">{link}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        {completedSteps === totalSteps && failedSteps === 0 ? (
          <Text bold color="green">
            ✨ Swarm execution complete! All steps verified.
          </Text>
        ) : failedSteps > 0 && completedSteps + failedSteps === totalSteps ? (
          <Text bold color="yellow">
            ⚠️ Swarm execution complete with {failedSteps} failure(s).
          </Text>
        ) : (
          <Text color="gray">Press Ctrl+C to stop execution</Text>
        )}
      </Box>
    </Box>
  );
};

export interface DashboardManager {
  update: (updates: Partial<DashboardProps>) => void;
  stop: () => void;
}

/**
 * Start the live dashboard
 */
export function startDashboard(initialProps: DashboardProps): DashboardManager {
  let currentProps = { ...initialProps };
  
  const { rerender, unmount, waitUntilExit } = render(
    <SwarmDashboard {...currentProps} />
  );

  return {
    update: (updates: Partial<DashboardProps>) => {
      currentProps = { ...currentProps, ...updates };
      rerender(<SwarmDashboard {...currentProps} />);
    },
    stop: () => {
      unmount();
    }
  };
}

export default SwarmDashboard;
