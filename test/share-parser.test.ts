import * as assert from 'assert';
import { ShareParser } from '../src/share-parser';

describe('ShareParser', () => {
  let parser: ShareParser;

  beforeEach(() => {
    parser = new ShareParser();
  });

  describe('extractChangedFiles', () => {
    it('should extract files from git status output', () => {
      const transcript = `
$ git status
On branch main
Changes not staged for commit:
  modified:   src/api.ts
  modified:   src/server.ts

Untracked files:
  test/api.test.ts
`;

      const index = parser.parse(transcript);

      assert.ok(index.changedFiles.includes('src/api.ts'));
      assert.ok(index.changedFiles.includes('src/server.ts'));
      // note: untracked files without "new file:" prefix aren't captured by basic parser
      // this is intentional - we focus on staged/committed changes
    });

    it('should extract files from explicit mentions', () => {
      const transcript = `
created: src/utils.ts
modified: config/settings.json
`;

      const index = parser.parse(transcript);

      assert.ok(index.changedFiles.includes('src/utils.ts'));
      assert.ok(index.changedFiles.includes('config/settings.json'));
    });
  });

  describe('extractCommands', () => {
    it('should extract commands with $ prompt', () => {
      const transcript = `
$ npm test
$ git commit -m "add tests"
$ npm run build
`;

      const index = parser.parse(transcript);

      assert.ok(index.commandsExecuted.includes('npm test'));
      assert.ok(index.commandsExecuted.includes('git commit -m "add tests"'));
      assert.ok(index.commandsExecuted.includes('npm run build'));
    });

    it('should extract commands from code blocks', () => {
      const transcript = `
Run these commands:
\`\`\`
$ npm install
$ npm test
\`\`\`
`;

      const index = parser.parse(transcript);

      assert.ok(index.commandsExecuted.includes('npm install'));
      assert.ok(index.commandsExecuted.includes('npm test'));
    });
  });

  describe('extractTestRuns - DRIFT TRAP', () => {
    it('should verify test command with output', () => {
      const transcript = `
$ npm test

  ConfigLoader
    ✔ should load agents
    ✔ should validate config

  14 passing (10ms)
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.testsRun.length, 1);
      assert.strictEqual(index.testsRun[0]?.command, 'npm test');
      assert.strictEqual(index.testsRun[0]?.verified, true);
    });

    it('should mark test as unverified without output', () => {
      const transcript = `
$ npm test
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.testsRun.length, 1);
      assert.strictEqual(index.testsRun[0]?.verified, false);
      assert.ok(index.testsRun[0]?.reason?.includes('no test output'));
    });

    it('should detect jest test output', () => {
      const transcript = `
$ npm test

PASS  src/utils.test.ts
  ✓ should parse data (5ms)

Tests: 5 passed, 5 total
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.testsRun[0]?.verified, true);
    });

    it('should detect pytest output', () => {
      const transcript = `
$ pytest

test_api.py::test_endpoints PASSED
test_auth.py::test_login PASSED

3 passed in 0.5s
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.testsRun[0]?.verified, true);
    });

    it('should detect go test output', () => {
      const transcript = `
$ go test ./...

ok      github.com/user/repo/pkg    0.123s
PASS
`;

      const index = parser.parse(transcript);

      assert.strictEqual(index.testsRun[0]?.verified, true);
    });
  });

  describe('extractPRLinks', () => {
    it('should extract GitHub PR URLs', () => {
      const transcript = `
Created PR: https://github.com/owner/repo/pull/42
See also: https://github.com/owner/repo/pull/43
`;

      const index = parser.parse(transcript);

      assert.ok(index.prLinks.includes('https://github.com/owner/repo/pull/42'));
      assert.ok(index.prLinks.includes('https://github.com/owner/repo/pull/43'));
    });

    it('should extract PR number references', () => {
      const transcript = `
Merged #123
Fixed issue #456
`;

      const index = parser.parse(transcript);

      assert.ok(index.prLinks.includes('#123'));
      assert.ok(index.prLinks.includes('#456'));
    });
  });

  describe('extractClaims - CRITICAL DRIFT PREVENTION', () => {
    it('should verify "tests passed" claim with evidence', () => {
      const transcript = `
$ npm test

  14 passing (10ms)

All tests passed successfully.
`;

      const index = parser.parse(transcript);

      const claim = index.claims.find(c => c.claim.includes('tests passed'));
      assert.ok(claim);
      assert.strictEqual(claim?.verified, true);
      assert.ok(claim?.evidence?.includes('verified'));
    });

    it('should reject "tests passed" claim without evidence', () => {
      const transcript = `
I ran the tests and all tests passed.
`;

      const index = parser.parse(transcript);

      const claim = index.claims.find(c => c.claim.includes('tests passed'));
      assert.ok(claim);
      assert.strictEqual(claim?.verified, false);
      assert.ok(claim?.evidence?.includes('no test execution'));
    });

    it('should verify build claims with evidence', () => {
      const transcript = `
$ npm run build

Build succeeded.
`;

      const index = parser.parse(transcript);

      const claim = index.claims.find(c => c.claim.includes('Build succeeded'));
      assert.ok(claim);
      assert.strictEqual(claim?.verified, true);
    });

    it('should reject build claims without evidence', () => {
      const transcript = `
The build succeeded and everything compiled successfully.
`;

      const index = parser.parse(transcript);

      const claim = index.claims.find(c => c.claim.includes('compiled successfully'));
      assert.ok(claim);
      assert.strictEqual(claim?.verified, false);
    });

    it('should catch multiple unverified claims', () => {
      const transcript = `
All tests passed.
Build succeeded.
Deployment succeeded.
`;

      const index = parser.parse(transcript);

      const unverified = index.claims.filter(c => !c.verified);
      assert.strictEqual(unverified.length, 3);
    });
  });

  describe('negative tests - AI lying detection', () => {
    it('should flag "tests pass" without any test command', () => {
      const transcript = `
I made the changes.
All tests are passing.
Everything looks good.
`;

      const index = parser.parse(transcript);

      // should have zero verified test runs
      assert.strictEqual(index.testsRun.length, 0);

      // should have unverified claim
      const claim = index.claims.find(c => c.claim.includes('tests are passing'));
      assert.ok(claim);
      assert.strictEqual(claim?.verified, false);
    });

    it('should flag test command without output as unverified', () => {
      const transcript = `
$ npm test

Tests passed!
`;

      const index = parser.parse(transcript);

      // command was extracted
      assert.ok(index.commandsExecuted.includes('npm test'));

      // but test run is unverified
      assert.strictEqual(index.testsRun[0]?.verified, false);

      // claim is also unverified
      const claim = index.claims.find(c => c.claim.includes('Tests passed'));
      assert.ok(claim);
      assert.strictEqual(claim?.verified, false);
    });

    it('should flag generic success claims without commands', () => {
      const transcript = `
Everything works perfectly.
All tests passed.
Build succeeded.
Deployed successfully.
`;

      const index = parser.parse(transcript);

      // no commands extracted
      assert.strictEqual(index.commandsExecuted.length, 0);

      // all claims should be unverified
      const unverified = index.claims.filter(c => !c.verified);
      assert.strictEqual(unverified.length, 3); // tests, build, deploy
    });
  });

  describe('parse full transcript', () => {
    it('should parse a complete realistic transcript', () => {
      const transcript = `
I implemented the API endpoints as requested.

$ git status
Changes not staged for commit:
  modified: src/api/users.ts
  modified: src/api/auth.ts
  modified: test/api.test.ts

$ npm install
$ npm test

  API Tests
    ✔ should create user
    ✔ should authenticate
    ✔ should handle errors

  15 passing (25ms)

$ git add .
$ git commit -m "add user API"
$ git push

Created PR: https://github.com/owner/repo/pull/123

All tests passed and the API is working correctly.
`;

      const index = parser.parse(transcript);

      // verify all extractions
      assert.ok(index.changedFiles.length >= 3);
      assert.ok(index.commandsExecuted.length >= 5);
      assert.strictEqual(index.testsRun.length, 1);
      assert.strictEqual(index.testsRun[0]?.verified, true);
      assert.ok(index.prLinks.includes('https://github.com/owner/repo/pull/123'));

      // verify claims
      const testClaim = index.claims.find(c => c.claim.includes('tests passed'));
      assert.ok(testClaim);
      assert.strictEqual(testClaim?.verified, true);
    });
  });
});
