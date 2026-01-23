#!/usr/bin/env node

import * as path from 'path';
import { ConfigLoader } from './config-loader';
import { PlanGenerator, PlanStep } from './plan-generator';
import { PlanStorage } from './plan-storage';

function showUsage(): void {
  console.log(`
Copilot Swarm Conductor - Sequential AI Workflow Tool

Usage:
  swarm-conductor plan <goal>          Generate a plan for the given goal
  swarm-conductor plan --help          Show this help message

Examples:
  swarm-conductor plan "Build a REST API for user management"
  swarm-conductor plan "Add authentication to the web app"

The plan command will:
  1. Load available agent profiles
  2. Create a step-by-step execution plan
  3. Save the plan to plans/ directory
  4. Display the plan for review

Note: In this implementation, plan generation is manual. 
In production, this would integrate with Copilot CLI for AI-powered planning.
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
  console.log(`\nTo execute this plan, run: swarm-conductor execute ${path.basename(planPath)}`);
  console.log('(Note: Execution command will be implemented in Phase 4)\n');
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
