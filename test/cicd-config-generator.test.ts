import * as assert from 'assert';
import CICDConfigGenerator from '../src/cicd-config-generator.js';
import * as fs from 'fs';
import * as path from 'path';

describe('CICDConfigGenerator', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = path.join(__dirname, `test-repo-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('should detect existing CI/CD configuration', () => {
    const workflowsDir = path.join(tmpDir, '.github', 'workflows');
    fs.mkdirSync(workflowsDir, { recursive: true });
    fs.writeFileSync(path.join(workflowsDir, 'ci.yml'), 'name: CI', 'utf8');

    const generator = new CICDConfigGenerator();
    const result = generator.detectExistingConfig(tmpDir);

    assert.strictEqual(result.exists, true);
    assert.ok(result.path?.includes('ci.yml'));
  });

  it('should return false for repos without CI/CD', () => {
    const generator = new CICDConfigGenerator();
    const result = generator.detectExistingConfig(tmpDir);

    assert.strictEqual(result.exists, false);
    assert.strictEqual(result.path, undefined);
  });

  it('should extract Node version from package.json engines', () => {
    const pkg = {
      name: 'test-app',
      engines: {
        node: '>=18.0.0'
      }
    };
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify(pkg, null, 2),
      'utf8'
    );

    const generator = new CICDConfigGenerator();
    const version = generator.detectNodeVersion(tmpDir);

    assert.strictEqual(version, '18.0.0');
  });

  it('should default to Node 20 if no engines specified', () => {
    const pkg = { name: 'test-app' };
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify(pkg, null, 2),
      'utf8'
    );

    const generator = new CICDConfigGenerator();
    const version = generator.detectNodeVersion(tmpDir);

    assert.strictEqual(version, '20');
  });

  it('should extract build and test scripts from package.json', () => {
    const pkg = {
      name: 'test-app',
      scripts: {
        build: 'tsc',
        test: 'mocha',
        lint: 'eslint .',
        dev: 'nodemon'
      }
    };
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify(pkg, null, 2),
      'utf8'
    );

    const generator = new CICDConfigGenerator();
    const scripts = generator.extractScripts(tmpDir);

    assert.strictEqual(scripts.build, 'tsc');
    assert.strictEqual(scripts.test, 'mocha');
    assert.strictEqual(scripts.lint, 'eslint .');
  });

  it('should generate valid GitHub Actions workflow', () => {
    const generator = new CICDConfigGenerator();
    const config = {
      nodeVersion: '20',
      scripts: {
        build: 'npm run build',
        test: 'npm test',
        lint: 'npm run lint'
      },
      workflowPath: path.join(tmpDir, '.github', 'workflows', 'ci.yml')
    };

    const workflow = generator.generateWorkflow(config);

    assert.ok(workflow.includes('name: CI'));
    assert.ok(workflow.includes('node-version: \'20\''));
    assert.ok(workflow.includes('npm ci'));
    assert.ok(workflow.includes('npm run lint'));
    assert.ok(workflow.includes('npm run build'));
    assert.ok(workflow.includes('npm test'));
  });

  it('should create workflow file in correct location', () => {
    const pkg = {
      name: 'test-app',
      scripts: { build: 'tsc', test: 'mocha' }
    };
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify(pkg, null, 2),
      'utf8'
    );

    const generator = new CICDConfigGenerator();
    const config = {
      nodeVersion: '18',
      scripts: { build: 'tsc', test: 'mocha' },
      workflowPath: path.join(tmpDir, '.github', 'workflows', 'ci.yml')
    };

    const workflowPath = generator.createWorkflowFile(tmpDir, config);

    assert.ok(fs.existsSync(workflowPath));
    assert.ok(workflowPath.includes('.github/workflows/ci.yml'));
  });

  it('should auto-configure CI for a new repo', () => {
    const pkg = {
      name: 'test-app',
      engines: { node: '20.0.0' },
      scripts: {
        build: 'tsc',
        test: 'vitest'
      }
    };
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify(pkg, null, 2),
      'utf8'
    );

    const generator = new CICDConfigGenerator();
    const result = generator.autoConfigureCI(tmpDir);

    assert.strictEqual(result.created, true);
    assert.ok(fs.existsSync(result.path));
    assert.strictEqual(result.config.nodeVersion, '20.0.0');
    assert.strictEqual(result.config.scripts.build, 'tsc');
  });

  it('should not recreate CI if it already exists', () => {
    const workflowsDir = path.join(tmpDir, '.github', 'workflows');
    fs.mkdirSync(workflowsDir, { recursive: true });
    const existingPath = path.join(workflowsDir, 'existing.yml');
    fs.writeFileSync(existingPath, 'name: Existing', 'utf8');

    const generator = new CICDConfigGenerator();
    const result = generator.autoConfigureCI(tmpDir);

    assert.strictEqual(result.created, false);
    assert.strictEqual(result.path, existingPath);
  });
});
