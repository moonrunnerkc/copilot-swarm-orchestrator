import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import ExecutionSharer from '../src/execution-sharer.js';

describe('ExecutionSharer', () => {
  let tmpSharesDir: string;
  let sharer: ExecutionSharer;

  beforeEach(() => {
    tmpSharesDir = path.join(__dirname, `test-shares-${Date.now()}`);
    sharer = new ExecutionSharer(tmpSharesDir);
  });

  afterEach(() => {
    if (fs.existsSync(tmpSharesDir)) {
      fs.rmSync(tmpSharesDir, { recursive: true, force: true });
    }
  });

  it('should create a shareable execution', () => {
    const share = sharer.createShare(
      'exec-123',
      '/path/to/run',
      'Build todo app'
    );

    assert.ok(share.shareId);
    assert.strictEqual(share.executionId, 'exec-123');
    assert.strictEqual(share.runDir, '/path/to/run');
    assert.strictEqual(share.goal, 'Build todo app');
    assert.ok(share.createdAt);
    assert.strictEqual(share.expiresAt, undefined);
  });

  it('should create share with expiration', () => {
    const share = sharer.createShare(
      'exec-456',
      '/path/to/run',
      'Build API',
      24 // expires in 24 hours
    );

    assert.ok(share.shareId);
    assert.ok(share.expiresAt);
    
    const expiresDate = new Date(share.expiresAt);
    const now = new Date();
    const diff = expiresDate.getTime() - now.getTime();
    
    // Should expire in approximately 24 hours (allow 1 minute tolerance)
    assert.ok(diff > 23 * 60 * 60 * 1000);
    assert.ok(diff < 25 * 60 * 60 * 1000);
  });

  it('should retrieve share by ID', () => {
    const created = sharer.createShare(
      'exec-789',
      '/path/to/run',
      'Test goal'
    );

    const retrieved = sharer.getShare(created.shareId);
    
    assert.ok(retrieved);
    assert.strictEqual(retrieved.shareId, created.shareId);
    assert.strictEqual(retrieved.executionId, 'exec-789');
    assert.strictEqual(retrieved.goal, 'Test goal');
  });

  it('should return null for non-existent share', () => {
    const share = sharer.getShare('non-existent-id');
    assert.strictEqual(share, null);
  });

  it('should return null for expired share', () => {
    const share = sharer.createShare(
      'exec-expired',
      '/path/to/run',
      'Expired test',
      -1 // expire 1 hour ago (negative)
    );

    // Manually set expiration to past
    const sharePath = path.join(tmpSharesDir, `${share.shareId}.json`);
    const data = JSON.parse(fs.readFileSync(sharePath, 'utf8'));
    data.expiresAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    fs.writeFileSync(sharePath, JSON.stringify(data, null, 2), 'utf8');

    const retrieved = sharer.getShare(share.shareId);
    assert.strictEqual(retrieved, null);
  });

  it('should delete a share', () => {
    const share = sharer.createShare(
      'exec-delete',
      '/path/to/run',
      'Delete test'
    );

    const deleted = sharer.deleteShare(share.shareId);
    assert.strictEqual(deleted, true);

    const retrieved = sharer.getShare(share.shareId);
    assert.strictEqual(retrieved, null);
  });

  it('should return false when deleting non-existent share', () => {
    const deleted = sharer.deleteShare('non-existent');
    assert.strictEqual(deleted, false);
  });

  it('should list all active shares', () => {
    sharer.createShare('exec-1', '/run1', 'Goal 1');
    sharer.createShare('exec-2', '/run2', 'Goal 2');
    sharer.createShare('exec-3', '/run3', 'Goal 3');

    const shares = sharer.listShares();
    assert.strictEqual(shares.length, 3);
  });

  it('should exclude expired shares from list', () => {
    sharer.createShare('exec-active', '/run', 'Active', 24);
    
    const expired = sharer.createShare('exec-expired', '/run', 'Expired', 1);
    
    // Manually expire it
    const sharePath = path.join(tmpSharesDir, `${expired.shareId}.json`);
    const data = JSON.parse(fs.readFileSync(sharePath, 'utf8'));
    data.expiresAt = new Date(Date.now() - 1000).toISOString();
    fs.writeFileSync(sharePath, JSON.stringify(data, null, 2), 'utf8');

    const shares = sharer.listShares();
    assert.strictEqual(shares.length, 1);
    assert.strictEqual(shares[0].executionId, 'exec-active');
  });

  it('should clean up expired shares', () => {
    sharer.createShare('exec-active', '/run', 'Active', 24);
    
    const expired1 = sharer.createShare('exec-expired-1', '/run', 'Expired 1', 1);
    const expired2 = sharer.createShare('exec-expired-2', '/run', 'Expired 2', 1);
    
    // Manually expire them
    [expired1, expired2].forEach(share => {
      const sharePath = path.join(tmpSharesDir, `${share.shareId}.json`);
      const data = JSON.parse(fs.readFileSync(sharePath, 'utf8'));
      data.expiresAt = new Date(Date.now() - 1000).toISOString();
      fs.writeFileSync(sharePath, JSON.stringify(data, null, 2), 'utf8');
    });

    const cleaned = sharer.cleanupExpired();
    assert.strictEqual(cleaned, 2);

    const remaining = sharer.listShares();
    assert.strictEqual(remaining.length, 1);
  });

  it('should persist shares to disk', () => {
    const share = sharer.createShare(
      'exec-persist',
      '/run/persist',
      'Persistence test'
    );

    const sharePath = path.join(tmpSharesDir, `${share.shareId}.json`);
    assert.ok(fs.existsSync(sharePath));

    const data = JSON.parse(fs.readFileSync(sharePath, 'utf8'));
    assert.strictEqual(data.executionId, 'exec-persist');
  });

  it('should generate unique share IDs', () => {
    const share1 = sharer.createShare('exec-1', '/run1', 'Goal 1');
    const share2 = sharer.createShare('exec-2', '/run2', 'Goal 2');
    const share3 = sharer.createShare('exec-3', '/run3', 'Goal 3');

    assert.notStrictEqual(share1.shareId, share2.shareId);
    assert.notStrictEqual(share2.shareId, share3.shareId);
    assert.notStrictEqual(share1.shareId, share3.shareId);
  });

  it('should handle empty shares directory', () => {
    const shares = sharer.listShares();
    assert.strictEqual(shares.length, 0);
  });

  it('should handle corrupted share file gracefully', () => {
    const corruptedPath = path.join(tmpSharesDir, 'corrupted.json');
    fs.mkdirSync(tmpSharesDir, { recursive: true });
    fs.writeFileSync(corruptedPath, 'invalid json{{{', 'utf8');

    const share = sharer.getShare('corrupted');
    assert.strictEqual(share, null);
  });
});
