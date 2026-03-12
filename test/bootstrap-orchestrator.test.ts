import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import BootstrapOrchestrator from '../src/bootstrap-orchestrator';

describe('BootstrapOrchestrator', () => {
  let testDir: string;
  let orchestrator: BootstrapOrchestrator;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bootstrap-test-'));
    orchestrator = new BootstrapOrchestrator();
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should create evidence artifact', async () => {
    // Create minimal test repo
    const repoDir = path.join(testDir, 'test-repo');
    fs.mkdirSync(repoDir);
    
    const pkg = {
      name: 'test-repo',
      scripts: { build: 'tsc' }
    };
    fs.writeFileSync(path.join(repoDir, 'package.json'), JSON.stringify(pkg));

    const srcDir = path.join(repoDir, 'src');
    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, 'index.ts'), '// test');

    const runDir = path.join(testDir, 'run');

    const result = await orchestrator.bootstrap([repoDir], 'Test goal', runDir);

    assert.ok(fs.existsSync(result.evidencePath));
    assert.ok(result.plan.steps.length > 0);

    // Verify evidence structure
    const evidence = JSON.parse(fs.readFileSync(result.evidencePath, 'utf8'));
    assert.strictEqual(evidence.schemaVersion, '1.0.0');
    assert.strictEqual(evidence.goal, 'Test goal');
    assert.strictEqual(evidence.analyzedRepos.length, 1);
  });

  it('should handle multi-repo bootstrap', async () => {
    // Create two minimal repos
    const repo1 = path.join(testDir, 'repo1');
    const repo2 = path.join(testDir, 'repo2');
    
    fs.mkdirSync(repo1);
    fs.mkdirSync(repo2);
    
    fs.writeFileSync(path.join(repo1, 'package.json'), '{"name":"repo1","scripts":{}}');
    fs.writeFileSync(path.join(repo2, 'package.json'), '{"name":"repo2","scripts":{}}');

    const runDir = path.join(testDir, 'run');

    const result = await orchestrator.bootstrap([repo1, repo2], 'Multi-repo test', runDir);

    const evidence = JSON.parse(fs.readFileSync(result.evidencePath, 'utf8'));
    assert.strictEqual(evidence.analyzedRepos.length, 2);
  });
});
