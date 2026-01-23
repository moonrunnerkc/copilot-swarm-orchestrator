import * as assert from 'assert';
import { ShareParser, ShareIndex } from '../src/share-parser';

describe('Enhanced ShareParser', () => {
  let parser: ShareParser;

  beforeEach(() => {
    parser = new ShareParser();
  });

  describe('extractGitCommits', () => {
    it('should extract commit from git commit command', () => {
      const transcript = `
$ git commit -m "feat: add user authentication"
[main abc1234] feat: add user authentication
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.gitCommits.length, 1);
      assert.strictEqual(index.gitCommits[0]?.message, 'feat: add user authentication');
      assert.strictEqual(index.gitCommits[0]?.sha, 'abc1234');
      assert.strictEqual(index.gitCommits[0]?.verified, true);
    });

    it('should extract multiple commits', () => {
      const transcript = `
$ git commit -m "feat: add API"
[main abc1234] feat: add API

$ git commit -m "test: add tests"
[main def5678] test: add tests
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.gitCommits.length, 2);
      assert.strictEqual(index.gitCommits[0]?.message, 'feat: add API');
      assert.strictEqual(index.gitCommits[1]?.message, 'test: add tests');
    });

    it('should handle commit without SHA', () => {
      const transcript = `
$ git commit -m "fix: bug fix"
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.gitCommits.length, 1);
      assert.strictEqual(index.gitCommits[0]?.message, 'fix: bug fix');
      assert.strictEqual(index.gitCommits[0]?.verified, true);
    });

    it('should return empty array when no commits', () => {
      const transcript = `
$ git status
Nothing to commit.
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.gitCommits.length, 0);
    });
  });

  describe('extractPackageOperations', () => {
    it('should extract npm install', () => {
      const transcript = `
$ npm install express cors
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.packageOperations.length, 1);
      assert.strictEqual(index.packageOperations[0]?.operation, 'install');
      assert.ok(index.packageOperations[0]?.packages.includes('express'));
      assert.ok(index.packageOperations[0]?.packages.includes('cors'));
    });

    it('should extract yarn add', () => {
      const transcript = `
$ yarn add react react-dom
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.packageOperations.length, 1);
      assert.strictEqual(index.packageOperations[0]?.operation, 'install');
      assert.ok(index.packageOperations[0]?.packages.includes('react'));
    });

    it('should extract pnpm install', () => {
      const transcript = `
$ pnpm install typescript @types/node
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.packageOperations.length, 1);
      assert.strictEqual(index.packageOperations[0]?.operation, 'install');
      assert.ok(index.packageOperations[0]?.packages.includes('typescript'));
    });

    it('should extract npm uninstall', () => {
      const transcript = `
$ npm uninstall lodash
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.packageOperations.length, 1);
      assert.strictEqual(index.packageOperations[0]?.operation, 'uninstall');
      assert.ok(index.packageOperations[0]?.packages.includes('lodash'));
    });

    it('should extract yarn remove', () => {
      const transcript = `
$ yarn remove moment
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.packageOperations.length, 1);
      assert.strictEqual(index.packageOperations[0]?.operation, 'uninstall');
      assert.ok(index.packageOperations[0]?.packages.includes('moment'));
    });

    it('should extract npm update', () => {
      const transcript = `
$ npm update
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.packageOperations.length, 1);
      assert.strictEqual(index.packageOperations[0]?.operation, 'update');
    });

    it('should filter out flags', () => {
      const transcript = `
$ npm install --save-dev jest @types/jest
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.packageOperations.length, 1);
      const packages = index.packageOperations[0]?.packages || [];
      assert.ok(!packages.includes('--save-dev'));
      assert.ok(packages.includes('jest'));
      assert.ok(packages.includes('@types/jest'));
    });

    it('should handle multiple package operations', () => {
      const transcript = `
$ npm install express
$ npm install mongoose
$ yarn add react
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.packageOperations.length, 3);
    });
  });

  describe('extractBuildOperations', () => {
    it('should extract tsc build', () => {
      const transcript = `
$ tsc
Compiled successfully.
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.buildOperations.length, 1);
      assert.strictEqual(index.buildOperations[0]?.tool, 'tsc');
      assert.strictEqual(index.buildOperations[0]?.verified, true);
    });

    it('should extract webpack build', () => {
      const transcript = `
$ webpack --mode production
Built in 5s
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.buildOperations.length, 1);
      assert.strictEqual(index.buildOperations[0]?.tool, 'webpack');
      assert.strictEqual(index.buildOperations[0]?.verified, true);
    });

    it('should extract vite build', () => {
      const transcript = `
$ vite build
✓ built in 1.2s
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.buildOperations.length, 1);
      assert.strictEqual(index.buildOperations[0]?.tool, 'vite');
      assert.strictEqual(index.buildOperations[0]?.verified, true);
    });

    it('should extract npm run build', () => {
      const transcript = `
$ npm run build
Build succeeded.
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.buildOperations.length, 1);
      assert.strictEqual(index.buildOperations[0]?.tool, 'npm build');
      assert.strictEqual(index.buildOperations[0]?.verified, true);
    });

    it('should mark build as unverified without success output', () => {
      const transcript = `
$ tsc
Some warning...
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.buildOperations.length, 1);
      assert.strictEqual(index.buildOperations[0]?.verified, false);
    });

    it('should handle multiple build tools', () => {
      const transcript = `
$ tsc
Compiled successfully.

$ webpack
Built in 3s
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.buildOperations.length, 2);
      assert.ok(index.buildOperations.every(b => b.verified));
    });
  });

  describe('extractLintOperations', () => {
    it('should extract eslint', () => {
      const transcript = `
$ eslint src/**/*.ts
✓ no errors found
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.lintOperations.length, 1);
      assert.strictEqual(index.lintOperations[0]?.tool, 'eslint');
      assert.strictEqual(index.lintOperations[0]?.verified, true);
    });

    it('should extract prettier', () => {
      const transcript = `
$ prettier --check .
All files passed formatting
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.lintOperations.length, 1);
      assert.strictEqual(index.lintOperations[0]?.tool, 'prettier');
      assert.strictEqual(index.lintOperations[0]?.verified, true);
    });

    it('should extract biome', () => {
      const transcript = `
$ biome check src/
✨ done
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.lintOperations.length, 1);
      assert.strictEqual(index.lintOperations[0]?.tool, 'biome');
      assert.strictEqual(index.lintOperations[0]?.verified, true);
    });

    it('should extract npm run lint', () => {
      const transcript = `
$ npm run lint
0 errors
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.lintOperations.length, 1);
      assert.strictEqual(index.lintOperations[0]?.tool, 'npm lint');
      assert.strictEqual(index.lintOperations[0]?.verified, true);
    });

    it('should mark lint as unverified without success output', () => {
      const transcript = `
$ eslint .
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.lintOperations.length, 1);
      assert.strictEqual(index.lintOperations[0]?.verified, false);
    });
  });

  describe('extractMcpSections', () => {
    it('should extract MCP Evidence section', () => {
      const transcript = `
## MCP Evidence

- Consulted open issues: Found issue #42 "Add authentication"
- Checked existing PRs: No conflicts
- Reviewed CI workflow: .github/workflows/ci.yml runs tests
- Decision: Implemented auth to resolve #42

## Other Section
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.mcpSections.length, 1);
      assert.ok(index.mcpSections[0]?.content.includes('issue #42'));
      assert.ok(index.mcpSections[0]?.content.includes('Decision'));
    });

    it('should verify MCP section with proper evidence', () => {
      const transcript = `
## MCP Evidence

- Consulted issues: issue #123 about user auth
- Reviewed existing PR #456
- Decision: Based on issue analysis, implemented OAuth
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.mcpSections[0]?.verified, true);
    });

    it('should mark MCP section as unverified without evidence', () => {
      const transcript = `
## MCP Evidence

I looked at GitHub.
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.mcpSections[0]?.verified, false);
    });

    it('should mark MCP section as unverified without decision', () => {
      const transcript = `
## MCP Evidence

- Found issue #42
- Found PR #55
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.mcpSections[0]?.verified, false);
    });

    it('should mark short MCP section as unverified', () => {
      const transcript = `
## MCP Evidence

Checked GitHub.
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.mcpSections[0]?.verified, false);
    });

    it('should extract multiple MCP sections', () => {
      const transcript = `
## MCP Evidence

First check of issues #1

Decision: go ahead

## MCP Evidence

Second check of PR #2

Decision: merged
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.mcpSections.length, 2);
    });

    it('should return empty array when no MCP sections', () => {
      const transcript = `
## Verification

All tests passed.
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.mcpSections.length, 0);
    });
  });

  describe('extractClaims - comprehensive', () => {
    it('should verify package install claim', () => {
      const transcript = `
$ npm install express
Installed package express.
`;

      const index = parser.parse(transcript);

      const claim = index.claims.find(c => c.claim.includes('Installed package'));
      assert.ok(claim);
      assert.strictEqual(claim?.verified, true);
    });

    it('should reject package install claim without evidence', () => {
      const transcript = `
I installed package express.
`;

      const index = parser.parse(transcript);

      const claim = index.claims.find(c => c.claim.includes('installed package'));
      assert.ok(claim);
      assert.strictEqual(claim?.verified, false);
    });

    it('should verify git commit claim', () => {
      const transcript = `
$ git commit -m "feat: add feature"
Committed changes.
`;

      const index = parser.parse(transcript);

      const claim = index.claims.find(c => c.claim.includes('Committed'));
      assert.ok(claim);
      assert.strictEqual(claim?.verified, true);
    });

    it('should reject commit claim without evidence', () => {
      const transcript = `
I committed the changes.
`;

      const index = parser.parse(transcript);

      const claim = index.claims.find(c => c.claim.includes('committed'));
      assert.ok(claim);
      assert.strictEqual(claim?.verified, false);
    });

    it('should verify MCP usage claim', () => {
      const transcript = `
## MCP Evidence

Consulted issue #42 about auth
Reviewed PR #55
Decision: implemented OAuth

I consulted MCP for GitHub context.
`;

      const index = parser.parse(transcript);

      const claim = index.claims.find(c => c.claim.includes('consulted MCP'));
      assert.ok(claim);
      assert.strictEqual(claim?.verified, true);
    });

    it('should reject MCP claim without evidence section', () => {
      const transcript = `
I checked GitHub context using MCP.
`;

      const index = parser.parse(transcript);

      const claim = index.claims.find(c => c.claim.includes('GitHub context'));
      assert.ok(claim);
      assert.strictEqual(claim?.verified, false);
    });

    it('should verify lint passing claim', () => {
      const transcript = `
$ eslint .
✓ no errors
Lint passed successfully.
`;

      const index = parser.parse(transcript);

      const claim = index.claims.find(c => c.claim.includes('Lint passed'));
      assert.ok(claim);
      assert.strictEqual(claim?.verified, true);
    });

    it('should reject lint claim without evidence', () => {
      const transcript = `
No lint errors found.
`;

      const index = parser.parse(transcript);

      const claim = index.claims.find(c => c.claim.includes('lint errors'));
      assert.ok(claim);
      assert.strictEqual(claim?.verified, false);
    });
  });

  describe('comprehensive drift detection', () => {
    it('should catch all claims in complex transcript', () => {
      const transcript = `
I implemented the feature.

$ npm install express
$ npm run build
Build succeeded.
$ npm test
14 passing

$ git commit -m "feat: add feature"
[main abc123] feat: add feature

## MCP Evidence

Consulted issue #42
Decision: based on issue, added feature

All tests passed.
Build succeeded.
Committed changes.
`;

      const index = parser.parse(transcript);

      // should have claims for: tests passed, build succeeded, committed
      assert.ok(index.claims.length >= 3);

      // all should be verified
      const unverified = index.claims.filter(c => !c.verified);
      assert.strictEqual(unverified.length, 0, `Unverified claims: ${JSON.stringify(unverified)}`);
    });

    it('should catch lies in complex transcript', () => {
      const transcript = `
I ran all the tests and they passed.
The build succeeded.
I committed the changes.
I consulted GitHub issues via MCP.
`;

      const index = parser.parse(transcript);

      // should have multiple claims
      assert.ok(index.claims.length >= 4);

      // all should be unverified (no evidence)
      const verified = index.claims.filter(c => c.verified);
      assert.strictEqual(verified.length, 0, `Unexpectedly verified: ${JSON.stringify(verified)}`);
    });
  });
});
