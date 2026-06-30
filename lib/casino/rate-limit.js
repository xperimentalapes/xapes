const buckets = new Map();
const DEFAULT_MAX = 30;
const WINDOW_MS = 60000;

function checkRateLimit(key, maxPerMinute = DEFAULT_MAX) {
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= maxPerMinute) return false;
  hits.push(now);
  buckets.set(key, hits);
  return true;
}

function enforceRateLimit(walletAddress, action, maxPerMinute) {
  const key = `${action}:${walletAddress}`;
  if (!checkRateLimit(key, maxPerMinute)) {
    const err = new Error('Too many requests. Please wait before trying again.');
    err.status = 429;
    throw err;
  }
}

module.exports = { checkRateLimit, enforceRateLimit };
