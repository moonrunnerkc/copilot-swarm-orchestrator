import * as assert from 'assert';
import DeploymentManager from '../src/deployment-manager.js';
import ExternalToolManager from '../src/external-tool-manager.js';
import * as fs from 'fs';
import * as path from 'path';

describe('DeploymentManager', () => {
  let tmpDir: string;
  let tmpRunDir: string;

  beforeEach(() => {
    tmpDir = path.join(__dirname, `test-deploy-${Date.now()}`);
    tmpRunDir = path.join(__dirname, `test-run-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.mkdirSync(tmpRunDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    if (fs.existsSync(tmpRunDir)) {
      fs.rmSync(tmpRunDir, { recursive: true, force: true });
    }
  });

  it('should detect Vercel platform from config file', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'vercel.json'),
      JSON.stringify({ version: 2 }),
      'utf8'
    );

    const toolManager = new ExternalToolManager({
      enableExternal: true,
      dryRun: true
    });
    const manager = new DeploymentManager(toolManager, tmpDir);

    const platform = await manager.detectPlatform();
    assert.strictEqual(platform, 'vercel');
  });

  it('should detect Netlify platform from config file', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'netlify.toml'),
      '[build]\n  command = "npm run build"',
      'utf8'
    );

    const toolManager = new ExternalToolManager({
      enableExternal: true,
      dryRun: true
    });
    const manager = new DeploymentManager(toolManager, tmpDir);

    const platform = await manager.detectPlatform();
    assert.strictEqual(platform, 'netlify');
  });

  it('should return none when no platform detected', async () => {
    const toolManager = new ExternalToolManager({
      enableExternal: true,
      dryRun: true
    });
    const manager = new DeploymentManager(toolManager, tmpDir);

    const platform = await manager.detectPlatform();
    assert.strictEqual(platform, 'none');
  });

  it('should fail gracefully when deploying with no platform', async () => {
    const toolManager = new ExternalToolManager({
      enableExternal: true,
      dryRun: false
    });
    const manager = new DeploymentManager(toolManager, tmpDir);

    const result = await manager.deployPreview('test-branch');

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.platform, 'none');
    assert.ok(result.error?.includes('No deployment platform detected'));
  });

  it('should save deployment metadata', () => {
    const toolManager = new ExternalToolManager({
      enableExternal: true,
      dryRun: true
    });
    const manager = new DeploymentManager(toolManager, tmpDir);

    const metadata = {
      stepNumber: 3,
      agentName: 'DevOpsPro',
      timestamp: new Date().toISOString(),
      platform: 'vercel',
      previewUrl: 'https://app-preview.vercel.app',
      deploymentId: 'dpl_123',
      branchName: 'feature-123'
    };

    const metadataPath = manager.saveDeploymentMetadata(tmpRunDir, metadata);

    assert.ok(fs.existsSync(metadataPath));
    assert.ok(metadataPath.includes('step-3-vercel.json'));

    const saved = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    assert.strictEqual(saved.previewUrl, metadata.previewUrl);
    assert.strictEqual(saved.platform, 'vercel');
  });

  it('should load all deployment metadata from run', () => {
    const toolManager = new ExternalToolManager({
      enableExternal: true,
      dryRun: true
    });
    const manager = new DeploymentManager(toolManager, tmpDir);

    // Save multiple deployments
    manager.saveDeploymentMetadata(tmpRunDir, {
      stepNumber: 1,
      agentName: 'DevOpsPro',
      timestamp: new Date().toISOString(),
      platform: 'vercel',
      branchName: 'test'
    });

    manager.saveDeploymentMetadata(tmpRunDir, {
      stepNumber: 3,
      agentName: 'DevOpsPro',
      timestamp: new Date().toISOString(),
      platform: 'netlify',
      previewUrl: 'https://app.netlify.app',
      branchName: 'test'
    });

    const metadata = manager.loadDeploymentMetadata(tmpRunDir);

    assert.strictEqual(metadata.length, 2);
    assert.strictEqual(metadata[0].stepNumber, 1);
    assert.strictEqual(metadata[1].stepNumber, 3);
    assert.strictEqual(metadata[1].previewUrl, 'https://app.netlify.app');
  });

  it('should handle deployment failure gracefully', async () => {
    // Vercel is not installed, so deployment will fail
    const toolManager = new ExternalToolManager({
      enableExternal: true,
      dryRun: false
    });
    const manager = new DeploymentManager(toolManager, tmpDir);

    // Create a vercel.json to trigger Vercel detection
    fs.writeFileSync(
      path.join(tmpDir, 'vercel.json'),
      JSON.stringify({ version: 2 }),
      'utf8'
    );

    const result = await manager.deployPreview('test-branch');

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.platform, 'vercel');
    assert.ok(result.error);
  });
});
