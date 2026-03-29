/**
 * Unit tests for URL validation, in-memory short-code storage, and statistics tracking.
 */
import assert from 'assert';
import { StatisticsTracker, URLShortener, validateURL } from '../src/url-shortener';

describe('validateURL', () => {
  it('accepts trimmed HTTP and HTTPS URLs', () => {
    assert.strictEqual(validateURL(' https://example.com/path?q=1 '), true);
    assert.strictEqual(validateURL('http://example.com'), true);
  });

  it('rejects non-http protocols, blank values, and malformed URLs', () => {
    assert.strictEqual(validateURL('ftp://example.com'), false);
    assert.strictEqual(validateURL('   '), false);
    assert.strictEqual(validateURL('not a url'), false);
  });

  it('rejects URLs that exceed the configured max length', () => {
    const longURL = `https://example.com/${'a'.repeat(32)}`;
    assert.strictEqual(validateURL(longURL, 20), false);
  });
});

describe('StatisticsTracker', () => {
  it('records and returns hit counts per short code', () => {
    const tracker = new StatisticsTracker();

    assert.strictEqual(tracker.recordHit('abc123'), 1);
    assert.strictEqual(tracker.recordHit('abc123'), 2);
    assert.strictEqual(tracker.recordHit('xyz999'), 1);
    assert.strictEqual(tracker.getHits('abc123'), 2);
    assert.strictEqual(tracker.getHits('xyz999'), 1);
  });

  it('supports resetting one code or the full tracker', () => {
    const tracker = new StatisticsTracker();
    tracker.recordHit('first');
    tracker.recordHit('second');

    tracker.reset('first');
    assert.strictEqual(tracker.getHits('first'), 0);
    assert.strictEqual(tracker.getHits('second'), 1);

    tracker.reset();
    assert.deepStrictEqual(tracker.snapshot(), {});
  });

  it('rejects blank short codes', () => {
    const tracker = new StatisticsTracker();

    assert.throws(() => tracker.recordHit('   '), /Short code is required\./);
    assert.throws(() => tracker.reset('   '), /Short code is required\./);
  });
});

describe('URLShortener', () => {
  it('creates deterministic base62 short codes for the same URL', () => {
    const shortener = new URLShortener();

    const firstCode = shortener.shorten('https://example.com/resource');
    const secondCode = shortener.shorten('  https://example.com/resource  ');

    assert.strictEqual(firstCode, secondCode);
    assert.match(firstCode, /^[0-9a-zA-Z]+$/);
    assert.ok(firstCode.length >= 7);
  });

  it('stores mappings in memory and resolves back to the original URL', () => {
    const shortener = new URLShortener();
    const originalURL = 'https://example.com/articles/testing';
    const shortCode = shortener.shorten(originalURL);

    assert.strictEqual(shortener.has(shortCode), true);
    assert.strictEqual(shortener.resolve(shortCode), originalURL);
    assert.strictEqual(shortener.resolve('missing'), null);
  });

  it('tracks hits only for successful resolutions', () => {
    const shortener = new URLShortener();
    const shortCode = shortener.shorten('https://example.com/hits');

    shortener.resolve(shortCode);
    shortener.resolve(shortCode);
    shortener.resolve('missing');

    assert.strictEqual(shortener.getHitCount(shortCode), 2);
  });

  it('rejects invalid URLs and blank short codes', () => {
    const shortener = new URLShortener();

    assert.throws(() => shortener.shorten('javascript:alert(1)'), /A valid HTTP or HTTPS URL is required\./);
    assert.throws(() => shortener.resolve('   '), /Short code is required\./);
  });
});
