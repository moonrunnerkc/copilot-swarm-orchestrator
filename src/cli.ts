#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { ConfigLoader } from './config-loader';
import { DemoMode } from './demo-mode';
import { PlanGenerator } from './plan-generator';
import { PlanStorage } from './plan-storage';
import QuickFixMode from './quick-fix-mode';
import { SessionManager } from './session-manager';
import { StepRunner } from './step-runner';
import { SwarmOrchestrator } from './swarm-orchestrator';
import { ExecutionOptions } from './types';

function showUsage(): void {
  console.log(`
Copilot Swarm Orchestrator - Parallel AI Workflow Tool

Usage:
  swarm bootstrap <path(s)> "Goal"       Deep analysis and plan generation (multi-repo)
  swarm plan <goal>                      Generate intelligent plan
  swarm plan --copilot <goal>            Generate Copilot CLI prompt for planning
  swarm plan import <runid> <transcript> Parse plan from Copilot /share transcript
  swarm execute <planfile>               Execute a saved plan step-by-step
  swarm swarm <planfile>                 Execute plan in parallel swarm mode
  swarm run --goal "description"          Plan + execute in one step (convenience)
  swarm quick "task"                     Quick-fix mode for simple single-agent tasks
  swarm demo <scenario>                  Run pre-configured demo scenario
  swarm demo-fast                        Fast 2-step demo (alias for: swarm demo demo-fast)
  swarm demo list                        List available demo scenarios
  swarm gates [path]                     Run quality gates on a repo (default: cwd)
  swarm status <execid>                  Show execution status
  swarm dashboard <execid>               Show TUI dashboard for a run
  swarm web-dashboard [port]             Start web dashboard (default port: 3002)
  swarm templates                        List available plan templates
  swarm share import <runid> <step> <agent> <path>
                                         Import /share transcript for a step
  swarm share context <runid> <step>     Show prior context for a step
  swarm audit <session-id>               Generate Markdown audit report for a session
  swarm metrics <session-id>             Show metrics summary for a session
  swarm --help                           Show this help message

Flags:
  --delegate       Instruct agents to use /delegate for PR creation
  --mcp            Require MCP evidence from GitHub context in verification
  --model          Specify model for sessions (e.g., claude-sonnet-4.5)
  --no-dashboard   Disable live TUI dashboard during swarm execution
  --resume <id>    Resume a previously paused/failed swarm session
  --agent          Specify agent for quick-fix mode
  --skip-verify    Skip verification in quick-fix mode (faster)
  --confirm-deploy Enable opt-in deployment for DevOpsPro (vercel, netlify)
  --no-quality-gates Disable quality gates (swarm mode)
  --pm               Run PM agent plan review before swarm execution
  --governance       Enable critic review + governance pause before merge
  --strict-isolation Force per-task branch isolation, transcript-only context
  --lean             Enable Delta Context Engine (reuse prior KB patterns)
  --useInnerFleet    Prefix prompts with /fleet for parallel sub-agent dispatch
  --plan-cache       Skip planning when a cached plan template matches (>85% similar)
  --replay           Reuse prior transcript for identical steps (skip Copilot call)
  --quality-gates-config <path> Path to quality gates YAML (default: config/quality-gates.yaml)
  --quality-gates-out <dir>    Where to write gate reports (default: <runDir>/quality-gates)

Examples:
  # Quick demo (recommended for first-time users)
  swarm demo-fast

  # Full demo (12-18 min)
  swarm demo todo-app

  # Quick-fix mode for simple tasks
  swarm quick "fix typo in README"
  swarm quick "update version in package.json" --skip-verify

  # List available demos
  swarm demo list

  # Generate plan using intelligent fallback
  swarm plan "Build a REST API for user management"

  # Execute plan in parallel swarm mode
  swarm swarm plan.json

  # Execute with specific model
  swarm swarm plan.json --model claude-opus-4.5

  # Sequential execution (legacy mode)
  swarm execute plan.json --delegate --mcp

The swarm command:
  - Executes steps in parallel based on dependencies
  - Shows progress via structured console output (wave headers, per-step timing)
  - Verifies each step with evidence-based checks
  - Auto-rollback on verification failure
  - Preserves human-like git commit history
`);
}

async function runQualityGatesCli(args: string[]): Promise<void> {
  const { load_quality_gates_config, run_quality_gates } = require('./quality-gates');

  // optional positional: `swarm gates [path]` (must come before flags)
  const positional = args[0] && !args[0].startsWith('-') ? args[0] : undefined;
  const projectRoot = positional ? path.resolve(process.cwd(), positional) : process.cwd();

  const configIndex = args.indexOf('--quality-gates-config');
  const configPath = configIndex !== -1 && args[configIndex + 1] ? args[configIndex + 1] : undefined;

  const outIndex = args.indexOf('--quality-gates-out');
  const outDir = outIndex !== -1 && args[outIndex + 1]
    ? path.resolve(process.cwd(), args[outIndex + 1])
    : undefined;

  const config = load_quality_gates_config(projectRoot, configPath);
  const result = await run_quality_gates(projectRoot, config, outDir);

  // human-readable summary
  const icon = result.passed ? '✅' : '❌';
  console.log(`${icon} quality gates ${result.passed ? 'passed' : 'failed'} (${result.totalDurationMs}ms)`);
  for (const gate of result.results) {
    const g = gate.status === 'pass' ? '✅' : gate.status === 'skip' ? '⏭️' : '❌';
    console.log(`  ${g} ${gate.id}: ${gate.issues.length} issue(s)`);
  }

  if (!result.passed) {
    process.exit(1);
  }
}

function bootstrap(repoPaths: string[], goal: string): void {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  BOOTSTRAP MODE - Multi-Repo Analysis & Planning                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  const BootstrapOrchestrator = require('./bootstrap-orchestrator').default;
  const PlanStorage = require('./plan-storage').PlanStorage;

  const orchestrator = new BootstrapOrchestrator();
  const storage = new PlanStorage();

  // Create run directory
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const goalSlug = goal.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30);
  const runId = `bootstrap-${timestamp}-${goalSlug}`;
  const runDir = path.join(process.cwd(), 'runs', runId);

  orchestrator.bootstrap(repoPaths, goal, runDir)
    .then(({ evidencePath, plan }: any) => {
      // Save plan
      const planPath = storage.savePlan(plan, runId);

      console.log('📋 Bootstrap Results:');
      console.log(`  Evidence: ${evidencePath}`);
      console.log(`  Plan: ${planPath}`);
      console.log(`  Run ID: ${runId}`);
      console.log();
      console.log('Next steps:');
      console.log(`  1. Review the evidence: cat ${evidencePath}`);
      console.log(`  2. Execute the plan: swarm swarm ${planPath}`);
    })
    .catch((error: Error) => {
      console.error('Bootstrap failed:', error.message);
      process.exit(1);
    });
}

function generatePlan(goal: string, copilotMode: boolean = false, opts?: { planCache?: boolean }): void {
  const configLoader = new ConfigLoader();
  const agents = configLoader.loadAllAgents();
  const generator = new PlanGenerator(agents);

  if (copilotMode) {
    // generate Copilot CLI prompt for planning
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║  COPILOT CLI PLANNING MODE                                           ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝\n');
    console.log('📋 Goal:', goal, '\n');
    console.log('Instructions:');
    console.log('  1. Copy the prompt below');
    console.log('  2. Start a new Copilot CLI session: gh copilot');
    console.log('  3. Paste the prompt and press Enter');
    console.log('  4. When Copilot responds with JSON, run: /share');
    console.log('  5. Save the /share transcript to a file');
    console.log('  6. Import the plan: swarm plan import <runid> <transcript-path>\n');
    console.log('═'.repeat(70));
    console.log('PROMPT (copy from next line until the marker):');
    console.log('═'.repeat(70));
    console.log();

    const prompt = generator.generateCopilotPlanningPrompt(goal);
    console.log(prompt);

    console.log();
    console.log('═'.repeat(70));
    console.log('END OF PROMPT');
    console.log('═'.repeat(70));
    console.log();
    return;
  }

  // intelligent fallback plan generation
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  INTELLIGENT PLAN GENERATION (Fallback Mode)                        ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');
  console.log('📋 Goal:', goal, '\n');
  console.log('💡 Tip: Use --copilot for Copilot CLI-generated plans\n');

  console.log(`Loaded ${agents.length} agent profiles:`);
  agents.forEach(agent => {
    console.log(`  ✓ ${agent.name}: ${agent.purpose}`);
  });
  console.log();

  // generate intelligent plan based on goal analysis
  const plan = generator.createPlan(goal, undefined, opts?.planCache ? { planCache: true } : undefined);

  // display plan
  console.log('Generated Execution Plan:');
  console.log('═'.repeat(70));
  console.log();

  plan.steps.forEach(step => {
    console.log(`Step ${step.stepNumber}: ${step.task}`);
    console.log(`  👤 Agent: ${step.agentName}`);
    if (step.dependencies.length > 0) {
      console.log(`  🔗 Dependencies: Steps ${step.dependencies.join(', ')}`);
    }
    console.log(`  📦 Expected outputs:`);
    step.expectedOutputs.forEach(output => {
      console.log(`     • ${output}`);
    });
    console.log();
  });

  // get execution order
  const executionOrder = generator.getExecutionOrder(plan);
  console.log(`🔄 Execution Order: ${executionOrder.join(' → ')}\n`);

  // save plan
  const storage = new PlanStorage();
  const planPath = storage.savePlan(plan);
  console.log(`✅ Plan saved to: ${planPath}`);
  console.log(`\n▶  To execute: swarm swarm ${path.basename(planPath)}\n`);
}

function importPlanFromTranscript(runId: string, transcriptPath: string): void {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  IMPORT COPILOT-GENERATED PLAN                                       ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  console.log('📁 Transcript:', transcriptPath);
  console.log('🆔 Run ID:', runId);
  console.log();

  try {
    const fs = require('fs');

    if (!fs.existsSync(transcriptPath)) {
      throw new Error(`Transcript file not found: ${transcriptPath}`);
    }

    const transcriptContent = fs.readFileSync(transcriptPath, 'utf-8');

    const configLoader = new ConfigLoader();
    const agents = configLoader.loadAllAgents();
    const generator = new PlanGenerator(agents);

    console.log('🔍 Parsing transcript for JSON plan...');
    const plan = generator.parseCopilotPlanFromTranscript(transcriptContent);

    console.log('✅ Plan parsed successfully!\n');
    console.log('Plan details:');
    console.log(`  Goal: ${plan.goal}`);
    console.log(`  Steps: ${plan.steps.length}`);
    console.log(`  Created: ${plan.createdAt}\n`);

    // display steps
    console.log('Steps:');
    console.log('═'.repeat(70));
    plan.steps.forEach(step => {
      console.log(`\nStep ${step.stepNumber}: ${step.task}`);
      console.log(`  👤 Agent: ${step.agentName}`);
      if (step.dependencies.length > 0) {
        console.log(`  🔗 Dependencies: ${step.dependencies.join(', ')}`);
      }
      console.log(`  📦 Outputs: ${step.expectedOutputs.join(', ')}`);
    });
    console.log('\n' + '═'.repeat(70));

    // validate execution order
    const executionOrder = generator.getExecutionOrder(plan);
    console.log(`\n🔄 Execution Order: ${executionOrder.join(' → ')}`);

    // save plan
    const storage = new PlanStorage();
    const planPath = storage.savePlan(plan);
    console.log(`\n✅ Plan saved to: ${planPath}`);
    console.log(`\n▶  To execute: swarm swarm ${path.basename(planPath)}\n`);

  } catch (error) {
    console.error('\n❌ Error importing plan:');
    console.error('  ', error instanceof Error ? error.message : String(error));
    console.error('\nTroubleshooting:');
    console.error('  • Ensure the transcript contains valid JSON output from Copilot');
    console.error('  • The JSON must match the ExecutionPlan schema');
    console.error('  • Check that all agent names are valid');
    console.error('  • Ensure dependencies form a valid DAG (no cycles)\n');
    process.exit(1);
  }
}

function executePlan(planFilename: string, options?: ExecutionOptions): void {
  console.log('Copilot Swarm Orchestrator - Plan Execution\n');

  // Load plan
  const storage = new PlanStorage();
  const plan = storage.loadPlan(planFilename);

  console.log(`Plan: ${plan.goal}`);
  console.log(`Steps: ${plan.steps.length}`);

  if (options?.delegate || options?.mcp) {
    console.log('\nGitHub Integration:');
    if (options.delegate) console.log('  ✓ /delegate enabled - agents will be instructed to create PRs');
    if (options.mcp) console.log('  ✓ MCP required - agents must provide GitHub context evidence');
  }
  console.log('');

  // Load agents
  const configLoader = new ConfigLoader();
  const agents = configLoader.loadAllAgents();

  // Initialize execution
  const runner = new StepRunner();
  const context = runner.initializeExecution(plan, planFilename, options);

  console.log(`Execution ID: ${context.executionId}\n`);

  // Get execution order
  const generator = new PlanGenerator(agents);
  const executionOrder = generator.getExecutionOrder(plan);

  console.log(`Execution Order: ${executionOrder.join(' → ')}\n`);
  console.log('='.repeat(70));
  console.log('SEQUENTIAL EXECUTION GUIDE');
  console.log('='.repeat(70));
  console.log('');
  console.log('This tool will guide you through each step of the plan.');
  console.log('For each step, you will:');
  console.log('  1. Receive a session prompt to copy/paste into Copilot CLI');
  console.log('  2. Complete the work in that Copilot session');
  console.log('  3. Run /share to capture the transcript');
  console.log('  4. Save the transcript to the specified proof file');
  console.log('  5. Return here to mark the step complete and get the next step');
  console.log('');
  console.log('Press ENTER to begin with Step 1...');
  console.log('');

  // Display first step instructions
  const firstStepNumber = executionOrder[0];
  if (firstStepNumber === undefined) {
    console.error('No steps to execute');
    process.exit(1);
  }

  const firstStep = plan.steps.find(s => s.stepNumber === firstStepNumber);
  if (!firstStep) {
    console.error(`Step ${firstStepNumber} not found in plan`);
    process.exit(1);
  }

  const agent = agents.find(a => a.name === firstStep.agentName);
  if (!agent) {
    console.error(`Agent ${firstStep.agentName} not found`);
    process.exit(1);
  }

  runner.displayStepInstructions(firstStep, agent, context);

  // Save execution context
  const contextPath = runner.saveExecutionContext(context);
  console.log(`\n✓ Execution context saved to: ${contextPath}`);
  console.log(`\nTo continue execution after completing this step, run:`);
  console.log(`  swarm status ${context.executionId}\n`);
}

async function executeSwarm(
  planFilename: string,
  options?: {
    model?: string; noDashboard?: boolean; confirmDeploy?: boolean;
    noQualityGates?: boolean; pm?: boolean; governance?: boolean;
    strictIsolation?: boolean; lean?: boolean; useInnerFleet?: boolean;
    session?: string;
  }
): Promise<void> {
  console.log('🐝 Copilot Swarm Orchestrator - Parallel Execution\n');

  // Load plan
  const storage = new PlanStorage();
  let plan = storage.loadPlan(planFilename);

  console.log(`Goal: ${plan.goal}`);
  console.log(`Total Steps: ${plan.steps.length}\n`);

  // Load agents
  const configLoader = new ConfigLoader();
  const agents = configLoader.loadAllAgents();

  // Create agent map
  const agentMap = new Map(agents.map(a => [a.name, a]));

  // PM agent review (optional, activated with --pm)
  if (options?.pm) {
    const { PMAgent } = require('./pm-agent');
    const pmAgent = new PMAgent(agents);
    console.log('📋 PM Agent: Reviewing plan...');
    const pmResult = pmAgent.reviewPlan(plan);

    if (pmResult.reviewNotes.length > 0) {
      console.log('  Review notes:');
      pmResult.reviewNotes.forEach((note: string) => console.log(`    - ${note}`));
    }
    if (pmResult.changesApplied.length > 0) {
      console.log('  Changes applied:');
      pmResult.changesApplied.forEach((change: string) => console.log(`    - ${change}`));
    }
    if (pmResult.reviewNotes.length === 0 && pmResult.changesApplied.length === 0) {
      console.log('  Plan approved with no issues.');
    }

    plan = pmResult.revisedPlan;
    console.log('');
  }

  // Initialize orchestrator
  const orchestrator = new SwarmOrchestrator();

  // Create run directory
  const runId = `swarm-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const runDir = path.join(process.cwd(), 'runs', runId);

  console.log(`Run ID: ${runId}`);
  console.log(`Run Directory: ${runDir}\n`);

  // Dashboard: attempt dynamic import of Ink-based dashboard (ESM module)
  // Ink 4+ is ESM-only and cannot be require()'d from CommonJS.
  // Using dynamic import() as a bridge.
  let dashboard: { update: (updates: any) => void; stop: () => void } | undefined;
  if (!options?.noDashboard) {
    try {
      const dashboardModule = await import('./dashboard');
      const startDashboard = dashboardModule.startDashboard;
      const result = await startDashboard({
        executionId: runId,
        goal: plan.goal,
        totalSteps: plan.steps.length,
        currentWave: 0,
        totalWaves: 0,
        results: [],
        recentCommits: [],
        prLinks: [],
        startTime: new Date().toISOString()
      });
      if (result) {
        dashboard = result;
        console.log('📊 Live TUI dashboard started\n');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('raw mode') || msg.includes('setRawMode')) {
        console.log('ℹ️  TUI dashboard unavailable (terminal does not support raw mode); continuing without dashboard\n');
      } else {
        console.log('ℹ️  Live dashboard unavailable (Ink ESM import failed); continuing without dashboard\n');
      }
    }
  } else {
    console.log('ℹ️  Dashboard disabled via --no-dashboard\n');
  }

  try {
    // Execute swarm - build options with all upgrade flags
    const swarmOptions: {
      model?: string;
      confirmDeploy?: boolean;
      qualityGates?: boolean;
      governance?: boolean;
      strictIsolation?: boolean;
      lean?: boolean;
      useInnerFleet?: boolean;
      onProgress?: (ctx: any, event: string) => void;
    } = {};
    if (options?.model) swarmOptions.model = options.model;
    if (options?.confirmDeploy) swarmOptions.confirmDeploy = true;
    if (options?.noQualityGates) swarmOptions.qualityGates = false;
    if (options?.governance) swarmOptions.governance = true;
    if (options?.strictIsolation) swarmOptions.strictIsolation = true;
    if (options?.lean) swarmOptions.lean = true;
    if (options?.useInnerFleet) swarmOptions.useInnerFleet = true;

    // Wire real-time progress into the TUI dashboard
    if (dashboard) {
      swarmOptions.onProgress = (ctx, event) => {
        // Parse the wave number from wave events
        const waveMatch = event.match(/^wave-(?:start|done):(\d+)/);
        const currentWave = waveMatch ? parseInt(waveMatch[1], 10) : undefined;

        // Read live queue stats directly from the queue, not from the stale snapshot
        const liveQueueStats = ctx.executionQueue?.getStats?.() || ctx.queueStats;

        dashboard!.update({
          results: ctx.results,
          ...(currentWave !== undefined && { currentWave }),
          ...(ctx.totalWaves && { totalWaves: ctx.totalWaves }),
          ...(ctx.criticResults && { criticResults: ctx.criticResults }),
          ...(ctx.leanSavedRequests && { leanSavedRequests: ctx.leanSavedRequests }),
          ...(liveQueueStats && { queueStats: liveQueueStats }),
        });
      };
    }

    const context = await orchestrator.executeSwarm(plan, agentMap, runDir, swarmOptions);

    // Final dashboard update
    if (dashboard) {
      dashboard.update({
        currentWave: context.results.filter(r => r.status === 'completed').length,
        results: context.results
      });

      // Wait a moment for user to see final state
      await new Promise(resolve => setTimeout(resolve, 2000));
      dashboard.stop();
    }

    // Summary
    const completed = context.results.filter(r => r.status === 'completed').length;
    const failed = context.results.filter(r => r.status === 'failed').length;

    console.log('\n' + '═'.repeat(60));
    console.log('  SWARM EXECUTION COMPLETE');
    console.log('═'.repeat(60));
    console.log(`\n  ✅ Completed: ${completed}/${plan.steps.length}`);

    if (failed > 0) {
      console.log(`  ❌ Failed: ${failed}/${plan.steps.length}`);
      console.log('\n  Failed steps:');
      context.results
        .filter(r => r.status === 'failed')
        .forEach(r => {
          console.log(`    - Step ${r.stepNumber} (${r.agentName}): ${r.error}`);
        });
    }

    // Calculate total execution time from first start to last end
    const starts = context.results.filter(r => r.startTime).map(r => new Date(r.startTime!).getTime());
    const ends = context.results.filter(r => r.endTime).map(r => new Date(r.endTime!).getTime());
    if (starts.length > 0 && ends.length > 0) {
      const totalSec = Math.round((Math.max(...ends) - Math.min(...starts)) / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      console.log(`  ⏱  Total time: ${min > 0 ? `${min}m ${sec}s` : `${sec}s`}`);
    }

    console.log(`\n  📁 Results: ${runDir}`);
    console.log(`  📊 Reports: ${runDir}/verification/`);
    console.log('═'.repeat(60));

    if (completed === plan.steps.length) {
      console.log('\n🎉 All steps completed successfully!');
      console.log('   Review the git log to see the natural commit history:');
      console.log('   git log --oneline -20\n');
    }

  } catch (error) {
    if (dashboard) {
      dashboard.stop();
    }
    throw error;
  }
}

async function runDemo(scenarioName: string): Promise<void> {
  console.log('🐝 Copilot Swarm Orchestrator - Demo Mode\n');

  const demoMode = new DemoMode();
  const scenario = demoMode.getScenario(scenarioName);

  // Create a temp folder for the demo so we don't pollute the orchestrator repo
  const os = require('os');
  const demoDir = fs.mkdtempSync(path.join(os.tmpdir(), `swarm-demo-${scenarioName}-`));
  console.log(`📂 Demo folder: ${demoDir}\n`);

  // Initialize git in the temp folder (required for branch operations)
  const { execSync } = require('child_process');
  execSync('git init', { cwd: demoDir, stdio: 'pipe' });
  execSync('git config user.email "demo@swarm.local"', { cwd: demoDir, stdio: 'pipe' });
  execSync('git config user.name "Swarm Demo"', { cwd: demoDir, stdio: 'pipe' });
  // Create an initial commit so branches can be created
  fs.writeFileSync(path.join(demoDir, 'README.md'), `# Swarm Demo: ${scenarioName}\n`);
  execSync('git add . && git commit -m "init demo"', { cwd: demoDir, stdio: 'pipe' });

  // Change to demo directory
  process.chdir(demoDir);

  if (!scenario) {
    console.error(`❌ Demo scenario "${scenarioName}" not found\n`);
    console.log('Available scenarios:');
    demoMode.getAvailableScenarios().forEach(s => {
      console.log(`  - ${s.name}: ${s.description}`);
    });
    console.log('\nRun: swarm demo list\n');
    process.exit(1);
  }

  console.log(`📋 Scenario: ${scenario.name}`);
  console.log(`Description: ${scenario.description}`);
  console.log(`Estimated Duration: ${scenario.expectedDuration}`);
  console.log(`Steps: ${scenario.steps.length}\n`);

  console.log('This demo will:');
  console.log('  1. Execute all steps in parallel based on dependencies');
  console.log('  2. Show progress via structured console output');
  console.log('  3. Verify each step with evidence-based checks');
  console.log('  4. Demonstrate human-like git commit history\n');

  console.log('ℹ️  NOTE: This will execute real Copilot CLI sessions.');
  console.log(`    Running in temp folder: ${process.cwd()}\n`);

  // Convert scenario to plan
  const plan = demoMode.scenarioToPlan(scenario);

  // Save plan
  const storage = new PlanStorage();
  const planPath = storage.savePlan(plan);

  console.log(`✅ Demo plan saved to: ${planPath}\n`);

  // Execute in swarm mode with quality gates disabled to keep within time estimate
  // (demos are meant to be quick showcases, not production runs)
  // Forward any CLI flags the user passed (--pm, --governance, --lean, etc.)
  const execOpts: Record<string, any> = { noQualityGates: true };
  const cliArgs = process.argv.slice(2);
  if (cliArgs.includes('--pm')) execOpts.pm = true;
  if (cliArgs.includes('--governance')) execOpts.governance = true;
  if (cliArgs.includes('--strict-isolation')) execOpts.strictIsolation = true;
  if (cliArgs.includes('--lean')) execOpts.lean = true;
  if (cliArgs.includes('--no-dashboard')) execOpts.noDashboard = true;
  await executeSwarm(path.basename(planPath), execOpts);

  // Post-demo: install dependencies so demo is runnable out of the box
  await installDemoDependencies(demoDir);
}

/**
 * Install npm dependencies for all package.json files in demo output
 * Makes the demo runnable immediately after completion
 */
async function installDemoDependencies(demoDir: string): Promise<void> {
  const { execSync } = require('child_process');

  console.log('\n📦 Installing dependencies for demo output...\n');

  // Find all package.json files (root and subdirectories)
  const packageJsonPaths: string[] = [];

  function findPackageJsons(dir: string, depth: number = 0): void {
    if (depth > 3) return; // Limit depth to avoid node_modules

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'runs') continue;

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          findPackageJsons(fullPath, depth + 1);
        } else if (entry.name === 'package.json') {
          packageJsonPaths.push(dir);
        }
      }
    } catch {
      // Ignore permission errors
    }
  }

  findPackageJsons(demoDir);

  if (packageJsonPaths.length === 0) {
    console.log('  No package.json files found, skipping dependency install.\n');
    return;
  }

  // Sort by path length (install root first, then subdirs)
  packageJsonPaths.sort((a, b) => a.length - b.length);

  let successCount = 0;
  let failCount = 0;

  for (const pkgDir of packageJsonPaths) {
    const relativePath = path.relative(demoDir, pkgDir) || '.';
    try {
      console.log(`  📂 ${relativePath}/`);
      execSync('npm install --loglevel=error', {
        cwd: pkgDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 120000 // 2 minute timeout per install
      });
      console.log(`     ✅ Dependencies installed\n`);
      successCount++;
    } catch (error) {
      console.log(`     ⚠️  npm install failed (run manually)\n`);
      failCount++;
    }
  }

  console.log('━'.repeat(60));
  if (failCount === 0) {
    console.log(`✅ All dependencies installed (${successCount} location${successCount > 1 ? 's' : ''})`);
  } else {
    console.log(`⚠️  Installed ${successCount}/${packageJsonPaths.length} - some may need manual install`);
  }

  // Print run instructions
  console.log('\n🚀 To run the demo:\n');
  console.log(`   cd ${demoDir}`);

  // Check for common scripts and provide tailored instructions
  const rootPkgPath = path.join(demoDir, 'package.json');
  if (fs.existsSync(rootPkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
      if (pkg.scripts?.['start:server']) {
        console.log('   npm run start:server   # Start backend');
      } else if (pkg.scripts?.start) {
        console.log('   npm start              # Start server');
      }
      if (pkg.scripts?.dev) {
        console.log('   npm run dev            # Start dev server');
      }
      if (pkg.scripts?.test) {
        console.log('   npm test               # Run tests');
      }
    } catch {
      // Fallback to generic
      console.log('   npm start');
    }
  }

  // Check for frontend subdirectory
  const frontendPkgPath = path.join(demoDir, 'frontend', 'package.json');
  if (fs.existsSync(frontendPkgPath)) {
    console.log('\n   # Frontend (in separate terminal):');
    console.log('   cd frontend && npm run dev');
  }

  console.log('');
}

function showStatus(executionId: string): void {
  console.log('Copilot Swarm Orchestrator - Execution Status\n');

  const runner = new StepRunner();

  // Try legacy sequential execution context first
  try {
    const context = runner.loadExecutionContext(executionId);
    const summary = runner.generateSummary(context);

    console.log(summary);

    const nextStep = context.stepResults.find(r => r.status === 'pending');
    if (nextStep) {
      console.log(`\nNext step: ${nextStep.stepNumber} (${nextStep.agentName})`);
      console.log('Run execution command again to see instructions for this step.');
    } else {
      const allCompleted = context.stepResults.every(r => r.status === 'completed');
      if (allCompleted) {
        console.log('\n✓ All steps completed!');
      } else {
        console.log('\n⚠ Some steps failed or were skipped');
      }
    }
    return;
  } catch {
    // Not a sequential execution -- try swarm session state
  }

  // Fall back to swarm session-state.json
  const MetricsCollectorClass = require('./metrics-collector').default;
  const collector = new MetricsCollectorClass(executionId, '');
  const state = collector.loadSession(executionId);
  if (state) {
    const completed = state.lastCompletedStep;
    const total = state.graph.steps.length;
    console.log(`  Session:    ${state.sessionId}`);
    console.log(`  Status:     ${state.status}`);
    console.log(`  Progress:   ${completed}/${total} steps completed`);
    console.log(`  Branches:   ${Object.keys(state.branchMap).length}`);
    console.log(`  Transcripts:${Object.keys(state.transcripts).length}`);
    if (state.status === 'completed') {
      console.log('\n✓ All steps completed!');
    } else if (state.status === 'failed') {
      console.log('\n⚠ Execution failed. Use --resume to retry.');
    } else {
      console.log(`\n⏳ ${state.status} at step ${completed + 1}`);
    }
    return;
  }

  console.error(`Execution not found: ${executionId}`);
  console.error('Checked both proof/ (sequential) and runs/ (swarm) directories.');
  process.exit(1);
}

function importShare(runId: string, stepNumber: string, agentName: string, transcriptPath: string): void {
  console.log('Copilot Swarm Orchestrator - Import /share Transcript\n');

  const step = parseInt(stepNumber, 10);
  if (isNaN(step)) {
    console.error('Error: Step number must be a number');
    process.exit(1);
  }

  const manager = new SessionManager();

  try {
    const stepShare = manager.importShare(runId, step, agentName, transcriptPath);

    console.log(`✓ Imported /share transcript for step ${step}`);
    console.log(`  Agent: ${agentName}`);
    console.log(`  Run: ${runId}`);
    console.log(`  Saved to: ${stepShare.transcriptPath}\n`);

    console.log('Extracted Index:');
    console.log('===============');

    if (stepShare.index.changedFiles.length > 0) {
      console.log(`\nChanged Files (${stepShare.index.changedFiles.length}):`);
      stepShare.index.changedFiles.forEach(file => console.log(`  - ${file}`));
    }

    if (stepShare.index.commandsExecuted.length > 0) {
      console.log(`\nCommands Executed (${stepShare.index.commandsExecuted.length}):`);
      stepShare.index.commandsExecuted.forEach(cmd => console.log(`  $ ${cmd}`));
    }

    if (stepShare.index.testsRun.length > 0) {
      console.log(`\nTests Run:`);
      stepShare.index.testsRun.forEach(test => {
        const status = test.verified ? '✓' : '✗';
        console.log(`  ${status} ${test.command}`);
        if (!test.verified && test.reason) {
          console.log(`    reason: ${test.reason}`);
        }
      });
    }

    if (stepShare.index.prLinks.length > 0) {
      console.log(`\nPR Links:`);
      stepShare.index.prLinks.forEach(link => console.log(`  - ${link}`));
    }

    if (stepShare.index.claims.length > 0) {
      console.log(`\nClaims Verification:`);
      stepShare.index.claims.forEach(claim => {
        const status = claim.verified ? '✓' : '⚠';
        console.log(`  ${status} ${claim.claim.substring(0, 80)}`);
        if (claim.evidence) {
          console.log(`    evidence: ${claim.evidence}`);
        }
      });
    }

    // show unverified warnings
    const unverified = stepShare.index.claims.filter(c => !c.verified);
    if (unverified.length > 0) {
      console.log(`\n⚠ WARNING: ${unverified.length} unverified claims detected`);
      console.log('this step may require manual review before proceeding\n');
    } else {
      console.log('\n✓ All claims verified\n');
    }

  } catch (error) {
    console.error('Error importing share:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

function showShareContext(runId: string, stepNumber: string): void {
  console.log('Copilot Swarm Orchestrator - Prior Context\n');

  const step = parseInt(stepNumber, 10);
  if (isNaN(step)) {
    console.error('Error: Step number must be a number');
    process.exit(1);
  }

  const manager = new SessionManager();

  try {
    const summary = manager.generateContextSummary(runId, step);
    console.log(`Prior context for step ${step} in run ${runId}:\n`);
    console.log(summary);
    console.log();

    // check for unverified claims across all prior steps
    const allUnverified = manager.getUnverifiedClaims(runId);
    if (allUnverified.length > 0) {
      console.log('⚠ UNVERIFIED CLAIMS IN PRIOR STEPS:');
      allUnverified.forEach(item => {
        console.log(`  Step ${item.step} (${item.agent}): ${item.claims.length} unverified claims`);
      });
      console.log();
    }

  } catch (error) {
    console.error('Error loading context:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showUsage();
    process.exit(0);
  }

  const command = args[0];

  // convenience alias so `npm start demo-fast` is a thing
  if (command === 'demo-fast') {
    try {
      await runDemo('demo-fast');
    } catch (error) {
      console.error('Error running demo:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
    return;
  }

  if (command === 'gates') {
    await runQualityGatesCli(args.slice(1));
    return;
  }

  if (command === 'quick') {
    // Quick-fix mode
    if (args.length < 2) {
      console.error('Error: Quick-fix mode requires a task');
      console.log('Usage: swarm quick "task description"');
      console.log('Example: swarm quick "fix typo in README"');
      process.exit(1);
    }

    const task = args[1];
    const flags = {
      model: args.includes('--model') ? args[args.indexOf('--model') + 1] : undefined,
      agent: args.includes('--agent') ? args[args.indexOf('--agent') + 1] : undefined,
      skipVerify: args.includes('--skip-verify')
    };

    const quickFix = new QuickFixMode();

    console.log('⚡ Quick-Fix Mode\n');

    const quickOpts: any = {
      skipVerification: flags.skipVerify
    };
    if (flags.model) quickOpts.model = flags.model;
    if (flags.agent) quickOpts.agent = flags.agent;

    const result = await quickFix.execute(task, quickOpts);

    if (!result.wasQuickFixEligible) {
      console.log(result.output);
      process.exit(1);
    }

    if (result.success) {
      console.log(`\n✅ Quick-fix completed in ${(result.duration / 1000).toFixed(1)}s`);
      console.log(`   Agent: ${result.agentUsed}`);

      if (result.verificationPassed !== undefined) {
        console.log(`   Verification: ${result.verificationPassed ? '✓ Passed' : '✗ Failed'}`);
      }
    } else {
      console.error(`\n❌ Quick-fix failed (${(result.duration / 1000).toFixed(1)}s)`);
      console.error(`   Agent: ${result.agentUsed}`);
      if (result.reason) {
        console.error(`   Reason: ${result.reason}`);
      }
      process.exit(1);
    }

    return;
  }

  if (command === 'bootstrap') {
    if (args.length < 3) {
      console.error('Usage: swarm bootstrap <repo-path> [<repo-path2> ...] "Goal description"');
      process.exit(1);
    }

    // Strip flags, then last positional arg is the goal, rest are repo paths
    const positional = args.slice(1).filter(a => !a.startsWith('--'));
    const repoPaths = positional.slice(0, -1);
    const goal = positional[positional.length - 1];

    // Validate paths
    for (const repoPath of repoPaths) {
      if (!fs.existsSync(repoPath)) {
        console.error(`Repository path does not exist: ${repoPath}`);
        process.exit(1);
      }
    }

    bootstrap(repoPaths, goal);
    return;
  }

  if (command === 'plan') {
    if (args.length < 2 || args[1] === '--help') {
      showUsage();
      process.exit(0);
    }

    // check for subcommands
    const subcommand = args[1];

    if (subcommand === 'import') {
      // plan import <runid> <transcript>
      if (args.length < 4) {
        console.error('Error: plan import requires: <runid> <transcript-path>\n');
        showUsage();
        process.exit(1);
      }

      const runId = args[2];
      const transcriptPath = args[3];

      if (!runId || !transcriptPath) {
        console.error('Error: all arguments required\n');
        showUsage();
        process.exit(1);
      }

      try {
        importPlanFromTranscript(runId, transcriptPath);
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    } else if (subcommand === '--copilot') {
      // plan --copilot <goal>
      if (args.length < 3) {
        console.error('Error: goal required for --copilot mode\n');
        showUsage();
        process.exit(1);
      }

      const goal = args.slice(2).filter(a => !a.startsWith('--')).join(' ');
      try {
        generatePlan(goal, true);  // copilotMode = true
      } catch (error) {
        console.error('Error generating Copilot prompt:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    } else {
      // plan <goal> (regular mode) -- strip flags so --plan-cache etc. aren't swallowed as goal text
      const usePlanCache = args.includes('--plan-cache');
      const goal = args.slice(1).filter(a => !a.startsWith('--')).join(' ');
      try {
        generatePlan(goal, false, { planCache: usePlanCache });  // copilotMode = false
      } catch (error) {
        console.error('Error generating plan:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    }
  } else if (command === 'execute') {
    if (args.length < 2 || !args[1]) {
      console.error('Error: Plan filename required\n');
      showUsage();
      process.exit(1);
    }

    const planFilename = args[1];
    const hasDelegate = args.includes('--delegate');
    const hasMcp = args.includes('--mcp');

    const options: ExecutionOptions = {};
    if (hasDelegate) options.delegate = true;
    if (hasMcp) options.mcp = true;

    try {
      executePlan(planFilename, Object.keys(options).length > 0 ? options : undefined);
    } catch (error) {
      console.error('Error executing plan:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  } else if (command === 'status') {
    if (args.length < 2 || !args[1]) {
      console.error('Error: Execution ID required\n');
      showUsage();
      process.exit(1);
    }

    const executionId = args[1];
    try {
      showStatus(executionId);
    } catch (error) {
      console.error('Error showing status:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  } else if (command === 'swarm') {
    if (args.length < 2 || !args[1]) {
      console.error('Error: Plan filename required\n');
      showUsage();
      process.exit(1);
    }

    const planFilename = args[1];
    const modelIndex = args.indexOf('--model');
    const model = modelIndex !== -1 && args[modelIndex + 1] ? args[modelIndex + 1] : undefined;
    const noDashboard = args.includes('--no-dashboard');
    const confirmDeploy = args.includes('--confirm-deploy');

    const noQualityGates = args.includes('--no-quality-gates');
    const pmEnabled = args.includes('--pm');
    const governanceEnabled = args.includes('--governance');
    const strictIsolationEnabled = args.includes('--strict-isolation');
    const leanEnabled = args.includes('--lean');
    const useInnerFleetEnabled = args.includes('--useInnerFleet');
    const resumeIndex = args.indexOf('--resume');
    const resumeId = resumeIndex !== -1 && args[resumeIndex + 1] ? args[resumeIndex + 1] : undefined;
    const qgConfigIndex = args.indexOf('--quality-gates-config');
    const qgConfigPath = qgConfigIndex !== -1 && args[qgConfigIndex + 1] ? args[qgConfigIndex + 1] : undefined;
    const qgOutIndex = args.indexOf('--quality-gates-out');
    const qgOutDir = qgOutIndex !== -1 && args[qgOutIndex + 1] ? args[qgOutIndex + 1] : undefined;

    try {
      const options: {
        model?: string; noDashboard?: boolean; confirmDeploy?: boolean;
        qualityGates?: boolean; qualityGatesConfigPath?: string; qualityGatesOutDir?: string;
        pm?: boolean; governance?: boolean; strictIsolation?: boolean;
        lean?: boolean; useInnerFleet?: boolean; session?: string;
      } = {};
      if (model) options.model = model;
      if (noDashboard) options.noDashboard = noDashboard;
      if (confirmDeploy) options.confirmDeploy = confirmDeploy;
      if (noQualityGates) options.qualityGates = false;
      if (qgConfigPath) options.qualityGatesConfigPath = qgConfigPath;
      if (qgOutDir) options.qualityGatesOutDir = qgOutDir;
      if (pmEnabled) options.pm = true;
      if (governanceEnabled) options.governance = true;
      if (strictIsolationEnabled) options.strictIsolation = true;
      if (leanEnabled) options.lean = true;
      if (useInnerFleetEnabled) options.useInnerFleet = true;
      if (resumeId) options.session = resumeId;
      await executeSwarm(planFilename, options);
    } catch (error) {
      console.error('Error executing swarm:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  } else if (command === 'demo') {
    const subcommand = args[1];

    if (!subcommand || subcommand === '--help') {
      console.log('\nAvailable demo scenarios:');
      console.log('  demo-fast      - Hello-world swarm (2-4 min, 2 steps)');
      console.log('  todo-app        - Simple todo app (5-8 min, 4 steps)');
      console.log('  api-server      - REST API with auth (10-15 min, 6 steps)');
      console.log('  full-stack-app  - Complete full-stack app (15-20 min, 7 steps)\n');
      console.log('Usage:');
      console.log('  swarm demo <scenario-name>');
      console.log('  swarm demo list\n');
      process.exit(0);
    }

    if (subcommand === 'list') {
      const demoMode = new DemoMode();
      const scenarios = demoMode.getAvailableScenarios();

      console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
      console.log('║  Available Demo Scenarios                                            ║');
      console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

      scenarios.forEach(scenario => {
        console.log(`📋 ${scenario.name}`);
        console.log(`   ${scenario.description}`);
        console.log(`   Duration: ${scenario.expectedDuration}`);
        console.log(`   Steps: ${scenario.steps.length}\n`);
      });

      console.log('To run a demo:');
      console.log('  swarm demo <scenario-name>\n');
      process.exit(0);
    }

    try {
      runDemo(subcommand);
    } catch (error) {
      console.error('Error running demo:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  } else if (command === 'dashboard') {
    if (args.length < 2 || !args[1]) {
      console.error('Error: Execution ID required\n');
      showUsage();
      process.exit(1);
    }

    const executionId = args[1];
    try {
      const dashboardModule: any = await import('./dashboard');
      const renderDashboard = dashboardModule.renderDashboard || dashboardModule.startDashboard;
      if (typeof renderDashboard === 'function') {
        renderDashboard(executionId);
      } else {
        console.error('Dashboard module loaded but renderDashboard not found.');
        console.error('Use `swarm status <execid>` to check execution status.');
        process.exit(1);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Dashboard unavailable:', msg);
      console.error('Use `swarm status <execid>` to check execution status instead.');
      process.exit(1);
    }
  } else if (command === 'web-dashboard') {
    const port = args[1] ? parseInt(args[1], 10) : 3002;
    const runsDir = path.join(process.cwd(), 'runs');
    const { startWebDashboard } = require('./web-dashboard');
    startWebDashboard(runsDir, port);
  } else if (command === 'templates') {
    const templatesDir = path.join(__dirname, '..', 'templates');
    // If running from dist/src, look one more level up
    const resolvedDir = fs.existsSync(templatesDir) ? templatesDir : path.join(__dirname, '..', '..', 'templates');
    if (!fs.existsSync(resolvedDir)) {
      console.error('Templates directory not found.');
      process.exit(1);
    }
    const files = fs.readdirSync(resolvedDir).filter((f: string) => f.endsWith('.json'));
    console.log('\n  Available Plan Templates\n');
    console.log('  ' + '-'.repeat(60));
    for (const file of files) {
      try {
        const plan = JSON.parse(fs.readFileSync(path.join(resolvedDir, file), 'utf8'));
        const steps = plan.steps?.length || 0;
        const duration = plan.metadata?.estimatedDuration || 'unknown';
        console.log(`  ${file.padEnd(20)} ${String(steps).padStart(2)} steps   ${duration}`);
      } catch {
        console.log(`  ${file.padEnd(20)}  (invalid JSON)`);
      }
    }
    console.log('  ' + '-'.repeat(60));
    console.log(`\n  Usage: swarm swarm templates/<template>.json\n`);
  } else if (command === '--help' || command === '-h') {
    showUsage();
    process.exit(0);
  } else if (command === 'share') {
    const subcommand = args[1];

    if (!subcommand) {
      console.error('Error: share subcommand required (import or context)\n');
      showUsage();
      process.exit(1);
    }

    if (subcommand === 'import') {
      if (args.length < 6) {
        console.error('Error: share import requires: <runid> <step> <agent> <path>\n');
        showUsage();
        process.exit(1);
      }

      const runId = args[2];
      const stepNumber = args[3];
      const agentName = args[4];
      const transcriptPath = args[5];

      if (!runId || !stepNumber || !agentName || !transcriptPath) {
        console.error('Error: all arguments required\n');
        showUsage();
        process.exit(1);
      }

      try {
        importShare(runId, stepNumber, agentName, transcriptPath);
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    } else if (subcommand === 'context') {
      if (args.length < 4) {
        console.error('Error: share context requires: <runid> <step>\n');
        showUsage();
        process.exit(1);
      }

      const runId = args[2];
      const stepNumber = args[3];

      if (!runId || !stepNumber) {
        console.error('Error: all arguments required\n');
        showUsage();
        process.exit(1);
      }

      try {
        showShareContext(runId, stepNumber);
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    } else {
      console.error(`Unknown share subcommand: ${subcommand}\n`);
      showUsage();
      process.exit(1);
    }
  } else if (command === 'audit') {
    const sessionId = args[1];
    if (!sessionId) {
      console.error('Error: session ID required\nUsage: swarm audit <session-id>');
      process.exit(1);
    }
    const MetricsCollectorClass = require('./metrics-collector').default;
    const collector = new MetricsCollectorClass(sessionId, '');
    const state = collector.loadSession(sessionId);
    if (!state) {
      console.error(`Session not found: ${sessionId}`);
      process.exit(1);
    }
    console.log(collector.generateAuditReport(state));
  } else if (command === 'metrics') {
    const sessionId = args[1];
    if (!sessionId) {
      console.error('Error: session ID required\nUsage: swarm metrics <session-id>');
      process.exit(1);
    }
    const MetricsCollectorClass = require('./metrics-collector').default;
    const collector = new MetricsCollectorClass(sessionId, '');
    const state = collector.loadSession(sessionId);
    if (!state) {
      console.error(`Session not found: ${sessionId}`);
      process.exit(1);
    }
    // structured metrics summary
    const steps = state.graph.steps.length;
    const completed = state.lastCompletedStep;
    const branches = Object.keys(state.branchMap).length;
    const transcripts = Object.keys(state.transcripts).length;
    const gatesPassed = state.gateResults.filter((g: any) => g.status === 'pass').length;
    const gatesFailed = state.gateResults.filter((g: any) => g.status !== 'pass').length;
    const premiumReqs = (state.metrics as any).premiumRequests ?? 0;
    const totalMs = (state.metrics as any).totalTimeMs ?? 0;

    if (args.includes('--json')) {
      console.log(JSON.stringify({
        sessionId: state.sessionId,
        status: state.status,
        steps, completed, branches, transcripts,
        gatesPassed, gatesFailed, premiumReqs,
        totalTimeMs: totalMs
      }, null, 2));
    } else {
      console.log(`\n  Session Metrics: ${state.sessionId}\n  ${'─'.repeat(50)}`);
      console.log(`  Status:          ${state.status}`);
      console.log(`  Steps:           ${completed}/${steps} completed`);
      console.log(`  Branches:        ${branches}`);
      console.log(`  Transcripts:     ${transcripts}`);
      console.log(`  Gates:           ${gatesPassed} passed, ${gatesFailed} failed`);
      console.log(`  Premium requests:${premiumReqs}`);
      if (totalMs > 0) {
        const sec = Math.round(totalMs / 1000);
        console.log(`  Wall time:       ${sec}s`);
      }
      console.log(`  ${'─'.repeat(50)}\n`);
    }
  } else if (command === 'run') {
    // Convenience: plan + execute in one step
    const goalIndex = args.indexOf('--goal');
    let goal = '';
    if (goalIndex !== -1) {
      // Collect tokens after --goal until the next flag
      const afterGoal = args.slice(goalIndex + 1);
      const tokens: string[] = [];
      for (const tok of afterGoal) {
        if (tok.startsWith('--')) break;
        tokens.push(tok);
      }
      goal = tokens.join(' ');
    } else {
      goal = args.slice(1).filter(a => !a.startsWith('--')).join(' ');
    }

    if (!goal) {
      console.error('Error: goal required\nUsage: swarm run --goal "Build a REST API"');
      process.exit(1);
    }

    console.log('🐝 Copilot Swarm Orchestrator - Plan & Execute\n');
    console.log(`Goal: ${goal}\n`);

    // Generate plan
    const configLoader = new ConfigLoader();
    const agents = configLoader.loadAllAgents();
    const generator = new PlanGenerator(agents);
    const usePlanCache = args.includes('--plan-cache');
    const plan = generator.createPlan(goal, undefined, { planCache: usePlanCache });

    // Save to temp plan file
    const storage = new PlanStorage();
    const planFilename = storage.savePlan(plan);
    console.log(`Plan saved: ${planFilename} (${plan.steps.length} steps)\n`);

    // Parse flags and execute
    const modelIndex = args.indexOf('--model');
    const model = modelIndex !== -1 && args[modelIndex + 1] ? args[modelIndex + 1] : undefined;
    const runOpts: any = {};
    if (model) runOpts.model = model;
    if (args.includes('--no-dashboard')) runOpts.noDashboard = true;
    if (args.includes('--governance')) runOpts.governance = true;
    if (args.includes('--strict-isolation')) runOpts.strictIsolation = true;
    if (args.includes('--lean')) runOpts.lean = true;
    if (args.includes('--useInnerFleet')) runOpts.useInnerFleet = true;
    if (args.includes('--plan-cache')) runOpts.planCache = true;
    if (args.includes('--replay')) runOpts.replay = true;
    if (args.includes('--no-quality-gates')) runOpts.noQualityGates = true;
    if (args.includes('--pm')) runOpts.pm = true;

    try {
      await executeSwarm(path.basename(planFilename), runOpts);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  } else {
    console.log(`Unknown command: ${command}\n`);
    showUsage();
    process.exit(1);
  }
}

// Only run main if this file is executed directly
if (require.main === module) {
  main();
}

export { generatePlan, main };

