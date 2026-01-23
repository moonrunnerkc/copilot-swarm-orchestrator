import * as fs from 'fs';
import * as path from 'path';
import { RepoAnalysis, CrossRepoRelationship } from './bootstrap-types';

/**
 * Multi-Repo Coordinator - identify cross-repo relationships
 * Analysis only, no execution
 */
export class MultiRepoCoordinator {
  
  /**
   * Identify relationships between multiple repositories
   */
  identifyRelationships(repos: RepoAnalysis[]): CrossRepoRelationship[] {
    if (repos.length < 2) {
      return [];
    }

    const relationships: CrossRepoRelationship[] = [];

    // Check for API dependencies (import statements referencing other repos)
    for (let i = 0; i < repos.length; i++) {
      for (let j = i + 1; j < repos.length; j++) {
        const apiDeps = this.findApiDependencies(repos[i], repos[j]);
        relationships.push(...apiDeps);
      }
    }

    // Check for shared schemas (TypeScript types exported/imported)
    for (let i = 0; i < repos.length; i++) {
      for (let j = i + 1; j < repos.length; j++) {
        const schemas = this.findSharedSchemas(repos[i], repos[j]);
        relationships.push(...schemas);
      }
    }

    // Check for build coupling (one repo's build depends on another)
    for (let i = 0; i < repos.length; i++) {
      for (let j = i + 1; j < repos.length; j++) {
        const buildCoupling = this.findBuildCoupling(repos[i], repos[j]);
        relationships.push(...buildCoupling);
      }
    }

    return relationships;
  }

  /**
   * Find API dependencies between repos
   */
  private findApiDependencies(repo1: RepoAnalysis, repo2: RepoAnalysis): CrossRepoRelationship[] {
    const relationships: CrossRepoRelationship[] = [];

    // Check if repo1 has repo2 as a dependency
    const repo1DepOnRepo2 = repo1.dependencies.some(d => 
      d.name === repo2.repoName || d.name.includes(repo2.repoName)
    );

    if (repo1DepOnRepo2) {
      relationships.push({
        sourceRepo: repo1.repoName,
        targetRepo: repo2.repoName,
        type: 'api_dependency',
        evidence: [
          repo1.dependencies.find(d => d.name === repo2.repoName || d.name.includes(repo2.repoName))!.source
        ],
        details: `${repo1.repoName} depends on ${repo2.repoName}`
      });
    }

    // Check reverse
    const repo2DepOnRepo1 = repo2.dependencies.some(d => 
      d.name === repo1.repoName || d.name.includes(repo1.repoName)
    );

    if (repo2DepOnRepo1) {
      relationships.push({
        sourceRepo: repo2.repoName,
        targetRepo: repo1.repoName,
        type: 'api_dependency',
        evidence: [
          repo2.dependencies.find(d => d.name === repo1.repoName || d.name.includes(repo1.repoName))!.source
        ],
        details: `${repo2.repoName} depends on ${repo1.repoName}`
      });
    }

    return relationships;
  }

  /**
   * Find shared schemas (look for types/ or schema/ directories)
   */
  private findSharedSchemas(repo1: RepoAnalysis, repo2: RepoAnalysis): CrossRepoRelationship[] {
    const relationships: CrossRepoRelationship[] = [];

    // Check if both have schema directories
    const repo1SchemaDir = path.join(repo1.repoPath, 'src', 'types');
    const repo2SchemaDir = path.join(repo2.repoPath, 'src', 'types');

    const repo1HasTypes = fs.existsSync(repo1SchemaDir);
    const repo2HasTypes = fs.existsSync(repo2SchemaDir);

    if (repo1HasTypes && repo2HasTypes) {
      // Look for similarly named type files
      const repo1Types = this.getTypeFiles(repo1SchemaDir);
      const repo2Types = this.getTypeFiles(repo2SchemaDir);

      const commonTypes = repo1Types.filter(t => repo2Types.includes(t));

      if (commonTypes.length > 0) {
        relationships.push({
          sourceRepo: repo1.repoName,
          targetRepo: repo2.repoName,
          type: 'schema_sharing',
          evidence: commonTypes.map(t => `Both repos have: ${t}`),
          details: `Shared type files: ${commonTypes.join(', ')}`
        });
      }
    }

    return relationships;
  }

  private getTypeFiles(dir: string): string[] {
    try {
      return fs.readdirSync(dir)
        .filter(f => f.endsWith('.ts') || f.endsWith('.d.ts'))
        .map(f => path.basename(f));
    } catch {
      return [];
    }
  }

  /**
   * Find build coupling (build scripts reference other repos)
   */
  private findBuildCoupling(repo1: RepoAnalysis, repo2: RepoAnalysis): CrossRepoRelationship[] {
    const relationships: CrossRepoRelationship[] = [];

    // Check if build scripts reference other repo
    for (const script of repo1.buildScripts) {
      if (script.command.includes(repo2.repoName) || script.command.includes(path.basename(repo2.repoPath))) {
        relationships.push({
          sourceRepo: repo1.repoName,
          targetRepo: repo2.repoName,
          type: 'build_coupling',
          evidence: [script.source, `Command: ${script.command}`],
          details: `${repo1.repoName} build depends on ${repo2.repoName}`
        });
      }
    }

    // Check reverse
    for (const script of repo2.buildScripts) {
      if (script.command.includes(repo1.repoName) || script.command.includes(path.basename(repo1.repoPath))) {
        relationships.push({
          sourceRepo: repo2.repoName,
          targetRepo: repo1.repoName,
          type: 'build_coupling',
          evidence: [script.source, `Command: ${script.command}`],
          details: `${repo2.repoName} build depends on ${repo1.repoName}`
        });
      }
    }

    return relationships;
  }
}

export default MultiRepoCoordinator;
