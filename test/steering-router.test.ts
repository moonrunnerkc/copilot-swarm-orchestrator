import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import SteeringRouter from '../src/steering-router.js';
import ConflictResolver from '../src/conflict-resolver.js';
import { parseSteeringCommand } from '../src/steering-types.js';

describe('SteeringRouter', () => {
  let tmpDir: string;
  let conflictResolver: ConflictResolver;
  let router: SteeringRouter;

  beforeEach(() => {
    tmpDir = path.join(__dirname, `test-steering-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    conflictResolver = new ConflictResolver(tmpDir);
    router = new SteeringRouter(conflictResolver, tmpDir, false);
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should initialize with idle status', () => {
    const state = router.getState();
    assert.strictEqual(state.status, 'idle');
    assert.strictEqual(state.readOnly, false);
    assert.strictEqual(state.pendingConflicts.length, 0);
  });

  it('should update status', () => {
    router.updateStatus('running');
    const state = router.getState();
    assert.strictEqual(state.status, 'running');
  });

  it('should update current wave', () => {
    router.updateWave(3);
    const state = router.getState();
    assert.strictEqual(state.currentWave, 3);
  });

  it('should handle pause command when running', async () => {
    router.updateStatus('running');
    
    const command = parseSteeringCommand('pause');
    assert.ok(command);
    
    const result = await router.processCommand(command!);
    
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.action, 'pause');
    assert.strictEqual(router.getState().status, 'paused');
  });

  it('should reject pause when not running', async () => {
    router.updateStatus('idle');
    
    const command = parseSteeringCommand('pause');
    assert.ok(command);
    
    const result = await router.processCommand(command!);
    
    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('Cannot pause'));
  });

  it('should handle resume command when paused', async () => {
    router.updateStatus('paused');
    
    const command = parseSteeringCommand('resume');
    assert.ok(command);
    
    const result = await router.processCommand(command!);
    
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.action, 'resume');
    assert.strictEqual(router.getState().status, 'running');
  });

  it('should reject resume when not paused', async () => {
    router.updateStatus('running');
    
    const command = parseSteeringCommand('resume');
    assert.ok(command);
    
    const result = await router.processCommand(command!);
    
    assert.strictEqual(result.success, false);
  });

  it('should handle approve command with pending conflict', async () => {
    conflictResolver.addConflict({
      type: 'verification',
      stepNumber: 1,
      agentName: 'TestAgent',
      description: 'Test conflict',
      evidence: [],
      timestamp: new Date().toISOString()
    });

    const command = parseSteeringCommand('approve');
    assert.ok(command);
    
    const result = await router.processCommand(command!);
    
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.action, 'approve');
    assert.ok(result.message.includes('Approved'));
  });

  it('should reject approve with no pending conflicts', async () => {
    const command = parseSteeringCommand('approve');
    assert.ok(command);
    
    const result = await router.processCommand(command!);
    
    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('No pending conflicts'));
  });

  it('should handle reject command', async () => {
    conflictResolver.addConflict({
      type: 'merge',
      stepNumber: 2,
      agentName: 'Agent2',
      description: 'Merge conflict',
      evidence: ['file.ts'],
      timestamp: new Date().toISOString()
    });

    const command = parseSteeringCommand('reject');
    assert.ok(command);
    
    const result = await router.processCommand(command!);
    
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.action, 'reject');
  });

  it('should handle help command', async () => {
    const command = parseSteeringCommand('help');
    assert.ok(command);
    
    const result = await router.processCommand(command!);
    
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.action, 'help');
    assert.ok(result.message.includes('Available commands'));
  });

  it('should handle prioritize command', async () => {
    const command = parseSteeringCommand('prioritize step 5');
    assert.ok(command);
    assert.strictEqual(command.type, 'prioritize');
    assert.strictEqual(command.target, '5');
    
    const result = await router.processCommand(command);
    
    assert.strictEqual(result.success, true);
  });

  it('should log steering commands', async () => {
    const command = parseSteeringCommand('pause');
    assert.ok(command);
    
    router.updateStatus('running');
    await router.processCommand(command);
    
    const history = router.getSteeringHistory();
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].type, 'pause');
  });

  it('should persist steering log to disk', async () => {
    const command = parseSteeringCommand('pause');
    assert.ok(command);
    
    router.updateStatus('running');
    await router.processCommand(command);
    
    const logPath = path.join(tmpDir, 'steering-log.json');
    assert.ok(fs.existsSync(logPath));
    
    const data = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    assert.strictEqual(data.length, 1);
    assert.strictEqual(data[0].type, 'pause');
  });

  it('should reject commands in read-only mode', async () => {
    const readOnlyRouter = new SteeringRouter(conflictResolver, tmpDir, true);
    
    const command = parseSteeringCommand('pause');
    assert.ok(command);
    
    const result = await readOnlyRouter.processCommand(command);
    
    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('Read-only'));
  });

  it('should load steering log from disk', async () => {
    const command = parseSteeringCommand('pause');
    assert.ok(command);
    
    router.updateStatus('running');
    await router.processCommand(command);
    
    // Create new router with same dir
    const router2 = new SteeringRouter(conflictResolver, tmpDir, false);
    const history = router2.getSteeringHistory();
    
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].type, 'pause');
  });
});

describe('Steering Command Parsing', () => {
  it('should parse pause command', () => {
    const cmd = parseSteeringCommand('pause');
    assert.ok(cmd);
    assert.strictEqual(cmd.type, 'pause');
    assert.strictEqual(cmd.userId, 'human');
  });

  it('should parse short pause command', () => {
    const cmd = parseSteeringCommand('p');
    assert.ok(cmd);
    assert.strictEqual(cmd.type, 'pause');
  });

  it('should parse resume command', () => {
    const cmd = parseSteeringCommand('resume');
    assert.ok(cmd);
    assert.strictEqual(cmd.type, 'resume');
  });

  it('should parse approve command', () => {
    const cmd = parseSteeringCommand('approve');
    assert.ok(cmd);
    assert.strictEqual(cmd.type, 'approve');
  });

  it('should parse short approve (y)', () => {
    const cmd = parseSteeringCommand('y');
    assert.ok(cmd);
    assert.strictEqual(cmd.type, 'approve');
  });

  it('should parse reject command', () => {
    const cmd = parseSteeringCommand('reject');
    assert.ok(cmd);
    assert.strictEqual(cmd.type, 'reject');
  });

  it('should parse short reject (n)', () => {
    const cmd = parseSteeringCommand('n');
    assert.ok(cmd);
    assert.strictEqual(cmd.type, 'reject');
  });

  it('should parse help command', () => {
    const cmd = parseSteeringCommand('help');
    assert.ok(cmd);
    assert.strictEqual(cmd.type, 'help');
  });

  it('should parse prioritize with step number', () => {
    const cmd = parseSteeringCommand('prioritize step 3');
    assert.ok(cmd);
    assert.strictEqual(cmd.type, 'prioritize');
    assert.strictEqual(cmd.target, '3');
  });

  it('should parse short prioritize', () => {
    const cmd = parseSteeringCommand('pri 7');
    assert.ok(cmd);
    assert.strictEqual(cmd.type, 'prioritize');
    assert.strictEqual(cmd.target, '7');
  });

  it('should parse prioritize with message', () => {
    const cmd = parseSteeringCommand('prioritize step 5 fix the bug');
    assert.ok(cmd);
    assert.strictEqual(cmd.type, 'prioritize');
    assert.strictEqual(cmd.target, '5');
    assert.strictEqual(cmd.message, 'fix the bug');
  });

  it('should return null for invalid command', () => {
    const cmd = parseSteeringCommand('invalid-command');
    assert.strictEqual(cmd, null);
  });

  it('should handle empty input', () => {
    const cmd = parseSteeringCommand('');
    assert.strictEqual(cmd, null);
  });
});
