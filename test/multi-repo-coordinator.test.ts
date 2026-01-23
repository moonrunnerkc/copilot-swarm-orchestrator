import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import MultiRepoCoordinator from '../src/multi-repo-coordinator';
import { RepoAnalysis } from '../src/bootstrap-types';

describe('MultiRepoCoordinator', () => {
  let coordinator: MultiRepoCoordinator;

  beforeEach(() => {
    coordinator = new MultiRepoCoordinator();
  });

  it('should find API dependency relationship', () => {
    const repo1: RepoAnalysis = {
      repoPath: '/tmp/repo1',
      repoName: 'repo1',
      languages: ['TypeScript'],
      buildScripts: [],
      testScripts: [],
      dependencies: [
        { name: 'repo2', version: '1.0.0', type: 'production', source: 'package.json:dependencies' }
      ],
      techDebtMarkers: [],
      baselineConcerns: []
    };

    const repo2: RepoAnalysis = {
      repoPath: '/tmp/repo2',
      repoName: 'repo2',
      languages: ['TypeScript'],
      buildScripts: [],
      testScripts: [],
      dependencies: [],
      techDebtMarkers: [],
      baselineConcerns: []
    };

    const relationships = coordinator.identifyRelationships([repo1, repo2]);

    assert.strictEqual(relationships.length, 1);
    assert.strictEqual(relationships[0].type, 'api_dependency');
    assert.strictEqual(relationships[0].sourceRepo, 'repo1');
    assert.strictEqual(relationships[0].targetRepo, 'repo2');
  });

  it('should find build coupling', () => {
    const repo1: RepoAnalysis = {
      repoPath: '/tmp/repo1',
      repoName: 'repo1',
      languages: ['TypeScript'],
      buildScripts: [
        { name: 'build', command: 'tsc && cd ../repo2 && npm run build', source: 'package.json:scripts.build' }
      ],
      testScripts: [],
      dependencies: [],
      techDebtMarkers: [],
      baselineConcerns: []
    };

    const repo2: RepoAnalysis = {
      repoPath: '/tmp/repo2',
      repoName: 'repo2',
      languages: ['TypeScript'],
      buildScripts: [],
      testScripts: [],
      dependencies: [],
      techDebtMarkers: [],
      baselineConcerns: []
    };

    const relationships = coordinator.identifyRelationships([repo1, repo2]);

    const buildCoupling = relationships.find(r => r.type === 'build_coupling');
    assert.ok(buildCoupling);
    assert.strictEqual(buildCoupling.sourceRepo, 'repo1');
  });

  it('should return empty array for single repo', () => {
    const repo: RepoAnalysis = {
      repoPath: '/tmp/repo',
      repoName: 'repo',
      languages: ['TypeScript'],
      buildScripts: [],
      testScripts: [],
      dependencies: [],
      techDebtMarkers: [],
      baselineConcerns: []
    };

    const relationships = coordinator.identifyRelationships([repo]);

    assert.strictEqual(relationships.length, 0);
  });
});
