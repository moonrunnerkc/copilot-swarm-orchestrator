/**
 * Simple terminal dashboard for displaying execution status
 * No fancy TUI library - just clean terminal output
 */

import * as fs from 'fs';
import * as path from 'path';
import { ExecutionContext, StepResult } from './step-runner';

export class Dashboard {
  private context: ExecutionContext;

  constructor(context: ExecutionContext) {
    this.context = context;
  }

  /**
   * Render the dashboard to terminal
   */
  render(): void {
    console.clear();
    this.renderHeader();
    this.renderPlanInfo();
    this.renderSteps();
    this.renderFooter();
  }

  private renderHeader(): void {
    const width = 70;
    console.log('═'.repeat(width));
    console.log('  Copilot Swarm Orchestrator - Execution Dashboard');
    console.log('═'.repeat(width));
    console.log(`  Execution ID: ${this.context.executionId}`);
    console.log('─'.repeat(width));
  }

  private renderPlanInfo(): void {
    console.log(`\n  Plan: \x1b[32m${this.context.plan.goal}\x1b[0m`);
    console.log(`  Total Steps: ${this.context.plan.steps.length}`);
    console.log(`  Started: ${new Date(this.context.startTime).toLocaleString()}`);
    
    if (this.context.options) {
      console.log('\n  GitHub Integration:');
      if (this.context.options.delegate) {
        console.log('    \x1b[33m✓\x1b[0m /delegate enabled');
      }
      if (this.context.options.mcp) {
        console.log('    \x1b[33m✓\x1b[0m MCP evidence required');
      }
    }
  }

  private renderSteps(): void {
    console.log('\n  Execution Steps:');
    console.log('  ' + '─'.repeat(68));

    this.context.stepResults.forEach((result, idx) => {
      const step = this.context.plan.steps[idx];
      if (!step) return;

      const statusIcon = this.getStatusIcon(result.status);
      const statusColor = this.getStatusColor(result.status);
      
      console.log(`\n  ${statusColor}${statusIcon}\x1b[0m Step ${result.stepNumber}: ${step.task}`);
      console.log(`     Agent: ${result.agentName}`);
      
      if (step.dependencies.length > 0) {
        console.log(`     Depends on: Steps ${step.dependencies.join(', ')}`);
      }

      if (result.status === 'completed' && result.transcriptPath) {
        console.log(`     \x1b[36m📄 Transcript: ${result.transcriptPath}\x1b[0m`);
      }

      if (result.status === 'running') {
        console.log(`     \x1b[33m⏳ In progress...\x1b[0m`);
      }

      if (result.errors && result.errors.length > 0) {
        console.log(`     \x1b[31m⚠ Errors: ${result.errors.join(', ')}\x1b[0m`);
      }
    });

    console.log('\n  ' + '─'.repeat(68));
  }

  private renderFooter(): void {
    const completed = this.context.stepResults.filter(r => r.status === 'completed').length;
    const failed = this.context.stepResults.filter(r => r.status === 'failed').length;
    const running = this.context.stepResults.filter(r => r.status === 'running').length;
    const pending = this.context.stepResults.filter(r => r.status === 'pending').length;

    console.log('\n  Summary:');
    console.log(`    \x1b[32m✓ Completed: ${completed}\x1b[0m`);
    console.log(`    \x1b[33m▶ Running: ${running}\x1b[0m`);
    console.log(`    \x1b[37m○ Pending: ${pending}\x1b[0m`);
    if (failed > 0) {
      console.log(`    \x1b[31m✗ Failed: ${failed}\x1b[0m`);
    }

    console.log('\n  ' + '═'.repeat(68));
    console.log('  Press Ctrl+C to exit');
    console.log('  ' + '═'.repeat(68) + '\n');
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case 'completed': return '✓';
      case 'running': return '▶';
      case 'failed': return '✗';
      case 'skipped': return '⊘';
      case 'pending':
      default: return '○';
    }
  }

  private getStatusColor(status: string): string {
    switch (status) {
      case 'completed': return '\x1b[32m';  // green
      case 'running': return '\x1b[33m';    // yellow
      case 'failed': return '\x1b[31m';     // red
      case 'skipped': return '\x1b[90m';    // gray
      case 'pending':
      default: return '\x1b[37m';           // white
    }
  }
}

/**
 * Render dashboard for an execution
 */
export function renderDashboard(executionId: string): void {
  const proofDir = path.join(process.cwd(), 'proof');
  const contextPath = path.join(proofDir, `${executionId}.json`);

  if (!fs.existsSync(contextPath)) {
    console.error(`Error: Execution context not found: ${contextPath}`);
    console.error(`\nAvailable executions:`);
    
    if (fs.existsSync(proofDir)) {
      const files = fs.readdirSync(proofDir)
        .filter(f => f.startsWith('exec-') && f.endsWith('.json'));
      
      if (files.length === 0) {
        console.error('  (none)');
      } else {
        files.forEach(f => {
          const execId = f.replace('.json', '');
          console.error(`  - ${execId}`);
        });
      }
    }
    
    process.exit(1);
  }

  const context: ExecutionContext = JSON.parse(
    fs.readFileSync(contextPath, 'utf-8')
  );

  const dashboard = new Dashboard(context);
  dashboard.render();
}
