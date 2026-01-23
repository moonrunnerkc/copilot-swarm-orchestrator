import * as assert from 'assert';
import ExternalToolManager from '../src/external-tool-manager.js';
import * as fs from 'fs';
import * as path from 'path';

describe('ExternalToolManager', () => {
  let tmpLogFile: string;

  beforeEach(() => {
    tmpLogFile = path.join(__dirname, `test-log-${Date.now()}.json`);
  });

  afterEach(() => {
    if (fs.existsSync(tmpLogFile)) {
      fs.unlinkSync(tmpLogFile);
    }
  });

  it('should detect available tools', async () => {
    const manager = new ExternalToolManager({
      enableExternal: true,
      dryRun: false
    });

    const tools = await manager.detectAvailableTools();

    assert.ok('gh' in tools);
    assert.ok('vercel' in tools);
    assert.ok('netlify' in tools);
    // gh should be available (it's installed in this system)
    assert.strictEqual(typeof tools.gh, 'boolean');
  });

  it('should block command execution when enableExternal is false', async () => {
    const manager = new ExternalToolManager({
      enableExternal: false,
      dryRun: false
    });

    const result = await manager.executeCommand('echo', ['test']);

    assert.strictEqual(result.exitCode, -1);
    assert.ok(result.error?.includes('External tool execution disabled'));
  });

  it('should log commands in dry-run mode without executing', async () => {
    const manager = new ExternalToolManager({
      enableExternal: true,
      dryRun: true,
      logFile: tmpLogFile
    });

    const result = await manager.executeCommand('echo', ['test-message']);

    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.output?.includes('DRY RUN'));
    assert.ok(fs.existsSync(tmpLogFile));
  });

  it('should sanitize command arguments containing secrets', async () => {
    const manager = new ExternalToolManager({
      enableExternal: true,
      dryRun: true
    });

    const result = await manager.executeCommand('curl', [
      '-H',
      'Authorization: token=abc123',
      'https://api.example.com'
    ]);

    const log = manager.getExecutionLog();
    const lastExecution = log[log.length - 1];
    
    // Args should be sanitized in the log
    const tokenArg = lastExecution.args.find(arg => arg.includes('token'));
    assert.ok(tokenArg?.includes('[REDACTED]'));
  });

  it('should log command execution metadata', async () => {
    const manager = new ExternalToolManager({
      enableExternal: true,
      dryRun: true,
      logFile: tmpLogFile
    });

    await manager.executeCommand('echo', ['test']);

    const log = manager.getExecutionLog();
    assert.strictEqual(log.length, 1);
    assert.strictEqual(log[0].command, 'echo');
    assert.ok(log[0].args);
    assert.ok(log[0].timestamp);
    assert.ok(log[0].workingDir);
    assert.strictEqual(log[0].exitCode, 0);
  });

  it('should fail gracefully when required tool is not available', async () => {
    const manager = new ExternalToolManager({
      enableExternal: true,
      dryRun: false
    });

    // Vercel is not installed in this env
    const result = await manager.executeCommand(
      'vercel',
      ['deploy'],
      { requireTool: 'vercel' }
    );

    assert.strictEqual(result.exitCode, -1);
    assert.ok(result.error?.includes('not available'));
  });

  it('should execute real commands when enabled and not dry-run', async () => {
    const manager = new ExternalToolManager({
      enableExternal: true,
      dryRun: false
    });

    const result = await manager.executeCommand('echo', ['hello']);

    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.output?.includes('hello'));
    assert.ok('duration' in result);
  });
});
