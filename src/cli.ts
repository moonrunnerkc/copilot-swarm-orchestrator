#!/usr/bin/env node

import {
  generatePlan,
  handleAgentsCommand,
  handleAuditCommand,
  handleBootstrapCommand,
  handleDashboardCommand,
  handleDemoCommand,
  handleExecuteCommand,
  handleGatesCommand,
  handleMetricsCommand,
  handlePlanCommand,
  handleQuickCommand,
  handleRecipeInfoCommand,
  handleRecipesCommand,
  handleRunCommand,
  handleShareCommand,
  handleStatusCommand,
  handleSwarmCommand,
  handleTemplatesCommand,
  handleUseCommand,
  showUsage,
} from './cli-handlers';
import { startMcpServer } from './mcp-server';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showUsage();
    return;
  }

  const command = args[0];
  let exitCode = 0;

  try {
    switch (command) {
      case 'demo-fast':
        exitCode = await handleDemoCommand(['demo', 'demo-fast', ...args.slice(1)]);
        break;
      case 'gates':
        exitCode = await handleGatesCommand(args.slice(1));
        break;
      case 'quick':
        exitCode = await handleQuickCommand(args);
        break;
      case 'bootstrap':
        exitCode = await handleBootstrapCommand(args);
        break;
      case 'plan':
        exitCode = await handlePlanCommand(args);
        break;
      case 'execute':
        exitCode = await handleExecuteCommand(args);
        break;
      case 'status':
        exitCode = await handleStatusCommand(args);
        break;
      case 'swarm':
        exitCode = await handleSwarmCommand(args);
        break;
      case 'demo':
        exitCode = await handleDemoCommand(args);
        break;
      case 'dashboard':
        exitCode = await handleDashboardCommand(args);
        break;
      case 'templates':
        exitCode = await handleTemplatesCommand();
        break;
      case '--help':
      case '-h':
        showUsage();
        break;
      case 'share':
        exitCode = await handleShareCommand(args);
        break;
      case 'audit':
        exitCode = await handleAuditCommand(args);
        break;
      case 'metrics':
        exitCode = await handleMetricsCommand(args);
        break;
      case 'run':
        exitCode = await handleRunCommand(args);
        break;
      case 'agents':
        exitCode = await handleAgentsCommand(args);
        break;
      case 'use':
        exitCode = await handleUseCommand(args);
        break;
      case 'recipes':
        exitCode = handleRecipesCommand();
        break;
      case 'recipe-info':
        exitCode = handleRecipeInfoCommand(args);
        break;
      case 'mcp-server':
        startMcpServer(process.cwd());
        break;
      default:
        console.log(`Unknown command: ${command}\n`);
        showUsage();
        exitCode = 1;
    }
  } catch (error) {
    console.error('Fatal error:', error instanceof Error ? error.message : String(error));
    exitCode = 1;
  }

  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

if (require.main === module) {
  main();
}

export { generatePlan, main };

