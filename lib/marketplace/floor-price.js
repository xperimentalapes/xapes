/**
 * Collection floor price (SOL) for holders USD estimates — ME with stale cache + env fallback.
 */
const { fetchMeStats } = require('./magic-eden');

/** Last-resort when ME is slow/unavailable on cold start (~12.5M lamports). Override via COLLECTION_FLOOR_PRICE_SOL. */
const DEFAULT_FLOOR_SOL = 0.0125011;

function parseFloorEnv() {
  const raw = process.env.COLLECTION_FLOOR_PRICE_SOL || process.env.MUTANT_APES_FLOOR_SOL || '';
  if (!raw.trim()) return null;
  const n = parseFloat(raw);
  return isFinite(n) && n > 0 ? n : null;
}

/**
 * @param {string} [slug]
 * @param {{ timeoutMs?: number }} [opts]
 * @returns {Promise<number|null>}
 */
async function getCollectionFloorPriceSol(slug, opts) {
  const envFloor = parseFloorEnv();
  if (envFloor != null) return envFloor;

  const s = slug || process.env.COLLECTION_ME_SLUG || 'mutant_apes';
  const timeoutMs = opts?.timeoutMs ?? 2500;
  try {
    const stats = await fetchMeStats(s, { timeoutMs });
    if (stats?.floorPriceSol != null) {
      const n = parseFloat(String(stats.floorPriceSol));
      if (isFinite(n) && n > 0) return n;
    }
  } catch (e) {
    console.warn('getCollectionFloorPriceSol failed', s, e.message);
  }

  return DEFAULT_FLOOR_SOL;
}

module.exports = { getCollectionFloorPriceSol, DEFAULT_FLOOR_SOL };
