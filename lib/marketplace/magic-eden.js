/**
 * Magic Eden Solana API helpers with short-lived in-memory cache.
 */
const axios = require('axios');

const ME_BASE = 'https://api-mainnet.magiceden.dev/v2';
const LAMPORTS_PER_SOL = 1e9;
const CACHE_TTL_MS = 2 * 60 * 1000;

/** @type {Map<string, { expires: number, value: object }>} */
const cache = new Map();

function cacheKey(kind, slug) {
  return kind + ':' + slug;
}

function readCache(key) {
  const hit = cache.get(key);
  if (!hit || hit.expires < Date.now()) return null;
  return hit.value;
}

function writeCache(key, value) {
  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, value });
}

function lamportsToSol(lamports) {
  if (lamports == null || lamports === '') return null;
  const n = Number(lamports);
  if (!isFinite(n)) return null;
  const sol = n >= 1000 ? n / LAMPORTS_PER_SOL : n;
  return isFinite(sol) ? sol : null;
}

function formatSol(sol) {
  if (sol == null || !isFinite(sol)) return null;
  if (sol >= 1) return sol.toFixed(4);
  if (sol >= 0.0001) return sol.toFixed(4);
  return sol.toFixed(6);
}

async function meGet(path, timeoutMs) {
  const res = await axios.get(ME_BASE + path, {
    timeout: timeoutMs,
    validateStatus: () => true,
    headers: { Accept: 'application/json' },
  });
  if (res.status === 429) {
    const err = new Error('Magic Eden rate limited');
    err.code = 'ME_RATE_LIMIT';
    throw err;
  }
  if (res.status !== 200 || !res.data) {
    const err = new Error('Magic Eden HTTP ' + res.status);
    err.code = 'ME_HTTP';
    throw err;
  }
  return res.data;
}

/**
 * @param {string} slug
 * @param {{ timeoutMs?: number }} [opts]
 */
async function fetchMeStats(slug, opts) {
  const timeoutMs = opts?.timeoutMs ?? 12000;
  const key = cacheKey('stats', slug);
  const cached = readCache(key);
  if (cached) return cached;

  const s = await meGet('/collections/' + encodeURIComponent(slug) + '/stats', timeoutMs);
  const floorSol = lamportsToSol(s.floorPrice);
  const out = {
    listedCount: s.listedCount != null ? s.listedCount : null,
    floorPrice: s.floorPrice != null ? s.floorPrice : null,
    floorPriceSol: formatSol(floorSol),
    volumeAll: s.volumeAll != null ? s.volumeAll : null,
    volumeAllSol: s.volumeAll != null ? formatSol(Number(s.volumeAll) / LAMPORTS_PER_SOL) : null,
    avgPrice24hr: s.avgPrice24hr != null ? s.avgPrice24hr : null,
    avgPrice24hrSol:
      s.avgPrice24hr != null ? formatSol(Number(s.avgPrice24hr) / LAMPORTS_PER_SOL) : null,
  };
  writeCache(key, out);
  return out;
}

/**
 * @param {string} slug
 * @param {{ timeoutMs?: number }} [opts]
 */
async function fetchMeCollectionMeta(slug, opts) {
  const timeoutMs = opts?.timeoutMs ?? 8000;
  const key = cacheKey('meta', slug);
  const cached = readCache(key);
  if (cached) return cached;

  const m = await meGet('/collections/' + encodeURIComponent(slug), timeoutMs);
  const out = {
    name: m.name || null,
    description: m.description || null,
    image: m.image || m.imageURI || null,
    animationUrl: m.animation_url || m.animationUrl || null,
    supply: m.totalSupply != null ? m.totalSupply : null,
  };
  writeCache(key, out);
  return out;
}

module.exports = {
  ME_BASE,
  LAMPORTS_PER_SOL,
  lamportsToSol,
  formatSol,
  fetchMeStats,
  fetchMeCollectionMeta,
};
