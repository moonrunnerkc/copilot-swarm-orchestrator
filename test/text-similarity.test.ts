import { strict as assert } from 'assert';
import { levenshtein } from '../src/text-similarity';

describe('text-similarity', () => {
  describe('levenshtein', () => {
    it('returns 0 for identical strings', () => {
      assert.strictEqual(levenshtein('hello', 'hello'), 0);
    });

    it('returns string length for empty vs non-empty', () => {
      assert.strictEqual(levenshtein('', 'abc'), 3);
      assert.strictEqual(levenshtein('xyz', ''), 3);
    });

    it('returns 0 for two empty strings', () => {
      assert.strictEqual(levenshtein('', ''), 0);
    });

    it('computes single-char edits correctly', () => {
      assert.strictEqual(levenshtein('cat', 'bat'), 1);  // substitution
      assert.strictEqual(levenshtein('cat', 'cats'), 1); // insertion
      assert.strictEqual(levenshtein('cats', 'cat'), 1); // deletion
    });

    it('handles multi-edit cases', () => {
      assert.strictEqual(levenshtein('kitten', 'sitting'), 3);
    });
  });
});
