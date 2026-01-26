import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import AnalyticsLog from './analytics-log';
import CommitPatternDetector, { CommitMessage } from './commit-pattern-detector';
import { AgentProfile } from './config-loader';
import ContextBroker, { ContextEntry } from './context-broker';
import DeploymentManager, { DeploymentMetadata } from './deployment-manager';
import { ExecutionQueue, QueueStats } from './execution-queue';
import ExternalToolManager from './external-tool-manager';
import { KnowledgeBaseManager } from './knowledge-base';
import { MetaAnalyzer, MetaReviewResult } from './meta-analyzer';
import MetricsCollector from './metrics-collector';
import { ExecutionPlan, PlanStep, ReplanPayload } from './plan-generator';
import { load_quality_gates_config, run_quality_gates } from './quality-gates';
import SessionExecutor, { SessionOptions, SessionResult } from './session-executor';
import ShareParser from './share-parser';
import { Spinner } from './spinner';
import VerifierEngine, { VerificationResult } from './verifier-engine';
import { AdaptiveConcurrencyManager, WaveResizer } from './wave-resizer';

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
  };
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
    options?: {
      model?: string;
      maxConcurrency?: number;
      enableExternal?: boolean;
      confirmDeploy?: boolean;
      dryRun?: boolean;
      autoPR?: boolean;
      qualityGates?: boolean;
      qualityGatesConfigPath?: string;
      qualityGatesOutDir?: string;
    }
  ): Promise<SwarmExecutionContext> {
    const context = this.initializeSwarmExecution(plan, runDir, options?.maxConcurrency);
    context.agents = agents;
    context.qualityGatesTriggered = {
      duplicateRefactorAdded: false,
      readmeTruthAdded: false,
      scaffoldFixAdded: false,
      configFixAdded: false
    };

    console.log('\n🚀 Starting Parallel Swarm Execution');
    console.log(`Execution ID: ${context.executionId}`);
    console.log(`Main branch: ${context.mainBranch}`);
    console.log(`Steps: ${plan.steps.length}`);
    console.log(`Max concurrency: ${options?.maxConcurrency || 'unlimited'}`);
    if (options?.confirmDeploy) {
      console.log('⚠️  Deployment enabled (--confirm-deploy)');
    }
    console.log('');

    // build dependency graph
    const dependencyGraph = this.buildDependencyGraph(plan);

    // identify waves of parallel execution
    const executionWaves = this.identifyExecutionWaves(dependencyGraph);

    console.log(`Execution will proceed in ${executionWaves.length} wave(s)\n`);

    // execute each wave with queue and adaptive concurrency
    for (let waveIndex = 0; waveIndex < executionWaves.length; waveIndex++) {
      let wave = executionWaves[waveIndex];
      console.log(`\n📊 Wave ${waveIndex + 1}: ${wave.length} step(s) in parallel`);

      // Track wave start
      context.metricsCollector?.startWave(waveIndex + 1);

      // Check for pause before starting wave
      if (this.pauseRequested) {
        console.log('\n⏸️  Pause requested. Waiting for resume...');
        await this.waitForResume();
        console.log('\n▶️  Resuming execution...');
      }

      // adaptive wave resizing on large waves
      let subWaves: number[][] = [wave];
      if (wave.length > (options?.maxConcurrency || 3)) {
        const optimalChunk = context.waveResizer?.calculateOptimalChunkSize(
          wave.length,
          0, // track failures separately if needed
          context.executionQueue?.getStats() || { running: 0, queued: 0, completed: 0, failed: 0, maxConcurrency: 3 }
        ) || 3;

        if (optimalChunk < wave.length) {
          subWaves = context.waveResizer?.splitWave(wave, optimalChunk, 'concurrent_failures') || [wave];
          console.log(`  🔄 Wave split into ${subWaves.length} sub-wave(s) for stability`);
        }
      }

      // execute sub-waves sequentially
      for (let subWaveIndex = 0; subWaveIndex < subWaves.length; subWaveIndex++) {
        const subWave = subWaves[subWaveIndex];
        if (subWaves.length > 1) {
          console.log(`  📦 Sub-wave ${subWaveIndex + 1}/${subWaves.length}: ${subWave.length} step(s)`);
        }

        const wavePromises = subWave.map(stepNumber => {
          const step = plan.steps.find(s => s.stepNumber === stepNumber);
          const agent = agents.get(step!.agentName);

          if (!step || !agent) {
            throw new Error(`Step ${stepNumber} or agent not found`);
          }

          // enqueue with priority and retry
          return context.executionQueue!.enqueue(
            `step-${stepNumber}`,
            () => this.executeStepInSwarmQueued(step, agent, context, options),
            {
              priority: 100 - stepNumber, // earlier steps have higher priority
              maxRetries: 3,
              metadata: {
                stepNumber: step.stepNumber,
                agentName: agent.name,
                wave: waveIndex + 1
              }
            }
          );
        });

        // wait for all steps in sub-wave to complete
        const waveResults = await Promise.allSettled(wavePromises);

        // update queue stats
        context.queueStats = context.executionQueue!.getStats();

        // check for failures and adjust concurrency
        const failures = waveResults.filter(r => r.status === 'rejected');
        if (failures.length > 0) {
          console.error(`\n❌ Sub-wave ${subWaveIndex + 1} had ${failures.length} failure(s)`);
          failures.forEach((failure, idx) => {
            const reason = failure.status === 'rejected' ? failure.reason : 'unknown';
            const errorMsg = String(reason);
            console.error(`  - Step ${subWave[idx]}: ${errorMsg}`);

            // check if rate limit related
            const isRateLimit = /rate limit|quota|429|throttle/i.test(errorMsg);
            context.adaptiveConcurrency?.recordFailure(isRateLimit ? 'rate_limit' : 'error');
          });

          // adjust concurrency for next sub-wave
          const newLimit = context.adaptiveConcurrency?.getCurrentLimit() || 3;
          context.executionQueue?.setMaxConcurrency(newLimit);
          console.log(`  ⚙️  Adjusted concurrency to ${newLimit} based on failures`);
        } else {
          // record success
          subWave.forEach(() => context.adaptiveConcurrency?.recordSuccess());
        }
      }

      // wave timing summary
      const waveStepResults = context.results.filter(r => wave.includes(r.stepNumber));
      const completedInWave = waveStepResults.filter(r => r.status === 'completed');
      const failedInWave = waveStepResults.filter(r => r.status === 'failed');

      console.log(`\n📊 Wave ${waveIndex + 1} Summary:`);
      completedInWave.forEach(r => {
        const durationMs = r.startTime && r.endTime
          ? new Date(r.endTime).getTime() - new Date(r.startTime).getTime()
          : 0;
        const durationSec = Math.round(durationMs / 1000);
        console.log(`  ✅ ${r.agentName}:${r.stepNumber} (${durationSec}s)`);
      });
      failedInWave.forEach(r => {
        console.log(`  ❌ ${r.agentName}:${r.stepNumber} - ${r.error || 'unknown error'}`);
      });

      // post-wave meta-analysis
      if (context.metaAnalyzer && context.knowledgeBase) {
        console.log(`\n🔍 Analyzing wave ${waveIndex + 1} quality...`);

        const waveAnalysis = context.metaAnalyzer.analyzeWave(
          waveIndex,
          wave,
          context.results,
          plan,
          context.executionId
        );

        context.waveAnalyses?.push(waveAnalysis);

        // save analysis
        const analysisPath = path.join(runDir, `wave-${waveIndex + 1}-analysis.json`);
        fs.writeFileSync(analysisPath, JSON.stringify(waveAnalysis, null, 2), 'utf8');

        // update knowledge base
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
          console.log(`  📚 Updated knowledge base with ${waveAnalysis.knowledgeUpdates.length} insight(s)`);
        }

        // display analysis summary
        if (waveAnalysis.overallHealth === 'critical') {
          console.error(`  ⚠️  Wave health: CRITICAL - ${waveAnalysis.replanReason}`);
        } else if (waveAnalysis.overallHealth === 'degraded') {
          console.warn(`  ⚠️  Wave health: DEGRADED`);
        } else {
          console.log(`  ✅ Wave health: HEALTHY`);
        }

        if (waveAnalysis.detectedPatterns.length > 0) {
          console.log(`  🔍 Detected ${waveAnalysis.detectedPatterns.length} pattern(s):`);
          waveAnalysis.detectedPatterns.forEach(p => {
            const icon = p.type === 'anti-pattern' ? '❌' : p.type === 'good-pattern' ? '✅' : '⚠️';
            console.log(`    ${icon} ${p.pattern} (${p.severity} severity, ${p.occurrences} occurrence(s))`);
          });
        }

        // handle replan if needed
        if (waveAnalysis.replanNeeded) {
          console.error(`\n🔄 Replanning needed: ${waveAnalysis.replanReason}`);
          const replanDecision = context.metaAnalyzer.makeReplanDecision(
            waveAnalysis,
            plan,
            context.results.filter(r => r.status === 'completed').map(r => r.stepNumber)
          );

          if (replanDecision.stepsToRetry && replanDecision.stepsToRetry.length > 0) {
            console.log(`  🔁 Retrying step(s): ${replanDecision.stepsToRetry.join(', ')}`);

            // build replan payload
            const addSteps = replanDecision.newSteps?.map(s => ({
              agent: s.agentName,
              task: s.task,
              afterStep: s.dependencies[0]
            }));

            const replanPayload: ReplanPayload = {
              retrySteps: replanDecision.stepsToRetry,
              ...(addSteps && { addSteps })
            };

            // execute replan with retry branches
            await this.executeReplan(context, replanPayload, agents, options);
          }
        }
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

      const gatesConfig = load_quality_gates_config(this.workingDir, options?.qualityGatesConfigPath);
      let gatesResult = await run_quality_gates(this.workingDir, gatesConfig, gatesOut);

      if (!gatesResult.passed && gatesConfig.failOnIssues) {
        const failedIds = new Set(gatesResult.results.filter(r => r.status === 'fail').map(r => r.id));
        const agentMap = context.agents || agents;

        const canAutoFix = !!context.qualityGatesTriggered && (
          (failedIds.has('duplicate-blocks') && gatesConfig.autoAddRefactorStepOnDuplicateBlocks && !context.qualityGatesTriggered.duplicateRefactorAdded) ||
          (failedIds.has('readme-claims') && gatesConfig.autoAddReadmeTruthStepOnReadmeClaims && !context.qualityGatesTriggered.readmeTruthAdded) ||
          (failedIds.has('scaffold-defaults') && gatesConfig.autoAddScaffoldFixStepOnScaffoldDefaults && !context.qualityGatesTriggered.scaffoldFixAdded) ||
          (failedIds.has('hardcoded-config') && gatesConfig.autoAddConfigFixStepOnHardcodedConfig && !context.qualityGatesTriggered.configFixAdded)
        );

        if (canAutoFix) {
          const maxStep = Math.max(...context.plan.steps.map(s => s.stepNumber));
          const preferredAgent = agentMap.get('integrator_finalizer')
            ? 'integrator_finalizer'
            : agentMap.get('IntegratorFinalizer')
            ? 'IntegratorFinalizer'
            : context.plan.steps[context.plan.steps.length - 1]?.agentName || 'integrator_finalizer';

          const addSteps: Array<{ agent: string; task: string; afterStep?: number }> = [];

          if (failedIds.has('duplicate-blocks') && gatesConfig.autoAddRefactorStepOnDuplicateBlocks && context.qualityGatesTriggered && !context.qualityGatesTriggered.duplicateRefactorAdded) {
            context.qualityGatesTriggered.duplicateRefactorAdded = true;
            addSteps.push({
              agent: preferredAgent,
              task: 'Quality gates flagged repeated code blocks. Extract shared utilities/hooks/middleware and refactor duplicates away. Use the gate report as the source of truth. Re-run tests and ensure quality gates pass.',
              afterStep: maxStep
            });
          }

          if (failedIds.has('readme-claims') && gatesConfig.autoAddReadmeTruthStepOnReadmeClaims && context.qualityGatesTriggered && !context.qualityGatesTriggered.readmeTruthAdded) {
            context.qualityGatesTriggered.readmeTruthAdded = true;
            addSteps.push({
              agent: preferredAgent,
              task: 'Quality gates flagged README claims that are not backed by code. Either implement the missing features or downgrade/remove the claims. Use the gate report as the source of truth. Re-run tests and ensure quality gates pass.',
              afterStep: maxStep
            });
          }

          if (failedIds.has('scaffold-defaults') && gatesConfig.autoAddScaffoldFixStepOnScaffoldDefaults && context.qualityGatesTriggered && !context.qualityGatesTriggered.scaffoldFixAdded) {
            context.qualityGatesTriggered.scaffoldFixAdded = true;
            addSteps.push({
              agent: preferredAgent,
              task: 'Quality gates flagged scaffold defaults. Remove placeholder assets and generic scaffold README sections, and ensure HTML title/app metadata are meaningful. Use the gate report as the source of truth. Re-run tests and ensure quality gates pass.',
              afterStep: maxStep
            });
          }

          if (failedIds.has('hardcoded-config') && gatesConfig.autoAddConfigFixStepOnHardcodedConfig && context.qualityGatesTriggered && !context.qualityGatesTriggered.configFixAdded) {
            context.qualityGatesTriggered.configFixAdded = true;
            addSteps.push({
              agent: preferredAgent,
              task: 'Quality gates flagged hardcoded config values. Move API base URLs, ports, retry counts, timeouts, and environment-specific values into env/typed config. For Vite proxy targets, prefer import.meta.env with a safe default. Use the gate report as the source of truth. Re-run tests and ensure quality gates pass.',
              afterStep: maxStep
            });
          }

          if (addSteps.length > 0) {
            console.warn('⚠️  Final quality gates failed; attempting one remediation pass...');
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
    }

    // Record execution in knowledge base
    if (context.knowledgeBase) {
      const totalPatternsDetected = context.waveAnalyses?.reduce(
        (sum, analysis) => sum + analysis.detectedPatterns.length, 0
      ) || 0;
      context.knowledgeBase.recordRun(totalPatternsDetected);
    }

    // Auto-create PR if requested
    if (options?.autoPR) {
      console.log('\n📝 Creating PR...');
      try {
        const PRAutomation = require('./pr-automation').default;
        const ExternalToolManager = require('./external-tool-manager').default;
        const DeploymentManager = require('./deployment-manager').default;

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
   * execute replan: retry failed steps on new branches with suffix
   * preserves completed work, only re-runs what failed
   */
  private async executeReplan(
    context: SwarmExecutionContext,
    replanPayload: ReplanPayload,
    agents: Map<string, AgentProfile>,
    options?: {
      model?: string;
      confirmDeploy?: boolean;
      enableExternal?: boolean;
      dryRun?: boolean;
      qualityGates?: boolean;
      qualityGatesConfigPath?: string;
      qualityGatesOutDir?: string;
    }
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

    // execute retries for each failed step
    for (const stepNumber of replanPayload.retrySteps) {
      const step = context.plan.steps.find(s => s.stepNumber === stepNumber);
      if (!step) {
        console.warn(`  replan: step ${stepNumber} not found, skipping`);
        continue;
      }

      const agent = agents.get(step.agentName);
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

      console.log(`  🔁 Retrying step ${stepNumber} (${agent.name}) - attempt ${retryCount}`);

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

        // update step task to indicate retry
        const retryStep = { ...step, task: `[RETRY ${retryCount}] ${step.task}` };

        // execute retry
        await this.executeStepInSwarm(retryStep, agent, context, options);

        console.log(`  ✅ Retry ${retryCount} succeeded for step ${stepNumber}`);
      } catch (error: unknown) {
        const err = error as Error;
        console.error(`  ❌ Retry ${retryCount} failed for step ${stepNumber}: ${err.message}`);
      }
    }

    // append and execute any new steps
    if (replanPayload.addSteps && replanPayload.addSteps.length > 0) {
      const PlanGenerator = require('./plan-generator').PlanGenerator;
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

      for (const added of newSteps) {
        const agent = agents.get(added.agentName);
        if (!agent) {
          console.warn(`  replan: agent ${added.agentName} not found for step ${added.stepNumber}, skipping`);
          continue;
        }

        console.log(`  🧩 Executing added step ${added.stepNumber} (${agent.name})`);
        await this.executeStepInSwarm(added, agent, context, options);
      }
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
   * Execute a single step within the swarm (queued version with retry support)
   */
  private async executeStepInSwarmQueued(
    step: PlanStep,
    agent: AgentProfile,
    context: SwarmExecutionContext,
    options?: {
      model?: string;
      confirmDeploy?: boolean;
      enableExternal?: boolean;
      dryRun?: boolean;
      qualityGates?: boolean;
      qualityGatesConfigPath?: string;
      qualityGatesOutDir?: string;
    }
  ): Promise<void> {
    // delegate to original implementation
    return this.executeStepInSwarm(step, agent, context, options);
  }

  /**
   * Execute a single step within the swarm
   */
  private async executeStepInSwarm(
    step: PlanStep,
    agent: AgentProfile,
    context: SwarmExecutionContext,
    options?: {
      model?: string;
      confirmDeploy?: boolean;
      enableExternal?: boolean;
      dryRun?: boolean;
      qualityGates?: boolean;
      qualityGatesConfigPath?: string;
      qualityGatesOutDir?: string;
    }
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

      // Use git worktree so each agent has its own isolated working directory
      const worktreePath = await this.createAgentWorktree(branchName, context.mainBranch, context.runDir, step.stepNumber);
      console.log(`  🌿 Step ${step.stepNumber} (${agent.name}) on branch: ${branchName}`);

      // build enhanced prompt with dependency context
      const dependencyContext = context.contextBroker.getDependencyContext(step.dependencies);
      const enhancedPrompt = this.buildSwarmPrompt(step, agent, context, dependencyContext);

      // execute session on agent branch - IN THE WORKTREE DIRECTORY
      const stepDir = path.join(context.runDir, 'steps', `step-${step.stepNumber}`);
      const transcriptPath = path.join(stepDir, 'share.md');

      // Ensure step directory exists before session runs
      if (!fs.existsSync(stepDir)) {
        fs.mkdirSync(stepDir, { recursive: true });
      }

      // Create a session executor for this worktree
      const worktreeExecutor = new SessionExecutor(worktreePath);

      const sessionOptions: SessionOptions = {
        allowAllTools: true,
        shareToFile: transcriptPath,
        logPrefix: `[${agent.name}:${step.stepNumber}]`, // live console logging for parallelism proof
        ...(options?.model && { model: options.model })
      };

      // Print static header instead of animated spinner when live logging
      // This prevents spinner animation from interleaving with agent output
      console.log(`  🐝 Step ${step.stepNumber} (${agent.name}) — Agent working...`);
      console.log(`  ${'─'.repeat(60)}`);

      const sessionResult = await worktreeExecutor.executeSession(enhancedPrompt, sessionOptions);

      // Print completion with timing
      const durationSec = Math.round(sessionResult.duration / 1000);
      console.log(`  ${'─'.repeat(60)}`);
      console.log(`  ✅ Step ${step.stepNumber} (${agent.name}) complete (${durationSec}s)`);

      result.sessionResult = sessionResult;

      if (!sessionResult.success) {
        throw new Error(sessionResult.error || 'Session failed');
      }

      // Check if transcript was created, create fallback if not
      if (!fs.existsSync(transcriptPath)) {
        const fallbackContent = `# Copilot Session Transcript\n\nSession output:\n\`\`\`\n${sessionResult.output || 'No output captured'}\n\`\`\`\n`;
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
        }
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
            verificationPassed: verificationResult.passed
          }
        };
        context.contextBroker.addStepContext(contextEntry);

        await this.verifier.commitVerificationReport(
          reportPath,
          step.stepNumber,
          agent.name,
          true
        );

        // advisory per-step quality gates (can auto-add a follow-up step)
        if (options?.qualityGates === false) {
          // explicitly disabled
        } else if (options?.dryRun) {
          // skip gates in dry-run; no code changes expected
        } else {
          const agentMap = context.agents || new Map<string, AgentProfile>();
          const gatesConfig = load_quality_gates_config(this.workingDir, options?.qualityGatesConfigPath);
          const baseOut = options?.qualityGatesOutDir
            ? path.isAbsolute(options.qualityGatesOutDir)
              ? options.qualityGatesOutDir
              : path.join(context.runDir, options.qualityGatesOutDir)
            : path.join(context.runDir, 'quality-gates');
          const outDir = path.join(baseOut, `step-${step.stepNumber}`);
          const gatesResult = await run_quality_gates(this.workingDir, gatesConfig, outDir);

          const scaffold = gatesResult.results.find(r => r.id === 'scaffold-defaults');
          const dup = gatesResult.results.find(r => r.id === 'duplicate-blocks');
          const hardcoded = gatesResult.results.find(r => r.id === 'hardcoded-config');
          const readme = gatesResult.results.find(r => r.id === 'readme-claims');

          // auto-add refactor step once
          if (
            gatesConfig.autoAddRefactorStepOnDuplicateBlocks &&
            dup && dup.status === 'fail' &&
            context.qualityGatesTriggered &&
            !context.qualityGatesTriggered.duplicateRefactorAdded
          ) {
            const preferredAgent = agentMap.get('integrator_finalizer')
              ? 'integrator_finalizer'
              : agentMap.get('IntegratorFinalizer')
              ? 'IntegratorFinalizer'
              : agent.name;

            console.warn('  ⚠️  Duplicate blocks detected; scheduling refactor follow-up step');
            context.qualityGatesTriggered.duplicateRefactorAdded = true;

            await this.executeReplan(
              context,
              {
                retrySteps: [],
                addSteps: [
                  {
                    agent: preferredAgent,
                    task: 'Refactor duplicated code blocks into shared utilities/hooks/middleware. Use the latest quality gates report as the source of truth. After refactor: re-run project tests/lints if available and ensure quality gates pass.',
                    afterStep: step.stepNumber
                  }
                ]
              },
              agentMap,
              options
            );
          }

          // auto-add scaffold cleanup step once
          if (
            gatesConfig.autoAddScaffoldFixStepOnScaffoldDefaults &&
            scaffold && scaffold.status === 'fail' &&
            context.qualityGatesTriggered &&
            !context.qualityGatesTriggered.scaffoldFixAdded
          ) {
            const preferredAgent = agentMap.get('integrator_finalizer')
              ? 'integrator_finalizer'
              : agentMap.get('IntegratorFinalizer')
              ? 'IntegratorFinalizer'
              : agent.name;

            console.warn('  ⚠️  Scaffold defaults detected; scheduling cleanup follow-up step');
            context.qualityGatesTriggered.scaffoldFixAdded = true;

            await this.executeReplan(
              context,
              {
                retrySteps: [],
                addSteps: [
                  {
                    agent: preferredAgent,
                    task: 'Remove scaffold defaults and placeholders. Use the latest quality gates report as the source of truth. Replace generic scaffold README sections and update any default app metadata (HTML title, favicon, etc.). Re-run project tests/lints if available and ensure quality gates pass.',
                    afterStep: step.stepNumber
                  }
                ]
              },
              agentMap,
              options
            );
          }

          // auto-add config hardcode cleanup step once
          if (
            gatesConfig.autoAddConfigFixStepOnHardcodedConfig &&
            hardcoded && hardcoded.status === 'fail' &&
            context.qualityGatesTriggered &&
            !context.qualityGatesTriggered.configFixAdded
          ) {
            const preferredAgent = agentMap.get('integrator_finalizer')
              ? 'integrator_finalizer'
              : agentMap.get('IntegratorFinalizer')
              ? 'IntegratorFinalizer'
              : agent.name;

            console.warn('  ⚠️  Hardcoded config detected; scheduling config cleanup follow-up step');
            context.qualityGatesTriggered.configFixAdded = true;

            await this.executeReplan(
              context,
              {
                retrySteps: [],
                addSteps: [
                  {
                    agent: preferredAgent,
                    task: 'Remove hardcoded config values (API base URLs, ports, retry counts, timeouts, theme constants) and move them into env/typed config. For Vite proxy targets, prefer import.meta.env with a safe default. Use the latest quality gates report as the source of truth. Re-run tests and ensure quality gates pass.',
                    afterStep: step.stepNumber
                  }
                ]
              },
              agentMap,
              options
            );
          }

          // auto-add README truth step once
          if (
            gatesConfig.autoAddReadmeTruthStepOnReadmeClaims &&
            readme && readme.status === 'fail' &&
            context.qualityGatesTriggered &&
            !context.qualityGatesTriggered.readmeTruthAdded
          ) {
            const preferredAgent = agentMap.get('integrator_finalizer')
              ? 'integrator_finalizer'
              : agentMap.get('IntegratorFinalizer')
              ? 'IntegratorFinalizer'
              : agent.name;

            console.warn('  ⚠️  README claims mismatch detected; scheduling README truth follow-up step');
            context.qualityGatesTriggered.readmeTruthAdded = true;

            await this.executeReplan(
              context,
              {
                retrySteps: [],
                addSteps: [
                  {
                    agent: preferredAgent,
                    task: 'Make README claims strictly match implementation. If a feature is claimed but not implemented, either implement it or remove/downgrade the claim. Re-run quality gates after changes.',
                    afterStep: step.stepNumber
                  }
                ]
              },
              agentMap,
              options
            );
          }
        }

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

      console.log(`  ✅ Step ${step.stepNumber} (${agent.name}) completed and merged`);

    } catch (error: unknown) {
      const err = error as Error;
      result.status = 'failed';
      result.error = err.message;
      result.endTime = new Date().toISOString();

      console.error(`  ❌ Step ${step.stepNumber} (${agent.name}) failed: ${err.message}`);
      throw error;
    }
  }

  /**
   * Build enhanced prompt for swarm execution
   */
  private buildSwarmPrompt(
    step: PlanStep,
    agent: AgentProfile,
    context: SwarmExecutionContext,
    dependencyContext: string
  ): string {
    const sections: string[] = [];

    sections.push('=== COPILOT SWARM ORCHESTRATOR - Parallel Execution ===\n');
    sections.push(`Step ${step.stepNumber} of ${context.plan.steps.length}`);
    sections.push(`Agent: ${agent.name}`);
    sections.push(`Branch: swarm/${context.executionId}/step-${step.stepNumber}-${agent.name.toLowerCase()}`);
    sections.push(`Execution Mode: PARALLEL\n`);

    sections.push('YOUR TASK:');
    sections.push(step.task + '\n');

    sections.push('PARALLEL EXECUTION CONTEXT:');
    sections.push('You are running in parallel with other agents. Your changes are isolated');
    sections.push('on a dedicated branch and will be auto-merged when complete.\n');

    sections.push('DEPENDENCY CONTEXT:');
    sections.push(dependencyContext + '\n');

    sections.push('BRANCH STATUS: YOU ARE ALREADY ON YOUR CORRECT BRANCH');
    sections.push('-----------------------------------------------------');
    sections.push('Your working directory is a dedicated git worktree.');
    sections.push('You are ALREADY checked out to your assigned branch: ' + `swarm/.../${step.stepNumber}-${agent.name.toLowerCase()}`);
    sections.push('DO NOT run git checkout or switch branches - just start working.\n');

    sections.push('GIT WORKFLOW:');
    sections.push('- You are on your own agent branch (already checked out)');
    sections.push('- Make incremental commits with natural, human-like messages');
    sections.push('- Your branch will auto-merge to main when you complete');
    sections.push('- If conflicts arise, they will be flagged for manual resolution\n');

    sections.push('COMMIT MESSAGE GUIDELINES:');
    sections.push('Use varied, natural messages like:');
    sections.push('  "add user authentication module"');
    sections.push('  "fix: handle null case in parser"');
    sections.push('  "update config and deps"');
    sections.push('  "implement todo API with tests"\n');

    sections.push('QUALITY BAR (apply when relevant to your scope):');
    sections.push('- Extract-before-repeat: if you copy the same logic more than twice, refactor into a shared util/hook/middleware.');
    sections.push('- Config-first: do not hardcode API base URLs, timeouts, retry counts, or environment-specific values. Prefer env vars or a typed config module.');
    sections.push('- README truth: do not claim features that are not implemented. If unsure, downgrade the claim and list how to verify.');
    sections.push('- Keep it verifiable: request logging, correlation id propagation, and consistent error responses for HTTP APIs.');
    sections.push('- For frontends: real HTML title, responsive meta viewport, centralized fetch error handling (retry/backoff only if actually implemented).\n');

    sections.push('CODE COMMENTS (Required):');
    sections.push('- Add a 1-2 line purpose comment at the top of each new file');
    sections.push('- Add brief inline comments for non-obvious logic (not every line)');
    sections.push('- Use natural, casual language - avoid formal/robotic phrasing');
    sections.push('- Good: "// handles edge case when user submits empty form"');
    sections.push('- Bad: "// This function handles the edge case scenario wherein..."');
    sections.push('- For functions: brief docstring explaining purpose and params\n');

    sections.push('SCOPE: ' + agent.scope.join(', '));
    sections.push('BOUNDARIES: ' + agent.boundaries.join(', '));
    sections.push('\nDONE WHEN: ' + agent.done_definition.join(', '));

    sections.push('\n=== BEGIN PARALLEL WORK ===');

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
   * Each agent gets its own isolated working directory with its branch checked out
   */
  private async createAgentWorktree(
    branchName: string,
    fromBranch: string,
    runDir: string,
    stepNumber: number
  ): Promise<string> {
    const worktreePath = path.join(runDir, 'worktrees', `step-${stepNumber}`);

    // Ensure worktrees directory exists
    const worktreesDir = path.dirname(worktreePath);
    if (!fs.existsSync(worktreesDir)) {
      fs.mkdirSync(worktreesDir, { recursive: true });
    }

    // Create the branch first (without checkout)
    try {
      execSync(`git branch ${branchName} ${fromBranch}`, { cwd: this.workingDir, stdio: 'pipe' });
    } catch {
      // Branch might already exist from a retry, that's fine
    }

    // Create worktree with the branch
    return new Promise((resolve, reject) => {
      const proc = spawn('git', ['worktree', 'add', worktreePath, branchName], {
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
      // stash might fail if nothing to stash, that's fine
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

    for (const result of context.results) {
      if (result.status === 'completed' && result.branchName) {
        try {
          await this.mergeBranch(result.branchName, context);
          console.log(`  ✅ Merged ${result.branchName}`);
        } catch (error: unknown) {
          const err = error as Error;
          console.error(`  ⚠️  Conflict merging ${result.branchName}: ${err.message}`);
          console.error(`     Manual resolution required`);
        }
      }
    }
  }

  /**
   * Switch to a git branch
   */
  private async switchBranch(branchName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('git', ['checkout', branchName], {
        cwd: this.workingDir
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to switch to branch ${branchName}`));
        }
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

  private async mergeBranch(branchName: string, context: SwarmExecutionContext): Promise<void> {
    // acquire git lock
    const lockId = await context.contextBroker.acquireGitLock('orchestrator', `merge ${branchName}`);
    if (!lockId) {
      throw new Error('Failed to acquire git lock for merge');
    }

    try {
      return await new Promise((resolve, reject) => {
        const proc = spawn('git', ['merge', '--no-ff', branchName, '-m', `Merge ${branchName}`], {
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
            reject(new Error(`Merge conflict: ${stderr}`));
          }
        });
      });
    } finally {
      context.contextBroker.releaseGitLock(lockId);
    }
  }

  /**
   * Get current git branch
   */
  private getCurrentBranch(): string {
    const result = require('child_process').execSync('git branch --show-current', {
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
    const execSync = require('child_process').execSync;

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
      // no commits yet, create initial commit
    }

    console.log('  📝 Empty repo detected, creating initial commit...');

    // create a minimal .gitignore so there's something to commit
    const fs = require('fs');
    const path = require('path');
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
      } catch {
        // ignore if still fails
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
      const deployResult = await deploymentManager.deployPreview(branchName);

      if (deployResult.success && deployResult.previewUrl) {
        console.log(`  ✅ Preview deployed: ${deployResult.previewUrl}`);

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
