/**
 * CLI command handlers extracted from cli.ts.
 * Each handler validates its arguments, performs the work, and returns an
 * exit code (0 = success, 1 = failure). No handler calls process.exit.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { ConfigLoader } from './config-loader';
import { DemoMode } from './demo-mode';
import { ExecutionPlan, PlanGenerator } from './plan-generator';
import { PlanStorage } from './plan-storage';
import QuickFixMode, { QuickFixOptions } from './quick-fix-mode';
import { SessionManager } from './session-manager';
import { StepRunner } from './step-runner';
import { SwarmOrchestrator, SwarmExecutionOptions, SwarmExecutionContext } from './swarm-orchestrator';
import { ExecutionOptions, SessionState } from './types';
import AgentsExporter from './agents-exporter';
import { defaultModelForAdapter } from './adapters';
import { loadRecipe, listRecipeDetails, parameterizeRecipe } from './recipe-loader';

// ---------------------------------------------------------------------------
// Progress spinner for long-running subprocess calls
// ---------------------------------------------------------------------------

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function startSpinner(label: string): { stop: () => void } {
  let frameIdx = 0;
  const t0 = Date.now();
  const interval = setInterval(() => {
    const elapsed = Math.round((Date.now() - t0) / 1000);
    const frame = SPINNER_FRAMES[frameIdx % SPINNER_FRAMES.length];
    process.stdout.write(`\r${frame} ${label} ${elapsed}s`);
    frameIdx++;
  }, 100);
  return {
    stop() {
      clearInterval(interval);
      process.stdout.write('\r' + ' '.repeat(label.length + 15) + '\r');
    }
  };
}

// ---------------------------------------------------------------------------
// Cost confirmation gate: blocks execution until user approves token spend
// ---------------------------------------------------------------------------

function confirmCostPrompt(estimateLow: number, estimateHigh: number, model: string, skipConfirm: boolean): Promise<boolean> {
  if (skipConfirm) return Promise.resolve(true);
  // Non-interactive environments (CI, piped stdin) skip the prompt
  if (!process.stdin.isTTY) return Promise.resolve(true);

  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(
      `\n⚡ This will use ${estimateLow}-${estimateHigh} premium requests (${model}). Proceed? [Y/n] `,
      (answer) => {
        rl.close();
        const normalized = (answer || 'y').trim().toLowerCase();
        resolve(normalized === 'y' || normalized === 'yes' || normalized === '');
      }
    );
  });
}

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

export function showUsage(): void {
  console.log(`
Swarm Orchestrator - Parallel AI Workflow Tool

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
  swarm templates                        List available plan templates
  swarm share import <runid> <step> <agent> <path>
                                         Import /share transcript for a step
  swarm share context <runid> <step>     Show prior context for a step
  swarm audit <session-id>               Generate Markdown audit report for a session
  swarm metrics <session-id>             Show metrics summary for a session
  swarm agents export [--output-dir dir] Export agents as .agent.md from execution history
  swarm use <recipe> [--param k=v ...]   Execute a pre-built recipe (see: swarm recipes)
  swarm recipes                          List available recipes
  swarm recipe-info <name>               Show recipe details and parameters
  swarm report <run-id>                  Generate structured run report from artifacts
  swarm mcp-server                       Start MCP server (JSON-RPC over stdio)
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
  --wrap-fleet       Enable /fleet prefix on all step prompts (alias for --useInnerFleet)
  --fleet            Dispatch entire waves via /fleet (hybrid mode, falls back on failure)
  --cost-estimate-only Run plan generation and cost estimation, print result, exit
  --max-premium-requests <n> Abort if estimated premium requests exceed budget
  --plan-cache       Skip planning when a cached plan template matches (>85% similar)
  --replay           Reuse prior transcript for identical steps (skip Copilot call)
  --quality-gates-config <path> Path to quality gates YAML (default: config/quality-gates.yaml)
  --quality-gates-out <dir>    Where to write gate reports (default: <runDir>/quality-gates)
  --pr <auto|review>   Create PRs instead of direct merge (auto: merge on pass, review: wait for approval)
  --owasp-report       Generate OWASP ASI compliance report after verification
  --tool <name>        Agent tool: copilot, claude-code, claude-code-teams
  --team-size <n>      Max concurrent teammates per wave with claude-code-teams (1-5, default 5)
  --target <dir>       Run execution in specified directory instead of cwd (alias: --dir)
  --hooks              Enable per-step hook injection for scope enforcement (default: on)
  --no-hooks           Disable hook injection for debugging
  --yes, -y            Skip cost confirmation prompt (auto-approve)

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

// ---------------------------------------------------------------------------
// Shared flag parsing
// ---------------------------------------------------------------------------

export interface ExecuteSwarmCliOptions {
  model?: string;
  noDashboard?: boolean;
  confirmDeploy?: boolean;
  noQualityGates?: boolean;
  qualityGatesConfigPath?: string;
  qualityGatesOutDir?: string;
  pm?: boolean;
  governance?: boolean;
  strictIsolation?: boolean;
  lean?: boolean;
  useInnerFleet?: boolean;
  session?: string;
  costEstimateOnly?: boolean;
  maxPremiumRequests?: number;
  planCache?: boolean;
  replay?: boolean;
  prMode?: 'auto' | 'review';
  hooksEnabled?: boolean;
  fleetWaveMode?: boolean;
  targetDir?: string;
  cliAgent?: string;
  teamSize?: number;
  owaspReport?: boolean;
  yes?: boolean;
}

/**
 * Extract swarm/run/demo CLI flags from an argument array.
 * Validates numeric flag values and maps aliases.
 */
export function parseSwarmFlags(args: string[]): ExecuteSwarmCliOptions {
  const opts: ExecuteSwarmCliOptions = {};

  const modelIndex = args.indexOf('--model');
  if (modelIndex !== -1 && args[modelIndex + 1]) opts.model = args[modelIndex + 1];

  if (args.includes('--no-dashboard')) opts.noDashboard = true;
  if (args.includes('--confirm-deploy')) opts.confirmDeploy = true;
  if (args.includes('--no-quality-gates')) opts.noQualityGates = true;
  if (args.includes('--pm')) opts.pm = true;
  if (args.includes('--governance')) opts.governance = true;
  if (args.includes('--strict-isolation')) opts.strictIsolation = true;
  if (args.includes('--lean')) opts.lean = true;
  if (args.includes('--useInnerFleet') || args.includes('--wrap-fleet')) opts.useInnerFleet = true;
  if (args.includes('--fleet')) opts.fleetWaveMode = true;
  if (args.includes('--cost-estimate-only')) opts.costEstimateOnly = true;
  if (args.includes('--yes') || args.includes('-y')) opts.yes = true;
  if (args.includes('--plan-cache')) opts.planCache = true;
  if (args.includes('--replay')) opts.replay = true;

  // Hooks default to on; --no-hooks disables
  if (args.includes('--no-hooks')) {
    opts.hooksEnabled = false;
  } else if (args.includes('--hooks')) {
    opts.hooksEnabled = true;
  }

  const maxPremIdx = args.indexOf('--max-premium-requests');
  if (maxPremIdx !== -1 && args[maxPremIdx + 1]) {
    const parsed = parseInt(args[maxPremIdx + 1], 10);
    if (isNaN(parsed) || parsed < 0) {
      throw new Error(
        `--max-premium-requests requires a non-negative integer, got "${args[maxPremIdx + 1]}"`
      );
    }
    opts.maxPremiumRequests = parsed;
  }

  const resumeIndex = args.indexOf('--resume');
  if (resumeIndex !== -1 && args[resumeIndex + 1]) opts.session = args[resumeIndex + 1];

  const qgConfigIndex = args.indexOf('--quality-gates-config');
  if (qgConfigIndex !== -1 && args[qgConfigIndex + 1]) {
    opts.qualityGatesConfigPath = args[qgConfigIndex + 1];
  }

  const qgOutIndex = args.indexOf('--quality-gates-out');
  if (qgOutIndex !== -1 && args[qgOutIndex + 1]) {
    opts.qualityGatesOutDir = args[qgOutIndex + 1];
  }

  const prIndex = args.indexOf('--pr');
  if (prIndex !== -1 && args[prIndex + 1]) {
    const mode = args[prIndex + 1];
    if (mode !== 'auto' && mode !== 'review') {
      throw new Error(
        `--pr requires "auto" or "review", got "${mode}"`
      );
    }
    opts.prMode = mode;
  }

  const targetIndex = args.indexOf('--target') !== -1
    ? args.indexOf('--target')
    : args.indexOf('--dir');
  if (targetIndex !== -1 && args[targetIndex + 1]) {
    opts.targetDir = args[targetIndex + 1];
  }

  if (args.includes('--yes') || args.includes('-y')) opts.yes = true;
  if (args.includes('--owasp-report')) opts.owaspReport = true;

  const toolIndex = args.indexOf('--tool');
  if (toolIndex !== -1 && args[toolIndex + 1]) {
    opts.cliAgent = args[toolIndex + 1];
  }

  const teamSizeIdx = args.indexOf('--team-size');
  if (teamSizeIdx !== -1 && args[teamSizeIdx + 1]) {
    const parsed = parseInt(args[teamSizeIdx + 1], 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 5) {
      throw new Error(
        `--team-size requires an integer between 1 and 5, got "${args[teamSizeIdx + 1]}"`
      );
    }
    opts.teamSize = parsed;
  }

  return opts;
}

// ---------------------------------------------------------------------------
// Internal helpers (not exported; called by the handle* functions)
// ---------------------------------------------------------------------------

function generatePlan(goal: string, copilotMode: boolean = false, opts?: { planCache?: boolean }): void {
  const configLoader = new ConfigLoader();
  const agents = configLoader.loadAllAgents();
  const generator = new PlanGenerator(agents);

  if (copilotMode) {
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║  COPILOT CLI PLANNING MODE                                           ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝\n');
    console.log('📋 Goal:', goal, '\n');
    console.log('Instructions:');
    console.log('  1. Copy the prompt below');
    console.log('  2. Start a new Copilot CLI session: copilot');
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

  const plan = generator.createPlan(goal, undefined, opts?.planCache ? { planCache: true } : undefined);

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

  const executionOrder = generator.getExecutionOrder(plan);
  console.log(`🔄 Execution Order: ${executionOrder.join(' → ')}\n`);

  const storage = new PlanStorage();
  const planPath = storage.savePlan(plan);
  console.log(`✅ Plan saved to: ${planPath}`);
  console.log(`\n▶  To execute: swarm swarm ${path.basename(planPath)}\n`);
}

function importPlanFromTranscript(runId: string, transcriptPath: string): number {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  IMPORT COPILOT-GENERATED PLAN                                       ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  console.log('📁 Transcript:', transcriptPath);
  console.log('🆔 Run ID:', runId);
  console.log();

  try {
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

    const executionOrder = generator.getExecutionOrder(plan);
    console.log(`\n🔄 Execution Order: ${executionOrder.join(' → ')}`);

    const storage = new PlanStorage();
    const planPath = storage.savePlan(plan);
    console.log(`\n✅ Plan saved to: ${planPath}`);
    console.log(`\n▶  To execute: swarm swarm ${path.basename(planPath)}\n`);

    return 0;
  } catch (error) {
    console.error('\n❌ Error importing plan:');
    console.error('  ', error instanceof Error ? error.message : String(error));
    console.error('\nTroubleshooting:');
    console.error('  • Ensure the transcript contains valid JSON output from Copilot');
    console.error('  • The JSON must match the ExecutionPlan schema');
    console.error('  • Check that all agent names are valid');
    console.error('  • Ensure dependencies form a valid DAG (no cycles)\n');
    return 1;
  }
}

function executePlan(planFilename: string, options?: ExecutionOptions): number {
  console.log('Swarm Orchestrator - Plan Execution\n');

  const storage = new PlanStorage();
  const plan = storage.loadPlan(planFilename);

  console.log(`Plan: ${plan.goal}`);
  console.log(`Steps: ${plan.steps.length}`);

  const { CostEstimator } = require('./cost-estimator') as typeof import('./cost-estimator');
  const seqModel = defaultModelForAdapter(options?.cliAgent);
  const seqEstimator = new CostEstimator();
  const seqEstimate = seqEstimator.estimate(plan, { modelName: seqModel });
  console.log(`\n💰 Cost Estimate: ${seqEstimate.lowEstimate}-${seqEstimate.totalPremiumRequests} premium requests`);
  console.log(`   ${plan.steps.length} steps | ${seqModel} (${seqEstimate.modelMultiplier}x)`);

  if (options?.delegate || options?.mcp) {
    console.log('\nGitHub Integration:');
    if (options.delegate) console.log('  ✓ /delegate enabled - agents will be instructed to create PRs');
    if (options.mcp) console.log('  ✓ MCP required - agents must provide GitHub context evidence');
  }
  console.log('');

  const configLoader = new ConfigLoader();
  const agents = configLoader.loadAllAgents();

  const runner = new StepRunner();
  const context = runner.initializeExecution(plan, planFilename, options);

  console.log(`Execution ID: ${context.executionId}\n`);

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

  const firstStepNumber = executionOrder[0];
  if (firstStepNumber === undefined) {
    console.error('No steps to execute');
    return 1;
  }

  const firstStep = plan.steps.find(s => s.stepNumber === firstStepNumber);
  if (!firstStep) {
    console.error(`Step ${firstStepNumber} not found in plan`);
    return 1;
  }

  const agent = agents.find(a => a.name === firstStep.agentName);
  if (!agent) {
    console.error(`Agent ${firstStep.agentName} not found`);
    return 1;
  }

  runner.displayStepInstructions(firstStep, agent, context);

  const contextPath = runner.saveExecutionContext(context);
  console.log(`\n✓ Execution context saved to: ${contextPath}`);
  console.log(`\nTo continue execution after completing this step, run:`);
  console.log(`  swarm status ${context.executionId}\n`);
  return 0;
}

// Maps each adapter to the env var(s) it requires at runtime.
// Checked before execution so users get clear guidance instead of cryptic
// auth failures deep in the agent subprocess.
// Copilot authenticates via `gh auth login` (filesystem credentials),
// so it has no hard env var requirement. GITHUB_TOKEN is only used
// in CI where Actions provides it automatically.
// Claude Code supports both API key auth and subscription auth (via `claude login`).
// Only codex strictly requires an env var.
const ADAPTER_REQUIRED_KEYS: Record<string, string[]> = {
  codex: ['OPENAI_API_KEY'],
};

function validateAdapterSecrets(tool: string): void {
  const required = ADAPTER_REQUIRED_KEYS[tool];
  if (!required) return;

  const missing = required.filter(k => !process.env[k]);
  if (missing.length === 0) return;

  const lines = [
    `Missing required secrets for --tool ${tool}: ${missing.join(', ')}`,
    '',
    'Set them in your environment or GitHub Secrets:',
    ...missing.map(k => `  ${k}=<your-key>`),
    '',
    'In a GitHub Actions workflow, pass them via the env: block:',
    ...missing.map(k => `  ${k}: \${{ secrets.${k} }}`),
  ];
  throw new Error(lines.join('\n'));
}

async function executeSwarm(
  planFilename: string,
  options?: ExecuteSwarmCliOptions
): Promise<number> {
  const selectedTool = options?.cliAgent || 'copilot';
  validateAdapterSecrets(selectedTool);

  console.log('🐝 Swarm Orchestrator - Parallel Execution\n');

  const storage = new PlanStorage();
  let plan = storage.loadPlan(planFilename);

  console.log(`Goal: ${plan.goal}`);
  console.log(`Total Steps: ${plan.steps.length}\n`);

  const configLoader = new ConfigLoader();
  const agents = configLoader.loadAllAgents();
  const agentMap = configLoader.buildAgentMap();

  // PM agent review (optional, activated with --pm)
  if (options?.pm) {
    const { PMAgent } = await import('./pm-agent');
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

  // Cost estimation (always runs pre-execution)
  const { CostEstimator } = await import('./cost-estimator');
  const costEstimator = new CostEstimator();
  const modelName = options?.model || defaultModelForAdapter(options?.cliAgent);
  const costEstimate = costEstimator.estimate(plan, {
    modelName,
    fleetMode: !!options?.useInnerFleet,
  });

  const retryPct = Math.round((costEstimate.perStep[0]?.retryProbability ?? 0.15) * 100);
  console.log(`\n💰 Cost Estimate: ${costEstimate.lowEstimate}-${costEstimate.totalPremiumRequests} premium requests`);
  console.log(`   ${plan.steps.length} steps | ${modelName} (${costEstimate.modelMultiplier}x) | ${retryPct}% retry buffer`);
  if (options?.useInnerFleet) {
    console.log(`   /fleet mode: subagent multiplier applied`);
  }
  console.log('');

  if (options?.costEstimateOnly) {
    console.log(`Cost Estimate for: ${plan.goal}`);
    console.log(`Steps: ${plan.steps.length} | Model: ${modelName} (${costEstimate.modelMultiplier}x multiplier)`);
    console.log(`Estimated premium requests: ${costEstimate.lowEstimate}-${costEstimate.highEstimate}`);
    console.log(`Retry buffer (${retryPct}% historical failure rate): +${costEstimate.retryBuffer}`);
    console.log(`Total estimate: ${costEstimate.lowEstimate}-${costEstimate.totalPremiumRequests} premium requests`);
    if (costEstimate.remainingAllowance !== undefined) {
      console.log(`At $0.04/overage: $${costEstimate.overageCostUSD.toFixed(2)} if over allowance`);
    }
    console.log('');
    return 0;
  }

  if (options?.maxPremiumRequests !== undefined && costEstimate.totalPremiumRequests > options.maxPremiumRequests) {
    console.error(
      `Aborting: estimated ${costEstimate.totalPremiumRequests} premium requests exceeds budget of ${options.maxPremiumRequests}`
    );
    return 1;
  }

  // Gate: require explicit user confirmation before spending tokens
  const confirmed = await confirmCostPrompt(
    costEstimate.lowEstimate,
    costEstimate.totalPremiumRequests,
    modelName,
    !!options?.yes
  );
  if (!confirmed) {
    console.log('Cancelled.');
    return 0;
  }

  // Resolve the target repo directory: plan metadata > CLI flag > first step repo > plan file location > cwd
  // When the plan file sits under <project>/plans/, infer <project> as the target.
  let inferredFromPlan: string | undefined;
  if (path.isAbsolute(planFilename)) {
    const planDir = path.dirname(planFilename);
    if (path.basename(planDir) === 'plans') {
      inferredFromPlan = path.dirname(planDir);
    }
  }

  const targetDir = plan.metadata?.targetDir
    || options?.targetDir
    || plan.steps.find(s => s.repo)?.repo
    || inferredFromPlan
    || undefined;

  if (targetDir) {
    console.log(`📂 Target directory: ${targetDir}`);
  }

  const orchestrator = new SwarmOrchestrator(targetDir);

  const runId = `swarm-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const baseDir = targetDir || process.cwd();
  const runDir = path.join(baseDir, 'runs', runId);

  console.log(`Run ID: ${runId}`);
  console.log(`Run Directory: ${runDir}\n`);

  // Dashboard: Ink 4+ is ESM-only; bridge via dynamic import()
  let dashboard: { update: (updates: Record<string, unknown>) => void; stop: () => void } | undefined;
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
        startTime: new Date().toISOString(),
        costSummary: `Cost Estimate: ${costEstimate.lowEstimate}-${costEstimate.totalPremiumRequests} premium requests | ${modelName} (${costEstimate.modelMultiplier}x) | ${plan.steps.length} steps`
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
    const swarmOptions: SwarmExecutionOptions = {};
    if (options?.model) swarmOptions.model = options.model;
    if (options?.confirmDeploy) swarmOptions.confirmDeploy = true;
    if (options?.noQualityGates) swarmOptions.qualityGates = false;
    if (options?.governance) swarmOptions.governance = true;
    if (options?.strictIsolation) swarmOptions.strictIsolation = true;
    if (options?.lean) swarmOptions.lean = true;
    if (options?.useInnerFleet) swarmOptions.useInnerFleet = true;
    if (options?.fleetWaveMode) swarmOptions.fleetWaveMode = true;
    if (options?.prMode) swarmOptions.prMode = options.prMode;
    if (options?.hooksEnabled !== undefined) swarmOptions.hooksEnabled = options.hooksEnabled;
    if (options?.owaspReport) swarmOptions.owaspReport = true;
    if (options?.cliAgent) swarmOptions.cliAgent = options.cliAgent;
    if (options?.teamSize) swarmOptions.teamSize = options.teamSize;

    if (dashboard) {
      // Capture live agent output lines for the dashboard log panel
      const agentLogLines: string[] = [];
      swarmOptions.onAgentLine = (line: string) => {
        agentLogLines.push(line);
        // Keep a rolling window to avoid unbounded memory growth
        if (agentLogLines.length > 200) agentLogLines.splice(0, agentLogLines.length - 200);
        dashboard!.update({ agentLog: agentLogLines.slice(-12) });
      };

      swarmOptions.onProgress = (ctx: SwarmExecutionContext, event: string) => {
        const waveMatch = event.match(/^wave-(?:start|done):(\d+)/);
        const currentWave = waveMatch ? parseInt(waveMatch[1], 10) : undefined;

        const liveQueueStats = ctx.executionQueue?.getStats?.() || ctx.queueStats;

        dashboard!.update({
          results: ctx.results,
          totalSteps: ctx.plan.steps.length,
          ...(currentWave !== undefined && { currentWave }),
          ...(ctx.totalWaves && { totalWaves: ctx.totalWaves }),
          ...(ctx.criticResults && { criticResults: ctx.criticResults }),
          ...(ctx.leanSavedRequests && { leanSavedRequests: ctx.leanSavedRequests }),
          ...(liveQueueStats && { queueStats: liveQueueStats }),
        });
      };
    }

    const context = await orchestrator.executeSwarm(plan, agentMap, runDir, swarmOptions);

    if (dashboard) {
      dashboard.update({
        currentWave: context.totalWaves || 1,
        results: context.results
      });
      await new Promise(resolve => setTimeout(resolve, 2000));
      dashboard.stop();
    }

    const completed = context.results.filter(r => r.status === 'completed').length;
    const failed = context.results.filter(r => r.status === 'failed').length;
    const totalSteps = context.results.length;

    console.log('\n' + '═'.repeat(60));
    console.log('  SWARM EXECUTION COMPLETE');
    console.log('═'.repeat(60));
    console.log(`\n  ✅ Completed: ${completed}/${totalSteps}`);

    if (failed > 0) {
      console.log(`  ❌ Failed: ${failed}/${totalSteps}`);
      console.log('\n  Failed steps:');
      context.results
        .filter(r => r.status === 'failed')
        .forEach(r => {
          console.log(`    - Step ${r.stepNumber} (${r.agentName}): ${r.error}`);
        });
    }

    const starts = context.results.filter(r => r.startTime).map(r => new Date(r.startTime!).getTime());
    const ends = context.results.filter(r => r.endTime).map(r => new Date(r.endTime!).getTime());
    if (starts.length > 0 && ends.length > 0) {
      const totalSec = Math.round((Math.max(...ends) - Math.min(...starts)) / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      console.log(`  ⏱  Total time: ${min > 0 ? `${min}m ${sec}s` : `${sec}s`}`);
    }

    console.log(`\n  💰 Cost: ${costEstimate.lowEstimate}-${costEstimate.totalPremiumRequests} estimated premium requests`);
    console.log(`     ${modelName} (${costEstimate.modelMultiplier}x) | ${totalSteps} steps${totalSteps > plan.steps.length ? ` (${plan.steps.length} planned + ${totalSteps - plan.steps.length} remediation)` : ''} | ${retryPct}% retry buffer`);

    console.log(`\n  📁 Results: ${runDir}`);
    console.log(`  📊 Reports: ${runDir}/verification/`);

    // Show PR URLs if --pr mode was active
    if (context.prUrls && context.prUrls.size > 0) {
      console.log('\n  Pull Requests:');
      for (const [stepNum, url] of context.prUrls) {
        console.log(`    Step ${stepNum}: ${url}`);
      }
    }

    console.log('═'.repeat(60));

    if (completed === totalSteps) {
      console.log('\n🎉 All steps completed successfully!');
      console.log('   Review the git log to see the natural commit history:');
      console.log('   git log --oneline -20\n');
    }

    // CI output: write structured result when running inside GitHub Actions
    const allPassed = context.results.every(r => r.verificationResult?.passed);
    if (process.env.GITHUB_ACTIONS) {
      writeCIOutputs(context, plan, allPassed);
    }

    return allPassed ? 0 : 1;
  } catch (error) {
    if (dashboard) {
      dashboard.stop();
    }
    throw error;
  }
}

/**
 * Write CI-specific output files when running inside GitHub Actions.
 * These feed into action.yml outputs via GITHUB_OUTPUT.
 */
function writeCIOutputs(
  context: SwarmExecutionContext,
  plan: ExecutionPlan,
  allPassed: boolean
): void {
  const starts = context.results.filter(r => r.startTime).map(r => new Date(r.startTime!).getTime());
  const ends = context.results.filter(r => r.endTime).map(r => new Date(r.endTime!).getTime());
  const totalDurationMs = (starts.length > 0 && ends.length > 0)
    ? Math.max(...ends) - Math.min(...starts)
    : 0;

  const resultJson = {
    allPassed,
    totalSteps: context.results.length,
    completed: context.results.filter(r => r.status === 'completed').length,
    failed: context.results.filter(r => r.status === 'failed').length,
    totalDurationMs,
    steps: context.results.map(r => ({
      stepNumber: r.stepNumber,
      agentName: r.agentName,
      status: r.status,
      passed: r.verificationResult?.passed ?? false,
      retryCount: r.retryCount ?? 0,
    })),
  };

  fs.writeFileSync('/tmp/swarm-result.json', JSON.stringify(resultJson), 'utf8');
  fs.writeFileSync('/tmp/swarm-plan.json', JSON.stringify(plan, null, 2), 'utf8');

  // Write first PR URL if present
  if (context.prUrls && context.prUrls.size > 0) {
    const firstUrl = context.prUrls.values().next().value;
    if (firstUrl) {
      fs.writeFileSync('/tmp/swarm-pr-url.txt', firstUrl, 'utf8');
    }
  }
}

/**
 * Install npm dependencies for all package.json files in demo output.
 * Makes the demo runnable immediately after completion.
 */
async function installDemoDependencies(demoDir: string): Promise<void> {
  const { execSync } = await import('child_process');

  const packageJsonPaths: string[] = [];

  function findPackageJsons(dir: string, depth: number = 0): void {
    if (depth > 3) return;
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
      // Permission denied or broken symlink; skip this subtree
    }
  }

  findPackageJsons(demoDir);

  if (packageJsonPaths.length === 0) {
    return;
  }

  console.log('\n📦 Installing dependencies for demo output...\n');

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
        timeout: 120000
      });
      console.log(`     ✅ Dependencies installed\n`);
      successCount++;
    } catch {
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

  console.log('\n🚀 To run the demo:\n');
  console.log(`   cd ${demoDir}`);

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
      // package.json unreadable or malformed; show generic start command
      console.log('   npm start');
    }
  }

  const frontendPkgPath = path.join(demoDir, 'frontend', 'package.json');
  if (fs.existsSync(frontendPkgPath)) {
    console.log('\n   # Frontend (in separate terminal):');
    console.log('   cd frontend && npm run dev');
  }

  console.log('');
}

function showStatus(executionId: string): number {
  console.log('Swarm Orchestrator - Execution Status\n');

  const runner = new StepRunner();

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
    return 0;
  } catch {
    // Not a sequential execution context; fall through to swarm session state
  }

  const MetricsCollectorClass = require('./metrics-collector').default;
  const collector = new MetricsCollectorClass(executionId, '');
  const state = collector.loadSession(executionId) as SessionState | null;
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
    return 0;
  }

  console.error(`Execution not found: ${executionId}`);
  console.error('Checked both proof/ (sequential) and runs/ (swarm) directories.');
  return 1;
}

function importShare(runId: string, stepNumber: string, agentName: string, transcriptPath: string): number {
  console.log('Swarm Orchestrator - Import /share Transcript\n');

  const step = parseInt(stepNumber, 10);
  if (isNaN(step)) {
    console.error('Error: Step number must be a number');
    return 1;
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

    const unverified = stepShare.index.claims.filter(c => !c.verified);
    if (unverified.length > 0) {
      console.log(`\n⚠ WARNING: ${unverified.length} unverified claims detected`);
      console.log('this step may require manual review before proceeding\n');
    } else {
      console.log('\n✓ All claims verified\n');
    }

    return 0;
  } catch (error) {
    console.error('Error importing share:', error instanceof Error ? error.message : error);
    return 1;
  }
}

function showShareContext(runId: string, stepNumber: string): number {
  console.log('Swarm Orchestrator - Prior Context\n');

  const step = parseInt(stepNumber, 10);
  if (isNaN(step)) {
    console.error('Error: Step number must be a number');
    return 1;
  }

  const manager = new SessionManager();

  try {
    const summary = manager.generateContextSummary(runId, step);
    console.log(`Prior context for step ${step} in run ${runId}:\n`);
    console.log(summary);
    console.log();

    const allUnverified = manager.getUnverifiedClaims(runId);
    if (allUnverified.length > 0) {
      console.log('⚠ UNVERIFIED CLAIMS IN PRIOR STEPS:');
      allUnverified.forEach(item => {
        console.log(`  Step ${item.step} (${item.agent}): ${item.claims.length} unverified claims`);
      });
      console.log();
    }

    return 0;
  } catch (error) {
    console.error('Error loading context:', error instanceof Error ? error.message : error);
    return 1;
  }
}

// ---------------------------------------------------------------------------
// Command handlers (exported for testing and called by main dispatch)
// ---------------------------------------------------------------------------

export async function handleGatesCommand(args: string[]): Promise<number> {
  const { load_quality_gates_config, run_quality_gates } = require('./quality-gates');

  const positional = args[0] && !args[0].startsWith('-') ? args[0] : undefined;
  const projectRoot = positional ? path.resolve(process.cwd(), positional) : process.cwd();

  const configIndex = args.indexOf('--quality-gates-config');
  const configPath = configIndex !== -1 && args[configIndex + 1] ? args[configIndex + 1] : undefined;

  const outIndex = args.indexOf('--quality-gates-out');
  const outDir = outIndex !== -1 && args[outIndex + 1]
    ? path.resolve(process.cwd(), args[outIndex + 1])
    : undefined;

  // When a base commit is provided, compute baseline files so gates only flag
  // agent-created or agent-modified files, not pre-existing project code.
  const baseCommitIdx = args.indexOf('--base-commit');
  const baseCommitSha = baseCommitIdx !== -1 && args[baseCommitIdx + 1] ? args[baseCommitIdx + 1] : undefined;
  let baselineFiles: Set<string> | undefined;

  if (baseCommitSha) {
    try {
      const { execSync } = require('child_process');
      const fileList = execSync(`git ls-tree -r --name-only ${baseCommitSha}`, {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      baselineFiles = new Set(fileList.trim().split('\n').filter(Boolean));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to read baseline files from commit ${baseCommitSha}: ${msg}`);
      return 1;
    }
  }

  const config = load_quality_gates_config(projectRoot, configPath);
  const result = await run_quality_gates(projectRoot, config, outDir, baselineFiles, baseCommitSha);

  const icon = result.passed ? '✅' : '❌';
  console.log(`${icon} quality gates ${result.passed ? 'passed' : 'failed'} (${result.totalDurationMs}ms)`);
  for (const gate of result.results) {
    const g = gate.status === 'pass' ? '✅' : gate.status === 'skip' ? '⏭️' : '❌';
    console.log(`  ${g} ${gate.id}: ${gate.issues.length} issue(s)`);
  }

  return result.passed ? 0 : 1;
}

export async function handleBootstrapCommand(args: string[]): Promise<number> {
  if (args.length < 3) {
    console.error('Usage: swarm bootstrap <repo-path> [<repo-path2> ...] "Goal description"');
    return 1;
  }

  // Extract positional args, skipping flags and their values
  const flagsWithValues = new Set([
    '--tool', '--model', '--resume', '--pr', '--target', '--dir',
    '--quality-gates-config', '--quality-gates-out', '--max-premium-requests',
  ]);
  const positional: string[] = [];
  const raw = args.slice(1);
  for (let i = 0; i < raw.length; i++) {
    if (flagsWithValues.has(raw[i])) {
      i++; // skip the flag's value
    } else if (!raw[i].startsWith('--')) {
      positional.push(raw[i]);
    }
  }

  if (positional.length < 2) {
    console.error('Usage: swarm bootstrap <repo-path> [<repo-path2> ...] "Goal description"');
    return 1;
  }

  const repoPaths = positional.slice(0, -1);
  const goal = positional[positional.length - 1];

  for (const repoPath of repoPaths) {
    if (!fs.existsSync(repoPath)) {
      console.error(`Repository path does not exist: ${repoPath}`);
      return 1;
    }
  }

  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  BOOTSTRAP MODE - Multi-Repo Analysis & Planning                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  const BootstrapOrchestrator = require('./bootstrap-orchestrator').default;
  const storage = new PlanStorage();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const goalSlug = goal.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30);
  const runId = `bootstrap-${timestamp}-${goalSlug}`;
  const runDir = path.join(process.cwd(), 'runs', runId);

  try {
    const orchestrator = new BootstrapOrchestrator();
    const bsSpinner = startSpinner('Analyzing repos...');
    let bootstrapResult: { evidencePath: string; plan: ExecutionPlan };
    try {
      bootstrapResult = await orchestrator.bootstrap(repoPaths, goal, runDir) as {
        evidencePath: string;
        plan: ExecutionPlan;
      };
    } finally {
      bsSpinner.stop();
    }
    const { evidencePath, plan } = bootstrapResult;

    const planPath = storage.savePlan(plan, runId);

    console.log('📋 Bootstrap Results:');
    console.log(`  Evidence: ${evidencePath}`);
    console.log(`  Plan: ${planPath}`);
    console.log(`  Run ID: ${runId}`);
    console.log();
    console.log('Next steps:');
    console.log(`  1. Review the evidence: cat ${evidencePath}`);
    console.log(`  2. Execute the plan: swarm swarm ${planPath}`);
    return 0;
  } catch (error) {
    console.error('Bootstrap failed:', error instanceof Error ? error.message : String(error));
    return 1;
  }
}

export async function handlePlanCommand(args: string[]): Promise<number> {
  if (args.length < 2 || args[1] === '--help') {
    showUsage();
    return 0;
  }

  const subcommand = args[1];

  if (subcommand === 'import') {
    if (args.length < 4) {
      console.error('Error: plan import requires: <runid> <transcript-path>\n');
      showUsage();
      return 1;
    }
    const runId = args[2];
    const transcriptPath = args[3];
    if (!runId || !transcriptPath) {
      console.error('Error: all arguments required\n');
      showUsage();
      return 1;
    }
    return importPlanFromTranscript(runId, transcriptPath);
  }

  if (subcommand === '--copilot') {
    if (args.length < 3) {
      console.error('Error: goal required for --copilot mode\n');
      showUsage();
      return 1;
    }
    const goal = args.slice(2).filter(a => !a.startsWith('--')).join(' ');
    try {
      generatePlan(goal, true);
      return 0;
    } catch (error) {
      console.error('Error generating Copilot prompt:', error instanceof Error ? error.message : error);
      return 1;
    }
  }

  // plan <goal> (regular mode)
  const usePlanCache = args.includes('--plan-cache');
  const goal = args.slice(1).filter(a => !a.startsWith('--')).join(' ');
  try {
    generatePlan(goal, false, { planCache: usePlanCache });
    return 0;
  } catch (error) {
    console.error('Error generating plan:', error instanceof Error ? error.message : error);
    return 1;
  }
}

export async function handleExecuteCommand(args: string[]): Promise<number> {
  if (args.length < 2 || !args[1]) {
    console.error('Error: Plan filename required\n');
    showUsage();
    return 1;
  }

  const planFilename = args[1];
  const options: ExecutionOptions = {};
  if (args.includes('--delegate')) options.delegate = true;
  if (args.includes('--mcp')) options.mcp = true;

  try {
    return executePlan(planFilename, Object.keys(options).length > 0 ? options : undefined);
  } catch (error) {
    console.error('Error executing plan:', error instanceof Error ? error.message : error);
    return 1;
  }
}

export async function handleStatusCommand(args: string[]): Promise<number> {
  if (args.length < 2 || !args[1]) {
    console.error('Error: Execution ID required\n');
    showUsage();
    return 1;
  }

  try {
    return showStatus(args[1]);
  } catch (error) {
    console.error('Error showing status:', error instanceof Error ? error.message : error);
    return 1;
  }
}

export async function handleSwarmCommand(args: string[]): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: swarm swarm <planfile> [flags]

Execute a plan in parallel swarm mode. Runs steps concurrently based on
their dependency graph, verifying each step with evidence-based checks.

Arguments:
  <planfile>   Path to a plan JSON file (from \`swarm plan\` or \`swarm run\`)

Flags:
  --model <name>             Model to use (e.g., claude-opus-4.5, o3)
  --no-dashboard             Disable the live TUI dashboard
  --pm                       Run PM agent plan review before execution
  --governance               Enable critic review + governance pause before merge
  --strict-isolation         Force per-task branch isolation
  --lean                     Enable Delta Context Engine (reuse KB patterns)
  --useInnerFleet            Prefix all prompts with /fleet
  --fleet                    Dispatch waves via /fleet (hybrid mode)
  --cost-estimate-only       Print cost estimate and exit without executing
  --max-premium-requests <n> Abort if estimated cost exceeds budget
  --plan-cache               Skip planning when a cached template matches
  --replay                   Reuse prior transcripts for identical steps
  --pr <auto|review>         Create PRs instead of direct merge
  --target <dir>             Run in specified directory instead of cwd
  --resume <id>              Resume a paused or failed session
  --hooks / --no-hooks       Enable/disable per-step hook injection
  --owasp-report             Generate OWASP ASI compliance report
  --tool <name>              Agent tool: copilot, claude-code, claude-code-teams
  --team-size <n>            Max concurrent teammates (claude-code-teams, 1-5)

Examples:
  swarm swarm plan.json
  swarm swarm plan.json --model claude-opus-4.5 --pm
  swarm swarm plan.json --cost-estimate-only
  swarm swarm plan.json --pr auto --governance
`);
    return 0;
  }

  if (args.length < 2 || !args[1]) {
    console.error('Error: Plan filename required\n');
    showUsage();
    return 1;
  }

  const planFilename = args[1];
  try {
    const options = parseSwarmFlags(args);
    return await executeSwarm(planFilename, options);
  } catch (error) {
    console.error('Error executing swarm:', error instanceof Error ? error.message : error);
    return 1;
  }
}

export async function handleDemoCommand(args: string[]): Promise<number> {
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
    return 0;
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
    return 0;
  }

  // Run a demo scenario
  try {
    return await runDemo(subcommand);
  } catch (error) {
    console.error('Error running demo:', error instanceof Error ? error.message : error);
    return 1;
  }
}

async function runDemo(scenarioName: string): Promise<number> {
  console.log('🐝 Swarm Orchestrator - Demo Mode\n');

  const demoMode = new DemoMode();
  const scenario = demoMode.getScenario(scenarioName);

  // Parse all CLI flags (including --target, --pr, --hooks, etc.)
  const cliArgs = process.argv.slice(2);
  const parsedFlags = parseSwarmFlags(cliArgs);

  const os = require('os');
  let demoDir: string;
  let isExternalTarget = false;

  if (parsedFlags.targetDir) {
    // Use provided target directory instead of creating a temp one
    demoDir = path.resolve(parsedFlags.targetDir);
    isExternalTarget = true;
    if (!fs.existsSync(demoDir)) {
      console.error(`❌ Target directory does not exist: ${demoDir}`);
      return 1;
    }
  } else {
    demoDir = fs.mkdtempSync(path.join(os.tmpdir(), `swarm-demo-${scenarioName}-`));
    const { execSync } = require('child_process');
    execSync('git init', { cwd: demoDir, stdio: 'pipe' });
    execSync('git config user.email "demo@swarm.local"', { cwd: demoDir, stdio: 'pipe' });
    execSync('git config user.name "Swarm Demo"', { cwd: demoDir, stdio: 'pipe' });
    fs.writeFileSync(path.join(demoDir, 'README.md'), `# Swarm Demo: ${scenarioName}\n`);
    execSync('git add . && git commit -m "init demo"', { cwd: demoDir, stdio: 'pipe' });
  }
  console.log(`📂 Demo folder: ${demoDir}\n`);

  // Run the demo in the target directory; restore cwd when done
  const originalDir = process.cwd();
  process.chdir(demoDir);

  try {
    if (!scenario) {
      console.error(`❌ Demo scenario "${scenarioName}" not found\n`);
      console.log('Available scenarios:');
      demoMode.getAvailableScenarios().forEach(s => {
        console.log(`  - ${s.name}: ${s.description}`);
      });
      console.log('\nRun: swarm demo list\n');
      return 1;
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
    console.log(`    Running in ${isExternalTarget ? 'target' : 'temp'} folder: ${process.cwd()}\n`);

    const plan = demoMode.scenarioToPlan(scenario);

    const storage = new PlanStorage();
    const planPath = storage.savePlan(plan);

    console.log(`✅ Demo plan saved to: ${planPath}\n`);

    // Forward all parsed CLI flags to the swarm executor
    const execOpts: ExecuteSwarmCliOptions = { ...parsedFlags, noQualityGates: true };
    const exitCode = await executeSwarm(path.basename(planPath), execOpts);

    await installDemoDependencies(demoDir);

    return exitCode;
  } finally {
    process.chdir(originalDir);
  }
}

export async function handleDashboardCommand(args: string[]): Promise<number> {
  if (args.length < 2 || !args[1]) {
    console.error('Error: Execution ID required\n');
    showUsage();
    return 1;
  }

  const executionId = args[1];
  try {
    const dashboardModule = await import('./dashboard') as Record<string, unknown>;
    const renderDashboard = dashboardModule.renderDashboard || dashboardModule.startDashboard;
    if (typeof renderDashboard === 'function') {
      renderDashboard(executionId);
      return 0;
    } else {
      console.error('Dashboard module loaded but renderDashboard not found.');
      console.error('Use `swarm status <execid>` to check execution status.');
      return 1;
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Dashboard unavailable:', msg);
    console.error('Use `swarm status <execid>` to check execution status instead.');
    return 1;
  }
}

export async function handleTemplatesCommand(): Promise<number> {
  const templatesDir = path.join(__dirname, '..', 'templates');
  const resolvedDir = fs.existsSync(templatesDir) ? templatesDir : path.join(__dirname, '..', '..', 'templates');
  if (!fs.existsSync(resolvedDir)) {
    console.error('Templates directory not found.');
    return 1;
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
      // Template file is malformed; show it in the listing with an error indicator
      console.log(`  ${file.padEnd(20)}  (invalid JSON)`);
    }
  }
  console.log('  ' + '-'.repeat(60));
  console.log(`\n  Usage: swarm swarm templates/<template>.json\n`);
  return 0;
}

export async function handleShareCommand(args: string[]): Promise<number> {
  const subcommand = args[1];

  if (!subcommand) {
    console.error('Error: share subcommand required (import or context)\n');
    showUsage();
    return 1;
  }

  if (subcommand === 'import') {
    if (args.length < 6) {
      console.error('Error: share import requires: <runid> <step> <agent> <path>\n');
      showUsage();
      return 1;
    }
    const runId = args[2];
    const stepNumber = args[3];
    const agentName = args[4];
    const transcriptPath = args[5];
    if (!runId || !stepNumber || !agentName || !transcriptPath) {
      console.error('Error: all arguments required\n');
      showUsage();
      return 1;
    }
    try {
      return importShare(runId, stepNumber, agentName, transcriptPath);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      return 1;
    }
  }

  if (subcommand === 'context') {
    if (args.length < 4) {
      console.error('Error: share context requires: <runid> <step>\n');
      showUsage();
      return 1;
    }
    const runId = args[2];
    const stepNumber = args[3];
    if (!runId || !stepNumber) {
      console.error('Error: all arguments required\n');
      showUsage();
      return 1;
    }
    try {
      return showShareContext(runId, stepNumber);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      return 1;
    }
  }

  console.error(`Unknown share subcommand: ${subcommand}\n`);
  showUsage();
  return 1;
}

export async function handleAuditCommand(args: string[]): Promise<number> {
  const sessionId = args[1];
  if (!sessionId) {
    console.error('Error: session ID required\nUsage: swarm audit <session-id>');
    return 1;
  }
  const MetricsCollectorClass = require('./metrics-collector').default;
  const collector = new MetricsCollectorClass(sessionId, '');
  const state: SessionState | null = collector.loadSession(sessionId);
  if (!state) {
    console.error(`Session not found: ${sessionId}`);
    return 1;
  }
  console.log(collector.generateAuditReport(state));
  return 0;
}

export async function handleMetricsCommand(args: string[]): Promise<number> {
  const sessionId = args[1];
  if (!sessionId) {
    console.error('Error: session ID required\nUsage: swarm metrics <session-id>');
    return 1;
  }
  const MetricsCollectorClass = require('./metrics-collector').default;
  const collector = new MetricsCollectorClass(sessionId, '');
  const state: SessionState | null = collector.loadSession(sessionId);
  if (!state) {
    console.error(`Session not found: ${sessionId}`);
    return 1;
  }

  const steps = state.graph.steps.length;
  const completed = state.lastCompletedStep;
  const branches = Object.keys(state.branchMap).length;
  const transcripts = Object.keys(state.transcripts).length;
  const gatesPassed = state.gateResults.filter(g => g.status === 'pass').length;
  const gatesFailed = state.gateResults.filter(g => g.status !== 'pass').length;
  const premiumReqs = Number(state.metrics['premiumRequests'] ?? 0);
  const totalMs = Number(state.metrics['totalTimeMs'] ?? 0);

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
  return 0;
}

export async function handleQuickCommand(args: string[]): Promise<number> {
  if (args.length < 2) {
    console.error('Error: Quick-fix mode requires a task');
    console.log('Usage: swarm quick "task description"');
    console.log('Example: swarm quick "fix typo in README"');
    return 1;
  }

  const task = args[1];
  const flags = {
    model: args.includes('--model') ? args[args.indexOf('--model') + 1] : undefined,
    agent: args.includes('--agent') ? args[args.indexOf('--agent') + 1] : undefined,
    tool: args.includes('--tool') ? args[args.indexOf('--tool') + 1] : undefined,
    skipVerify: args.includes('--skip-verify'),
    yes: args.includes('--yes') || args.includes('-y')
  };

  const quickFix = new QuickFixMode();

  console.log('⚡ Quick-Fix Mode\n');

  const quickModel = flags.model || defaultModelForAdapter(flags.tool);
  const { CostEstimator } = require('./cost-estimator') as typeof import('./cost-estimator');
  const quickCostEstimator = new CostEstimator();
  const quickEstimate = quickCostEstimator.estimate(
    {
      goal: task,
      createdAt: new Date().toISOString(),
      steps: [{
        stepNumber: 1,
        agentName: flags.agent || 'backend_master',
        task,
        dependencies: [],
        expectedOutputs: []
      }]
    },
    { modelName: quickModel }
  );
  console.log(`💰 Cost Estimate: ${quickEstimate.lowEstimate}-${quickEstimate.totalPremiumRequests} premium requests`);
  console.log(`   1 step | ${quickModel} (${quickEstimate.modelMultiplier}x)\n`);

  // Gate: require explicit user confirmation before spending tokens
  const quickConfirmed = await confirmCostPrompt(
    quickEstimate.lowEstimate,
    quickEstimate.totalPremiumRequests,
    quickModel,
    flags.yes
  );
  if (!quickConfirmed) {
    console.log('Cancelled.');
    return 0;
  }

  const quickOpts: QuickFixOptions = {
    skipVerification: flags.skipVerify
  };
  if (flags.model) quickOpts.model = flags.model;
  if (flags.agent) quickOpts.agent = flags.agent;

  const result = await quickFix.execute(task, quickOpts);

  if (!result.wasQuickFixEligible) {
    console.log(result.output);
    return 1;
  }

  if (result.success) {
    console.log(`\n✅ Quick-fix completed in ${(result.duration / 1000).toFixed(1)}s`);
    console.log(`   Agent: ${result.agentUsed}`);

    if (result.verificationPassed !== undefined) {
      console.log(`   Verification: ${result.verificationPassed ? '✓ Passed' : '✗ Failed'}`);
    }
    return 0;
  }

  console.error(`\n❌ Quick-fix failed (${(result.duration / 1000).toFixed(1)}s)`);
  console.error(`   Agent: ${result.agentUsed}`);
  if (result.reason) {
    console.error(`   Reason: ${result.reason}`);
  }
  return 1;
}

export async function handleRunCommand(args: string[]): Promise<number> {
  const goalIndex = args.indexOf('--goal');
  let goal = '';
  if (goalIndex !== -1) {
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
    return 1;
  }

  console.log('🐝 Swarm Orchestrator - Plan & Execute\n');
  console.log(`Goal: ${goal}\n`);

  const configLoader = new ConfigLoader();
  const agents = configLoader.loadAllAgents();
  const generator = new PlanGenerator(agents);
  const usePlanCache = args.includes('--plan-cache');
  const plan = generator.createPlan(goal, undefined, { planCache: usePlanCache });

  const storage = new PlanStorage();
  const planFilename = storage.savePlan(plan);
  console.log(`Plan saved: ${planFilename} (${plan.steps.length} steps)\n`);

  try {
    const options = parseSwarmFlags(args);
    return await executeSwarm(path.basename(planFilename), options);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    return 1;
  }
}

// ---------------------------------------------------------------------------
// recipe command handlers
// ---------------------------------------------------------------------------

export async function handleUseCommand(args: string[]): Promise<number> {
  const recipeName = args[1];
  if (!recipeName) {
    console.error('Error: recipe name required\nUsage: swarm use <recipe> [--param key=value ...]');
    return 1;
  }

  let recipe;
  try {
    recipe = loadRecipe(recipeName);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  // Parse --param key=value pairs from remaining args
  const userParams: Record<string, string> = {};
  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--param' && args[i + 1]) {
      const eq = args[i + 1].indexOf('=');
      if (eq === -1) {
        console.error(`Invalid parameter format: "${args[i + 1]}". Expected key=value`);
        return 1;
      }
      const key = args[i + 1].substring(0, eq);
      const value = args[i + 1].substring(eq + 1);
      userParams[key] = value;
      i++; // skip the value token
    }
  }

  let plan;
  try {
    plan = parameterizeRecipe(recipe, userParams);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  console.log(`🐝 Recipe: ${recipe.name}\n`);
  console.log(`   ${recipe.description}`);
  console.log(`   Category: ${recipe.category}`);
  console.log(`   Steps: ${plan.steps.length}\n`);

  plan.steps.forEach(step => {
    console.log(`   Step ${step.stepNumber}: ${step.task.substring(0, 80)}${step.task.length > 80 ? '...' : ''}`);
  });
  console.log('');

  // Save the parameterized plan, then delegate to executeSwarm
  const storage = new PlanStorage();
  const planPath = storage.savePlan(plan, `recipe-${recipeName}-${Date.now()}.json`);
  console.log(`Plan saved: ${planPath}\n`);

  try {
    const options = parseSwarmFlags(args);
    const exitCode = await executeSwarm(path.basename(planPath), options);

    // Record recipe run in knowledge base after execution
    try {
      const { KnowledgeBaseManager } = await import('./knowledge-base');
      const kb = new KnowledgeBaseManager();
      kb.recordRecipeRun({
        recipe: recipeName,
        parameters: userParams,
        tool: options.cliAgent || 'copilot',
        passed: exitCode === 0,
        duration: 0,
        stepsCompleted: plan.steps.length,
        totalSteps: plan.steps.length,
      });
    } catch {
      // Knowledge base recording is non-critical
    }

    return exitCode;
  } catch (error) {
    console.error('Error executing recipe:', error instanceof Error ? error.message : error);
    return 1;
  }
}

export function handleRecipesCommand(): number {
  const recipes = listRecipeDetails();

  if (recipes.length === 0) {
    console.log('No recipes found.');
    return 0;
  }

  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  Available Recipes                                                   ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  for (const recipe of recipes) {
    console.log(`  ${recipe.name}`);
    console.log(`    ${recipe.description}`);
    console.log(`    Category: ${recipe.category} | Steps: ${recipe.steps.length}`);
    const paramNames = Object.keys(recipe.parameters);
    if (paramNames.length > 0) {
      console.log(`    Parameters: ${paramNames.join(', ')}`);
    }
    console.log('');
  }

  console.log('Usage: swarm use <recipe> [--param key=value ...]\n');
  return 0;
}

export function handleRecipeInfoCommand(args: string[]): number {
  const recipeName = args[1];
  if (!recipeName) {
    console.error('Error: recipe name required\nUsage: swarm recipe-info <name>');
    return 1;
  }

  let recipe;
  try {
    recipe = loadRecipe(recipeName);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }

  console.log(`\nRecipe: ${recipe.name}`);
  console.log(`Description: ${recipe.description}`);
  console.log(`Category: ${recipe.category}\n`);

  console.log('Parameters:');
  for (const [key, param] of Object.entries(recipe.parameters)) {
    const defaultStr = param.default !== undefined ? ` (default: ${param.default})` : ' (required)';
    const optionsStr = param.options ? ` [${param.options.join(' | ')}]` : '';
    console.log(`  --param ${key}=<value>  ${param.description}${defaultStr}${optionsStr}`);
  }
  console.log('');

  console.log('Steps:');
  for (const step of recipe.steps) {
    const deps = step.dependencies.length > 0 ? ` (after step ${step.dependencies.join(', ')})` : '';
    console.log(`  ${step.stepNumber}. [${step.agentName}] ${step.task.substring(0, 70)}${step.task.length > 70 ? '...' : ''}${deps}`);
  }
  console.log('');

  return 0;
}

// ---------------------------------------------------------------------------
// agents command handler
// ---------------------------------------------------------------------------

export async function handleAgentsCommand(args: string[]): Promise<number> {
  const subcommand = args[1];

  if (subcommand !== 'export') {
    console.error('Usage: swarm agents export [--output-dir dir] [--min-runs N] [--diff]');
    return 1;
  }

  // Parse flags
  const outputDirIdx = args.indexOf('--output-dir');
  const outputDir = outputDirIdx !== -1 && args[outputDirIdx + 1]
    ? args[outputDirIdx + 1]
    : path.join(process.cwd(), 'agents');

  const minRunsIdx = args.indexOf('--min-runs');
  let minRuns = 5;
  if (minRunsIdx !== -1 && args[minRunsIdx + 1]) {
    const parsed = parseInt(args[minRunsIdx + 1], 10);
    if (!isNaN(parsed) && parsed > 0) minRuns = parsed;
  }

  const diff = args.includes('--diff');

  console.log('🐝 Swarm Orchestrator - Agent Export\n');
  console.log(`Output directory: ${outputDir}`);
  console.log(`Minimum runs for data-driven export: ${minRuns}`);
  if (diff) console.log('Diff mode: enabled\n');
  else console.log('');

  const exporter = new AgentsExporter();
  const result = exporter.export({ outputDir, minRuns, diff });

  if (result.fromData) {
    console.log(`Exported ${result.agentsExported.length} agent(s) with data-driven recommendations.`);
  } else {
    console.log(`Exported ${result.agentsExported.length} agent(s) from base definitions (insufficient run data).`);
  }

  for (const name of result.agentsExported) {
    const filename = name.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '.agent.md';
    console.log(`  - ${filename}`);
  }

  if (diff && result.diffs.length > 0) {
    console.log(`\nChanges detected (${result.diffs.length} diff(s)):`);
    for (const d of result.diffs) {
      console.log(`  ${d.agentName} / ${d.field}:`);
      if (d.previous) console.log(`    - ${d.previous.slice(0, 100)}`);
      console.log(`    + ${d.current.slice(0, 100)}`);
    }
  } else if (diff) {
    console.log('\nNo changes detected since last export.');
  }

  console.log(`\nAgent files written to: ${outputDir}`);
  return 0;
}

// ---------------------------------------------------------------------------
// report command handler
// ---------------------------------------------------------------------------

export async function handleReportCommand(args: string[]): Promise<number> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: swarm report <run-id> [flags]

Generate a structured run report from existing run artifacts.

Arguments:
  <run-id>   The run directory name (e.g., swarm-2026-04-08T05-23-52-947Z)

Flags:
  --format <md|json>   Output format (default: both)
  --stdout             Print to terminal instead of writing files
  --latest             Use the most recent run directory

Examples:
  swarm report swarm-2026-04-08T05-23-52-947Z
  swarm report --latest --format md --stdout
  swarm report --latest
`);
    return 0;
  }

  const useLatest = args.includes('--latest');
  const toStdout = args.includes('--stdout');

  const formatIdx = args.indexOf('--format');
  let format: 'md' | 'json' | 'both' = 'both';
  if (formatIdx !== -1 && args[formatIdx + 1]) {
    const val = args[formatIdx + 1];
    if (val !== 'md' && val !== 'json') {
      console.error(`--format requires "md" or "json", got "${val}"`);
      return 1;
    }
    format = val;
  }

  let runDir: string;

  if (useLatest) {
    const runsRoot = path.join(process.cwd(), 'runs');
    if (!fs.existsSync(runsRoot)) {
      console.error(`No runs/ directory found in ${process.cwd()}`);
      return 1;
    }
    const entries = fs.readdirSync(runsRoot, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort()
      .reverse();
    if (entries.length === 0) {
      console.error('No run directories found in runs/');
      return 1;
    }
    runDir = path.join(runsRoot, entries[0]);
  } else {
    const runId = args.find(a => !a.startsWith('--') && a !== 'report');
    if (!runId) {
      console.error('Error: run-id required (or use --latest)');
      console.error('Usage: swarm report <run-id>');
      return 1;
    }
    runDir = path.join(process.cwd(), 'runs', runId);
    if (!fs.existsSync(runDir)) {
      // Try as absolute path
      runDir = runId;
    }
  }

  if (!fs.existsSync(runDir)) {
    console.error(`Run directory not found: ${runDir}`);
    return 1;
  }

  const { ReportGenerator } = await import('./report-generator');
  const { ReportRenderer } = await import('./report-renderer');

  let report;
  try {
    const generator = new ReportGenerator();
    report = generator.generate(runDir);
  } catch (err) {
    console.error(`Failed to generate report: ${err instanceof Error ? err.message : err}`);
    return 1;
  }

  const md = ReportRenderer.toMarkdown(report);
  const json = ReportRenderer.toJson(report);

  if (toStdout) {
    if (format === 'md' || format === 'both') console.log(md);
    if (format === 'json' || format === 'both') console.log(json);
  } else {
    if (format === 'md' || format === 'both') {
      const mdPath = path.join(runDir, 'report.md');
      fs.writeFileSync(mdPath, md);
      console.log(`Report written: ${mdPath}`);
    }
    if (format === 'json' || format === 'both') {
      const jsonPath = path.join(runDir, 'report.json');
      fs.writeFileSync(jsonPath, json);
      console.log(`Report written: ${jsonPath}`);
    }
  }

  const summary = ReportRenderer.toSummaryLine(report);
  console.log(summary);

  return 0;
}

// Re-export generatePlan for backward compatibility
export { generatePlan };
