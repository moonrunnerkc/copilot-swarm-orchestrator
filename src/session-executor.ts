import { spawn, SpawnOptions } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { AgentProfile } from './config-loader';
import { PlanStep } from './plan-generator';
import { ExecutionContext } from './step-runner';

export interface SessionOptions {
  model?: string | undefined;
  silent?: boolean;
  allowAllTools?: boolean;
  availableTools?: string[];
  mcpConfig?: string;
  agent?: string;
  shareToFile?: string;
  logPrefix?: string; // prefix for live console logs (e.g., "[Agent:Step]")
}

export interface SessionResult {
  success: boolean;
  output: string;
  error?: string;
  transcriptPath?: string;
  exitCode: number;
  duration: number;
}

/**
 * Executes GitHub Copilot CLI sessions programmatically
 * Uses the real `copilot -p` command with automation flags
 */
export class SessionExecutor {
  private copilotBin: string;
  private workingDir: string;

  constructor(workingDir?: string) {
    this.copilotBin = 'copilot';
    this.workingDir = workingDir || process.cwd();
  }

  /**
   * Execute a Copilot CLI session with a prompt
   * Returns full output and transcript path if --share used
   */
  async executeSession(
    prompt: string,
    options: SessionOptions = {}
  ): Promise<SessionResult> {
    const startTime = Date.now();

    // build command args based on real copilot CLI flags
    const args: string[] = ['-p', prompt];

    if (options.model) {
      args.push('--model', options.model);
    }

    if (options.silent) {
      args.push('--silent');
    }

    if (options.allowAllTools) {
      args.push('--allow-all-tools');
    }

    if (options.availableTools && options.availableTools.length > 0) {
      args.push('--available-tools', ...options.availableTools);
    }

    if (options.mcpConfig) {
      args.push('--additional-mcp-config', options.mcpConfig);
    }

    if (options.agent) {
      args.push('--agent', options.agent);
    }

    if (options.shareToFile) {
      args.push('--share', options.shareToFile);
    }

    // execute copilot command with optional log prefix for parallelism visibility
    const result = await this.runCommand(this.copilotBin, args, options.logPrefix);

    const duration = Date.now() - startTime;

    return {
      success: result.exitCode === 0,
      output: result.stdout + result.stderr,
      error: result.exitCode !== 0 ? result.stderr : undefined,
      transcriptPath: options.shareToFile && result.exitCode === 0 ? options.shareToFile : undefined,
      exitCode: result.exitCode,
      duration
    } as SessionResult;
  }

  /**
   * Execute a step with automatic session creation
   * Includes human-like commit instructions
   */
  async executeStep(
    step: PlanStep,
    agent: AgentProfile,
    context: ExecutionContext,
    options: SessionOptions = {}
  ): Promise<SessionResult> {
    // generate comprehensive prompt with human-like commit instructions
    const prompt = this.buildStepPrompt(step, agent, context);

    // set up transcript path
    const transcriptPath = path.join(
      this.workingDir,
      'proof',
      `step-${step.stepNumber}-${agent.name.toLowerCase()}.md`
    );

    // ensure proof directory exists
    const proofDir = path.dirname(transcriptPath);
    if (!fs.existsSync(proofDir)) {
      fs.mkdirSync(proofDir, { recursive: true });
    }

    // merge options with defaults
    const sessionOptions: SessionOptions = {
      silent: false,
      allowAllTools: true, // enable git, npm, test commands
      shareToFile: transcriptPath,
      ...options
    };

    return this.executeSession(prompt, sessionOptions);
  }

  /**
   * Build comprehensive step prompt with human-like commit guidance
   */
  private buildStepPrompt(
    step: PlanStep,
    agent: AgentProfile,
    context: ExecutionContext
  ): string {
    const sections: string[] = [];

    sections.push('=== COPILOT CLI SESSION - Step ' + step.stepNumber + ' ===\n');

    sections.push('You are operating as a GitHub Copilot CLI custom agent within a supervised,');
    sections.push('sequential workflow.\n');

    sections.push('Context');
    sections.push('-------');
    sections.push('- This repository is: ' + context.plan.goal);
    sections.push('- Execution ID: ' + context.executionId);
    sections.push('- Step: ' + step.stepNumber + ' of ' + context.plan.steps.length);
    sections.push('- Your work must be fully auditable through session transcripts, git history,');
    sections.push('  and test output.\n');

    sections.push('Your assigned role');
    sections.push('------------------');
    sections.push('- Agent name: ' + agent.name);
    sections.push('- Domain scope: ' + agent.purpose);
    sections.push('- You must stay strictly within this domain.');
    sections.push('- If a task exceeds this scope, say so and stop.\n');

    sections.push('Your specific task for this step');
    sections.push('---------------------------------');
    sections.push(step.task + '\n');

    sections.push('Scope (what you ARE responsible for)');
    sections.push('-------------------------------------');
    agent.scope.forEach(item => {
      sections.push('- ' + item);
    });
    sections.push('');

    sections.push('Boundaries (what you should NOT do)');
    sections.push('-----------------------------------');
    agent.boundaries.forEach(item => {
      sections.push('- ' + item);
    });
    sections.push('');

    // CRITICAL: Human-like commit instructions
    sections.push('Git Commit Requirements (CRITICAL)');
    sections.push('-----------------------------------');
    sections.push('Make INCREMENTAL commits throughout your work, not one giant commit at the end.');
    sections.push('');
    sections.push('Each commit message must be:');
    sections.push('- Natural and human-written (avoid AI patterns like perfect grammar or templates)');
    sections.push('- Descriptive and imperative ("add feature" not "added feature")');
    sections.push('- Contextual and specific to what changed');
    sections.push('- Varied in style (mix of conventional-commits, casual, technical)');
    sections.push('');
    sections.push('Good commit message examples:');
    sections.push('  "add user authentication module"');
    sections.push('  "fix: handle edge case in validator"');
    sections.push('  "update deps and tweak config"');
    sections.push('  "implement todo list component with tests"');
    sections.push('  "refactor api client, clean up error handling"');
    sections.push('');
    sections.push('Commit frequently in logical chunks:');
    sections.push('  git add <files>');
    sections.push('  git commit -m "your natural message"');
    sections.push('');
    sections.push('Feel free to tweak configs (package.json, tsconfig.json, etc.) and commit them naturally.');
    sections.push('');

    sections.push('Hard rules');
    sections.push('----------');
    sections.push('1. Do not invent features, flags, APIs, or tool behavior.');
    sections.push('2. If you are uncertain about anything, explicitly say you are uncertain');
    sections.push('   and list how to verify it.');
    sections.push('3. Do not claim tests passed unless you actually ran them and can show');
    sections.push('   the command output.');
    sections.push('4. Do not say "done" unless all required artifacts exist.');
    sections.push('5. Prefer small, reviewable changes over large refactors.');
    sections.push('6. Make multiple small commits with varied, natural messages.');
    sections.push('7. ALWAYS verify your branch before committing: git branch --show-current\n');

    sections.push('Quality bar (applies when relevant to your scope)');
    sections.push('-----------------------------------------------');
    sections.push('- Extract-before-repeat: if you copy the same logic more than twice, stop and refactor into a shared util/hook/middleware.');
    sections.push('- Config-first: do not hardcode API base URLs, timeouts, retry counts, or environment-specific values. Prefer env vars or a typed config module.');
    sections.push('- README truth: do not claim features that are not implemented. If you are unsure, downgrade the claim and include how to verify.');
    sections.push('- Keep it boring and verifiable: request logging, correlation id propagation, and consistent error responses when building HTTP APIs.');
    sections.push('- For frontends: use a real HTML title, include responsive meta viewport, and centralize fetch error handling (retry/backoff only if implemented).');
    sections.push('');

    sections.push('Code comments (Required)');
    sections.push('------------------------');
    sections.push('- Add a 1-2 line purpose comment at top of each new file');
    sections.push('- Add brief inline comments for non-obvious logic');
    sections.push('- Use natural, casual language - not robotic/formal');
    sections.push('- Good: "// bail early if no items"');
    sections.push('- Bad: "// This conditional statement checks if the array is empty..."');
    sections.push('- For functions: brief docstring explaining purpose\n');

    sections.push('Refusal rules (when to stop and ask)');;
    sections.push('-------------------------------------');
    agent.refusal_rules.forEach(rule => {
      sections.push('- ' + rule);
    });
    sections.push('');

    if (step.dependencies.length > 0) {
      sections.push('Dependencies (steps you can rely on)');
      sections.push('------------------------------------');
      sections.push('This step depends on: Steps ' + step.dependencies.join(', '));

      if (context.priorContext.length > 0) {
        sections.push('');
        sections.push('Context from prior steps:');
        context.priorContext.forEach(ctx => {
          sections.push('  ' + ctx);
        });
      }
      sections.push('');
    }

    sections.push('Done definition (when you can say "done")');
    sections.push('------------------------------------------');
    agent.done_definition.forEach(item => {
      sections.push('- ' + item);
    });
    sections.push('');

    sections.push('Required artifacts for this step');
    sections.push('--------------------------------');
    sections.push('1. Implementation changes (code, config, etc.)');
    sections.push('2. Multiple small commits with varied, natural messages');
    sections.push('3. A verification section that includes:');
    sections.push('   - What commands you ran');
    sections.push('   - What tests were executed');
    sections.push('   - The results of those tests');
    sections.push('   - Any gaps or risks that remain');
    sections.push('');
    sections.push('Expected outputs:');
    step.expectedOutputs.forEach(output => {
      sections.push('   - ' + output);
    });
    sections.push('');

    sections.push('If any requirement cannot be met, stop and explain why before proceeding.');
    sections.push('');
    sections.push('=== BEGIN WORK ===');

    return sections.join('\n');
  }

  /**
   * Run a command and capture output.
   * Uses line buffering to prevent mid-word breaks when streaming output.
   * Each complete line gets prefixed with [Agent:Step] for parallelism visibility.
   * A heartbeat indicator prints during quiet periods so users know the agent
   * is still working (e.g. reading large files or thinking).
   */
  private runCommand(
    command: string,
    args: string[],
    logPrefix?: string
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
      const options: SpawnOptions = {
        cwd: this.workingDir,
        env: {
          ...process.env,
          // ensure copilot can authenticate
          COPILOT_ALLOW_ALL: 'true'
        }
      };

      const proc = spawn(command, args, options);

      let stdout = '';
      let stderr = '';

      // line buffers prevent mid-word breaks in streamed output
      let stdoutBuffer = '';
      let stderrBuffer = '';

      // Heartbeat: print activity status during quiet periods (no output for 10s)
      let lineCount = 0;
      let lastOutputTime = Date.now();
      const cmdStartTime = Date.now();
      let heartbeatInterval: NodeJS.Timeout | null = null;

      if (logPrefix) {
        heartbeatInterval = setInterval(() => {
          const silentMs = Date.now() - lastOutputTime;
          if (silentMs >= 10000) {
            const elapsed = Math.round((Date.now() - cmdStartTime) / 1000);
            console.log(`${logPrefix} ... still working (${elapsed}s, ${lineCount} lines so far)`);
            lastOutputTime = Date.now(); // reset so we don't spam
          }
        }, 5000);
      }

      if (proc.stdout) {
        proc.stdout.on('data', (data) => {
          const text = data.toString();
          stdout += text;
          lastOutputTime = Date.now();

          // buffer partial lines, only print complete ones
          if (logPrefix) {
            stdoutBuffer += text;
            const lines = stdoutBuffer.split('\n');
            // keep last (possibly incomplete) line in buffer
            stdoutBuffer = lines.pop() || '';
            // print complete lines with prefix
            for (const line of lines) {
              if (line.trim()) {
                lineCount++;
                console.log(`${logPrefix} ${line}`);
              }
            }
          }
        });
      }

      if (proc.stderr) {
        proc.stderr.on('data', (data) => {
          const text = data.toString();
          stderr += text;
          lastOutputTime = Date.now();

          // buffer partial lines, only print complete ones
          if (logPrefix) {
            stderrBuffer += text;
            const lines = stderrBuffer.split('\n');
            // keep last (possibly incomplete) line in buffer
            stderrBuffer = lines.pop() || '';
            // print complete lines with prefix
            for (const line of lines) {
              if (line.trim()) {
                lineCount++;
                console.error(`${logPrefix} ${line}`);
              }
            }
          }
        });
      }

      proc.on('close', (code) => {
        // stop heartbeat
        if (heartbeatInterval) clearInterval(heartbeatInterval);

        // flush any remaining buffered content
        if (logPrefix) {
          if (stdoutBuffer.trim()) {
            lineCount++;
            console.log(`${logPrefix} ${stdoutBuffer}`);
          }
          if (stderrBuffer.trim()) {
            lineCount++;
            console.error(`${logPrefix} ${stderrBuffer}`);
          }
        }

        resolve({
          stdout,
          stderr,
          exitCode: code || 0
        });
      });

      proc.on('error', (err) => {
        // stop heartbeat
        if (heartbeatInterval) clearInterval(heartbeatInterval);

        // flush buffers on error too
        if (logPrefix) {
          if (stdoutBuffer.trim()) {
            console.log(`${logPrefix} ${stdoutBuffer}`);
          }
          if (stderrBuffer.trim()) {
            console.error(`${logPrefix} ${stderrBuffer}`);
          }
        }

        resolve({
          stdout,
          stderr: stderr + '\n' + err.message,
          exitCode: 1
        });
      });
    });
  }

  /**
   * Retry a session execution up to N times on failure
   */
  async executeWithRetry(
    prompt: string,
    options: SessionOptions = {},
    maxRetries: number = 3
  ): Promise<SessionResult> {
    let lastResult: SessionResult | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      lastResult = await this.executeSession(prompt, options);

      if (lastResult.success) {
        return lastResult;
      }

      if (attempt < maxRetries) {
        console.error(`Attempt ${attempt} failed, retrying... (${maxRetries - attempt} left)`);
        // wait before retry (exponential backoff)
        await this.sleep(Math.pow(2, attempt) * 1000);
      }
    }

    return lastResult as SessionResult;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default SessionExecutor;
