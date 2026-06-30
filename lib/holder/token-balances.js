/**
 * Load XMA / SPL token balances for all holders (Helius getTokenAccounts + GPA fallback).
 */
const bs58 = require('bs58');
const { getHeliusApiKey, heliusPost } = require('./helius-rpc');
const { fetchXmaBalanceHuman } = require('./wallet-holdings');

const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const CACHE_MS = 5 * 60 * 1000;

/** @type {{ expires: number, map: Map<string, number>, source: string } | null} */
let cache = null;

function decodeTokenAccountOwnerAndAmount(dataBase64) {
  if (!dataBase64) return null;
  try {
    const buf = Buffer.from(dataBase64, 'base64');
    if (buf.length < 40) return null;
    const owner = bs58.encode(buf.slice(0, 32));
    const amount = buf.readBigUInt64LE(32);
    return { owner, amount: Number(amount) };
  } catch (e) {
    return null;
  }
}

function addRawAmount(map, owner, raw, decimals) {
  if (!owner || raw <= 0) return;
  const human = raw / Math.pow(10, decimals);
  map.set(owner, (map.get(owner) || 0) + human);
}

async function loadViaGetTokenAccounts(tokenMint, decimals) {
  const map = new Map();
  let page = 1;
  const limit = 1000;
  while (true) {
    const result = await heliusPost(
      'getTokenAccounts',
      { mint: tokenMint, page, limit },
      { timeoutMs: 45000 }
    );
    const accounts = result?.token_accounts || [];
    for (const acc of accounts) {
      addRawAmount(map, acc.owner, Number(acc.amount || 0), decimals);
    }
    if (accounts.length < limit) break;
    page += 1;
    if (page > 100) break;
  }
  return map;
}

async function loadViaGetProgramAccounts(tokenMint, decimals) {
  const map = new Map();
  const result = await heliusPost(
    'getProgramAccounts',
    [
      TOKEN_PROGRAM_ID,
      {
        encoding: 'base64',
        commitment: 'confirmed',
        filters: [
          { dataSize: 165 },
          { memcmp: { offset: 0, bytes: tokenMint } },
        ],
        dataSlice: { offset: 32, length: 40 },
      },
    ],
    { timeoutMs: 90000 }
  );
  const accounts = result || [];
  for (const item of accounts) {
    const data = item.account?.data;
    if (!data) continue;
    const decoded = decodeTokenAccountOwnerAndAmount(Array.isArray(data) ? data[0] : data);
    if (!decoded) continue;
    addRawAmount(map, decoded.owner, decoded.amount, decimals);
  }
  return map;
}

/**
 * @param {string} tokenMint
 * @param {number} decimals
 * @returns {Promise<{ map: Map<string, number>, source: string }>}
 */
async function loadAllTokenBalances(tokenMint, decimals) {
  if (cache && cache.expires > Date.now()) {
    return { map: new Map(cache.map), source: cache.source + '-cache' };
  }

  const map = new Map();
  let source = 'none';

  if (!getHeliusApiKey()) {
    return { map, source };
  }

  try {
    const viaTokenAccounts = await loadViaGetTokenAccounts(tokenMint, decimals);
    if (viaTokenAccounts.size > 0) {
      for (const [w, b] of viaTokenAccounts.entries()) map.set(w, b);
      source = 'helius-getTokenAccounts';
    }
  } catch (e) {
    console.warn('loadViaGetTokenAccounts failed', e.message);
  }

  if (map.size === 0) {
    try {
      const viaGpa = await loadViaGetProgramAccounts(tokenMint, decimals);
      if (viaGpa.size > 0) {
        for (const [w, b] of viaGpa.entries()) map.set(w, b);
        source = 'helius-getProgramAccounts';
      }
    } catch (e) {
      console.warn('loadViaGetProgramAccounts failed', e.message);
    }
  }

  if (map.size > 0) {
    cache = { expires: Date.now() + CACHE_MS, map: new Map(map), source };
  }

  return { map, source };
}

/**
 * Fill gaps for known wallets (NFT owners, linked Discord wallets).
 * @param {Map<string, number>} balances
 * @param {string[]} wallets
 */
async function enrichTokenBalancesForWallets(balances, wallets) {
  const uniq = [...new Set((wallets || []).filter(Boolean))];
  const batchSize = 10;
  for (let i = 0; i < uniq.length; i += batchSize) {
    const batch = uniq.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (wallet) => {
        const existing = balances.get(wallet) || 0;
        if (existing > 0) return;
        const bal = await fetchXmaBalanceHuman(wallet);
        if (bal > 0) balances.set(wallet, bal);
      })
    );
    if (i + batchSize < uniq.length) {
      await new Promise((r) => setTimeout(r, 30));
    }
  }
  return balances;
}

module.exports = {
  loadAllTokenBalances,
  enrichTokenBalancesForWallets,
};
