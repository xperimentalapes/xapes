/**
 * Sum XMA + NFT counts across multiple linked wallets (excludes stolen wallets).
 */
const { getWalletHoldings, sumXmaForWallets, formatTokenAmount } = require('./wallet-holdings');
const { isStolenWallet } = require('./flagged-wallets');

function filterLinkableWallets(wallets) {
  return [...new Set((wallets || []).map((w) => String(w || '').trim()).filter(Boolean))].filter(
    (w) => !isStolenWallet(w)
  );
}

/**
 * @param {string[]} wallets
 * @returns {Promise<{ blunana: number, blunanaFormatted: string, totalNfts: number, wallets: string[] }>}
 */
async function getAggregatedHoldingsForWallets(wallets) {
  const clean = filterLinkableWallets(wallets);
  if (!clean.length) {
    return {
      blunana: 0,
      blunanaFormatted: '0',
      totalNfts: 0,
      wallets: [],
    };
  }

  const totalXma = await sumXmaForWallets(clean);
  let totalNfts = 0;
  for (const w of clean) {
    try {
      const h = await getWalletHoldings(w);
      totalNfts += Number(h.totalNfts != null ? h.totalNfts : h.mutantApesCount) || 0;
    } catch (e) {
      console.warn('[aggregated-holdings]', w.slice(0, 8), e.message);
    }
  }

  return {
    blunana: totalXma,
    blunanaFormatted: formatTokenAmount(totalXma),
    xma: totalXma,
    xmaFormatted: formatTokenAmount(totalXma),
    totalNfts,
    wallets: clean,
  };
}

module.exports = {
  filterLinkableWallets,
  getAggregatedHoldingsForWallets,
};
