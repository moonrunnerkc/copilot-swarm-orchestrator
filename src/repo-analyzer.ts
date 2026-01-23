import * as fs from 'fs';
import * as path from 'path';
import {
  RepoAnalysis,
  BuildScript,
  TestScript,
  DependencyInfo,
  TechDebtMarker,
  BaselineConcern
} from './bootstrap-types';

/**
 * Repo Analyzer - deep static analysis of repository structure
 * NO GUESSING - only provable signals from actual files
 */
export class RepoAnalyzer {
  
  /**
   * Analyze a single repository
   */
  async analyzeRepo(repoPath: string): Promise<RepoAnalysis> {
    if (!fs.existsSync(repoPath)) {
      throw new Error(`Repository path does not exist: ${repoPath}`);
    }

    const repoName = path.basename(repoPath);
    const gitRemote = this.getGitRemote(repoPath);
    
    const analysis: RepoAnalysis = {
      repoPath,
      repoName,
      languages: await this.detectLanguages(repoPath),
      buildScripts: await this.findBuildScripts(repoPath),
      testScripts: await this.findTestScripts(repoPath),
      dependencies: await this.extractDependencies(repoPath),
      techDebtMarkers: await this.findTechDebtMarkers(repoPath),
      baselineConcerns: await this.identifyBaselineConcerns(repoPath),
      ...(gitRemote && { gitRemote })
    };

    return analysis;
  }

  /**
   * Detect languages from file extensions (no guessing)
   */
  private async detectLanguages(repoPath: string): Promise<string[]> {
    const extensionMap: Record<string, string> = {
      '.ts': 'TypeScript',
      '.js': 'JavaScript',
      '.tsx': 'TypeScript',
      '.jsx': 'JavaScript',
      '.py': 'Python',
      '.go': 'Go',
      '.java': 'Java',
      '.rb': 'Ruby',
      '.rs': 'Rust',
      '.c': 'C',
      '.cpp': 'C++',
      '.cs': 'C#'
    };

    const languages = new Set<string>();
    
    // Scan src/ directory if exists
    const srcDir = path.join(repoPath, 'src');
    if (fs.existsSync(srcDir)) {
      this.scanDirectoryForExtensions(srcDir, extensionMap, languages);
    }

    // Scan root level too
    const rootFiles = fs.readdirSync(repoPath);
    for (const file of rootFiles) {
      const ext = path.extname(file);
      if (extensionMap[ext]) {
        languages.add(extensionMap[ext]);
      }
    }

    return Array.from(languages).sort();
  }

  private scanDirectoryForExtensions(
    dir: string,
    extensionMap: Record<string, string>,
    languages: Set<string>
  ): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.name === 'node_modules') continue;
      
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        this.scanDirectoryForExtensions(fullPath, extensionMap, languages);
      } else {
        const ext = path.extname(entry.name);
        if (extensionMap[ext]) {
          languages.add(extensionMap[ext]);
        }
      }
    }
  }

  /**
   * Find build scripts from package.json, Makefile, etc.
   */
  private async findBuildScripts(repoPath: string): Promise<BuildScript[]> {
    const scripts: BuildScript[] = [];

    // Check package.json
    const packageJsonPath = path.join(repoPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (pkg.scripts) {
        const buildLikeScripts = ['build', 'compile', 'dist', 'bundle'];
        for (const scriptName of buildLikeScripts) {
          if (pkg.scripts[scriptName]) {
            scripts.push({
              name: scriptName,
              command: pkg.scripts[scriptName],
              source: `package.json:scripts.${scriptName}`
            });
          }
        }
      }
    }

    // Check Makefile
    const makefilePath = path.join(repoPath, 'Makefile');
    if (fs.existsSync(makefilePath)) {
      const content = fs.readFileSync(makefilePath, 'utf8');
      const buildTarget = content.match(/^build:/m);
      if (buildTarget) {
        scripts.push({
          name: 'build',
          command: 'make build',
          source: 'Makefile:build'
        });
      }
    }

    return scripts;
  }

  /**
   * Find test scripts
   */
  private async findTestScripts(repoPath: string): Promise<TestScript[]> {
    const scripts: TestScript[] = [];

    // Check package.json
    const packageJsonPath = path.join(repoPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (pkg.scripts?.test) {
        let framework: string | undefined;
        
        // Detect test framework from command
        if (pkg.scripts.test.includes('mocha')) framework = 'mocha';
        else if (pkg.scripts.test.includes('jest')) framework = 'jest';
        else if (pkg.scripts.test.includes('vitest')) framework = 'vitest';
        else if (pkg.scripts.test.includes('ava')) framework = 'ava';

        scripts.push({
          name: 'test',
          command: pkg.scripts.test,
          source: 'package.json:scripts.test',
          ...(framework && { framework })
        });
      }
    }

    return scripts;
  }

  /**
   * Extract dependencies from package.json, go.mod, requirements.txt, etc.
   */
  private async extractDependencies(repoPath: string): Promise<DependencyInfo[]> {
    const deps: DependencyInfo[] = [];

    // package.json
    const packageJsonPath = path.join(repoPath, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      if (pkg.dependencies) {
        for (const [name, version] of Object.entries(pkg.dependencies)) {
          deps.push({
            name,
            version: version as string,
            type: 'production',
            source: 'package.json:dependencies'
          });
        }
      }
      
      if (pkg.devDependencies) {
        for (const [name, version] of Object.entries(pkg.devDependencies)) {
          deps.push({
            name,
            version: version as string,
            type: 'development',
            source: 'package.json:devDependencies'
          });
        }
      }
    }

    return deps;
  }

  /**
   * Find tech debt markers
   */
  private async findTechDebtMarkers(repoPath: string): Promise<TechDebtMarker[]> {
    const markers: TechDebtMarker[] = [];

    // Look for .skip() in test files
    const testDir = path.join(repoPath, 'test');
    if (fs.existsSync(testDir)) {
      this.findSkippedTests(testDir, markers);
    }

    // Look for TODO comments in src/
    const srcDir = path.join(repoPath, 'src');
    if (fs.existsSync(srcDir)) {
      this.findTodoComments(srcDir, markers);
    }

    return markers;
  }

  private findSkippedTests(dir: string, markers: TechDebtMarker[]): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        this.findSkippedTests(fullPath, markers);
      } else if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.js')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');
        
        lines.forEach((line, idx) => {
          if (line.includes('.skip(') || line.includes('it.skip(') || line.includes('describe.skip(')) {
            markers.push({
              type: 'skipped_test',
              location: `${fullPath}:${idx + 1}`,
              evidence: line.trim(),
              severity: 'medium'
            });
          }
        });
      }
    }
  }

  private findTodoComments(dir: string, markers: TechDebtMarker[]): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.name === 'node_modules') continue;
      
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        this.findTodoComments(fullPath, markers);
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');
        
        lines.forEach((line, idx) => {
          if (line.includes('TODO') || line.includes('FIXME')) {
            markers.push({
              type: 'todo_comment',
              location: `${fullPath}:${idx + 1}`,
              evidence: line.trim(),
              severity: 'low'
            });
          }
        });
      }
    }
  }

  /**
   * Identify missing baseline concerns
   */
  private async identifyBaselineConcerns(repoPath: string): Promise<BaselineConcern[]> {
    const concerns: BaselineConcern[] = [];

    // Check for CI config
    const ciPaths = [
      '.github/workflows',
      '.gitlab-ci.yml',
      '.circleci/config.yml',
      'Jenkinsfile'
    ];

    const hasCi = ciPaths.some(p => fs.existsSync(path.join(repoPath, p)));
    if (!hasCi) {
      concerns.push({
        type: 'missing_ci',
        reason: 'No CI configuration detected',
        evidence: `Checked: ${ciPaths.join(', ')}`
      });
    }

    // Check for config management (only if src/ exists)
    const srcDir = path.join(repoPath, 'src');
    if (fs.existsSync(srcDir)) {
      const hasConfigFile = ['config.ts', 'config.js', '.env.example', 'config.json']
        .some(f => fs.existsSync(path.join(repoPath, f)) || fs.existsSync(path.join(srcDir, f)));
      
      if (!hasConfigFile) {
        concerns.push({
          type: 'missing_config',
          reason: 'No config management detected',
          evidence: 'Checked: config.ts, config.js, .env.example, config.json'
        });
      }
    }

    return concerns;
  }

  /**
   * Get git remote URL
   */
  private getGitRemote(repoPath: string): string | undefined {
    const gitConfigPath = path.join(repoPath, '.git', 'config');
    if (!fs.existsSync(gitConfigPath)) {
      return undefined;
    }

    try {
      const content = fs.readFileSync(gitConfigPath, 'utf8');
      const match = content.match(/url\s*=\s*(.+)/);
      return match ? match[1].trim() : undefined;
    } catch {
      return undefined;
    }
  }
}

export default RepoAnalyzer;
