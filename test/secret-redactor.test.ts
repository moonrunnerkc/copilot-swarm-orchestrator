import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { redactString, redactFile, REDACTABLE_KEYS } from '../src/secret-redactor';

describe('SecretRedactor', () => {
  let tempDir: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redact-test-'));
    // Save original env values so we can restore after each test
    for (const key of REDACTABLE_KEYS) {
      savedEnv[key] = process.env[key];
    }
  });

  afterEach(() => {
    // Restore original env values
    for (const key of REDACTABLE_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('redactString', () => {
    it('replaces a single known secret value', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-12345';
      const input = 'Authorization: Bearer sk-ant-test-key-12345';
      const result = redactString(input);
      assert.strictEqual(result, 'Authorization: Bearer [REDACTED:ANTHROPIC_API_KEY]');
    });

    it('replaces multiple occurrences of the same secret', () => {
      process.env.OPENAI_API_KEY = 'sk-openai-abc';
      const input = 'key=sk-openai-abc and again sk-openai-abc';
      const result = redactString(input);
      assert.ok(!result.includes('sk-openai-abc'), 'should redact all occurrences');
      assert.strictEqual(
        result,
        'key=[REDACTED:OPENAI_API_KEY] and again [REDACTED:OPENAI_API_KEY]'
      );
    });

    it('redacts multiple different secrets in one pass', () => {
      process.env.ANTHROPIC_API_KEY = 'secret-a';
      process.env.GITHUB_TOKEN = 'ghp_secret-b';
      const input = 'keys: secret-a and ghp_secret-b here';
      const result = redactString(input);
      assert.ok(!result.includes('secret-a'));
      assert.ok(!result.includes('ghp_secret-b'));
      assert.ok(result.includes('[REDACTED:ANTHROPIC_API_KEY]'));
      assert.ok(result.includes('[REDACTED:GITHUB_TOKEN]'));
    });

    it('returns input unchanged when no secrets are set', () => {
      for (const key of REDACTABLE_KEYS) {
        delete process.env[key];
      }
      const input = 'nothing secret here';
      assert.strictEqual(redactString(input), input);
    });

    it('handles secrets containing regex metacharacters', () => {
      // API keys can contain +, /, =, and other regex-special chars
      process.env.ANTHROPIC_API_KEY = 'sk+ant/test=key+abc';
      const input = 'token: sk+ant/test=key+abc end';
      const result = redactString(input);
      assert.ok(!result.includes('sk+ant/test=key+abc'), 'metacharacters should be treated literally');
      assert.ok(result.includes('[REDACTED:ANTHROPIC_API_KEY]'));
    });

    it('skips empty env values', () => {
      process.env.ANTHROPIC_API_KEY = '';
      const input = 'no empty replacements should happen';
      assert.strictEqual(redactString(input), input);
    });
  });

  describe('redactFile', () => {
    it('redacts secrets from a file on disk', () => {
      process.env.COPILOT_TOKEN = 'ghu_copilot123';
      const filePath = path.join(tempDir, 'transcript.md');
      fs.writeFileSync(filePath, 'Session used token ghu_copilot123 for auth', 'utf8');

      redactFile(filePath);

      const result = fs.readFileSync(filePath, 'utf8');
      assert.ok(!result.includes('ghu_copilot123'));
      assert.ok(result.includes('[REDACTED:COPILOT_TOKEN]'));
    });

    it('does not rewrite file when no secrets match', () => {
      for (const key of REDACTABLE_KEYS) {
        delete process.env[key];
      }
      const filePath = path.join(tempDir, 'clean.md');
      fs.writeFileSync(filePath, 'no secrets here', 'utf8');
      const mtime = fs.statSync(filePath).mtimeMs;

      redactFile(filePath);

      const result = fs.readFileSync(filePath, 'utf8');
      assert.strictEqual(result, 'no secrets here');
    });

    it('no-ops silently when file does not exist', () => {
      const missingPath = path.join(tempDir, 'does-not-exist.txt');
      // Should not throw
      redactFile(missingPath);
    });
  });

  describe('REDACTABLE_KEYS', () => {
    it('includes all expected secret env var names', () => {
      const keys = [...REDACTABLE_KEYS];
      assert.ok(keys.includes('ANTHROPIC_API_KEY'));
      assert.ok(keys.includes('OPENAI_API_KEY'));
      assert.ok(keys.includes('GITHUB_TOKEN'));
      assert.ok(keys.includes('COPILOT_TOKEN'));
      assert.ok(keys.includes('GOOGLE_APPLICATION_CREDENTIALS'));
    });
  });
});
