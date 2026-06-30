const { BRONZE_TREASURY_WALLET } = require('./constants');
const { getConnection } = require('./rpc');

const TOKEN_PRIZE_TIERS = {
  XMA: [350000, 1050000, 1750000],
  FRENS: [1000000, 3000000, 5000000],
};
const TOKEN_SIZE_WEIGHTS = [0.5, 0.3, 0.2];

function heliusRpcUrl() {
  const u = process.env.HELIUS_RPC_URL;
  if (u && String(u).trim()) return String(u).trim();
  const k = process.env.HELIUS_API_KEY;
  if (!k) return null;
  return 'https://mainnet.helius-rpc.com/?api-key=' + encodeURIComponent(k);
}

async function heliusPost(method, params) {
  const url = heliusRpcUrl();
  if (!url) throw new Error('HELIUS_API_KEY not configured');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: '1', method, params }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Helius error');
  return data.result;
}

async function fetchTreasuryInventory() {
  const treasuryNfts = [];
  const treasuryTokens = [];
  let page = 1;
  const limit = 100;
  let total = Infinity;

  while ((page - 1) * limit < total) {
    const result = await heliusPost('getAssetsByOwner', {
      ownerAddress: BRONZE_TREASURY_WALLET,
      page,
      limit,
    });
    total = result.total || 0;
    for (const item of result.items || []) {
      const id = item.id;
      const iface = (item.interface || '').toLowerCase();
      const tokenStandard = (item.token_standard || '').toLowerCase();
      const content = item.content || {};
      const files = (content.files || [])[0];
      const metadata = content.metadata || {};
      const image = (files && (files.cdn_uri || files.uri)) || null;
      const name = metadata.name || null;
      const tokenInfo = item.token_info || {};
      const balance = tokenInfo.balance !== undefined ? Number(tokenInfo.balance) : 0;
      const decimals = Math.max(0, Number(tokenInfo.decimals) || 0);
      const isNft =
        iface === 'v1_nft' ||
        tokenStandard === 'nonfungible' ||
        tokenStandard === 'programmablenonfungible' ||
        (item.compression && item.compression.compressed) ||
        (decimals === 0 && (balance === 1 || balance === 0) && (image || metadata.name));
      if (isNft) {
        treasuryNfts.push({ id, name: name || 'NFT', image });
      } else if (balance > 0) {
        const symbol = (tokenInfo.symbol || metadata.symbol || 'TOKEN').replace(/^\$/, '');
        treasuryTokens.push({
          id,
          symbol,
          balanceHuman: decimals ? balance / Math.pow(10, decimals) : balance,
          decimals,
          image,
        });
      }
    }
    page += 1;
    if (!result.items || result.items.length === 0) break;
  }

  const tokenAccounts = await heliusPost('getTokenAccounts', { owner: BRONZE_TREASURY_WALLET });
  const accounts = tokenAccounts?.token_accounts || [];
  const amountByMint = {};
  for (const acc of accounts) {
    const amount = Number(acc.amount) || 0;
    if (amount <= 0) continue;
    amountByMint[acc.mint] = (amountByMint[acc.mint] || 0) + amount;
  }

  for (const mint of Object.keys(amountByMint)) {
    if (treasuryTokens.some((t) => t.id === mint)) continue;
    try {
      const asset = await heliusPost('getAsset', { id: mint });
      const tokenInfo = asset?.token_info || {};
      const metadata = asset?.content?.metadata || {};
      const decimals = Math.max(0, Number(tokenInfo.decimals) || 0);
      const balance = amountByMint[mint];
      const symbol = (tokenInfo.symbol || metadata.symbol || 'TOKEN').replace(/^\$/, '');
      treasuryTokens.push({
        id: mint,
        symbol,
        balanceHuman: decimals ? balance / Math.pow(10, decimals) : balance,
        decimals,
        image: asset?.content?.files?.[0]?.cdn_uri || null,
      });
    } catch (_) {}
  }

  const availableTokenPrizes = [];
  for (const tok of treasuryTokens) {
    const tiers = TOKEN_PRIZE_TIERS[tok.symbol];
    if (!tiers) continue;
    tiers.forEach((tierAmount, idx) => {
      if (tok.balanceHuman >= tierAmount) {
        availableTokenPrizes.push({
          tokenId: tok.id,
          symbol: tok.symbol,
          tierAmount,
          tierStr: `${tierAmount.toLocaleString()} ${tok.symbol}`,
          image: tok.image,
          decimals: tok.decimals,
          size: ['small', 'medium', 'large'][idx],
          weight: TOKEN_SIZE_WEIGHTS[idx] || 0.2,
        });
      }
    });
  }

  return { treasuryNfts, treasuryTokens, availableTokenPrizes };
}

function rollChestOutcome(inventory) {
  const { treasuryNfts, availableTokenPrizes } = inventory;
  const r = Math.random();
  if (r < 0.35) return { type: 'loss' };
  if (r < 0.45 && treasuryNfts.length > 0) {
    const nft = treasuryNfts[Math.floor(Math.random() * treasuryNfts.length)];
    return { type: 'win', kind: 'nft', collection: nft.name, mint: nft.id, nftImage: nft.image };
  }
  if (availableTokenPrizes.length > 0) {
    const prize = availableTokenPrizes[Math.floor(Math.random() * availableTokenPrizes.length)];
    return {
      type: 'win',
      kind: 'token',
      prize: prize.tierStr,
      tokenMint: prize.tokenId,
      tokenImage: prize.image,
      amount: prize.tierAmount,
      decimals: prize.decimals != null ? prize.decimals : 6,
    };
  }
  if (treasuryNfts.length > 0) {
    const nft = treasuryNfts[Math.floor(Math.random() * treasuryNfts.length)];
    return { type: 'win', kind: 'nft', collection: nft.name, mint: nft.id, nftImage: nft.image };
  }
  return { type: 'loss' };
}

module.exports = { fetchTreasuryInventory, rollChestOutcome, TOKEN_PRIZE_TIERS };
