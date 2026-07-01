/**
 * NFT gallery payload for profile modal (Helius assets from getWalletHoldings).
 */
const { getWalletHoldings } = require('./wallet-holdings');

function nftImageUrl(item) {
  const content = item.content || {};
  const links = content.links || {};
  if (links.image) return String(links.image);
  const files = content.files;
  if (Array.isArray(files) && files[0] && files[0].uri) return String(files[0].uri);
  return '';
}

function parseNftNumber(name) {
  const s = String(name || '');
  const hash = s.match(/#\s*(\d+)\s*$/);
  if (hash) return hash[1];
  const tail = s.match(/(\d+)\s*$/);
  return tail ? tail[1] : '';
}

function formatNftItem(item) {
  const content = item.content || {};
  const meta = content.metadata || {};
  const name = String(meta.name || 'NFT').trim() || 'NFT';
  const number = parseNftNumber(name);
  return {
    mint: item.id || '',
    name,
    number,
    image: nftImageUrl(item),
  };
}

/**
 * @param {string} walletAddress
 * @returns {Promise<{ nfts: object[], total: number }>}
 */
async function getProfileNfts(walletAddress) {
  const holdings = await getWalletHoldings(walletAddress);
  const items = (holdings.collectionItems || []).map(formatNftItem);
  items.sort(function (a, b) {
    const na = parseInt(a.number, 10);
    const nb = parseInt(b.number, 10);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return String(a.name).localeCompare(String(b.name), undefined, { numeric: true });
  });
  return { nfts: items, total: items.length };
}

module.exports = { getProfileNfts, formatNftItem };
