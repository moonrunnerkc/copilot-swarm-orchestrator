// Strips known secret values from strings and files so credentials
// never persist in transcripts, session state, or log artifacts.

import * as fs from 'fs';

// Keys checked against process.env for values to redact.
// Ordering does not matter; every key with a non-empty value is applied.
const REDACTABLE_KEYS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GITHUB_TOKEN',
  'COPILOT_TOKEN',
  'GOOGLE_APPLICATION_CREDENTIALS',
] as const;

interface RedactionEntry {
  keyName: string;
  value: string;
}

function buildRedactionList(): RedactionEntry[] {
  const entries: RedactionEntry[] = [];
  for (const key of REDACTABLE_KEYS) {
    const value = process.env[key];
    if (value && value.length > 0) {
      entries.push({ keyName: key, value });
    }
  }
  return entries;
}

/**
 * Replace all occurrences of known secret values in the input string
 * with `[REDACTED:<KEY_NAME>]` placeholders. Returns the sanitized string.
 */
export function redactString(input: string): string {
  const entries = buildRedactionList();
  let result = input;
  for (const entry of entries) {
    // Split/join is safe for literal replacement without regex escaping
    while (result.includes(entry.value)) {
      result = result.split(entry.value).join(`[REDACTED:${entry.keyName}]`);
    }
  }
  return result;
}

/**
 * Redact known secret values in-place from a file on disk.
 * No-ops silently if the file does not exist (already cleaned up).
 */
export function redactFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;

  const original = fs.readFileSync(filePath, 'utf8');
  const redacted = redactString(original);

  // Only write back if something actually changed
  if (redacted !== original) {
    fs.writeFileSync(filePath, redacted, 'utf8');
  }
}

export { REDACTABLE_KEYS };
