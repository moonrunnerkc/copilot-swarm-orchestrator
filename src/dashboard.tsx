import React, { useState, useEffect } from 'react';
import { Box, Text, render, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { ParallelStepResult } from './swarm-orchestrator';
import { SteeringCommand, Conflict, OrchestratorState, parseSteeringCommand, formatSteeringCommand } from './steering-types';
import { MetricsComparison } from './metrics-types';

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
  orchestratorState?: OrchestratorState;
  onCommand?: (command: SteeringCommand) => void;
  readOnly?: boolean;
  metricsComparison?: MetricsComparison | null;
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

interface ProductivitySummaryProps {
  comparison: MetricsComparison;
}

const ProductivitySummary: React.FC<ProductivitySummaryProps> = ({ comparison }) => {
  const { current, averageHistorical, delta } = comparison;
  
  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getChangeIndicator = (value: number, lowerIsBetter: boolean = false): { text: string; color: string } => {
    if (Math.abs(value) < 0.01) return { text: '━', color: 'gray' };
    
    const isGood = lowerIsBetter ? value < 0 : value > 0;
    const symbol = value > 0 ? '▲' : '▼';
    const color = isGood ? 'green' : 'yellow';
    
    return { text: symbol, color };
  };

  const timeIndicator = getChangeIndicator(delta.timePercent, true);
  const passRateIndicator = getChangeIndicator(delta.passRateDiff, false);

  return (
    <Box flexDirection="column" marginBottom={1} borderStyle="double" borderColor="cyan" paddingX={1}>
      <Text bold underline color="cyan">
        📊 Productivity Summary
      </Text>
      
      <Box flexDirection="column" marginTop={1}>
        <Text>
          <Text bold>Time: </Text>
          {formatTime(current.totalTimeMs)}
          {' '}
          <Text color={timeIndicator.color}>
            {timeIndicator.text} {Math.abs(delta.timePercent).toFixed(1)}%
          </Text>
          <Text color="gray"> vs avg {formatTime(averageHistorical.totalTimeMs)}</Text>
        </Text>
        
        <Text>
          <Text bold>Commits: </Text>
          {current.commitCount}
          {' '}
          {delta.commitCountDiff !== 0 && (
            <Text color={delta.commitCountDiff > 0 ? 'green' : 'yellow'}>
              ({delta.commitCountDiff > 0 ? '+' : ''}{delta.commitCountDiff.toFixed(0)})
            </Text>
          )}
          <Text color="gray"> vs avg {averageHistorical.commitCount.toFixed(1)}</Text>
        </Text>
        
        <Text>
          <Text bold>Verification: </Text>
          {current.verificationsPassed}/{current.verificationsPassed + current.verificationsFailed}
          {' '}
          ({(current.verificationsPassed / (current.verificationsPassed + current.verificationsFailed) * 100).toFixed(0)}%)
          {' '}
          <Text color={passRateIndicator.color}>
            {passRateIndicator.text} {Math.abs(delta.passRateDiff * 100).toFixed(1)}%
          </Text>
        </Text>
        
        {current.recoveryEvents.length > 0 && (
          <Text color="yellow">
            <Text bold>Recoveries: </Text>
            {current.recoveryEvents.length}
          </Text>
        )}
      </Box>
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
  startTime,
  orchestratorState,
  onCommand,
  readOnly = false,
  metricsComparison
}) => {
  const [elapsedTime, setElapsedTime] = useState('0s');
  const [input, setInput] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [showInput, setShowInput] = useState(!readOnly);

  // Handle keyboard input
  useInput((inputChar, key) => {
    if (readOnly) return;

    if (key.return) {
      // Submit command
      if (input.trim()) {
        const command = parseSteeringCommand(input);
        if (command && onCommand) {
          onCommand(command);
          setCommandHistory(prev => [...prev, formatSteeringCommand(command)].slice(-5));
        } else {
          setCommandHistory(prev => [...prev, `Invalid: ${input}`].slice(-5));
        }
        setInput('');
      }
    } else if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
    } else if (key.escape) {
      setInput('');
    } else if (inputChar && !key.ctrl && !key.meta) {
      setInput(prev => prev + inputChar);
    }
  });

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

      {/* Pending Conflicts */}
      {orchestratorState && orchestratorState.pendingConflicts.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold underline color="yellow">
            ⚠️ Pending Conflicts ({orchestratorState.pendingConflicts.length}):
          </Text>
          {orchestratorState.pendingConflicts.slice(0, 3).map((conflict, idx) => (
            <Box key={conflict.id} flexDirection="column" marginLeft={2}>
              <Text color="yellow">
                {idx + 1}. Step {conflict.stepNumber} ({conflict.agentName}): {conflict.type}
              </Text>
              <Text color="gray">   {conflict.description}</Text>
            </Box>
          ))}
          {orchestratorState.pendingConflicts.length > 3 && (
            <Text color="gray" marginLeft={2}>
              ... and {orchestratorState.pendingConflicts.length - 3} more conflicts
            </Text>
          )}
          {!readOnly && (
            <Text color="cyan" marginTop={1} marginLeft={2}>
              Type 'approve' or 'reject' to resolve
            </Text>
          )}
        </Box>
      )}

      {/* Steering History */}
      {!readOnly && commandHistory.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold underline>
            Recent Commands:
          </Text>
          {commandHistory.map((cmd, idx) => (
            <Box key={idx}>
              <Text color="gray">{cmd}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Live Input */}
      {showInput && !readOnly && (
        <Box marginTop={1} borderStyle="single" borderColor="cyan" paddingX={1}>
          <Text color="cyan">Command: </Text>
          <Text>{input}</Text>
          <Text color="gray" dimColor>▊</Text>
        </Box>
      )}

      {/* Productivity Summary - shown at end of run */}
      {metricsComparison && completedSteps === totalSteps && (
        <ProductivitySummary comparison={metricsComparison} />
      )}

      {/* Footer */}
      <Box marginTop={1}>
        {readOnly ? (
          <Text bold color="blue">
            👁️  Read-only mode - Observing execution
          </Text>
        ) : orchestratorState?.status === 'paused' ? (
          <Text bold color="yellow">
            ⏸️  Execution paused - Type 'resume' to continue
          </Text>
        ) : completedSteps === totalSteps && failedSteps === 0 ? (
          <Text bold color="green">
            ✨ Swarm execution complete! All steps verified.
          </Text>
        ) : failedSteps > 0 && completedSteps + failedSteps === totalSteps ? (
          <Text bold color="yellow">
            ⚠️ Swarm execution complete with {failedSteps} failure(s).
          </Text>
        ) : (
          <Box flexDirection="column">
            {!readOnly && (
              <Text color="gray">Commands: pause, resume, approve, reject, help | Ctrl+C to exit</Text>
            )}
            {readOnly && (
              <Text color="gray">Press Ctrl+C to exit</Text>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
};

export interface DashboardManager {
  update: (updates: Partial<DashboardProps>) => void;
  stop: () => void;
  setCommandHandler: (handler: (command: SteeringCommand) => void) => void;
}

/**
 * Start the live dashboard
 */
export function startDashboard(
  initialProps: DashboardProps,
  commandHandler?: (command: SteeringCommand) => void
): DashboardManager {
  let currentProps = { ...initialProps };
  let currentCommandHandler = commandHandler;
  
  const { rerender, unmount, waitUntilExit } = render(
    <SwarmDashboard {...currentProps} onCommand={currentCommandHandler} />
  );

  return {
    update: (updates: Partial<DashboardProps>) => {
      currentProps = { ...currentProps, ...updates };
      rerender(<SwarmDashboard {...currentProps} onCommand={currentCommandHandler} />);
    },
    stop: () => {
      unmount();
    },
    setCommandHandler: (handler: (command: SteeringCommand) => void) => {
      currentCommandHandler = handler;
      rerender(<SwarmDashboard {...currentProps} onCommand={currentCommandHandler} />);
    }
  };
}

export default SwarmDashboard;
