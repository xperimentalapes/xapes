/**
 * Holders leaderboard: XMA token balances (Helius) + Mutant Apes NFT counts (Supabase or Helius).
 */
const { createClient } = require('@supabase/supabase-js');
const { getCollections, formatTokenAmount } = require('./wallet-holdings');
const { getHeliusApiKey, getHeliusRpcPostUrl, isHeliusConfigured } = require('./helius-rpc');
const { loadAllTokenBalances, enrichTokenBalancesForWallets } = require('./token-balances');
const { getXmaTokenMint, getXmaDecimals } = require('./constants');
const { getCollectionFloorPriceSol } = require('../marketplace/floor-price');
const { isStolenWallet, getFlaggedWalletMeta } = require('./flagged-wallets');

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function loadDiscordLinkGroups() {
  const supabase = getSupabase();
  const byUser = new Map();
  const walletToUser = new Map();
  if (!supabase) return { byUser, walletToUser };

  const pageSize = 1000;
  let from = 0;
  try {
    while (true) {
      const { data, error } = await supabase
        .from('discord_wallet_links')
        .select('discord_user_id, wallet_address, discord_display_name')
        .order('wallet_address')
        .range(from, from + pageSize - 1);
      if (error) {
        console.warn('Holders: discord_wallet_links group fetch', error.message);
        break;
      }
      const rows = data || [];
      for (const row of rows) {
        const wallet = row.wallet_address;
        const uid = row.discord_user_id;
        if (!wallet || !uid || isStolenWallet(wallet)) continue;
        walletToUser.set(wallet, uid);
        if (!byUser.has(uid)) {
          byUser.set(uid, {
            discordUserId: uid,
            displayName: row.discord_display_name ? String(row.discord_display_name).trim() : null,
            wallets: [],
          });
        }
        const group = byUser.get(uid);
        if (!group.wallets.includes(wallet)) group.wallets.push(wallet);
        if (!group.displayName && row.discord_display_name) {
          group.displayName = String(row.discord_display_name).trim();
        }
      }
      if (rows.length < pageSize) break;
      from += pageSize;
    }
  } catch (e) {
    console.warn('Holders: discord link groups', e.message);
  }
  return { byUser, walletToUser };
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

async function loadNftCountsFromHelius(collectionMint, collectionSlug) {
  const axios = require('axios');
  const byWallet = new Map();
  const rpcUrl = getHeliusRpcPostUrl();
  if (!rpcUrl || !collectionMint) return byWallet;

  let page = 1;
  let hasMore = true;
  while (hasMore) {
    try {
      const dasRes = await axios.post(
        rpcUrl,
        {
          jsonrpc: '2.0',
          id: '1',
          method: 'getAssetsByGroup',
          params: {
            groupKey: 'collection',
            groupValue: collectionMint,
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
        byWallet.set(owner, (byWallet.get(owner) || 0) + 1);
      }
      hasMore = items.length === 1000;
      page++;
      if (page > 50) break;
    } catch (e) {
      console.warn('Holders NFT fetch failed for', collectionSlug || collectionMint, e.message);
      hasMore = false;
    }
  }

  return byWallet;
}

function mergeNftCountMaps(primary, secondary) {
  const merged = new Map(primary);
  for (const [wallet, count] of secondary.entries()) {
    merged.set(wallet, Math.max(merged.get(wallet) || 0, count));
  }
  return merged;
}

function shouldUseHeliusNftScan(supabaseMap) {
  const mode = (process.env.HOLDERS_NFT_SOURCE || 'auto').toLowerCase();
  if (mode === 'helius') return true;
  if (mode === 'supabase') return false;
  return !supabaseMap || supabaseMap.size === 0;
}

/**
 * @param {{ sort?: string }} [opts]
 */
async function buildHoldersLeaderboard(opts) {
  const sortBy = (opts?.sort || 'total').toLowerCase();
  const validSort = ['total', 'token', 'nfts'].includes(sortBy) ? sortBy : 'total';

  const collections = getCollections();
  const primaryCollection = collections[0];
  const heliusKey = getHeliusApiKey();
  const heliusConfigured = isHeliusConfigured();
  const tokenMint = getXmaTokenMint();
  const decimals = getXmaDecimals();

  const [discordGroups, supabaseNfts, floorPriceSol] = await Promise.all([
    loadDiscordLinkGroups(),
    primaryCollection?.collectionMint
      ? loadNftCountsFromSupabase(primaryCollection.collectionMint)
      : Promise.resolve(new Map()),
    getCollectionFloorPriceSol(primaryCollection?.slug),
  ]);
  const byUser = discordGroups.byUser;
  const walletToUser = discordGroups.walletToUser;

  let nftByWallet = new Map();
  if (shouldUseHeliusNftScan(supabaseNfts) && heliusConfigured && primaryCollection?.collectionMint) {
    nftByWallet = await loadNftCountsFromHelius(
      primaryCollection.collectionMint,
      primaryCollection.slug || primaryCollection.name
    );
  }
  nftByWallet = mergeNftCountMaps(nftByWallet, supabaseNfts);

  const { map: tokenBalances, source: tokenSource } = await loadAllTokenBalances(tokenMint, decimals);

  const walletSeeds = new Set([
    ...supabaseNfts.keys(),
    ...nftByWallet.keys(),
    ...walletToUser.keys(),
  ]);
  if (tokenBalances.size === 0 && heliusConfigured) {
    await enrichTokenBalancesForWallets(tokenBalances, [...walletSeeds]);
  }

  const holderMap = new Map();

  function getOrCreate(wallet) {
    if (!holderMap.has(wallet)) {
      holderMap.set(wallet, {
        wallet,
        tokenBalance: 0,
        tokenBalanceFormatted: '0',
        mutantApesCount: 0,
      });
    }
    return holderMap.get(wallet);
  }

  for (const [wallet, balance] of tokenBalances.entries()) {
    const h = getOrCreate(wallet);
    h.tokenBalance = balance;
    h.tokenBalanceFormatted = formatTokenAmount(balance);
  }

  for (const [wallet, count] of nftByWallet.entries()) {
    const h = getOrCreate(wallet);
    h.mutantApesCount = count || 0;
  }

  const consumedWallets = new Set();
  const aggregatedList = [];

  for (const group of byUser.values()) {
    const wallets = (group.wallets || []).filter((w) => !isStolenWallet(w));
    if (!wallets.length) continue;
    wallets.forEach((w) => consumedWallets.add(w));

    let tokenBalance = 0;
    let mutantApesCount = 0;
    let primaryWallet = wallets[0];
    let bestScore = -1;
    for (const w of wallets) {
      const h = holderMap.get(w) || { tokenBalance: 0, mutantApesCount: 0 };
      tokenBalance += h.tokenBalance || 0;
      mutantApesCount += h.mutantApesCount || 0;
      const score = (h.tokenBalance || 0) / 1e6 + (h.mutantApesCount || 0) * 10;
      if (score > bestScore) {
        bestScore = score;
        primaryWallet = w;
      }
    }

    aggregatedList.push({
      wallet: primaryWallet,
      linkedWallets: wallets,
      walletCount: wallets.length,
      aggregated: wallets.length > 1,
      discordDisplayName: group.displayName || null,
      tokenBalance,
      tokenBalanceFormatted: formatTokenAmount(tokenBalance),
      mutantApesCount,
      totalNfts: mutantApesCount,
      totalScore: tokenBalance / 1e6 + mutantApesCount * 10,
    });
  }

  for (const [wallet, h] of holderMap.entries()) {
    if (consumedWallets.has(wallet)) continue;
    const flagged = getFlaggedWalletMeta(wallet);
    const discordDisplayName = flagged ? null : null;
    aggregatedList.push({
      wallet: h.wallet,
      linkedWallets: [h.wallet],
      walletCount: 1,
      aggregated: false,
      discordDisplayName,
      flaggedKind: flagged ? flagged.kind : null,
      flaggedLabel: flagged ? flagged.label : null,
      tokenBalance: h.tokenBalance,
      tokenBalanceFormatted: h.tokenBalanceFormatted,
      mutantApesCount: h.mutantApesCount,
      totalNfts: h.mutantApesCount || 0,
      totalScore: (h.tokenBalance || 0) / 1e6 + (h.mutantApesCount || 0) * 10,
    });
  }

  let list = aggregatedList;

  if (validSort === 'token') list.sort((a, b) => b.tokenBalance - a.tokenBalance);
  else if (validSort === 'nfts') list.sort((a, b) => b.totalNfts - a.totalNfts);
  else list.sort((a, b) => b.totalScore - a.totalScore);

  const enrichUsed = walletSeeds.size > 0 && tokenSource === 'none' && tokenBalances.size > 0;

  return {
    holders: list,
    sort: validSort,
    floorPriceSol: floorPriceSol != null ? floorPriceSol : null,
    sources: {
      tokenMint,
      tokenBalances:
        tokenBalances.size > 0
          ? enrichUsed
            ? 'helius-per-wallet'
            : tokenSource
          : heliusConfigured
            ? 'helius-empty'
            : 'none',
      helConfigured: heliusConfigured,
      helKeyPresent: !!heliusKey,
      nftCounts:
        nftByWallet.size > 0 && supabaseNfts.size > 0
          ? 'helius+supabase'
          : supabaseNfts.size > 0
            ? 'supabase'
            : nftByWallet.size > 0
              ? 'helius'
              : 'none',
    },
  };
}

module.exports = {
  buildHoldersLeaderboard,
  loadNftCountsFromSupabase,
};
