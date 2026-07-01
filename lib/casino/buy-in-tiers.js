/**
 * Casino buy-in tiers pegged to USD: $0.10, $0.50, $1, $2, $5 → rounded XMA amounts.
 */
const axios = require('axios');
const { XMA_TOKEN_MINT } = require('./constants');

const USD_BUY_IN_TIERS = [0.1, 0.5, 1, 2, 5];
const CACHE_MS = 60 * 1000;

/** Fallback XMA per tier when live price unavailable (~$2.5e-6 XMA). */
const FALLBACK_XMA = {
  0.1: 40000,
  0.5: 200000,
  1: 400000,
  2: 800000,
  5: 2000000,
};

let cache = { tiers: null, xmaUsd: null, priceSource: null, ts: 0 };

function formatUsdLabel(usd) {
  if (usd < 1) return '$' + usd.toFixed(2);
  return '$' + (Number.isInteger(usd) ? String(usd) : usd.toFixed(2));
}

function formatXmaLabel(xma) {
  const n = Number(xma);
  if (!Number.isFinite(n)) return '0';
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return (m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)) + 'M';
  }
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** Round to ~2 significant figures for clean XMA payment amounts. */
function roundXmaToNice(xma) {
  if (!Number.isFinite(xma) || xma <= 0) return 1;
  if (xma < 10) return Math.max(1, Math.round(xma));
  const exponent = Math.floor(Math.log10(xma));
  const scale = Math.pow(10, exponent - 1);
  return Math.round(xma / scale) * scale;
}

function buildTiersFromPrice(priceUsd, priceSource) {
  const tiers = USD_BUY_IN_TIERS.map(function (usd) {
    const rawXma = usd / priceUsd;
    const xma = roundXmaToNice(rawXma);
    return {
      usd,
      usdLabel: formatUsdLabel(usd),
      xma,
      xmaLabel: formatXmaLabel(xma),
      optionLabel: formatXmaLabel(xma) + ' XMA (' + formatUsdLabel(usd) + ')',
    };
  });
  return { tiers, xmaUsd: priceUsd, priceSource };
}

function buildFallbackTiers() {
  const tiers = USD_BUY_IN_TIERS.map(function (usd) {
    const xma = FALLBACK_XMA[usd] || roundXmaToNice(1);
    return {
      usd,
      usdLabel: formatUsdLabel(usd),
      xma,
      xmaLabel: formatXmaLabel(xma),
      optionLabel: formatXmaLabel(xma) + ' XMA (' + formatUsdLabel(usd) + ')',
    };
  });
  return { tiers, xmaUsd: null, priceSource: 'fallback' };
}

async function fetchXmaUsdPrice() {
  const mint = XMA_TOKEN_MINT;
  try {
    const r = await axios.get('https://api.jup.ag/tokens/v2/search?query=' + encodeURIComponent(mint), {
      timeout: 8000,
      validateStatus: () => true,
      headers: { Accept: 'application/json' },
    });
    if (r.status === 200 && Array.isArray(r.data) && r.data.length) {
      const row = r.data.find(function (t) { return t.id === mint; }) || r.data[0];
      const p = Number(row.usdPrice);
      if (p > 0) return { priceUsd: p, source: 'jupiter' };
    }
  } catch (e) {
    console.warn('[buy-in-tiers] Jupiter search', e.message);
  }
  try {
    const r = await axios.get('https://api.jup.ag/price/v3?ids=' + encodeURIComponent(mint), {
      timeout: 8000,
      validateStatus: () => true,
      headers: { Accept: 'application/json' },
    });
    if (r.status === 200 && r.data && typeof r.data === 'object') {
      const row = r.data[mint] || r.data.data?.[mint];
      const p = Number(row?.price ?? row?.usdPrice);
      if (p > 0) return { priceUsd: p, source: 'jupiter-price-v3' };
    }
  } catch (e) {
    console.warn('[buy-in-tiers] Jupiter price v3', e.message);
  }
  return null;
}

/**
 * @returns {Promise<{ tiers: object[], xmaUsd: number|null, priceSource: string }>}
 */
async function resolveBuyInTiers() {
  const now = Date.now();
  if (cache.tiers && now - cache.ts < CACHE_MS) {
    return { tiers: cache.tiers, xmaUsd: cache.xmaUsd, priceSource: cache.priceSource };
  }
  const live = await fetchXmaUsdPrice();
  const payload = live
    ? buildTiersFromPrice(live.priceUsd, live.source)
    : buildFallbackTiers();
  cache = {
    tiers: payload.tiers,
    xmaUsd: payload.xmaUsd,
    priceSource: payload.priceSource,
    ts: now,
  };
  return payload;
}

function getDefaultTierXma(tiers) {
  const list = tiers || cache.tiers || [];
  const one = list.find(function (t) { return t.usd === 1; });
  if (one) return one.xma;
  return list.length ? list[Math.floor(list.length / 2)].xma : FALLBACK_XMA[1];
}

function isAllowedBuyInCost(cost, tiers) {
  const c = Number(cost);
  if (!Number.isFinite(c) || c <= 0) return false;
  const list = tiers || cache.tiers || [];
  return list.some(function (t) { return Number(t.xma) === c; });
}

module.exports = {
  USD_BUY_IN_TIERS,
  roundXmaToNice,
  resolveBuyInTiers,
  getDefaultTierXma,
  isAllowedBuyInCost,
  formatUsdLabel,
  formatXmaLabel,
};
