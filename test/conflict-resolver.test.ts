import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import ConflictResolver from '../src/conflict-resolver.js';

describe('ConflictResolver', () => {
  let tmpDir: string;
  let resolver: ConflictResolver;

  beforeEach(() => {
    tmpDir = path.join(__dirname, `test-conflicts-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    resolver = new ConflictResolver(tmpDir);
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should add a conflict', () => {
    const conflict = resolver.addConflict({
      type: 'verification',
      stepNumber: 1,
      agentName: 'TestAgent',
      description: 'Test verification failed',
      evidence: ['test.log'],
      timestamp: new Date().toISOString()
    });

    assert.ok(conflict.id);
    assert.strictEqual(conflict.resolved, false);
    assert.strictEqual(conflict.type, 'verification');
  });

  it('should get pending conflicts', () => {
    resolver.addConflict({
      type: 'verification',
      stepNumber: 1,
      agentName: 'Agent1',
      description: 'Conflict 1',
      evidence: [],
      timestamp: new Date().toISOString()
    });

    resolver.addConflict({
      type: 'merge',
      stepNumber: 2,
      agentName: 'Agent2',
      description: 'Conflict 2',
      evidence: [],
      timestamp: new Date().toISOString()
    });

    const pending = resolver.getPendingConflicts();
    assert.strictEqual(pending.length, 2);
    assert.strictEqual(pending[0].resolved, false);
  });

  it('should get next conflict', () => {
    const c1 = resolver.addConflict({
      type: 'verification',
      stepNumber: 1,
      agentName: 'Agent1',
      description: 'Conflict 1',
      evidence: [],
      timestamp: new Date().toISOString()
    });

    const next = resolver.getNextConflict();
    assert.ok(next);
    assert.strictEqual(next.id, c1.id);
  });

  it('should approve a conflict', () => {
    const conflict = resolver.addConflict({
      type: 'merge',
      stepNumber: 3,
      agentName: 'Agent3',
      description: 'Merge conflict',
      evidence: ['file.ts'],
      timestamp: new Date().toISOString()
    });

    const approved = resolver.approveConflict(conflict.id, 'human');
    assert.strictEqual(approved, true);

    const resolved = resolver.getConflict(conflict.id);
    assert.ok(resolved);
    assert.strictEqual(resolved.resolved, true);
    assert.strictEqual(resolved.resolution, 'approved');
    assert.strictEqual(resolved.resolvedBy, 'human');
    assert.ok(resolved.resolvedAt);
  });

  it('should reject a conflict', () => {
    const conflict = resolver.addConflict({
      type: 'plan',
      stepNumber: 4,
      agentName: 'Agent4',
      description: 'Plan conflict',
      evidence: [],
      timestamp: new Date().toISOString()
    });

    const rejected = resolver.rejectConflict(conflict.id, 'human');
    assert.strictEqual(rejected, true);

    const resolved = resolver.getConflict(conflict.id);
    assert.ok(resolved);
    assert.strictEqual(resolved.resolved, true);
    assert.strictEqual(resolved.resolution, 'rejected');
  });

  it('should not approve already resolved conflict', () => {
    const conflict = resolver.addConflict({
      type: 'verification',
      stepNumber: 5,
      agentName: 'Agent5',
      description: 'Already resolved',
      evidence: [],
      timestamp: new Date().toISOString()
    });

    resolver.approveConflict(conflict.id, 'human');
    const secondApprove = resolver.approveConflict(conflict.id, 'another-user');
    
    assert.strictEqual(secondApprove, false);
  });

  it('should persist conflicts to disk', () => {
    const conflict = resolver.addConflict({
      type: 'verification',
      stepNumber: 6,
      agentName: 'Agent6',
      description: 'Persisted conflict',
      evidence: ['log.txt'],
      timestamp: new Date().toISOString()
    });

    const conflictsPath = path.join(tmpDir, 'conflicts.json');
    assert.ok(fs.existsSync(conflictsPath));

    const data = JSON.parse(fs.readFileSync(conflictsPath, 'utf8'));
    assert.strictEqual(data.length, 1);
    assert.strictEqual(data[0].id, conflict.id);
  });

  it('should load conflicts from disk', () => {
    const c1 = resolver.addConflict({
      type: 'verification',
      stepNumber: 7,
      agentName: 'Agent7',
      description: 'Conflict 7',
      evidence: [],
      timestamp: new Date().toISOString()
    });

    // Create new resolver instance with same dir
    const resolver2 = new ConflictResolver(tmpDir);
    const loaded = resolver2.getConflict(c1.id);
    
    assert.ok(loaded);
    assert.strictEqual(loaded.id, c1.id);
    assert.strictEqual(loaded.description, 'Conflict 7');
  });

  it('should return null for non-existent conflict', () => {
    const conflict = resolver.getConflict('non-existent-id');
    assert.strictEqual(conflict, null);
  });
});
