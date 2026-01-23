import * as fs from 'fs';
import * as path from 'path';

export interface CICDConfig {
  nodeVersion: string;
  scripts: {
    build?: string;
    test?: string;
    lint?: string;
  };
  workflowPath: string;
}

/**
 * CI/CD Config Generator - creates GitHub Actions workflows aligned with repo
 */
export class CICDConfigGenerator {
  
  /**
   * Detect existing CI/CD configuration
   */
  detectExistingConfig(repoPath: string): { exists: boolean; path?: string } {
    const workflowsDir = path.join(repoPath, '.github', 'workflows');
    
    if (!fs.existsSync(workflowsDir)) {
      return { exists: false };
    }

    const files = fs.readdirSync(workflowsDir);
    const ciFiles = files.filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

    if (ciFiles.length > 0) {
      return {
        exists: true,
        path: path.join(workflowsDir, ciFiles[0])
      };
    }

    return { exists: false };
  }

  /**
   * Extract Node version from package.json or system
   */
  detectNodeVersion(repoPath: string): string {
    const packageJsonPath = path.join(repoPath, 'package.json');
    
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        
        // Check engines field
        if (pkg.engines?.node) {
          const version = pkg.engines.node.replace(/[^0-9.]/g, '');
          return version || '20'; // Default to 20 if parsing fails
        }
      } catch {
        // Fall through to default
      }
    }

    // Use system Node version
    return '20';
  }

  /**
   * Extract build and test scripts from package.json
   */
  extractScripts(repoPath: string): CICDConfig['scripts'] {
    const packageJsonPath = path.join(repoPath, 'package.json');
    const scripts: CICDConfig['scripts'] = {};

    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        
        if (pkg.scripts) {
          if (pkg.scripts.build) scripts.build = pkg.scripts.build;
          if (pkg.scripts.test) scripts.test = pkg.scripts.test;
          if (pkg.scripts.lint) scripts.lint = pkg.scripts.lint;
        }
      } catch {
        // Return empty scripts
      }
    }

    return scripts;
  }

  /**
   * Generate GitHub Actions workflow content
   */
  generateWorkflow(config: CICDConfig): string {
    const { nodeVersion, scripts } = config;

    let workflow = `name: CI

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '${nodeVersion}'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
`;

    if (scripts.lint) {
      workflow += `
    - name: Lint
      run: npm run lint
`;
    }

    if (scripts.build) {
      workflow += `
    - name: Build
      run: npm run build
`;
    }

    if (scripts.test) {
      workflow += `
    - name: Test
      run: npm test
`;
    }

    return workflow;
  }

  /**
   * Create CI/CD configuration file
   */
  createWorkflowFile(repoPath: string, config: CICDConfig): string {
    const workflowsDir = path.join(repoPath, '.github', 'workflows');
    
    if (!fs.existsSync(workflowsDir)) {
      fs.mkdirSync(workflowsDir, { recursive: true });
    }

    const workflowPath = path.join(workflowsDir, 'ci.yml');
    const content = this.generateWorkflow(config);

    fs.writeFileSync(workflowPath, content, 'utf8');

    return workflowPath;
  }

  /**
   * Auto-configure CI/CD for a repository
   */
  autoConfigureCI(repoPath: string): { created: boolean; path: string; config: CICDConfig } {
    const existing = this.detectExistingConfig(repoPath);
    
    if (existing.exists) {
      const config: CICDConfig = {
        nodeVersion: this.detectNodeVersion(repoPath),
        scripts: this.extractScripts(repoPath),
        workflowPath: existing.path!
      };

      return {
        created: false,
        path: existing.path!,
        config
      };
    }

    // Create new workflow
    const config: CICDConfig = {
      nodeVersion: this.detectNodeVersion(repoPath),
      scripts: this.extractScripts(repoPath),
      workflowPath: path.join(repoPath, '.github', 'workflows', 'ci.yml')
    };

    const workflowPath = this.createWorkflowFile(repoPath, config);

    return {
      created: true,
      path: workflowPath,
      config
    };
  }
}

export default CICDConfigGenerator;
