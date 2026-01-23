#!/usr/bin/env node

import * as path from 'path';
import { ConfigLoader } from './config-loader';
import { PlanGenerator, PlanStep } from './plan-generator';
import { PlanStorage } from './plan-storage';
import { StepRunner } from './step-runner';

function showUsage(): void {
  console.log(`
Copilot Swarm Conductor - Sequential AI Workflow Tool

Usage:
  swarm-conductor plan <goal>          Generate a plan for the given goal
  swarm-conductor execute <planfile>   Execute a saved plan step-by-step
  swarm-conductor status <execid>      Show execution status
  swarm-conductor --help               Show this help message

Examples:
  swarm-conductor plan "Build a REST API for user management"
  swarm-conductor execute plan-2026-01-23T00-07-02-308Z-build-api.json
  swarm-conductor status exec-2026-01-23T00-10-15-123Z

The plan command will:
  1. Load available agent profiles
  2. Create a step-by-step execution plan
  3. Save the plan to plans/ directory
  4. Display the plan for review

The execute command will:
  1. Load the specified plan
  2. Walk through each step sequentially
  3. Generate Copilot CLI session prompts
  4. Track execution progress and context
  5. Save execution state to proof/ directory
`);
}

function generatePlan(goal: string): void {
  console.log('Copilot Swarm Conductor - Plan Generation\n');
  console.log(`Goal: ${goal}\n`);

  // Load available agents
  const configLoader = new ConfigLoader();
  const agents = configLoader.loadAllAgents();
  
  console.log(`Loaded ${agents.length} agent profiles:`);
  agents.forEach(agent => {
    console.log(`  - ${agent.name}: ${agent.purpose}`);
  });
  console.log();

  // Generate plan
  const generator = new PlanGenerator(agents);
  
  // For Phase 3, we create a simple demonstration plan
  // In production, this would invoke Copilot CLI to generate the plan
  const exampleSteps: PlanStep[] = [
    {
      stepNumber: 1,
      agentName: 'BackendMaster',
      task: 'Design and implement core API structure',
      dependencies: [],
      expectedOutputs: ['API endpoint definitions', 'Database schema', 'Test results']
    },
    {
      stepNumber: 2,
      agentName: 'SecurityAuditor',
      task: 'Review API security and authentication',
      dependencies: [1],
      expectedOutputs: ['Security audit report', 'Fixed vulnerabilities']
    },
    {
      stepNumber: 3,
      agentName: 'TesterElite',
      task: 'Create comprehensive test suite',
      dependencies: [1, 2],
      expectedOutputs: ['Test files', 'Coverage report', 'Test execution results']
    },
    {
      stepNumber: 4,
      agentName: 'IntegratorFinalizer',
      task: 'Verify integration and prepare documentation',
      dependencies: [1, 2, 3],
      expectedOutputs: ['Integration test results', 'API documentation', 'Release notes']
    }
  ];

  const plan = generator.createPlan(goal, exampleSteps);

  // Display plan
  console.log('Generated Execution Plan:');
  console.log('========================\n');
  
  plan.steps.forEach(step => {
    console.log(`Step ${step.stepNumber}: ${step.task}`);
    console.log(`  Agent: ${step.agentName}`);
    if (step.dependencies.length > 0) {
      console.log(`  Dependencies: Steps ${step.dependencies.join(', ')}`);
    }
    console.log(`  Expected outputs:`);
    step.expectedOutputs.forEach(output => {
      console.log(`    - ${output}`);
    });
    console.log();
  });

  // Get execution order
  const executionOrder = generator.getExecutionOrder(plan);
  console.log(`Execution Order: ${executionOrder.join(' → ')}\n`);

  // Save plan
  const storage = new PlanStorage();
  const planPath = storage.savePlan(plan);
  console.log(`✓ Plan saved to: ${planPath}`);
  console.log(`\nTo execute this plan, run: swarm-conductor execute ${path.basename(planPath)}\n`);
}

function executePlan(planFilename: string): void {
  console.log('Copilot Swarm Conductor - Plan Execution\n');

  // Load plan
  const storage = new PlanStorage();
  const plan = storage.loadPlan(planFilename);
  
  console.log(`Plan: ${plan.goal}`);
  console.log(`Steps: ${plan.steps.length}\n`);

  // Load agents
  const configLoader = new ConfigLoader();
  const agents = configLoader.loadAllAgents();

  // Initialize execution
  const runner = new StepRunner();
  const context = runner.initializeExecution(plan, planFilename);
  
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
  console.log(`  swarm-conductor status ${context.executionId}\n`);
}

function showStatus(executionId: string): void {
  console.log('Copilot Swarm Conductor - Execution Status\n');

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

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showUsage();
    process.exit(0);
  }

  const command = args[0];

  if (command === 'plan') {
    if (args.length < 2 || args[1] === '--help') {
      showUsage();
      process.exit(0);
    }

    const goal = args.slice(1).join(' ');
    try {
      generatePlan(goal);
    } catch (error) {
      console.error('Error generating plan:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  } else if (command === 'execute') {
    if (args.length < 2 || !args[1]) {
      console.error('Error: Plan filename required\n');
      showUsage();
      process.exit(1);
    }

    const planFilename = args[1];
    try {
      executePlan(planFilename);
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
  } else if (command === '--help' || command === '-h') {
    showUsage();
    process.exit(0);
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

export { main, generatePlan };
