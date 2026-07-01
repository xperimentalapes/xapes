/**
 * Casino buy-in tiers: fixed round XMA amounts with live USD value in labels.
 */
const axios = require('axios');
const { XMA_TOKEN_MINT } = require('./constants');

const XMA_BUY_IN_TIERS = [25000, 50000, 100000, 200000, 500000, 1000000, 2000000];
const DEFAULT_BUY_IN_XMA = 100000;
const CACHE_MS = 60 * 1000;

/** Approximate XMA/USD for display when live price unavailable. */
const FALLBACK_XMA_USD = 0.0000025;

let cache = { tiers: null, xmaUsd: null, priceSource: null, ts: 0 };

function formatUsdLabel(usd) {
  const n = Number(usd);
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n < 1) return '$' + n.toFixed(2);
  if (n < 10) return '$' + n.toFixed(2);
  if (n < 100) return '$' + (Number.isInteger(n) ? String(n) : n.toFixed(2));
  return '$' + Math.round(n).toLocaleString('en-US');
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

function buildTier(xma, priceUsd) {
  const usd = xma * priceUsd;
  return {
    xma,
    usd,
    usdLabel: formatUsdLabel(usd),
    xmaLabel: formatXmaLabel(xma),
    optionLabel: formatXmaLabel(xma) + ' XMA (' + formatUsdLabel(usd) + ')',
  };
}

function buildTiersFromPrice(priceUsd, priceSource) {
  const tiers = XMA_BUY_IN_TIERS.map(function (xma) {
    return buildTier(xma, priceUsd);
  });
  return { tiers, xmaUsd: priceUsd, priceSource };
}

function buildFallbackTiers() {
  const tiers = XMA_BUY_IN_TIERS.map(function (xma) {
    return buildTier(xma, FALLBACK_XMA_USD);
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
  const preferred = list.find(function (t) { return Number(t.xma) === DEFAULT_BUY_IN_XMA; });
  if (preferred) return preferred.xma;
  return list.length ? list[Math.floor(list.length / 2)].xma : DEFAULT_BUY_IN_XMA;
}

function isAllowedBuyInCost(cost, tiers) {
  const c = Number(cost);
  if (!Number.isFinite(c) || c <= 0) return false;
  const list = tiers || cache.tiers || [];
  return list.some(function (t) { return Number(t.xma) === c; });
}

module.exports = {
  XMA_BUY_IN_TIERS,
  DEFAULT_BUY_IN_XMA,
  resolveBuyInTiers,
  getDefaultTierXma,
  isAllowedBuyInCost,
  formatUsdLabel,
  formatXmaLabel,
};
