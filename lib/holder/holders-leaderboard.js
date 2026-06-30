/**
 * Holders leaderboard: token balances (Helius) + NFT counts (Helius or Supabase nfts table).
 */
const { createClient } = require('@supabase/supabase-js');
const { getCollections, formatTokenAmount } = require('./wallet-holdings');
const { getHeliusApiKey, getHeliusRpcPostUrl } = require('./helius-rpc');
const { loadAllTokenBalances, enrichTokenBalancesForWallets } = require('./token-balances');

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function loadDiscordDisplayNamesByWallet() {
  const supabase = getSupabase();
  if (!supabase) return new Map();
  const map = new Map();
  const pageSize = 1000;
  let from = 0;
  try {
    while (true) {
      const { data, error } = await supabase
        .from('discord_wallet_links')
        .select('wallet_address, discord_display_name')
        .order('wallet_address')
        .range(from, from + pageSize - 1);
      if (error) {
        console.warn('Holders: discord_wallet_links fetch', error.message);
        break;
      }
      const rows = data || [];
      for (const row of rows) {
        if (row.wallet_address && row.discord_display_name) {
          map.set(row.wallet_address, String(row.discord_display_name));
        }
      }
      if (rows.length < pageSize) break;
      from += pageSize;
    }
  } catch (e) {
    console.warn('Holders: Supabase display names', e.message);
  }
  return map;
}

/**
 * Aggregate NFT counts from synced `nfts` table (populated by /api/cron/sync-nfts?mode=nfts).
 * @param {string} collectionMint
 * @returns {Promise<Map<string, number>>}
 */
async function loadNftCountsFromSupabase(collectionMint) {
  const supabase = getSupabase();
  const counts = new Map();
  if (!supabase || !collectionMint) return counts;

  const pageSize = 1000;
  let from = 0;
  try {
    while (true) {
      const { data, error } = await supabase
        .from('nfts')
        .select('owner_wallet')
        .eq('collection_mint', collectionMint)
        .not('owner_wallet', 'is', null)
        .range(from, from + pageSize - 1);
      if (error) {
        console.warn('Holders: nfts table fetch', error.message);
        break;
      }
      const rows = data || [];
      for (const row of rows) {
        const w = row.owner_wallet;
        if (w) counts.set(w, (counts.get(w) || 0) + 1);
      }
      if (rows.length < pageSize) break;
      from += pageSize;
    }
  } catch (e) {
    console.warn('Holders: Supabase NFT counts', e.message);
  }
  return counts;
}

async function loadNftCountsFromHelius(collections, apiKey) {
  const axios = require('axios');
  /** @type {Map<string, { mnk3ysCount: number, zmb3ysCount: number }>} */
  const byWallet = new Map();

  if (!apiKey) return byWallet;

  for (let c = 0; c < collections.length; c++) {
    const col = collections[c];
    const key = c === 0 ? 'mnk3ysCount' : c === 1 ? 'zmb3ysCount' : null;
    if (!key || !col.collectionMint) continue;

    let page = 1;
    let hasMore = true;
    while (hasMore) {
      try {
        const dasRes = await axios.post(
          getHeliusRpcPostUrl(),
          {
            jsonrpc: '2.0',
            id: '1',
            method: 'getAssetsByGroup',
            params: {
              groupKey: 'collection',
              groupValue: col.collectionMint,
              page,
              limit: 1000,
            },
          },
          { timeout: 20000, validateStatus: () => true }
        );
        const items = dasRes.data?.result?.items || [];
        for (const item of items) {
          const owner = item.ownership?.owner;
          if (!owner) continue;
          if (!byWallet.has(owner)) {
            byWallet.set(owner, { mnk3ysCount: 0, zmb3ysCount: 0 });
          }
          const row = byWallet.get(owner);
          row[key] = (row[key] || 0) + 1;
        }
        hasMore = items.length === 1000;
        page++;
        if (page > 50) break;
      } catch (e) {
        console.warn('Holders NFT fetch failed for', col.slug, e.message);
        hasMore = false;
      }
    }
  }

  return byWallet;
}

function mergeNftCounts(heliusMap, supabaseMap, collectionIndex) {
  const key = collectionIndex === 0 ? 'mnk3ysCount' : collectionIndex === 1 ? 'zmb3ysCount' : null;
  if (!key) return heliusMap;

  const merged = new Map();
  for (const [wallet, counts] of heliusMap.entries()) {
    merged.set(wallet, { ...(counts || {}) });
  }
  for (const [wallet, count] of supabaseMap.entries()) {
    if (!merged.has(wallet)) merged.set(wallet, { mnk3ysCount: 0, zmb3ysCount: 0 });
    const row = merged.get(wallet);
    const heliusCount = row[key] || 0;
    row[key] = Math.max(heliusCount, count);
  }
  return merged;
}

function shouldUseHeliusNftScan(supabaseMaps) {
  const mode = (process.env.HOLDERS_NFT_SOURCE || 'auto').toLowerCase();
  if (mode === 'helius') return true;
  if (mode === 'supabase') return false;
  return !supabaseMaps.some((m) => m && m.size > 0);
}

/**
 * @param {{ sort?: string }} [opts]
 */
async function buildHoldersLeaderboard(opts) {
  const sortBy = (opts?.sort || 'total').toLowerCase();
  const validSort = ['total', 'token', 'nfts'].includes(sortBy) ? sortBy : 'total';

  const collections = getCollections();
  const heliusKey = getHeliusApiKey();
  const tokenMint =
    process.env.XMA_TOKEN_MINT ||
    process.env.BLUNA_TOKEN_MINT ||
    process.env.TOKEN_MINT ||
    'HVSruatutKcgpZJXYyeRCWAnyT7mzYq1io9YoJ6F4yMP';
  const decimals = parseInt(process.env.BLUNA_DECIMALS || '6', 10);

  const [discordByWallet, supabaseNfts0] = await Promise.all([
    loadDiscordDisplayNamesByWallet(),
    collections[0]?.collectionMint
      ? loadNftCountsFromSupabase(collections[0].collectionMint)
      : Promise.resolve(new Map()),
  ]);

  let supabaseNfts1 = new Map();
  if (collections[1]?.collectionMint) {
    supabaseNfts1 = await loadNftCountsFromSupabase(collections[1].collectionMint);
  }

  const supabaseMaps = [supabaseNfts0, supabaseNfts1];
  let heliusNfts = new Map();
  if (shouldUseHeliusNftScan(supabaseMaps) && heliusKey) {
    heliusNfts = await loadNftCountsFromHelius(collections, heliusKey);
  }

  let nftByWallet = heliusNfts;
  nftByWallet = mergeNftCounts(nftByWallet, supabaseNfts0, 0);
  nftByWallet = mergeNftCounts(nftByWallet, supabaseNfts1, 1);

  const { map: tokenBalances, source: tokenSource } = await loadAllTokenBalances(tokenMint, decimals);

  const walletSeeds = new Set([
    ...supabaseNfts0.keys(),
    ...supabaseNfts1.keys(),
    ...nftByWallet.keys(),
    ...discordByWallet.keys(),
  ]);
  if (tokenBalances.size === 0 && heliusKey) {
    await enrichTokenBalancesForWallets(tokenBalances, [...walletSeeds]);
  }

  const holderMap = new Map();

  function getOrCreate(wallet) {
    if (!holderMap.has(wallet)) {
      holderMap.set(wallet, {
        wallet,
        tokenBalance: 0,
        tokenBalanceFormatted: '0',
        mnk3ysCount: 0,
        zmb3ysCount: 0,
      });
    }
    return holderMap.get(wallet);
  }

  for (const [wallet, balance] of tokenBalances.entries()) {
    const h = getOrCreate(wallet);
    h.tokenBalance = balance;
    h.tokenBalanceFormatted = formatTokenAmount(balance);
  }

  for (const [wallet, counts] of nftByWallet.entries()) {
    const h = getOrCreate(wallet);
    h.mnk3ysCount = counts.mnk3ysCount || 0;
    h.zmb3ysCount = counts.zmb3ysCount || 0;
  }

  let list = Array.from(holderMap.values()).map(function (h) {
    const totalNfts = (h.mnk3ysCount || 0) + (h.zmb3ysCount || 0);
    const discordDisplayName = discordByWallet.get(h.wallet) || null;
    return {
      wallet: h.wallet,
      discordDisplayName,
      tokenBalance: h.tokenBalance,
      tokenBalanceFormatted: h.tokenBalanceFormatted,
      mnk3ysCount: h.mnk3ysCount || 0,
      zmb3ysCount: h.zmb3ysCount || 0,
      totalNfts,
      totalScore: (h.tokenBalance || 0) / 1e6 + totalNfts * 10,
    };
  });

  if (validSort === 'token') list.sort((a, b) => b.tokenBalance - a.tokenBalance);
  else if (validSort === 'nfts') list.sort((a, b) => b.totalNfts - a.totalNfts);
  else list.sort((a, b) => b.totalScore - a.totalScore);

  const enrichUsed = walletSeeds.size > 0 && tokenSource === 'none' && tokenBalances.size > 0;

  return {
    holders: list,
    sort: validSort,
    sources: {
      tokenBalances:
        tokenBalances.size > 0
          ? enrichUsed
            ? 'helius-per-wallet'
            : tokenSource
          : heliusKey
            ? 'helius-empty'
            : 'none',
      nftCounts:
        heliusNfts.size > 0 && (supabaseNfts0.size > 0 || supabaseNfts1.size > 0)
          ? 'helius+supabase'
          : heliusNfts.size > 0
            ? 'helius'
            : supabaseNfts0.size > 0 || supabaseNfts1.size > 0
              ? 'supabase'
              : 'none',
    },
  };
}

module.exports = {
  buildHoldersLeaderboard,
  loadNftCountsFromSupabase,
};
