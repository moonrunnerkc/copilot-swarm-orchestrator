#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { ConfigLoader } from './config-loader';
import { DemoMode } from './demo-mode';
import { PlanGenerator } from './plan-generator';
import { PlanStorage } from './plan-storage';
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
  swarm demo <scenario>                  Run pre-configured demo scenario
  swarm demo list                        List available demo scenarios
  swarm status <execid>                  Show execution status
  swarm dashboard <execid>               Show TUI dashboard for execution
  swarm share import <runid> <step> <agent> <path>
                                         Import /share transcript for a step
  swarm share context <runid> <step>     Show prior context for a step
  swarm --help                           Show this help message

Flags:
  --delegate     Instruct agents to use /delegate for PR creation
  --mcp          Require MCP evidence from GitHub context in verification
  --model        Specify model for sessions (e.g., claude-sonnet-4.5)
  --no-dashboard Disable live dashboard in swarm mode

Examples:
  # Quick demo (recommended for first-time users)
  swarm demo todo-app

  # List available demos
  swarm demo list

  # Generate plan using intelligent fallback
  swarm plan "Build a REST API for user management"

  # Execute plan in parallel swarm mode with live dashboard
  swarm swarm plan.json

  # Execute with specific model
  swarm swarm plan.json --model claude-opus-4.5

  # Sequential execution (legacy mode)
  swarm execute plan.json --delegate --mcp

The swarm command:
  - Executes steps in parallel based on dependencies
  - Shows live dashboard with commit history, agent status, progress
  - Verifies each step with evidence-based checks
  - Auto-rollback on verification failure
  - Preserves human-like git commit history
`);
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

function generatePlan(goal: string, copilotMode: boolean = false): void {
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
  const plan = generator.createPlan(goal);

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
  options?: { model?: string; noDashboard?: boolean }
): Promise<void> {
  console.log('🐝 Copilot Swarm Orchestrator - Parallel Execution\n');

  // Load plan
  const storage = new PlanStorage();
  const plan = storage.loadPlan(planFilename);

  console.log(`Goal: ${plan.goal}`);
  console.log(`Total Steps: ${plan.steps.length}\n`);

  // Load agents
  const configLoader = new ConfigLoader();
  const agents = configLoader.loadAllAgents();

  // Create agent map
  const agentMap = new Map(agents.map(a => [a.name, a]));

  // Initialize orchestrator
  const orchestrator = new SwarmOrchestrator();

  // Create run directory
  const runId = `swarm-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const runDir = path.join(process.cwd(), 'runs', runId);

  console.log(`Run ID: ${runId}`);
  console.log(`Run Directory: ${runDir}\n`);

  // Dashboard disabled due to ESM/CommonJS incompatibility
  // Ink requires ESM with top-level await, which cannot be required from CommonJS
  // TODO: Re-enable when project migrates to ESM or alternative TUI found
  let dashboard: { update: (updates: any) => void; stop: () => void } | undefined;
  console.log('ℹ️  Live dashboard disabled (ESM compatibility issue)\n');

  try {
    // Execute swarm
    const context = await orchestrator.executeSwarm(plan, agentMap, runDir, options);

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

    console.log('\n' + '='.repeat(70));
    console.log('SWARM EXECUTION COMPLETE');
    console.log('='.repeat(70));
    console.log(`\n✅ Completed: ${completed}/${plan.steps.length}`);

    if (failed > 0) {
      console.log(`❌ Failed: ${failed}/${plan.steps.length}`);
      console.log('\nFailed steps:');
      context.results
        .filter(r => r.status === 'failed')
        .forEach(r => {
          console.log(`  - Step ${r.stepNumber} (${r.agentName}): ${r.error}`);
        });
    }

    console.log(`\n📁 Results saved to: ${runDir}`);
    console.log(`📊 Verification reports: ${runDir}/verification/\n`);

    if (completed === plan.steps.length) {
      console.log('🎉 All steps completed successfully!');
      console.log('Review the git log to see the natural commit history:\n');
      console.log('  git log --oneline -20\n');
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
  console.log('  2. Show live dashboard with commit history and progress');
  console.log('  3. Verify each step with evidence-based checks');
  console.log('  4. Demonstrate human-like git commit history\n');

  console.log('⚠️  NOTE: This will execute real Copilot CLI sessions.');
  console.log('    Make sure you are in a clean working directory or test repo.\n');

  // Convert scenario to plan
  const plan = demoMode.scenarioToPlan(scenario);

  // Save plan
  const storage = new PlanStorage();
  const planPath = storage.savePlan(plan);

  console.log(`✅ Demo plan saved to: ${planPath}\n`);

  // Execute in swarm mode
  await executeSwarm(path.basename(planPath));
}

function showStatus(executionId: string): void {
  console.log('Copilot Swarm Orchestrator - Execution Status\n');

  const runner = new StepRunner();

  try {
    const context = runner.loadExecutionContext(executionId);
    const summary = runner.generateSummary(context);

    console.log(summary);

    // Show next step if any
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
  } catch (error) {
    console.error('Error loading execution context:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
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

  if (command === 'bootstrap') {
    if (args.length < 3) {
      console.error('Usage: swarm bootstrap <repo-path> [<repo-path2> ...] "Goal description"');
      process.exit(1);
    }

    // Parse: all args except last are repo paths, last is goal
    const repoPaths = args.slice(1, -1);
    const goal = args[args.length - 1];

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

      const goal = args.slice(2).join(' ');
      try {
        generatePlan(goal, true);  // copilotMode = true
      } catch (error) {
        console.error('Error generating Copilot prompt:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    } else {
      // plan <goal> (regular mode)
      const goal = args.slice(1).join(' ');
      try {
        generatePlan(goal, false);  // copilotMode = false
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

    try {
      const options: { model?: string; noDashboard?: boolean } = {};
      if (model) options.model = model;
      if (noDashboard) options.noDashboard = noDashboard;
      await executeSwarm(planFilename, options);
    } catch (error) {
      console.error('Error executing swarm:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  } else if (command === 'demo') {
    const subcommand = args[1];

    if (!subcommand || subcommand === '--help') {
      console.log('\nAvailable demo scenarios:');
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
      const { renderDashboard } = require('./dashboard');
      renderDashboard(executionId);
    } catch (error) {
      console.error('Error showing dashboard:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
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

