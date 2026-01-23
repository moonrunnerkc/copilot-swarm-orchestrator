import { describe, it } from 'mocha';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { GitHubMcpIntegrator } from '../src/github-mcp-integrator';

describe('GitHubMcpIntegrator', () => {
  const testDir = path.join(process.cwd(), 'test-proof');

  before(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  after(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('generateMcpPromptSection', () => {
    it('should include MCP evidence requirements', () => {
      const prompt = GitHubMcpIntegrator.generateMcpPromptSection();
      
      assert.ok(prompt.includes('MCP'));
      assert.ok(prompt.includes('GitHub context'));
      assert.ok(prompt.includes('evidence'));
      assert.ok(prompt.includes('verification'));
    });

    it('should include example format', () => {
      const prompt = GitHubMcpIntegrator.generateMcpPromptSection();
      
      assert.ok(prompt.includes('## MCP Evidence'));
      assert.ok(prompt.includes('issue'));
      assert.ok(prompt.includes('PR'));
    });
  });

  describe('generateDelegatePromptSection', () => {
    it('should include /delegate instructions', () => {
      const prompt = GitHubMcpIntegrator.generateDelegatePromptSection();
      
      assert.ok(prompt.includes('/delegate'));
      assert.ok(prompt.includes('PR'));
      assert.ok(prompt.includes('verification'));
    });

    it('should include PR URL format', () => {
      const prompt = GitHubMcpIntegrator.generateDelegatePromptSection();
      
      assert.ok(prompt.includes('https://github.com'));
      assert.ok(prompt.includes('pull'));
    });
  });

  describe('validateMcpEvidence', () => {
    it('should return not found if verification.md does not exist', () => {
      const result = GitHubMcpIntegrator.validateMcpEvidence(
        path.join(testDir, 'nonexistent.md')
      );
      
      assert.strictEqual(result.found, false);
      assert.ok(result.warnings.some(w => w.includes('not found')));
    });

    it('should return not found if no MCP Evidence section', () => {
      const verificationPath = path.join(testDir, 'no-mcp.md');
      fs.writeFileSync(verificationPath, `
# Verification

Changed files: src/api.ts
Tests run: npm test

All done.
`);

      const result = GitHubMcpIntegrator.validateMcpEvidence(verificationPath);
      
      assert.strictEqual(result.found, false);
      assert.ok(result.warnings.some(w => w.includes('MCP Evidence')));
    });

    it('should accept valid MCP evidence section', () => {
      const verificationPath = path.join(testDir, 'valid-mcp.md');
      fs.writeFileSync(verificationPath, `
# Verification

## MCP Evidence

- Consulted open issues: Found issue #42 "Add authentication"
- Checked existing PRs: No conflicts found
- Reviewed CI workflow: .github/workflows/ci.yml runs tests on push
- Decision: Implemented auth to resolve #42, ensured compatibility with CI

## Changes

Changed files: src/auth.ts, test/auth.test.ts
`);

      const result = GitHubMcpIntegrator.validateMcpEvidence(verificationPath);
      
      assert.strictEqual(result.found, true);
      assert.ok(result.section);
      assert.ok(result.section.includes('issue #42'));
      assert.ok(result.section.includes('Decision'));
    });

    it('should warn if MCP section is too short', () => {
      const verificationPath = path.join(testDir, 'short-mcp.md');
      fs.writeFileSync(verificationPath, `
## MCP Evidence

Checked.
`);

      const result = GitHubMcpIntegrator.validateMcpEvidence(verificationPath);
      
      assert.strictEqual(result.found, true);
      assert.ok(result.warnings.some(w => w.includes('too short')));
    });

    it('should warn if no specific GitHub references', () => {
      const verificationPath = path.join(testDir, 'vague-mcp.md');
      fs.writeFileSync(verificationPath, `
## MCP Evidence

I looked at GitHub and everything seems fine. Made some changes.
Nothing specific to mention really.
`);

      const result = GitHubMcpIntegrator.validateMcpEvidence(verificationPath);
      
      assert.strictEqual(result.found, true);
      // should warn about both missing references AND missing decision
      assert.ok(result.warnings.length > 0);
      assert.ok(
        result.warnings.some(w => w.includes('no specific GitHub references')) ||
        result.warnings.some(w => w.includes('influenced decisions'))
      );
    });

    it('should warn if no decision statement', () => {
      const verificationPath = path.join(testDir, 'no-decision.md');
      fs.writeFileSync(verificationPath, `
## MCP Evidence

- Checked issue #42
- Reviewed PR #10
- Saw workflow ci.yml
`);

      const result = GitHubMcpIntegrator.validateMcpEvidence(verificationPath);
      
      assert.strictEqual(result.found, true);
      assert.ok(result.warnings.some(w => w.includes('influenced decisions')));
    });
  });

  describe('extractPrUrls', () => {
    it('should extract GitHub PR URLs', () => {
      const verificationPath = path.join(testDir, 'with-pr-urls.md');
      fs.writeFileSync(verificationPath, `
# Verification

Created PR: https://github.com/owner/repo/pull/123
Related: https://github.com/other/project/pull/456
`);

      const urls = GitHubMcpIntegrator.extractPrUrls(verificationPath);
      
      assert.strictEqual(urls.length, 2);
      assert.ok(urls.includes('https://github.com/owner/repo/pull/123'));
      assert.ok(urls.includes('https://github.com/other/project/pull/456'));
    });

    it('should extract PR number references', () => {
      const verificationPath = path.join(testDir, 'with-pr-refs.md');
      fs.writeFileSync(verificationPath, `
# Verification

Created PR: #123
See also PR #456
`);

      const urls = GitHubMcpIntegrator.extractPrUrls(verificationPath);
      
      assert.strictEqual(urls.length, 2);
      assert.ok(urls.includes('#123'));
      assert.ok(urls.includes('#456'));
    });

    it('should return empty array if file does not exist', () => {
      const urls = GitHubMcpIntegrator.extractPrUrls(
        path.join(testDir, 'nonexistent.md')
      );
      
      assert.strictEqual(urls.length, 0);
    });

    it('should deduplicate PR URLs', () => {
      const verificationPath = path.join(testDir, 'duplicate-prs.md');
      fs.writeFileSync(verificationPath, `
Created PR: https://github.com/owner/repo/pull/123
See PR: https://github.com/owner/repo/pull/123
Also PR #123
`);

      const urls = GitHubMcpIntegrator.extractPrUrls(verificationPath);
      
      // should have URL and #ref, but not duplicates
      assert.strictEqual(urls.length, 2);
    });
  });

  describe('formatMcpEvidenceDisplay', () => {
    it('should format not found evidence', () => {
      const evidence = {
        found: false,
        warnings: ['verification.md not found']
      };

      const display = GitHubMcpIntegrator.formatMcpEvidenceDisplay(evidence);
      
      assert.ok(display.includes('NOT FOUND'));
      assert.ok(display.includes('verification.md not found'));
    });

    it('should format found evidence with section', () => {
      const evidence = {
        found: true,
        section: 'Consulted issue #42',
        warnings: []
      };

      const display = GitHubMcpIntegrator.formatMcpEvidenceDisplay(evidence);
      
      assert.ok(display.includes('FOUND'));
      assert.ok(display.includes('issue #42'));
    });

    it('should include warnings even when found', () => {
      const evidence = {
        found: true,
        section: 'Brief.',
        warnings: ['too short']
      };

      const display = GitHubMcpIntegrator.formatMcpEvidenceDisplay(evidence);
      
      assert.ok(display.includes('FOUND'));
      assert.ok(display.includes('Warnings'));
      assert.ok(display.includes('too short'));
    });
  });
});
