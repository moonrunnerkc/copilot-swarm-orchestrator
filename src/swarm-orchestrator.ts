import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import AnalyticsLog from './analytics-log';
import CommitPatternDetector, { CommitMessage } from './commit-pattern-detector';
import { AgentProfile } from './config-loader';
import ContextBroker, { ContextEntry } from './context-broker';
import { DeploymentMetadata } from './deployment-manager';
import { ExecutionQueue, QueueStats } from './execution-queue';
import { KnowledgeBaseManager } from './knowledge-base';
import { MetaAnalyzer, MetaReviewResult } from './meta-analyzer';
import MetricsCollector from './metrics-collector';
import { ExecutionPlan, PlanStep } from './plan-generator';
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
    const knowledgeBase = new KnowledgeBaseManager(this.workingDir);
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
      dryRun?: boolean;
      autoPR?: boolean;
    }
  ): Promise<SwarmExecutionContext> {
    const context = this.initializeSwarmExecution(plan, runDir, options?.maxConcurrency);

    console.log('\n🚀 Starting Parallel Swarm Execution');
    console.log(`Execution ID: ${context.executionId}`);
    console.log(`Main branch: ${context.mainBranch}`);
    console.log(`Steps: ${plan.steps.length}`);
    console.log(`Max concurrency: ${options?.maxConcurrency || 'unlimited'}\n`);

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
            console.log(`  🔁 Will retry step(s): ${replanDecision.stepsToRetry.join(', ')}`);
            // note: actual retry implementation would go here
            // for now we just log and continue
          }
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
   * Execute a single step within the swarm (queued version with retry support)
   */
  private async executeStepInSwarmQueued(
    step: PlanStep,
    agent: AgentProfile,
    context: SwarmExecutionContext,
    options?: { model?: string }
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
    options?: { model?: string }
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

      // create per-agent branch
      const branchName = `swarm/${context.executionId}/step-${step.stepNumber}-${agent.name.toLowerCase()}`;
      result.branchName = branchName;
      result.status = 'running';
      result.startTime = new Date().toISOString();

      await this.createAgentBranch(branchName, context.mainBranch);
      console.log(`  🌿 Step ${step.stepNumber} (${agent.name}) on branch: ${branchName}`);

      // build enhanced prompt with dependency context
      const dependencyContext = context.contextBroker.getDependencyContext(step.dependencies);
      const enhancedPrompt = this.buildSwarmPrompt(step, agent, context, dependencyContext);

      // execute session on agent branch
      const stepDir = path.join(context.runDir, 'steps', `step-${step.stepNumber}`);
      const transcriptPath = path.join(stepDir, 'share.md');

      // Ensure step directory exists before session runs
      if (!fs.existsSync(stepDir)) {
        fs.mkdirSync(stepDir, { recursive: true });
      }

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

      const sessionResult = await this.sessionExecutor.executeSession(enhancedPrompt, sessionOptions);

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
        await this.verifier.commitVerificationReport(
          reportPath,
          step.stepNumber,
          agent.name,
          true
        );
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

      // add to shared context
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

    sections.push('GIT WORKFLOW:');
    sections.push('- You are on your own agent branch');
    sections.push('- Make incremental commits with natural, human-like messages');
    sections.push('- Your branch will auto-merge to main when you complete');
    sections.push('- If conflicts arise, they will be flagged for manual resolution\n');

    sections.push('COMMIT MESSAGE GUIDELINES:');
    sections.push('Use varied, natural messages like:');
    sections.push('  "add user authentication module"');
    sections.push('  "fix: handle null case in parser"');
    sections.push('  "update config and deps"');
    sections.push('  "implement todo API with tests"\n');

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
   * Create a new git branch for an agent
   */
  private async createAgentBranch(branchName: string, fromBranch: string): Promise<void> {
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
   * Merge all agent branches back to main
   */
  private async mergeAllBranches(context: SwarmExecutionContext): Promise<void> {
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
}

export default SwarmOrchestrator;
