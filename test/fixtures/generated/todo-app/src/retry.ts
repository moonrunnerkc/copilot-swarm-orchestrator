export async function retry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const backoffMs = 50 * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, backoffMs));
    }
  }

  throw lastErr;
}
