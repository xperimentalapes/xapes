/**
 * Helius: Blunana balance + NFT counts per configured collections (same shape as legacy /api/verify).
 */
const axios = require('axios');
const { getHeliusApiKey, getHeliusRpcPostUrl, heliusPost } = require('./helius-rpc');

function formatTokenAmount(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

function getCollections() {
  const slug = process.env.COLLECTION_ME_SLUG || 'mutant_apes';
  return [
    {
      slug,
      name: process.env.COLLECTION_NAME || 'Xperimental Mutant Apes',
      collectionMint: process.env.MUTANT_APES_COLLECTION_MINT || '',
    },
  ];
}

/**
 * @param {string} walletAddress
 * @returns {Promise<{ blunana: number, blunanaFormatted: string, mnk3ysCount: number, zmb3ysCount: number, totalNfts: number, collectionItems?: any[] }>}
 */
async function getWalletHoldings(walletAddress) {
  const wallet = (walletAddress || '').trim();
  const out = {
    blunana: 0,
    blunanaFormatted: '0',
    mnk3ysCount: 0,
    zmb3ysCount: 0,
    totalNfts: 0,
    collectionItems: [],
  };

  const heliusUrl = getHeliusRpcPostUrl();
  const BLUNA_TOKEN_MINT =
    process.env.XMA_TOKEN_MINT ||
    process.env.BLUNA_TOKEN_MINT ||
    process.env.TOKEN_MINT ||
    'HVSruatutKcgpZJXYyeRCWAnyT7mzYq1io9YoJ6F4yMP';
  const COLLECTIONS = getCollections();

  if (!wallet || !heliusUrl) {
    return out;
  }

  try {
    out.blunana = await fetchXmaBalanceHuman(wallet);
    out.blunanaFormatted = formatTokenAmount(out.blunana);

    const collectionMints = COLLECTIONS.map((c) => c.collectionMint).filter(Boolean);
    if (collectionMints.length > 0) {
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const assetsRes = await axios.post(
          heliusUrl,
          {
            jsonrpc: '2.0',
            id: '1',
            method: 'getAssetsByOwner',
            params: {
              ownerAddress: wallet,
              page,
              limit: 1000,
              options: { showUnverifiedCollections: true },
            },
          },
          { timeout: 15000, validateStatus: () => true }
        );
        const items = assetsRes.data?.result?.items || [];
        for (const item of items) {
          const group = item.grouping?.find((g) => g.group_key === 'collection');
          const colVal = group?.group_value;
          for (let i = 0; i < COLLECTIONS.length; i++) {
            if (COLLECTIONS[i].collectionMint && colVal === COLLECTIONS[i].collectionMint) {
              if (i === 0) out.mnk3ysCount++;
              else if (i === 1) out.zmb3ysCount++;
              out.collectionItems.push(item);
              break;
            }
          }
        }
        hasMore = items.length === 1000;
        page++;
        if (page > 20) break;
      }
      out.totalNfts = out.mnk3ysCount + out.zmb3ysCount;
    }
  } catch (e) {
    console.warn('getWalletHoldings failed', e.message);
  }

  return out;
}

/**
 * XMA / BLUNA balance for one wallet (human units, 6 decimals by default).
 * @param {string} walletAddress
 * @returns {Promise<number>}
 */
async function fetchXmaBalanceHuman(walletAddress) {
  const wallet = (walletAddress || '').trim();
  const BLUNA_TOKEN_MINT =
    process.env.XMA_TOKEN_MINT ||
    process.env.BLUNA_TOKEN_MINT ||
    process.env.TOKEN_MINT ||
    'HVSruatutKcgpZJXYyeRCWAnyT7mzYq1io9YoJ6F4yMP';
  const BLUNA_DECIMALS = parseInt(process.env.BLUNA_DECIMALS || '6', 10);

  if (!wallet || !getHeliusApiKey()) return 0;

  try {
    const result = await heliusPost(
      'getTokenAccounts',
      {
        owner: wallet,
        mint: BLUNA_TOKEN_MINT,
        limit: 10,
      },
      { timeoutMs: 15000 }
    );
    const tokenAccounts = result?.token_accounts || [];
    let totalRaw = 0;
    for (const acc of tokenAccounts) {
      totalRaw += Number(acc.amount || 0);
    }
    return totalRaw / Math.pow(10, BLUNA_DECIMALS);
  } catch (e) {
    console.warn('fetchXmaBalanceHuman failed', wallet.slice(0, 8), e.message);
    return 0;
  }
}

/**
 * Sum XMA across many wallets (Helius per wallet; small delay to ease rate limits).
 * @param {string[]} wallets
 * @returns {Promise<number>}
 */
async function sumXmaForWallets(wallets) {
  const uniq = [...new Set((wallets || []).map((w) => String(w || '').trim()).filter(Boolean))];
  let sum = 0;
  for (const w of uniq) {
    sum += await fetchXmaBalanceHuman(w);
    await new Promise((r) => setTimeout(r, 40));
  }
  return sum;
}

module.exports = { getWalletHoldings, getCollections, formatTokenAmount, fetchXmaBalanceHuman, sumXmaForWallets };
