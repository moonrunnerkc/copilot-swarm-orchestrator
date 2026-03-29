import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { resolveAdapter, defaultModelForAdapter } from './adapters';
import AnalyticsLog from './analytics-log';
import CommitPatternDetector, { CommitMessage } from './commit-pattern-detector';
import { AgentProfile, ConfigLoader } from './config-loader';
import ContextBroker, { ContextEntry } from './context-broker';
import DeploymentManager, { DeploymentMetadata } from './deployment-manager';
import { ExecutionQueue, QueueStats } from './execution-queue';
import ExternalToolManager from './external-tool-manager';
import { KnowledgeBaseManager } from './knowledge-base';
import { MetaAnalyzer, MetaReviewResult } from './meta-analyzer';
import MetricsCollector from './metrics-collector';
import { ExecutionPlan, PlanGenerator, PlanStep, ReplanPayload } from './plan-generator';
import PRAutomation from './pr-automation';
import { load_quality_gates_config, run_quality_gates } from './quality-gates';
import RepairAgent, { RepairContext } from './repair-agent';
import SessionExecutor, { SessionOptions, SessionResult } from './session-executor';
import ShareParser from './share-parser';
import { Spinner } from './spinner';
import { CriticResult, SessionState } from './types';
import VerifierEngine, { VerificationResult } from './verifier-engine';
import { AdaptiveConcurrencyManager, WaveResizer } from './wave-resizer';
import { CostEstimator, CostEstimate } from './cost-estimator';
import { HookGenerator, GeneratedHooks } from './hook-generator';
import FleetExecutor from './fleet-executor';
import { CostAttribution, CostHistoryEvidence, StepCostRecord } from './metrics-types';
import PRManager from './pr-manager';

export interface ParallelStepResult {
  stepNumber: number;
  agentName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'blocked';
  branchName?: string;
  sessionResult?: SessionResult;
  verificationResult?: VerificationResult;
  error?: string;
  startTime?: string;
  endTime?: string;
  retryCount?: number;
}

// tracks replan execution state
export interface ReplanState {
  triggeredAt: string;
  payload: ReplanPayload;
  retryBranches: Map<number, string[]>;
}

// Single source of truth for the options object threaded through executeSwarm,
// executeReplan, executeStepInSwarm, and related methods.
export interface SwarmExecutionOptions {
  model?: string;
  maxConcurrency?: number;
  enableExternal?: boolean;
  confirmDeploy?: boolean;
  dryRun?: boolean;
  autoPR?: boolean;
  qualityGates?: boolean;
  qualityGatesConfigPath?: string;
  qualityGatesOutDir?: string;
  strictIsolation?: boolean;
  governance?: boolean;
  lean?: boolean;
  useInnerFleet?: boolean;
  replay?: boolean;
  prMode?: 'auto' | 'review';
  hooksEnabled?: boolean;
  fleetWaveMode?: boolean;
  cliAgent?: string;
  onProgress?: (context: SwarmExecutionContext, event: string) => void;
}

export interface SwarmExecutionContext {
  plan: ExecutionPlan;
  runDir: string;
  executionId: string;
  startTime: string;
  results: ParallelStepResult[];
  contextBroker: ContextBroker;
  mainBranch: string;
  deployments?: DeploymentMetadata[];
  metricsCollector?: MetricsCollector;
  executionQueue?: ExecutionQueue;
  queueStats?: QueueStats;
  waveResizer?: WaveResizer;
  adaptiveConcurrency?: AdaptiveConcurrencyManager;
  knowledgeBase?: KnowledgeBaseManager;
  metaAnalyzer?: MetaAnalyzer;
  waveAnalyses?: MetaReviewResult[];
  replanState?: ReplanState;
  agents?: Map<string, AgentProfile>;
  qualityGatesTriggered?: {
    duplicateRefactorAdded: boolean;
    readmeTruthAdded: boolean;
    scaffoldFixAdded: boolean;
    configFixAdded: boolean;
    accessibilityFixAdded: boolean;
    testCoverageFixAdded: boolean;
  };
  criticResults?: CriticResult[];
  leanSavedRequests?: number;
  totalWaves?: number;
  costEstimator?: CostEstimator;
  costEstimate?: CostEstimate;
  stepCostRecords?: StepCostRecord[];
  prManager?: PRManager;
  prUrls?: Map<number, string>;
  unmergedBranches?: Array<{
    stepNumber: number;
    branchName: string;
    agentName: string;
    reason: string;
  }>;
}

/**
 * Swarm Orchestrator - coordinates parallel execution of independent Copilot CLI sessions
 * Manages concurrent sessions, per-agent branches, and automatic merging
 */
export class SwarmOrchestrator {
  private sessionExecutor: SessionExecutor;
  private shareParser: ShareParser;
  private verifier: VerifierEngine;
  private workingDir: string;
  private pauseRequested: boolean = false;
  private resumeRequested: boolean = false;

  constructor(workingDir?: string) {
    this.workingDir = workingDir || process.cwd();
    this.sessionExecutor = new SessionExecutor(this.workingDir);
    this.shareParser = new ShareParser();
    this.verifier = new VerifierEngine(this.workingDir);
  }

  /**
   * Look up an agent by name, falling back to normalized (snake_case) matching.
   * Handles plans using snake_case (frontend_expert) against YAML agents (FrontendExpert).
   */
  private resolveAgent(agents: Map<string, AgentProfile>, name: string): AgentProfile | undefined {
    const exact = agents.get(name);
    if (exact) return exact;
    const normalized = ConfigLoader.normalizeAgentName(name);
    for (const [key, agent] of agents) {
      if (ConfigLoader.normalizeAgentName(key) === normalized) return agent;
    }
    return undefined;
  }

  /**
   * Request pause of current execution
   */
  requestPause(): void {
    this.pauseRequested = true;
  }

  /**
   * Request resume of paused execution
   */
  requestResume(): void {
    this.resumeRequested = true;
    this.pauseRequested = false;
  }

  /**
   * Check if pause is requested
   */
  isPauseRequested(): boolean {
    return this.pauseRequested;
  }

  /**
   * Initialize swarm execution context
   */
  initializeSwarmExecution(
    plan: ExecutionPlan,
    runDir: string,
    maxConcurrency?: number
  ): SwarmExecutionContext {
    const executionId = this.generateExecutionId();
    const contextBroker = new ContextBroker(runDir);
    const metricsCollector = new MetricsCollector(executionId, plan.goal);

    // ensure repo has at least one commit (required for branch creation)
    this.ensureInitialCommit();

    // get current git branch
    const mainBranch = this.getCurrentBranch();

    // initialize scalability components
    const concurrencyLimit = maxConcurrency || 3;
    const executionQueue = new ExecutionQueue(concurrencyLimit);
    const waveResizer = new WaveResizer();
    const adaptiveConcurrency = new AdaptiveConcurrencyManager(concurrencyLimit, 10);

    // initialize adaptive intelligence components
    // save knowledge base in run dir, not target repo (avoids git checkout conflicts)
    const knowledgeBase = new KnowledgeBaseManager(runDir);
    const metaAnalyzer = new MetaAnalyzer();

    const context: SwarmExecutionContext = {
      plan,
      runDir,
      executionId,
      startTime: new Date().toISOString(),
      results: plan.steps.map(step => ({
        stepNumber: step.stepNumber,
        agentName: step.agentName,
        status: 'pending'
      })),
      contextBroker,
      mainBranch,
      metricsCollector,
      executionQueue,
      queueStats: executionQueue.getStats(),
      waveResizer,
      adaptiveConcurrency,
      knowledgeBase,
      metaAnalyzer,
      waveAnalyses: []
    };

    return context;
  }

  /**
   * Execute plan with parallel swarm - independent steps run concurrently
   */
  async executeSwarm(
    plan: ExecutionPlan,
    agents: Map<string, AgentProfile>,
    runDir: string,
    options?: SwarmExecutionOptions
  ): Promise<SwarmExecutionContext> {
    const context = this.initializeSwarmExecution(plan, runDir, options?.maxConcurrency);
    context.agents = agents;
    context.qualityGatesTriggered = {
      duplicateRefactorAdded: false,
      readmeTruthAdded: false,
      scaffoldFixAdded: false,
      configFixAdded: false,
      accessibilityFixAdded: false,
      testCoverageFixAdded: false
    };

    // Initialize PR manager when --pr mode is set
    if (options?.prMode) {
      const prManager = new PRManager(this.workingDir);
      if (!prManager.isGhAvailable()) {
        console.error('  ❌ --pr requires gh CLI installed and authenticated. Run "gh auth login" first.');
        process.exit(1);
      }
      context.prManager = prManager;
      context.prUrls = new Map();
    }

    console.log('\n🚀 Starting Parallel Swarm Execution');
    console.log(`${'─'.repeat(50)}`);
    console.log(`  Execution ID:    ${context.executionId}`);
    console.log(`  Main branch:     ${context.mainBranch}`);
    console.log(`  Steps:           ${plan.steps.length}`);
    console.log(`  Max concurrency: ${options?.maxConcurrency || 'unlimited'}`);
    if (options?.confirmDeploy) {
      console.log('  ⚠️  Deployment enabled (--confirm-deploy)');
    }
    console.log(`${'─'.repeat(50)}`);

    // Group steps by repo for multi-repo orchestration
    const repoGroups = new Map<string, PlanStep[]>();
    for (const step of plan.steps) {
      const repo = step.repo ?? process.cwd();
      if (!repoGroups.has(repo)) repoGroups.set(repo, []);
      repoGroups.get(repo)!.push(step);
    }

    if (repoGroups.size > 1) {
      console.log(`\n📂 Multi-repo plan detected: ${repoGroups.size} repo(s)`);
      for (const [repo, steps] of repoGroups) {
        console.log(`  - ${path.basename(repo)}: ${steps.length} step(s)`);
      }
    }

    // build dependency graph
    const dependencyGraph = this.buildDependencyGraph(plan);

    // identify waves of parallel execution
    const executionWaves = this.identifyExecutionWaves(dependencyGraph);

    context.totalWaves = executionWaves.length;
    console.log(`Execution will proceed in ${executionWaves.length} wave(s)\n`);

    // Pre-execution cost estimation
    const costEstimator = new CostEstimator(context.knowledgeBase);
    const modelName = options?.model || defaultModelForAdapter(options?.cliAgent);
    context.costEstimator = costEstimator;
    context.costEstimate = costEstimator.estimate(plan, {
      modelName,
      fleetMode: !!options?.useInnerFleet,
    });
    context.stepCostRecords = [];

    // Write common prompt instructions to repo root so Copilot CLI picks them up natively.
    // Per-step prompts only carry task-specific content; shared boilerplate lives here.
    this.writeSharedInstructions();

    // Cache quality gates config once for the entire run
    const gatesConfig = load_quality_gates_config(this.workingDir, options?.qualityGatesConfigPath);

    // Greedy as-soon-as-ready scheduler: launch steps the moment their deps are satisfied,
    // not when an entire "wave" finishes. Eliminates idle time from unbalanced step durations.
    const pending = new Set(plan.steps.map(s => s.stepNumber));
    const completed = new Set<number>();
    const failed = new Set<number>();
    const inFlight = new Set<number>();
    let waveCounter = 0;

    // Lean mode: attach knowledge base references before scheduling
    if (options?.lean && context.knowledgeBase) {
      for (const step of plan.steps) {
        const matches = context.knowledgeBase.findSimilarTasks(step.task);
        if (matches.length > 0) {
          const ref = matches[0];
          const commitRef = ref.evidence[0] || 'unknown';
          step.task += `\nReference: similar task completed in session ${ref.id}, commit ${commitRef}.`;
          context.leanSavedRequests = (context.leanSavedRequests || 0) + 1;
          console.log(`  [lean] Step ${step.stepNumber}: found similar pattern "${ref.insight.slice(0, 50)}"`);
        }
      }
    }

    // Track which steps need merging once complete
    const pendingMerge: ParallelStepResult[] = [];

    // Resolve a single step: merge its branch to main and launch newly-unblocked steps
    const onStepComplete = async (stepNumber: number) => {
      pending.delete(stepNumber);
      inFlight.delete(stepNumber);
      completed.add(stepNumber);
      context.adaptiveConcurrency?.recordSuccess();

      const result = context.results.find(r => r.stepNumber === stepNumber);
      if (result && result.branchName && result.status === 'completed') {
        pendingMerge.push(result);
      }

      // Merge completed branches in batches (octopus merge when possible)
      if (inFlight.size === 0 || pendingMerge.length >= 3) {
        if (pendingMerge.length > 0) {
          context.contextBroker.forceReleaseStaleLocks();
          await this.mergeWaveBranches(pendingMerge, context, options);
          pendingMerge.length = 0;
        }
      }

      // Fire meta-analysis asynchronously (off the critical path)
      if (context.metaAnalyzer && context.knowledgeBase) {
        setImmediate(() => {
          this.runAsyncMetaAnalysis(context, plan, runDir, Array.from(completed));
        });
      }

      // Notify progress
      options?.onProgress?.(context, `step-done:${stepNumber}`);
    };

    const onStepFailed = (stepNumber: number, errorMsg: string) => {
      pending.delete(stepNumber);
      inFlight.delete(stepNumber);
      failed.add(stepNumber);

      const isRateLimit = /rate limit|quota|429|throttle/i.test(errorMsg);
      context.adaptiveConcurrency?.recordFailure(isRateLimit ? 'rate_limit' : 'error');

      const newLimit = context.adaptiveConcurrency?.getCurrentLimit() || 3;
      context.executionQueue?.setMaxConcurrency(newLimit);

      options?.onProgress?.(context, `step-failed:${stepNumber}`);
    };

    // Returns step numbers whose dependencies are all satisfied
    const getReadySteps = (): number[] => {
      const ready: number[] = [];
      for (const stepNum of pending) {
        if (inFlight.has(stepNum)) continue;
        const step = plan.steps.find(s => s.stepNumber === stepNum);
        if (!step) continue;
        if (step.dependencies.every(dep => completed.has(dep))) {
          ready.push(stepNum);
        }
      }
      return ready.sort((a, b) => a - b);
    };

    // Main scheduling loop: keep launching ready steps until everything is done or blocked
    while (pending.size > 0) {
      // Check for pause
      if (this.pauseRequested) {
        console.log('\n⏸️  Pause requested. Waiting for resume...');
        await this.waitForResume();
        console.log('\n▶️  Resuming execution...');
      }

      const ready = getReadySteps();

      if (ready.length === 0 && inFlight.size === 0) {
        // Nothing ready and nothing in flight: remaining steps are blocked by failures
        const blocked = Array.from(pending);
        console.error(`\n❌ ${blocked.length} step(s) blocked by failed dependencies: ${blocked.join(', ')}`);
        break;
      }

      if (ready.length > 0) {
        waveCounter++;
        context.metricsCollector?.startWave(waveCounter);
        options?.onProgress?.(context, `wave-start:${waveCounter}`);

        console.log(`\n📊 Batch ${waveCounter}: launching ${ready.length} step(s) [${ready.join(', ')}]`);

        // Fleet wave mode: attempt single /fleet dispatch for the batch, fall back on failure
        let fleetHandled = false;
        if (options?.fleetWaveMode && ready.length > 1) {
          fleetHandled = await this.attemptFleetDispatch(ready, plan, agents, context, options);
          if (fleetHandled) {
            // All steps handled by fleet; mark them complete
            for (const stepNum of ready) {
              inFlight.add(stepNum);
              await onStepComplete(stepNum);
            }
          }
        }

        if (!fleetHandled) {
        // Launch all ready steps concurrently
        const batchPromises = ready.map(stepNumber => {
          const step = plan.steps.find(s => s.stepNumber === stepNumber)!;
          const agent = this.resolveAgent(agents, step.agentName);

          if (!agent) {
            throw new Error(`Agent ${step.agentName} not found for step ${stepNumber}`);
          }

          inFlight.add(stepNumber);

          return context.executionQueue!.enqueue(
            `step-${stepNumber}`,
            () => this.executeStepInSwarm(step, agent, context, options),
            {
              priority: 100 - stepNumber,
              maxRetries: 3,
              metadata: {
                stepNumber: step.stepNumber,
                agentName: agent.name,
                wave: waveCounter
              }
            }
          ).then(
            () => onStepComplete(stepNumber),
            (err: Error) => onStepFailed(stepNumber, err.message)
          );
        });

        // Wait for at least one step to finish before re-evaluating the ready set
        await Promise.race(batchPromises);

        // Settle any remaining promises that are already resolved
        await Promise.allSettled(batchPromises);
        } // end if (!fleetHandled)

        // Update queue stats
        context.queueStats = context.executionQueue!.getStats();

        // Governance: critic review on completed batch
        const completedInBatch = context.results.filter(
          r => ready.includes(r.stepNumber) && r.status === 'completed'
        );
        if (options?.governance && completedInBatch.length > 0) {
          if (!context.criticResults) context.criticResults = [];
          const criticResult = this.runCriticReview(completedInBatch, context, plan);
          context.criticResults.push(criticResult);
          console.log(`  🎭 Critic score: ${criticResult.score}/100 (${criticResult.recommendation})`);
          if (criticResult.flags.length > 0) {
            console.log(`  ⚠️  Critic flags: ${criticResult.flags.join(', ')}`);
            console.log('  ⏸️  Governance pause: awaiting human approval...');
            this.pauseRequested = true;
            await this.waitForResume();
          }
        }

        options?.onProgress?.(context, `wave-done:${waveCounter}`);
      } else {
        // Steps in flight but none ready yet: wait for next completion
        await new Promise<void>(resolve => {
          const handler = () => {
            context.contextBroker.removeListener('step-completed', handler);
            resolve();
          };
          context.contextBroker.once('step-completed', handler);
          // Safety timeout in case event is missed
          setTimeout(() => {
            context.contextBroker.removeListener('step-completed', handler);
            resolve();
          }, 5000);
        });
      }
    }

    context.totalWaves = waveCounter;

    // Flush any remaining pending merges
    if (pendingMerge.length > 0) {
      context.contextBroker.forceReleaseStaleLocks();
      await this.mergeWaveBranches(pendingMerge, context, options);
      pendingMerge.length = 0;
    }

    // Execution summary
    const completedResults = context.results.filter(r => r.status === 'completed');
    const failedResults = context.results.filter(r => r.status === 'failed');
    console.log(`\n📊 Execution Summary:`);
    console.log(`  ${'─'.repeat(40)}`);
    completedResults.forEach(r => {
      const durationMs = r.startTime && r.endTime
        ? new Date(r.endTime).getTime() - new Date(r.startTime).getTime()
        : 0;
      console.log(`  ✅ ${r.agentName}:${r.stepNumber} (${Math.round(durationMs / 1000)}s)`);
    });
    failedResults.forEach(r => {
      console.log(`  ❌ ${r.agentName}:${r.stepNumber} - ${r.error || 'unknown error'}`);
    });
    console.log(`  ${'─'.repeat(40)}`);
    console.log(`  ${completedResults.length} passed, ${failedResults.length} failed, ${waveCounter} batch(es)`);

    if (context.unmergedBranches && context.unmergedBranches.length > 0) {
      console.log(`\n⚠️  ${context.unmergedBranches.length} branch(es) could not merge (work preserved on branch):`);
      for (const um of context.unmergedBranches) {
        console.log(`  • Step ${um.stepNumber} (${um.agentName}): ${um.branchName}`);
      }
    }

    // final quality gates run on the merged state (hard gate)
    // this happens before auto-PR so we don't create a PR for a failing run
    const gatesEnabled = options?.qualityGates !== false;
    if (gatesEnabled) {
      console.log('\n🧪 Running final quality gates...');
      const gatesOut = options?.qualityGatesOutDir
        ? path.isAbsolute(options.qualityGatesOutDir)
          ? options.qualityGatesOutDir
          : path.join(runDir, options.qualityGatesOutDir)
        : path.join(runDir, 'quality-gates');

      // Reuse cached gatesConfig from top of executeSwarm
      let gatesResult = await run_quality_gates(this.workingDir, gatesConfig, gatesOut);

      if (!gatesResult.passed && gatesConfig.failOnIssues) {
        const failedIds = new Set(gatesResult.results.filter(r => r.status === 'fail').map(r => r.id));
        const agentMap = context.agents || agents;

        const canAutoFix = !!context.qualityGatesTriggered && (
          (failedIds.has('duplicate-blocks') && gatesConfig.autoAddRefactorStepOnDuplicateBlocks && !context.qualityGatesTriggered.duplicateRefactorAdded) ||
          (failedIds.has('readme-claims') && gatesConfig.autoAddReadmeTruthStepOnReadmeClaims && !context.qualityGatesTriggered.readmeTruthAdded) ||
          (failedIds.has('scaffold-defaults') && gatesConfig.autoAddScaffoldFixStepOnScaffoldDefaults && !context.qualityGatesTriggered.scaffoldFixAdded) ||
          (failedIds.has('hardcoded-config') && gatesConfig.autoAddConfigFixStepOnHardcodedConfig && !context.qualityGatesTriggered.configFixAdded) ||
          (failedIds.has('accessibility') && gatesConfig.autoAddAccessibilityFixStepOnAccessibility && !context.qualityGatesTriggered.accessibilityFixAdded) ||
          (failedIds.has('test-coverage') && gatesConfig.autoAddTestCoverageStepOnTestCoverage && !context.qualityGatesTriggered.testCoverageFixAdded)
        );

        if (canAutoFix) {
          const maxStep = Math.max(...context.plan.steps.map(s => s.stepNumber));
          const lastAgent = context.plan.steps[context.plan.steps.length - 1]?.agentName || 'integrator_finalizer';

          const addSteps: Array<{ agent: string; task: string; afterStep?: number }> = [];

          const dupStep = this.buildRemediationStep(
            gatesResult.results.find(r => r.id === 'duplicate-blocks'),
            gatesConfig.autoAddRefactorStepOnDuplicateBlocks,
            'duplicateRefactorAdded', context, agentMap,
            'Quality gates flagged repeated code blocks. Extract shared utilities/hooks/middleware and refactor duplicates away. Use the gate report as the source of truth. Re-run tests and ensure quality gates pass.',
            '⚠️  Final quality gates: duplicate blocks detected; scheduling refactor',
            maxStep, lastAgent,
          );
          if (dupStep) addSteps.push(dupStep);

          const readmeStep = this.buildRemediationStep(
            gatesResult.results.find(r => r.id === 'readme-claims'),
            gatesConfig.autoAddReadmeTruthStepOnReadmeClaims,
            'readmeTruthAdded', context, agentMap,
            'Quality gates flagged README claims that are not backed by code. Either implement the missing features or downgrade/remove the claims. Use the gate report as the source of truth. Re-run tests and ensure quality gates pass.',
            '⚠️  Final quality gates: README claims mismatch; scheduling truth step',
            maxStep, lastAgent,
          );
          if (readmeStep) addSteps.push(readmeStep);

          const scaffoldStep = this.buildRemediationStep(
            gatesResult.results.find(r => r.id === 'scaffold-defaults'),
            gatesConfig.autoAddScaffoldFixStepOnScaffoldDefaults,
            'scaffoldFixAdded', context, agentMap,
            'Quality gates flagged scaffold defaults. Remove placeholder assets and generic scaffold README sections, and ensure HTML title/app metadata are meaningful. Use the gate report as the source of truth. Re-run tests and ensure quality gates pass.',
            '⚠️  Final quality gates: scaffold defaults detected; scheduling cleanup',
            maxStep, lastAgent,
          );
          if (scaffoldStep) addSteps.push(scaffoldStep);

          const configStep = this.buildRemediationStep(
            gatesResult.results.find(r => r.id === 'hardcoded-config'),
            gatesConfig.autoAddConfigFixStepOnHardcodedConfig,
            'configFixAdded', context, agentMap,
            'Quality gates flagged hardcoded config values. Move API base URLs, ports, retry counts, timeouts, and environment-specific values into env/typed config. For Vite proxy targets, prefer import.meta.env with a safe default. Use the gate report as the source of truth. Re-run tests and ensure quality gates pass.',
            '⚠️  Final quality gates: hardcoded config detected; scheduling cleanup',
            maxStep, lastAgent,
          );
          if (configStep) addSteps.push(configStep);

          const a11yStep = this.buildRemediationStep(
            gatesResult.results.find(r => r.id === 'accessibility'),
            gatesConfig.autoAddAccessibilityFixStepOnAccessibility,
            'accessibilityFixAdded', context, agentMap,
            'Quality gates flagged accessibility issues. Add missing accessibility attributes: skip-to-content link, heading hierarchy, aria-labels on nav/icon-only buttons, focus-visible styles. Remove bare outline:none without a replacement. Use the gate report as the source of truth. Re-run tests and ensure quality gates pass.',
            '⚠️  Final quality gates: accessibility issues detected; scheduling fix',
            maxStep, lastAgent,
          );
          if (a11yStep) addSteps.push(a11yStep);

          const testCovStep = this.buildRemediationStep(
            gatesResult.results.find(r => r.id === 'test-coverage'),
            gatesConfig.autoAddTestCoverageStepOnTestCoverage,
            'testCoverageFixAdded', context, agentMap,
            'Quality gates flagged missing test coverage. Add tests for uncovered source files, ensure each test file contains real assertions, and add component-level tests for React projects. Use the gate report as the source of truth. Re-run tests and ensure quality gates pass.',
            '⚠️  Final quality gates: test coverage gaps detected; scheduling fix',
            maxStep, lastAgent,
          );
          if (testCovStep) addSteps.push(testCovStep);

          // Consolidate multiple gate failures into a single remediation step
          // to avoid burning one premium request per gate failure.
          if (addSteps.length > 1) {
            const combinedTask = addSteps.map(s => s.task).join('\n\nALSO: ');
            const singleStep: { agent: string; task: string; afterStep?: number } = {
              agent: addSteps[0].agent,
              task: combinedTask,
            };
            if (addSteps[0].afterStep !== undefined) {
              singleStep.afterStep = addSteps[0].afterStep;
            }
            addSteps.length = 0;
            addSteps.push(singleStep);
            console.warn(`⚠️  Final quality gates failed (${failedIds.size} gates); scheduling single consolidated remediation step...`);
          } else if (addSteps.length === 1) {
            console.warn('⚠️  Final quality gates failed; attempting one remediation pass...');
          }

          if (addSteps.length > 0) {
            await this.executeReplan(context, { retrySteps: [], addSteps }, agentMap, options);
            gatesResult = await run_quality_gates(this.workingDir, gatesConfig, gatesOut);
          }
        }

        if (!gatesResult.passed) {
          console.error('❌ Quality gates failed. See report in:', gatesOut);
          throw new Error('Quality gates failed');
        }
      }
    }

    // merge all agent branches back to main
    console.log('\n🔀 Merging agent branches to main...');
    // Clean up any stale locks before final merge (e.g. from cancelled runs)
    context.contextBroker.forceReleaseStaleLocks();
    await this.mergeAllBranches(context);

    // Finalize metrics and save to analytics log
    if (context.metricsCollector) {
      const metrics = context.metricsCollector.finalize();

      // Save metrics to run directory
      const metricsPath = path.join(runDir, 'metrics.json');
      fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2), 'utf8');

      // Append to analytics log
      const analyticsLog = new AnalyticsLog();
      analyticsLog.appendRun(metrics);

      console.log(`\n📊 Metrics saved: ${metricsPath}`);

      // Save cost attribution alongside metrics
      if (context.costEstimate && context.stepCostRecords) {
        const modelName = options?.model || defaultModelForAdapter(options?.cliAgent);
        const totalEstimated = context.costEstimate.totalPremiumRequests;
        const totalActual = context.stepCostRecords.reduce((s, r) => s + r.actualPremiumRequests, 0);
        const attribution: CostAttribution = {
          totalEstimatedPremiumRequests: totalEstimated,
          totalActualPremiumRequests: totalActual,
          estimateAccuracy: context.costEstimator?.getAccuracy() ?? 1.0,
          modelUsed: modelName,
          modelMultiplier: context.costEstimate.modelMultiplier,
          overageTriggered: context.costEstimate.overageCostUSD > 0,
          perStep: context.stepCostRecords,
        };
        const costPath = path.join(runDir, 'cost-attribution.json');
        fs.writeFileSync(costPath, JSON.stringify(attribution, null, 2), 'utf8');
      }

      // Persist session state for audit/resume support
      // Use the runDir basename as session ID so it matches the directory
      // the CLI created (context.executionId differs by a few ms)
      const runDirId = path.basename(runDir);
      const completedSteps = context.results.filter(r => r.status === 'completed');
      const sessionState: SessionState = {
        sessionId: runDirId,
        graph: {
          goal: plan.goal,
          steps: plan.steps.map(s => ({ stepNumber: s.stepNumber, task: s.task, agent: s.agentName }))
        },
        branchMap: Object.fromEntries(
          context.results
            .filter(r => r.branchName)
            .map(r => [String(r.stepNumber), r.branchName!])
        ),
        transcripts: Object.fromEntries(
          context.results
            .filter(r => r.sessionResult?.transcriptPath)
            .map(r => [String(r.stepNumber), r.sessionResult!.transcriptPath!])
        ),
        metrics: metrics as unknown as Record<string, unknown>,
        gateResults: [],
        status: completedSteps.length === plan.steps.length ? 'completed' : 'failed',
        lastCompletedStep: Math.max(0, ...completedSteps.map(r => r.stepNumber))
      };
      // Write directly to runDir (saveSession uses cwd which differs for demos)
      fs.writeFileSync(
        path.join(runDir, 'session-state.json'),
        JSON.stringify(sessionState, null, 2),
        'utf8'
      );
      // Also persist via collector so audit/metrics CLI can find it from project root
      context.metricsCollector.saveSession(runDirId, sessionState);
    }

    // Record execution in knowledge base
    if (context.knowledgeBase) {
      const totalPatternsDetected = context.waveAnalyses?.reduce(
        (sum, analysis) => sum + analysis.detectedPatterns.length, 0
      ) || 0;
      context.knowledgeBase.recordRun(totalPatternsDetected);

      // Record cost history for future estimation calibration
      if (context.costEstimate && context.stepCostRecords) {
        const modelName = options?.model || defaultModelForAdapter(options?.cliAgent);
        const totalRetries = context.stepCostRecords.reduce((s, r) => s + r.retryCount, 0);
        const totalActual = context.stepCostRecords.reduce((s, r) => s + r.actualPremiumRequests, 0);
        const totalEstimated = context.costEstimate.totalPremiumRequests;
        const evidence: CostHistoryEvidence = {
          runId: context.executionId,
          estimated: totalEstimated,
          actual: totalActual,
          retries: totalRetries,
          steps: plan.steps.length,
          model: modelName,
        };
        context.knowledgeBase.addOrUpdatePattern({
          category: 'cost_history',
          insight: `${plan.steps.length} steps, model ${modelName}, ${totalActual} premium requests, ${totalRetries} retries`,
          confidence: 'high',
          evidence: [JSON.stringify(evidence)],
          impact: 'medium',
        });
      }
    }

    // Auto-create PR if requested
    if (options?.autoPR) {
      console.log('\n📝 Creating PR...');
      try {
        const toolManager = new ExternalToolManager({
          enableExternal: options.enableExternal || false,
          dryRun: options.dryRun || false,
          logFile: path.join(runDir, 'external-commands.log')
        });

        const deploymentManager = new DeploymentManager(toolManager, this.workingDir);
        const prAutomation = new PRAutomation(toolManager, this.workingDir);

        const deployments = deploymentManager.loadDeploymentMetadata(runDir);
        const summary = prAutomation.generatePRSummary(context, deployments);
        const prResult = await prAutomation.createPR(summary);

        if (prResult.success) {
          console.log(`✅ PR created: ${prResult.url}`);
        } else {
          console.warn(`⚠️  PR creation failed: ${prResult.error}`);
        }
      } catch (error) {
        console.warn(`⚠️  PR automation error: ${error instanceof Error ? error.message : error}`);
      }
    }

    return context;
  }

  /**
   * Shared auto-remediation logic for quality gate failures.
   * Returns a remediation step descriptor if the gate failed and auto-fix
   * is both enabled and not already triggered; otherwise returns null.
   */
  private buildRemediationStep(
    gateResult: { status: string } | undefined,
    configEnabled: boolean,
    triggeredFlag: keyof NonNullable<SwarmExecutionContext['qualityGatesTriggered']>,
    context: SwarmExecutionContext,
    agents: Map<string, AgentProfile>,
    taskDescription: string,
    warningMessage: string,
    afterStep: number,
    fallbackAgent: string,
  ): { agent: string; task: string; afterStep: number } | null {
    if (!gateResult || gateResult.status !== 'fail') return null;
    if (!configEnabled) return null;
    if (!context.qualityGatesTriggered || context.qualityGatesTriggered[triggeredFlag]) return null;

    const preferredAgent = this.resolveAgent(agents, 'integrator_finalizer')
      ? 'integrator_finalizer'
      : fallbackAgent;

    console.warn(warningMessage);
    context.qualityGatesTriggered[triggeredFlag] = true;

    return { agent: preferredAgent, task: taskDescription, afterStep };
  }

  /**
   * execute replan: retry failed steps on new branches with suffix
   * preserves completed work, only re-runs what failed
   */
  private async executeReplan(
    context: SwarmExecutionContext,
    replanPayload: ReplanPayload,
    agents: Map<string, AgentProfile>,
    options?: SwarmExecutionOptions
  ): Promise<void> {
    console.log('\n🔄 Executing replan...');

    // initialize replan state
    context.replanState = {
      triggeredAt: new Date().toISOString(),
      payload: replanPayload,
      retryBranches: new Map()
    };

    // update knowledge base with replan event
    context.knowledgeBase?.addOrUpdatePattern({
      category: 'failure_mode',
      insight: `replan triggered for steps: ${replanPayload.retrySteps.join(', ')}`,
      confidence: 'high',
      evidence: [`replan at ${context.replanState.triggeredAt}`],
      impact: 'medium'
    });

    // execute retries for each failed step using the repair agent
    for (const stepNumber of replanPayload.retrySteps) {
      const step = context.plan.steps.find(s => s.stepNumber === stepNumber);
      if (!step) {
        console.warn(`  replan: step ${stepNumber} not found, skipping`);
        continue;
      }

      const agent = this.resolveAgent(agents, step.agentName);
      if (!agent) {
        console.warn(`  replan: agent ${step.agentName} not found, skipping`);
        continue;
      }

      // get current retry count
      const resultIndex = context.results.findIndex(r => r.stepNumber === stepNumber);
      const result = context.results[resultIndex];
      const retryCount = (result?.retryCount || 0) + 1;

      // max 3 retries to avoid infinite loops
      if (retryCount > 3) {
        console.error(`  step ${stepNumber} exceeded max retries (3), skipping`);
        continue;
      }

      console.log(`  🔧 Spawning repair agent for step ${stepNumber} (${agent.name}) - attempt ${retryCount}`);

      // create retry branch with suffix
      const retryBranchName = `swarm/${context.executionId}/step-${stepNumber}-${agent.name.toLowerCase()}-retry${retryCount}`;

      // track retry branch
      if (!context.replanState.retryBranches.has(stepNumber)) {
        context.replanState.retryBranches.set(stepNumber, []);
      }
      context.replanState.retryBranches.get(stepNumber)!.push(retryBranchName);

      // reset result status
      if (result) {
        result.status = 'pending';
        result.retryCount = retryCount;
        result.branchName = retryBranchName;
        delete result.error;
        delete result.sessionResult;
        delete result.verificationResult;
      }

      try {
        // switch to main branch before creating retry branch
        await this.switchBranch(context.mainBranch);
        await this.createAgentBranch(retryBranchName, context.mainBranch);

        // Build repair context from the failed step's results
        const stepDir = path.join(context.runDir, 'steps', `step-${stepNumber}`);
        const transcriptPath = path.join(stepDir, 'share.md');
        const verificationReportPath = path.join(
          context.runDir, 'verification', `step-${stepNumber}-verification.md`
        );

        const failedChecks: string[] = [];
        let rootCause = 'Verification checks failed';
        if (result?.verificationResult) {
          const repairAgentHelper = new RepairAgent(this.workingDir);
          const extracted = repairAgentHelper.extractFailedChecks(result.verificationResult);
          failedChecks.push(...extracted);

          // Derive root cause from check types (includes outcome-based checks)
          const hasTestFailure = result.verificationResult.checks.some(c => !c.passed && (c.type === 'test' || c.type === 'test_exec'));
          const hasBuildFailure = result.verificationResult.checks.some(c => !c.passed && (c.type === 'build' || c.type === 'build_exec'));
          const hasCommitFailure = result.verificationResult.checks.some(c => !c.passed && c.type === 'commit');
          const hasNoDiff = result.verificationResult.checks.some(c => !c.passed && c.type === 'git_diff');
          const hasMissingFiles = result.verificationResult.checks.some(c => !c.passed && c.type === 'file_existence');
          if (hasMissingFiles) rootCause = 'Expected files were not created';
          else if (hasTestFailure) rootCause = 'Tests not executed or failed';
          else if (hasBuildFailure) rootCause = 'Build not executed or failed';
          else if (hasNoDiff) rootCause = 'Agent made no code changes';
          else if (hasCommitFailure) rootCause = 'No commits made';
        }

        const repairContext: RepairContext = {
          stepNumber,
          agentName: agent.name,
          originalTask: step.task,
          transcriptPath,
          verificationReportPath,
          branchName: retryBranchName,
          failedChecks,
          rootCause,
          retryCount,
          failureContext: result.verificationResult?.failureContext,
        };

        const repairAgent = new RepairAgent(this.workingDir, 3);
        const sessionOpts: SessionOptions = {
          allowAllTools: true,
          ...(options?.model && { model: options.model })
        };

        const repairResult = await repairAgent.attemptRepair(
          repairContext,
          sessionOpts,
          {
            requireTests: /\b(test suite|unit test|integration test|e2e test|write tests)\b/i.test(step.task),
            requireBuild: /\b(npm build|run build|compile|bundle|webpack)\b/i.test(step.task),
            requireCommits: false
          }
        );

        // Log repair cost
        console.log(`  📊 Repair cost: ~${repairResult.estimatedTokenCost} tokens, ${repairResult.attempts} attempt(s), ${Math.round(repairResult.totalDurationMs / 1000)}s`);

        // Save repair result to run directory
        const repairResultPath = path.join(context.runDir, `repair-step-${stepNumber}.json`);
        fs.writeFileSync(repairResultPath, JSON.stringify(repairResult, null, 2), 'utf8');

        if (repairResult.success) {
          if (result) {
            result.status = 'completed';
            result.endTime = new Date().toISOString();
          }
          console.log(`  ✅ Repair succeeded for step ${stepNumber} after ${repairResult.attempts} attempt(s)`);
        } else {
          // Repair failed - fall back to standard re-execution as last resort
          console.warn(`  ⚠️  Repair agent failed; falling back to full re-execution for step ${stepNumber}`);
          const retryStep = { ...step, task: `[RETRY ${retryCount}] ${step.task}` };
          await this.executeStepInSwarm(retryStep, agent, context, options);
          console.log(`  ✅ Fallback retry succeeded for step ${stepNumber}`);
        }
      } catch (error: unknown) {
        const err = error as Error;
        console.error(`  ❌ Retry ${retryCount} failed for step ${stepNumber}: ${err.message}`);
      }
    }

    // append and execute any new steps
    if (replanPayload.addSteps && replanPayload.addSteps.length > 0) {
      const generator = new PlanGenerator(Array.from(agents.values()));

      const completed = context.results.filter(r => r.status === 'completed').map(r => r.stepNumber);
      const revised = generator.revisePlan(context.plan, replanPayload, completed);

      const oldMax = Math.max(...context.plan.steps.map(s => s.stepNumber));
      const newSteps = revised.steps.filter((s: PlanStep) => s.stepNumber > oldMax);

      context.plan = revised;
      for (const s of newSteps) {
        context.results.push({
          stepNumber: s.stepNumber,
          agentName: s.agentName,
          status: 'pending'
        });
      }

      console.log(`  ➕ Replan added ${newSteps.length} new step(s)`);

      // Notify dashboard immediately so totalSteps and progress bar update
      // before the replan steps start executing
      options?.onProgress?.(context, `replan-added:${newSteps.length}`);

      // Execute added steps in parallel when they have no mutual dependencies
      const replanPromises = newSteps.map(async (added: PlanStep) => {
        const agent = this.resolveAgent(agents, added.agentName);
        if (!agent) {
          console.warn(`  replan: agent ${added.agentName} not found for step ${added.stepNumber}, skipping`);
          return;
        }

        console.log(`  🧩 Executing added step ${added.stepNumber} (${agent.name})`);
        try {
          await this.executeStepInSwarm(added, agent, context, options);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`  ❌ Replan step ${added.stepNumber} failed: ${msg}`);
        }
      });
      await Promise.allSettled(replanPromises);
    }

    // save replan state to run directory
    const replanPath = path.join(context.runDir, 'replan-state.json');
    fs.writeFileSync(replanPath, JSON.stringify({
      ...context.replanState,
      retryBranches: Object.fromEntries(context.replanState.retryBranches)
    }, null, 2), 'utf8');

    console.log('  📝 Replan state saved');
  }

  /**
   * Execute a single step within the swarm
   */
  private async executeStepInSwarm(
    step: PlanStep,
    agent: AgentProfile,
    context: SwarmExecutionContext,
    options?: SwarmExecutionOptions
  ): Promise<void> {
    const resultIndex = context.results.findIndex(r => r.stepNumber === step.stepNumber);
    const result = context.results[resultIndex];
    if (!result) {
      throw new Error(`Result for step ${step.stepNumber} not found`);
    }

    try {
      // wait for dependencies with spinner feedback
      if (step.dependencies.length > 0) {
        const depSpinner = new Spinner(
          `Step ${step.stepNumber} — Waiting for dependencies (${step.dependencies.join(', ')})...`,
          { style: 'pulse', prefix: '  ' }
        );
        depSpinner.start();

        try {
          const satisfied = await context.contextBroker.waitForDependencies(step.dependencies, 600000);
          if (!satisfied) {
            depSpinner.fail(`Step ${step.stepNumber} — Dependencies timeout`);
            throw new Error('Dependencies timeout after 10 minutes');
          }
          depSpinner.succeed(`Step ${step.stepNumber} — Dependencies ready`);
        } catch (depError) {
          depSpinner.fail(`Step ${step.stepNumber} — Dependency failed`);
          throw depError;
        }
      }

      // Track step execution
      context.metricsCollector?.trackStep(step.stepNumber, agent.name);

      // create per-agent branch and worktree for true parallel isolation
      const branchName = `swarm/${context.executionId}/step-${step.stepNumber}-${agent.name.toLowerCase()}`;
      result.branchName = branchName;
      result.status = 'running';
      result.startTime = new Date().toISOString();

      // Notify progress: step is now running
      options?.onProgress?.(context, `step-running:${step.stepNumber}`);

      // Use git worktree so each agent has its own isolated working directory
      const stepRepoDir = step.repo || this.workingDir;
      const worktreePath = await this.createAgentWorktree(branchName, context.mainBranch, context.runDir, step.stepNumber, stepRepoDir);
      console.log(`  🌿 Step ${step.stepNumber} (${agent.name}) on branch: ${branchName}`);

      // Capture baseline SHA before agent execution for outcome-based verification
      const baseSha = execSync('git rev-parse HEAD', { cwd: worktreePath, encoding: 'utf8' }).trim();

      // build enhanced prompt with dependency context
      const strictIsolation = options?.strictIsolation ?? false;
      const dependencyContext = context.contextBroker.getDependencyContext(step.dependencies, strictIsolation);
      const enhancedPrompt = this.buildSwarmPrompt(step, agent, context, dependencyContext);

      // Inner fleet toggle: prefix prompt with /fleet for parallel sub-agent dispatch
      const finalPrompt = options?.useInnerFleet
        ? `/fleet ${enhancedPrompt}`
        : enhancedPrompt;
      if (options?.useInnerFleet) {
        console.log(`  ⚡ [inner-fleet] Step ${step.stepNumber} dispatched via /fleet`);
      }

      // execute session on agent branch - IN THE WORKTREE DIRECTORY
      const stepDir = path.join(context.runDir, 'steps', `step-${step.stepNumber}`);
      const transcriptPath = path.join(stepDir, 'share.md');

      // Ensure step directory exists before session runs
      if (!fs.existsSync(stepDir)) {
        fs.mkdirSync(stepDir, { recursive: true });
      }

      // Create a session executor for this worktree
      // Per-step cliAgent takes priority; falls back to run-level option; defaults to copilot
      const adapterName = step.cliAgent || options?.cliAgent || 'copilot';
      const stepAdapter = resolveAdapter(adapterName);
      const worktreeExecutor = new SessionExecutor(worktreePath, stepAdapter);

      const sessionOptions: SessionOptions = {
        allowAllTools: true,
        shareToFile: transcriptPath,
        logPrefix: `[${agent.name}:${step.stepNumber}]`, // live console logging for parallelism proof
        ...(options?.model && { model: options.model })
      };

      // Generate per-step hooks for scope enforcement and evidence capture
      // Hooks default to on unless explicitly disabled via --no-hooks
      let generatedHooks: GeneratedHooks | undefined;
      if (options?.hooksEnabled !== false) {
        const hookGen = new HookGenerator();
        generatedHooks = hookGen.generateStepHooks({
          step,
          agent,
          executionId: context.executionId,
          runDir: context.runDir,
          stepBranch: branchName,
          workingDir: worktreePath
        });
        // Hooks are auto-loaded by Copilot CLI from <gitRoot>/.github/hooks/
      }

      // replay mode: reuse a matching prior transcript instead of calling Copilot
      if (options?.replay && context.knowledgeBase) {
        const patterns = context.knowledgeBase.findSimilarTasks(step.task, 0.9);
        const match = patterns.find(p => p.evidence.length > 0);
        if (match) {
          const priorTranscript = match.evidence[0];
          if (priorTranscript && fs.existsSync(priorTranscript)) {
            console.log(`  ♻️  [replay] Step ${step.stepNumber}: replaying from cached transcript`);
            fs.copyFileSync(priorTranscript, transcriptPath);
            result.sessionResult = {
              output: 'replayed from cache',
              success: true,
              duration: 0,
              exitCode: 0,
              transcriptPath: transcriptPath,
            };
            result.status = 'completed';
            result.endTime = new Date().toISOString();
            // skip to verification (fall through below)
          }
        }
      }

      // only call Copilot if we don't already have a session result (e.g. from replay)
      if (!result.sessionResult) {
        // Print static header instead of animated spinner when live logging
        // This prevents spinner animation from interleaving with agent output
        console.log(`  🐝 Step ${step.stepNumber} (${agent.name}) — Agent working...`);
        console.log(`  ${'─'.repeat(60)}`);

        const sessionResult = await worktreeExecutor.executeSession(finalPrompt, sessionOptions);

        // Print completion with timing
        const durationSec = Math.round(sessionResult.duration / 1000);
        console.log(`  ${'─'.repeat(60)}`);
        console.log(`  ✅ Step ${step.stepNumber} (${agent.name}) complete (${durationSec}s)`);

        result.sessionResult = sessionResult;

        if (!sessionResult.success) {
          throw new Error(sessionResult.error || 'Session failed');
        }
      }

      // Clean up hook files after session completes (evidence log in runDir persists)
      if (generatedHooks) {
        const hookGen = new HookGenerator();
        hookGen.cleanupHooks(generatedHooks.hooksFilePath);
      }

      // Check if transcript was created, create fallback if not
      if (!fs.existsSync(transcriptPath)) {
        const fallbackContent = `# Copilot Session Transcript\n\nSession output:\n\`\`\`\n${result.sessionResult?.output || 'No output captured'}\n\`\`\`\n`;
        fs.writeFileSync(transcriptPath, fallbackContent, 'utf8');
      }

      // parse transcript for context
      const transcriptContent = fs.readFileSync(transcriptPath, 'utf8');
      const shareIndex = this.shareParser.parse(transcriptContent);

      // Track commits from this step
      if (shareIndex.gitCommits) {
        shareIndex.gitCommits.forEach(() => {
          context.metricsCollector?.trackCommit(agent.name);
        });

        // Analyze commit quality for anti-patterns
        await this.analyzeCommitQuality(shareIndex.gitCommits, step.stepNumber, agent.name, context);
      }

      // Commit any uncommitted work the agent left behind.
      // Some adapters (e.g. Codex) modify files without committing;
      // the git_diff verification check only sees committed changes.
      try {
        const status = execSync('git status --porcelain', { cwd: worktreePath, encoding: 'utf8' }).trim();
        if (status) {
          execSync('git add -A', { cwd: worktreePath, stdio: 'pipe' });
          execSync(
            `git commit -m "auto-commit uncommitted work from step ${step.stepNumber} (${agent.name})"`,
            { cwd: worktreePath, stdio: 'pipe', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }
          );
        }
      } catch {
        // Commit may fail if working tree is truly clean or in detached HEAD; non-fatal
      }

      // verify the step with spinner feedback
      const verifySpinner = new Spinner(`Step ${step.stepNumber} — Verifying work...`, { style: 'dots', prefix: '  ' });
      verifySpinner.start();

      const verificationResult = await this.verifier.verifyStep(
        step.stepNumber,
        agent.name,
        transcriptPath,
        {
          // only require tests if task explicitly mentions testing/test suite
          requireTests: /\b(test suite|unit test|integration test|e2e test|write tests)\b/i.test(step.task),
          // only require build if task explicitly mentions build process (not "build an app")
          requireBuild: /\b(npm build|run build|compile|bundle|webpack)\b/i.test(step.task),
          // commits are desired but not blocking for demo
          requireCommits: false
        },
        shareIndex,
        generatedHooks?.evidenceLogPath,
        { workdir: worktreePath, baseSha }
      );

      result.verificationResult = verificationResult;

      // Track verification result
      context.metricsCollector?.trackVerification(verificationResult.passed);

      // generate and commit verification report
      const reportPath = path.join(
        context.runDir,
        'verification',
        `step-${step.stepNumber}-verification.md`
      );

      await this.verifier.generateVerificationReport(verificationResult, reportPath);

      if (verificationResult.passed) {
        verifySpinner.succeed(`Step ${step.stepNumber} (${agent.name}) verified ✓`);

        // add to shared context BEFORE advisory gates so replan steps can depend on this step
        const contextEntry: ContextEntry = {
          stepNumber: step.stepNumber,
          agentName: agent.name,
          timestamp: new Date().toISOString(),
          data: {
            filesChanged: shareIndex.changedFiles,
            outputsSummary: step.expectedOutputs.join(', '),
            branchName,
            commitShas: shareIndex.gitCommits.map(c => c.sha || 'unknown'),
            verificationPassed: verificationResult.passed,
            transcript: transcriptPath
          }
        };
        context.contextBroker.addStepContext(contextEntry);

        await this.verifier.commitVerificationReport(
          reportPath,
          step.stepNumber,
          agent.name,
          true
        );

        // Quality gates run only in the final pass (after all branches merged) to avoid
        // spawning extra Copilot sessions mid-execution. The final gates block handles
        // auto-remediation for every gate type, making per-step checks redundant.

        // optional deployment for devops_pro when --confirm-deploy is set
        if (agent.name === 'DevOpsPro' && options?.confirmDeploy) {
          await this.executeOptionalDeployment(step, agent, context, options);
        }
      } else {
        // verification failed - attempt rollback
        verifySpinner.warn(`Step ${step.stepNumber} verification failed, rolling back...`);

        const rollbackResult = await this.verifier.rollback(
          step.stepNumber,
          branchName,
          shareIndex.changedFiles
        );

        if (rollbackResult.success) {
          console.log(`  🔄 Rollback complete: ${rollbackResult.filesRestored.length} file(s) restored`);
        }

        throw new Error('Step failed verification - see verification report');
      }

      // context was already added before advisory gates block

      result.status = 'completed';
      result.endTime = new Date().toISOString();

      // Record actual cost for this step
      if (context.costEstimator && context.stepCostRecords) {
        const stepEstimate = context.costEstimate?.perStep.find(s => s.stepNumber === step.stepNumber);
        const durationMs = result.startTime && result.endTime
          ? new Date(result.endTime).getTime() - new Date(result.startTime).getTime()
          : 0;
        context.costEstimator.recordActual(step.stepNumber, stepEstimate?.estimatedPremiumRequests ?? 1, 1, 0);
        context.stepCostRecords.push({
          stepNumber: step.stepNumber,
          agentName: agent.name,
          estimatedPremiumRequests: stepEstimate?.estimatedPremiumRequests ?? 1,
          actualPremiumRequests: 1,
          retryCount: 0,
          promptTokens: stepEstimate?.estimatedPromptTokens ?? 0,
          fleetMode: !!options?.useInnerFleet,
          durationMs,
        });
      }

      // Notify progress: step completed
      options?.onProgress?.(context, `step-done:${step.stepNumber}`);

      console.log(`  ✅ Step ${step.stepNumber} (${agent.name}) completed and merged`);

    } catch (error: unknown) {
      const err = error as Error;
      result.status = 'failed';
      result.error = err.message;
      result.endTime = new Date().toISOString();

      // Signal completion even for failed steps so dependent replan steps
      // don't hang forever in waitForDependencies. The replan step can
      // check context.results to see the step failed and adapt.
      const failedEntry: ContextEntry = {
        stepNumber: step.stepNumber,
        agentName: agent.name,
        timestamp: new Date().toISOString(),
        data: {
          filesChanged: [],
          outputsSummary: 'step failed verification',
          branchName: result.branchName || '',
          commitShas: [],
          verificationPassed: false,
          transcript: path.join(context.runDir, 'steps', `step-${step.stepNumber}`, 'share.md')
        }
      };
      context.contextBroker.addStepContext(failedEntry);

      // Notify progress: step failed
      options?.onProgress?.(context, `step-failed:${step.stepNumber}`);

      console.error(`  ❌ Step ${step.stepNumber} (${agent.name}) failed: ${err.message}`);
      throw error;
    }
  }

  /**
   * Run critic review on completed wave results.
   * Scores per check axis (test/build/lint/commit/claim) with weighted deductions.
   * Grounded in structured verifier output, not raw pass/fail booleans.
   */
  private runCriticReview(
    completedResults: ParallelStepResult[],
    context: SwarmExecutionContext,
    plan: ExecutionPlan
  ): CriticResult {
    const flags: string[] = [];
    let score = 100;

    // per-axis deduction weights
    const weights: Record<string, number> = {
      test: 20, build: 25, lint: 5, commit: 10, claim: 5
    };

    for (const result of completedResults) {
      const step = plan.steps.find(s => s.stepNumber === result.stepNumber);
      if (!step) continue;

      // aggregate checks by type for this step
      if (result.verificationResult) {
        const byType = new Map<string, { passed: number; failed: number; reasons: string[] }>();
        for (const check of result.verificationResult.checks) {
          const entry = byType.get(check.type) || { passed: 0, failed: 0, reasons: [] };
          if (check.passed) {
            entry.passed++;
          } else {
            entry.failed++;
            if (check.reason) entry.reasons.push(check.reason);
          }
          byType.set(check.type, entry);
        }

        // score each axis and generate typed flags
        for (const [type, counts] of byType) {
          if (counts.failed > 0) {
            const deduction = (weights[type] || 10) * counts.failed;
            score -= deduction;
            const total = counts.passed + counts.failed;
            const detail = counts.reasons.length > 0 ? ` (${counts.reasons[0]})` : '';
            flags.push(`step-${result.stepNumber}: ${counts.failed}/${total} ${type} checks failed${detail}`);
          }
        }
      }

      // missing session output
      if (step.expectedOutputs.length > 0 && !result.sessionResult) {
        flags.push(`step-${result.stepNumber}: no session output captured`);
        score -= 10;
      }
    }

    score = Math.max(0, Math.min(100, score));
    const recommendation = flags.length === 0 ? 'approve' : score >= 60 ? 'revise' : 'reject';

    return { score, flags, recommendation };
  }

  /**
   * Build prompt for swarm step execution.
   * Shared boilerplate lives in .copilot-instructions.md (written once per run via
   * writeSharedInstructions). This prompt carries only task-specific content to keep
   * token cost low.
   */
  private buildSwarmPrompt(
    step: PlanStep,
    agent: AgentProfile,
    context: SwarmExecutionContext,
    dependencyContext: string
  ): string {
    const sections: string[] = [];

    sections.push(`Step ${step.stepNumber}/${context.plan.steps.length} | Agent: ${agent.name}\n`);

    sections.push('TASK:');
    sections.push(step.task + '\n');

    if (dependencyContext && dependencyContext.trim().length > 0) {
      sections.push('DEPENDENCY CONTEXT:');
      sections.push(dependencyContext + '\n');
    }

    sections.push('BRANCH: you are already on your correct branch in a dedicated git worktree.');
    sections.push('Do NOT run git checkout or switch branches.\n');

    sections.push(`SCOPE: ${agent.scope.join(', ')}`);
    sections.push(`BOUNDARIES: ${agent.boundaries.join(', ')}`);
    sections.push(`DONE WHEN: ${agent.done_definition.join(', ')}`);

    return sections.join('\n');
  }

  /**
   * Build dependency graph from plan
   */
  private buildDependencyGraph(plan: ExecutionPlan): Map<number, number[]> {
    const graph = new Map<number, number[]>();

    plan.steps.forEach(step => {
      graph.set(step.stepNumber, step.dependencies);
    });

    return graph;
  }

  /**
   * Identify waves of parallel execution (topological sort by levels)
   */
  private identifyExecutionWaves(graph: Map<number, number[]>): number[][] {
    const waves: number[][] = [];
    const completed = new Set<number>();
    const allSteps = Array.from(graph.keys());

    while (completed.size < allSteps.length) {
      const currentWave: number[] = [];

      // find steps whose dependencies are all completed
      for (const step of allSteps) {
        if (completed.has(step)) continue;

        const deps = graph.get(step) || [];
        const allDepsCompleted = deps.every(dep => completed.has(dep));

        if (allDepsCompleted) {
          currentWave.push(step);
        }
      }

      if (currentWave.length === 0) {
        throw new Error('Circular dependency detected or graph issue');
      }

      waves.push(currentWave);
      currentWave.forEach(step => completed.add(step));
    }

    return waves;
  }

  /**
   * Create a git worktree for an agent - enables true parallel execution
   * Each agent gets its own isolated working directory with its branch checked out.
   * When repoDir differs from this.workingDir, the worktree is forked from the
   * target repo's git history (e.g. bootstrap targeting an external project).
   */
  private async createAgentWorktree(
    branchName: string,
    fromBranch: string,
    runDir: string,
    stepNumber: number,
    repoDir?: string
  ): Promise<string> {
    // repoDir is the git repo to fork from; defaults to the orchestrator's own repo
    const gitDir = repoDir || this.workingDir;
    const worktreePath = path.join(runDir, 'worktrees', `step-${stepNumber}`);

    // Ensure worktrees directory exists
    const worktreesDir = path.dirname(worktreePath);
    if (!fs.existsSync(worktreesDir)) {
      fs.mkdirSync(worktreesDir, { recursive: true });
    }

    // Ensure the target repo has at least one commit (handles freshly-init'd repos)
    try {
      execSync('git rev-parse HEAD', { cwd: gitDir, stdio: 'pipe' });
    } catch {
      // No commits yet; create an initial empty commit so branch/worktree ops work
      try {
        execSync('git add -A', { cwd: gitDir, stdio: 'pipe' });
        execSync('git commit --allow-empty -m "chore: initialize repository"', { cwd: gitDir, stdio: 'pipe' });
      } catch {
        // Already has staged content or other edge case; try allow-empty as last resort
        try {
          execSync('git commit --allow-empty -m "chore: initialize repository"', { cwd: gitDir, stdio: 'pipe' });
        } catch {
          // Truly cannot commit; worktree add will fail with a clear error
        }
      }
    }

    // Resolve fromBranch: the target repo may not have the same branch name as the orchestrator
    let resolvedFromBranch = fromBranch;
    if (gitDir !== this.workingDir) {
      try {
        // Use whatever branch the target repo is currently on
        const targetBranch = execSync('git branch --show-current', { cwd: gitDir, encoding: 'utf8', stdio: 'pipe' }).trim();
        if (targetBranch) {
          resolvedFromBranch = targetBranch;
        } else {
          // Detached HEAD; fall back to the default branch
          resolvedFromBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: gitDir, encoding: 'utf8', stdio: 'pipe' }).trim();
        }
      } catch {
        // Keep the original fromBranch as best-effort fallback
      }
    }

    // Create the branch first (without checkout)
    try {
      execSync(`git branch ${branchName} ${resolvedFromBranch}`, { cwd: gitDir, stdio: 'pipe' });
    } catch {
      // Branch already exists from a prior retry; safe to reuse
    }

    // Clean up existing worktree if present (e.g. from a retry)
    if (fs.existsSync(worktreePath)) {
      try {
        execSync(`git worktree remove "${worktreePath}" --force`, { cwd: gitDir, stdio: 'pipe' });
      } catch {
        // Worktree entry may be stale or already removed; prune and force-delete the directory
        try {
          execSync('git worktree prune', { cwd: gitDir, stdio: 'pipe' });
        } catch {
          // Prune is best-effort cleanup; the rmSync below handles the directory
        }
        fs.rmSync(worktreePath, { recursive: true, force: true });
      }
    }

    // Create worktree with the branch
    return new Promise((resolve, reject) => {
      const proc = spawn('git', ['worktree', 'add', worktreePath, branchName], {
        cwd: gitDir
      });

      let stderr = '';
      if (proc.stderr) {
        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(worktreePath);
        } else {
          reject(new Error(`Failed to create worktree: ${stderr}`));
        }
      });
    });
  }

  /**
   * Remove a git worktree after merge
   */
  private async removeAgentWorktree(worktreePath: string): Promise<void> {
    return new Promise((resolve) => {
      const proc = spawn('git', ['worktree', 'remove', worktreePath, '--force'], {
        cwd: this.workingDir
      });

      proc.on('close', () => {
        // Don't fail if worktree removal fails - it's cleanup
        resolve();
      });
    });
  }

  /**
   * Create a new git branch for an agent (legacy - kept for compatibility)
   */
  private async createAgentBranch(branchName: string, fromBranch: string): Promise<void> {
    // stash any uncommitted changes before switching (avoids conflicts from parallel agents)
    try {
      execSync('git stash --include-untracked', { cwd: this.workingDir, stdio: 'pipe' });
    } catch {
      // Stash fails when working tree is clean; expected during normal execution
    }

    return new Promise((resolve, reject) => {
      const proc = spawn('git', ['checkout', '-b', branchName, fromBranch], {
        cwd: this.workingDir
      });

      let stderr = '';
      if (proc.stderr) {
        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to create branch: ${stderr}`));
        }
      });
    });
  }

  /**
   * Attempt to dispatch a batch of steps via a single /fleet prompt.
   * If fleet dispatch fails or any subtask cannot be mapped back, returns false
   * so the caller can fall back to subprocess mode.
   */
  private async attemptFleetDispatch(
    readySteps: number[],
    plan: ExecutionPlan,
    agents: Map<string, AgentProfile>,
    context: SwarmExecutionContext,
    options?: SwarmExecutionOptions
  ): Promise<boolean> {
    const fleetExecutor = new FleetExecutor(this.workingDir);

    if (!fleetExecutor.isAvailable()) {
      console.log('  ⚠️  Fleet mode requested but copilot CLI does not support /fleet. Falling back to subprocess mode.');
      return false;
    }

    const steps = readySteps
      .map(n => plan.steps.find(s => s.stepNumber === n))
      .filter((s): s is PlanStep => s !== undefined);

    if (steps.length === 0) return false;

    console.log(`  ⚡ [fleet] Dispatching ${steps.length} step(s) via /fleet`);

    const transcriptDir = path.join(context.runDir, 'steps');

    try {
      const waveResult = await fleetExecutor.executeWave(steps, agents, {
        model: options?.model,
        runDir: context.runDir,
        executionId: context.executionId,
        mainBranch: context.mainBranch,
        transcriptDir
      });

      if (!waveResult.success) {
        console.log('  ⚠️  Fleet dispatch failed. Falling back to subprocess mode.');
        return false;
      }

      // Check how many subtasks completed
      const completedCount = waveResult.subtaskResults.filter(r => r.completed).length;
      const failedCount = waveResult.subtaskResults.filter(r => !r.completed).length;

      console.log(`  ⚡ [fleet] ${completedCount} subtask(s) completed, ${failedCount} incomplete`);

      if (failedCount > 0) {
        console.log('  ⚠️  Some fleet subtasks incomplete. Falling back to subprocess mode for all steps.');
        return false;
      }

      // Map fleet results back to step results
      for (const subtask of waveResult.subtaskResults) {
        const result: ParallelStepResult = {
          stepNumber: subtask.stepNumber,
          agentName: subtask.agentName,
          status: subtask.completed ? 'completed' : 'failed',
          startTime: context.startTime,
          endTime: new Date().toISOString(),
          sessionResult: {
            success: subtask.completed,
            output: subtask.outputFragment,
            exitCode: subtask.completed ? 0 : 1,
            duration: waveResult.sessionResult.duration / steps.length
          }
        };
        context.results.push(result);
      }

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  ⚠️  Fleet dispatch error: ${message}. Falling back to subprocess mode.`);
      return false;
    }
  }

  /**
   * Merge completed branches to main. When a PRManager is configured on the
   * context, creates pull requests with verification evidence instead of
   * direct git merges. Falls back to sequential merge otherwise.
   */
  private async mergeWaveBranches(
    completedResults: ParallelStepResult[],
    context: SwarmExecutionContext,
    options?: SwarmExecutionOptions
  ): Promise<void> {
    const branches = completedResults
      .filter(r => r.branchName)
      .map(r => r.branchName!);

    if (branches.length === 0) return;

    // PR-based merge: create a PR for each branch instead of direct git merge
    if (context.prManager) {
      for (const result of completedResults) {
        if (!result.branchName) continue;

        const step = context.plan.steps.find(s => s.stepNumber === result.stepNumber);
        const taskDesc = step?.task || `Step ${result.stepNumber}`;
        const costRecord = context.stepCostRecords?.find(r => r.stepNumber === result.stepNumber);

        const prResult = context.prManager.createStepPR(
          result.branchName,
          context.mainBranch,
          result.stepNumber,
          result.agentName,
          taskDesc,
          {
            verification: result.verificationResult,
            costRecord
          }
        );

        if (prResult.success && prResult.url) {
          context.prUrls?.set(result.stepNumber, prResult.url);
          console.log(`  📋 PR created for step ${result.stepNumber}: ${prResult.url}`);

          if (options?.prMode === 'auto' && prResult.number) {
            const merged = context.prManager.autoMergePR(prResult.number);
            if (merged) {
              console.log(`  ✅ Auto-merged PR #${prResult.number}`);
            } else {
              console.warn(`  ⚠️  Auto-merge failed for PR #${prResult.number}; manual merge required`);
            }
          } else if (options?.prMode === 'review' && prResult.number) {
            console.log(`  ⏳ Waiting for approval on PR #${prResult.number}...`);
            const status = await context.prManager.waitForApproval(prResult.number);
            if (status.approved || status.state === 'MERGED') {
              console.log(`  ✅ PR #${prResult.number} approved`);
              if (status.state !== 'MERGED') {
                context.prManager.autoMergePR(prResult.number);
              }
            } else {
              console.warn(`  ⚠️  PR #${prResult.number} review timed out or was not approved`);
            }
          }
        } else {
          console.warn(`  ⚠️  PR creation failed for ${result.branchName}: ${prResult.error}`);
          // Fall back to direct merge
          try {
            await this.mergeBranch(result.branchName, context);
            console.log(`  ✅ Merged ${result.branchName} (fallback)`);
          } catch (error: unknown) {
            const err = error as Error;
            console.warn(`  ⚠️  Merge conflict for ${result.branchName}: ${err.message}`);
          }
        }
      }
      return;
    }

    try {
      await this.switchBranch(context.mainBranch);

      // Sequential merge with conflict resolution. Octopus merge was removed
      // because parallel agents nearly always touch shared files (package.json,
      // README, etc.), making octopus fail every time. Sequential merge with
      // the 3-strategy fallback (rebase, -X theirs, modify/delete) handles
      // all real-world conflict patterns correctly.
      for (const result of completedResults) {
        if (result.branchName) {
          try {
            await this.mergeBranch(result.branchName, context);
            console.log(`  ✅ Merged ${result.branchName}`);
          } catch (error: unknown) {
            const err = error as Error;
            // Merge conflict: abort, rebase the branch onto updated main, retry
            try {
              execSync('git merge --abort', { cwd: this.workingDir, stdio: 'pipe' });
            } catch {
              // No merge in progress to abort
            }

            console.log(`  🔄 Merge conflict for ${result.branchName}, rebasing onto ${context.mainBranch}...`);
            const rebased = this.tryRebaseAndMerge(result.branchName, context);
            if (rebased) {
              console.log(`  ✅ Merged ${result.branchName} (rebased)`);
            } else {
              console.warn(`  ⚠️  Could not merge ${result.branchName} after rebase: ${err.message}`);
              console.warn(`     Step ${result.stepNumber} work preserved on branch ${result.branchName}`);
              // Track the failure so callers can surface it
              if (!context.unmergedBranches) {
                context.unmergedBranches = [];
              }
              context.unmergedBranches.push({
                stepNumber: result.stepNumber,
                branchName: result.branchName,
                agentName: result.agentName,
                reason: err.message,
              });
            }
          }
        }
      }
    } finally {
      // switchBranch and mergeBranch pass cwd explicitly; no global state to restore
    }
  }

  /**
   * Merge all agent branches back to main and clean up worktrees
   */
  private async mergeAllBranches(context: SwarmExecutionContext): Promise<void> {
    // First, remove all worktrees (must be done before branch operations)
    const worktreesDir = path.join(context.runDir, 'worktrees');
    if (fs.existsSync(worktreesDir)) {
      for (const result of context.results) {
        if (result.branchName) {
          const worktreePath = path.join(worktreesDir, `step-${result.stepNumber}`);
          await this.removeAgentWorktree(worktreePath);
        }
      }
    }

    // switch back to main branch
    await this.switchBranch(context.mainBranch);

    // Stash only tracked modifications in the working directory
    // (e.g. from npm install during post-execution setup).
    // IMPORTANT: do NOT stash untracked files -- the runs/ directory contains
    // transcripts, verification reports, and other artifacts that must persist.
    let stashed = false;
    try {
      const stashResult = execSync('git stash push --no-include-untracked', { cwd: this.workingDir, encoding: 'utf8', stdio: 'pipe' });
      stashed = !stashResult.includes('No local changes');
    } catch {
      // Stash fails when working tree is clean; expected during normal execution
    }

    // Determine which branches are already merged to avoid double-merge
    let mergedBranches: string[] = [];
    try {
      const merged = execSync(`git branch --merged ${context.mainBranch}`, {
        cwd: this.workingDir, encoding: 'utf8', stdio: 'pipe'
      });
      mergedBranches = merged.split('\n').map(b => b.trim().replace(/^\* /, ''));
    } catch {
      // Branch listing can fail in shallow clones or empty repos; safe to attempt all merges
    }

    for (const result of context.results) {
      if (result.status === 'completed' && result.branchName) {
        // Skip branches already merged during wave completion
        if (mergedBranches.includes(result.branchName)) {
          console.log(`  ✅ ${result.branchName} (already merged)`);
          continue;
        }
        const mergeSpinner = new Spinner(`Merging ${result.branchName}...`, { style: 'dots', prefix: '  ' });
        mergeSpinner.start();
        try {
          await this.mergeBranch(result.branchName, context);
          mergeSpinner.succeed(`Merged ${result.branchName}`);
        } catch (error: unknown) {
          const err = error as Error;
          // Abort the failed merge, then try rebase-and-merge recovery
          try {
            execSync('git merge --abort', { cwd: this.workingDir, stdio: 'pipe' });
          } catch {
            // No merge in progress to abort
          }

          const rebased = this.tryRebaseAndMerge(result.branchName, context);
          if (rebased) {
            mergeSpinner.succeed(`Merged ${result.branchName} (rebased)`);
          } else {
            mergeSpinner.fail(`Conflict merging ${result.branchName}: ${err.message}`);
            console.error(`     Work preserved on branch ${result.branchName}`);
            if (!context.unmergedBranches) {
              context.unmergedBranches = [];
            }
            context.unmergedBranches.push({
              stepNumber: result.stepNumber,
              branchName: result.branchName,
              agentName: result.agentName,
              reason: err.message,
            });
          }
        }
      }
    }

    // Restore stashed changes if any
    if (stashed) {
      try {
        execSync('git stash pop', { cwd: this.workingDir, stdio: 'pipe' });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[merge] Stash pop conflict after final merge (non-fatal): ${msg}`);
      }
    }
  }

  /**
   * Switch to a git branch
   */
  private async switchBranch(branchName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('git', ['checkout', branchName], {
        cwd: this.workingDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      });

      // timeout: if checkout takes longer than 15s, something is wrong
      const timeout = setTimeout(() => {
        proc.kill('SIGKILL');
        reject(new Error(`Timeout switching to branch ${branchName}`));
      }, 15000);

      proc.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to switch to branch ${branchName}`));
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * Merge a branch with conflict detection
   */
  /**
   * Wait for resume signal
   */
  private async waitForResume(): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.resumeRequested || !this.pauseRequested) {
          clearInterval(checkInterval);
          this.resumeRequested = false;
          resolve();
        }
      }, 500); // Check every 500ms
    });
  }

  /**
   * Rebase a branch onto main and retry the merge. Used when a direct merge
   * fails due to conflicts with a sibling branch that merged first.
   * Returns true if the rebase + merge succeeded.
   */
  private tryRebaseAndMerge(branchName: string, context: SwarmExecutionContext): boolean {
    const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
    const mergeEnv = { ...gitEnv, GIT_MERGE_AUTOEDIT: 'no' };

    // Strategy 1: rebase onto main, then fast-forward merge
    try {
      execSync(`git rebase ${context.mainBranch} "${branchName}"`, {
        cwd: this.workingDir, stdio: 'pipe', timeout: 120000, env: gitEnv
      });
      execSync(`git checkout "${context.mainBranch}"`, {
        cwd: this.workingDir, stdio: 'pipe', env: gitEnv
      });
      execSync(`git merge --no-ff "${branchName}" -m "Merge ${branchName} (rebased)"`, {
        cwd: this.workingDir, stdio: 'pipe', timeout: 120000, env: mergeEnv
      });
      return true;
    } catch {
      // Clean up failed rebase/merge before trying next strategy
      try { execSync('git rebase --abort', { cwd: this.workingDir, stdio: 'pipe' }); } catch { /* none in progress */ }
      try { execSync('git merge --abort', { cwd: this.workingDir, stdio: 'pipe' }); } catch { /* none in progress */ }
      try { execSync(`git checkout "${context.mainBranch}"`, { cwd: this.workingDir, stdio: 'pipe', env: gitEnv }); } catch { /* best-effort */ }
    }

    // Strategy 2: merge with -X theirs to auto-resolve conflicts by
    // accepting the branch's version of conflicting hunks. This is safe
    // because each branch's agent owns its changes, and common files
    // like package.json/package-lock.json/.gitignore will be reconciled
    // by the IntegratorFinalizer step.
    try {
      console.log(`  🔀 Retrying merge of ${branchName} with conflict auto-resolution...`);
      execSync(`git merge -X theirs --no-ff "${branchName}" -m "Merge ${branchName} (auto-resolved)"`, {
        cwd: this.workingDir, stdio: 'pipe', timeout: 120000, env: mergeEnv
      });
      return true;
    } catch {
      // -X theirs can't resolve modify/delete conflicts (e.g. branch deleted
      // a file that master modified). Attempt manual resolution: accept the
      // branch's intent for each conflicting path, then commit.
      try {
        const statusOutput = execSync('git status --porcelain', {
          cwd: this.workingDir, encoding: 'utf8', stdio: 'pipe'
        });
        const conflictLines = statusOutput.split('\n').filter(l => l.startsWith('UD') || l.startsWith('DU'));

        if (conflictLines.length > 0) {
          for (const line of conflictLines) {
            const filePath = line.slice(3).trim();
            if (line.startsWith('UD')) {
              // Modified locally, deleted by branch: accept deletion
              execSync(`git rm -f "${filePath}"`, { cwd: this.workingDir, stdio: 'pipe' });
            } else {
              // Deleted locally, modified by branch: accept the branch version
              execSync(`git checkout --theirs "${filePath}" && git add "${filePath}"`, {
                cwd: this.workingDir, stdio: 'pipe', shell: '/bin/bash'
              });
            }
          }

          // Any remaining unresolved conflicts? Let git add -u handle them
          try {
            execSync('git add -u', { cwd: this.workingDir, stdio: 'pipe' });
          } catch { /* ignore */ }

          execSync(
            `git commit --no-edit -m "Merge ${branchName} (auto-resolved with modify/delete fix)"`,
            { cwd: this.workingDir, stdio: 'pipe', env: mergeEnv }
          );
          console.log(`  ✅ Resolved modify/delete conflicts for ${branchName}`);
          return true;
        }
      } catch {
        // Manual resolution failed; fall through to abort
      }

      try { execSync('git merge --abort', { cwd: this.workingDir, stdio: 'pipe' }); } catch { /* none in progress */ }
      try { execSync(`git checkout "${context.mainBranch}"`, { cwd: this.workingDir, stdio: 'pipe', env: gitEnv }); } catch { /* best-effort */ }
      return false;
    }
  }

  private async mergeBranch(branchName: string, context: SwarmExecutionContext): Promise<void> {
    // acquire git lock
    const lockId = await context.contextBroker.acquireGitLock('orchestrator', `merge ${branchName}`);
    if (!lockId) {
      throw new Error('Failed to acquire git lock for merge');
    }

    try {
      execSync(`git merge --no-ff "${branchName}" -m "Merge ${branchName}"`, {
        cwd: this.workingDir,
        stdio: 'pipe',
        timeout: 120000, // 2 min -- integrator merges can be large
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_MERGE_AUTOEDIT: 'no'
        }
      });
    } catch (err: unknown) {
      const e = err as { killed?: boolean; stderr?: Buffer | string; message?: string };
      if (e.killed) {
        throw new Error(`Timeout merging ${branchName}`);
      }
      throw new Error(`Merge conflict: ${e.stderr?.toString() || e.message || 'unknown error'}`);
    } finally {
      context.contextBroker.releaseGitLock(lockId);
    }
  }

  /**
   * Get current git branch
   */
  private getCurrentBranch(): string {
    const result = execSync('git branch --show-current', {
      cwd: this.workingDir,
      encoding: 'utf8'
    });
    return result.trim() || 'main';
  }

  /**
   * Ensure repo has at least one commit (required for branch creation)
   * Creates an initial commit if repo is empty
   */
  private ensureInitialCommit(): void {
    // check if repo has any commits
    try {
      execSync('git rev-parse HEAD', {
        cwd: this.workingDir,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      // repo has commits, nothing to do
      return;
    } catch {
      // rev-parse fails when repo has no commits; fall through to create one
    }

    console.log('  📝 Empty repo detected, creating initial commit...');

    // create a minimal .gitignore so there's something to commit
    const gitignorePath = path.join(this.workingDir, '.gitignore');

    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, `# Swarm orchestrator artifacts
plans/
runs/
proof/
.quickfix/
.context/
.locks/
node_modules/
`);
    }

    try {
      execSync('git add .gitignore', { cwd: this.workingDir, stdio: 'pipe' });
      execSync('git commit -m "chore: initialize repository"', { cwd: this.workingDir, stdio: 'pipe' });
      console.log('  ✅ Initial commit created');
    } catch (err: unknown) {
      // if commit fails (maybe .gitignore already staged), try committing anything
      try {
        execSync('git add -A', { cwd: this.workingDir, stdio: 'pipe' });
        execSync('git commit --allow-empty -m "chore: initialize repository"', { cwd: this.workingDir, stdio: 'pipe' });
        console.log('  ✅ Initial commit created (empty)');
      } catch (innerErr: unknown) {
        const msg = innerErr instanceof Error ? innerErr.message : String(innerErr);
        console.warn(`[init] Could not create initial commit: ${msg}`);
      }
    }
  }

  private generateExecutionId(): string {
    return `swarm-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  }

  /**
   * Analyze commit quality and flag anti-patterns
   */
  private async analyzeCommitQuality(
    commits: any[],
    stepNumber: number,
    agentName: string,
    context: SwarmExecutionContext
  ): Promise<void> {
    if (commits.length === 0) return;

    const detector = new CommitPatternDetector();

    // Convert to CommitMessage format
    const commitMessages: CommitMessage[] = commits.map(c => ({
      hash: c.sha || 'unknown',
      message: c.message || '',
      timestamp: c.timestamp ? new Date(c.timestamp) : new Date(),
      files: c.files || []
    }));

    const result = detector.analyzeCommits(commitMessages);

    // Log analysis results if anti-patterns detected
    if (result.hasAntiPatterns) {
      console.log(`  ⚠️  Commit quality warnings for Step ${stepNumber} (${agentName}):`);
      console.log(`      Quality score: ${result.score}/100`);
      result.warnings.forEach(warning => {
        console.log(`      - ${warning}`);
      });

      // Get suggestions
      const suggestions = detector.getSuggestions(result);
      if (suggestions.length > 0) {
        console.log(`      Suggestions:`);
        suggestions.forEach(suggestion => {
          console.log(`        • ${suggestion}`);
        });
      }

      // Just log warnings - don't store in context (data type mismatch)
      // Meta-analyzer will detect commit quality issues from transcripts
    } else if (result.score >= 90) {
      // Acknowledge good commit practices
      console.log(`  ✨ Excellent commit quality: ${result.score}/100 (${commitMessages.length} commits)`);
    }
  }

  /**
   * Write .copilot-instructions.md to the repo root with boilerplate every agent needs.
   * Copilot CLI picks this up automatically, so per-step prompts stay minimal.
   */
  private writeSharedInstructions(): void {
    const instructionsPath = path.join(this.workingDir, '.copilot-instructions.md');
    // Only write if the file does not already exist (avoid overwriting user content)
    if (fs.existsSync(instructionsPath)) return;

    const content = [
      '# Swarm Agent Instructions',
      '',
      '## Parallel Execution Context',
      'You are running inside a git worktree on a dedicated branch. Do NOT run `git checkout`.',
      'Make incremental commits with natural, varied messages.',
      '',
      '## Quality Bar',
      '- Extract before repeat: if you copy the same logic more than twice, refactor into a shared util/hook/middleware.',
      '- Config first: do not hardcode API base URLs, timeouts, retry counts, or environment-specific values.',
      '- README truth: do not claim features that are not implemented.',
      '- Keep it verifiable: request logging, correlation id propagation, and consistent error responses for HTTP APIs.',
      '- For frontends: real HTML title, responsive meta viewport, centralized fetch error handling.',
      '',
      '## Code Comments',
      '- Add a 1-2 line purpose comment at the top of each new file.',
      '- Add brief inline comments for non-obvious logic (not every line).',
      '- Use natural, casual language.',
      '',
      '## Commit Messages',
      'Use varied, natural messages like:',
      '  "add user authentication module"',
      '  "fix: handle null case in parser"',
      '  "update config and deps"',
      '  "implement todo API with tests"',
      '',
    ].join('\n');

    fs.writeFileSync(instructionsPath, content, 'utf8');
  }

  /**
   * Run meta-analysis off the critical path. Fires asynchronously via setImmediate
   * so the scheduler can launch the next step without waiting for KB updates.
   */
  private runAsyncMetaAnalysis(
    context: SwarmExecutionContext,
    plan: ExecutionPlan,
    runDir: string,
    completedSteps: number[]
  ): void {
    if (!context.metaAnalyzer || !context.knowledgeBase) return;

    // Use the most recent completed step as the "wave" we are analyzing
    const waveIndex = completedSteps.length;

    try {
      const waveAnalysis = context.metaAnalyzer.analyzeWave(
        waveIndex,
        completedSteps,
        context.results,
        plan,
        context.executionId
      );

      context.waveAnalyses?.push(waveAnalysis);

      // Persist analysis snapshot
      const analysisPath = path.join(runDir, `analysis-batch-${waveIndex}.json`);
      fs.writeFileSync(analysisPath, JSON.stringify(waveAnalysis, null, 2), 'utf8');

      // Feed insights back into the knowledge base
      if (waveAnalysis.knowledgeUpdates.length > 0) {
        waveAnalysis.knowledgeUpdates.forEach(update => {
          context.knowledgeBase!.addOrUpdatePattern({
            category: update.category,
            insight: update.insight,
            confidence: update.confidence,
            evidence: [update.evidence],
            impact: update.confidence === 'high' ? 'high' : 'medium'
          });
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[analytics] Wave analysis failed (non-fatal): ${msg}`);
    }
  }

  /**
   * execute optional deployment for devops_pro when --confirm-deploy is set
   * captures preview URL and stores in context
   */
  private async executeOptionalDeployment(
    step: PlanStep,
    agent: AgentProfile,
    context: SwarmExecutionContext,
    options: { confirmDeploy?: boolean; enableExternal?: boolean; dryRun?: boolean }
  ): Promise<void> {
    console.log(`  🚀 Deploying preview (--confirm-deploy)...`);

    const toolManager = new ExternalToolManager({
      enableExternal: options.enableExternal || true,
      dryRun: options.dryRun || false,
      logFile: path.join(context.runDir, 'deployment-commands.log')
    });

    const deploymentManager = new DeploymentManager(toolManager, this.workingDir);

    try {
      const branchName = context.results.find(r => r.stepNumber === step.stepNumber)?.branchName || 'unknown';

      // tag HEAD before deploy for rollback safety
      let preDeployTag: string | undefined;
      try {
        preDeployTag = deploymentManager.tagPreDeploy(context.executionId);
        console.log(`  🏷️  Tagged: ${preDeployTag}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  [deploy] Could not tag pre-deploy (non-fatal): ${msg}`);
      }

      const deployResult = await deploymentManager.deployPreview(branchName);

      if (deployResult.success && deployResult.previewUrl) {
        console.log(`  ✅ Preview deployed: ${deployResult.previewUrl}`);

        // health check the preview URL
        const healthy = await deploymentManager.runHealthCheck(deployResult.previewUrl);
        if (!healthy && preDeployTag) {
          console.warn(`  ⚠️  Health check failed, rolling back...`);
          try {
            deploymentManager.rollbackToTag(preDeployTag);
          } catch (rollbackErr: unknown) {
            const msg = rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
            console.warn(`  ⚠️  Rollback failed: ${msg}`);
          }
          return;
        } else if (healthy) {
          console.log(`  ✅ Health check passed`);
        }

        // store deployment metadata
        const metadata: DeploymentMetadata = {
          stepNumber: step.stepNumber,
          agentName: agent.name,
          timestamp: new Date().toISOString(),
          platform: deployResult.platform,
          previewUrl: deployResult.previewUrl,
          branchName
        };

        deploymentManager.saveDeploymentMetadata(context.runDir, metadata);

        // add to context deployments
        if (!context.deployments) {
          context.deployments = [];
        }
        context.deployments.push(metadata);
      } else if (deployResult.platform === 'none') {
        console.log(`  ℹ️  No deployment platform detected (vercel/netlify), skipping`);
      } else {
        console.warn(`  ⚠️  Deployment failed: ${deployResult.error}`);
      }
    } catch (error: unknown) {
      const err = error as Error;
      console.warn(`  ⚠️  Deployment error: ${err.message}`);
    }
  }
}

export default SwarmOrchestrator;
