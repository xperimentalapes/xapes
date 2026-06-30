/**
 * Collection image URL helpers — browser-friendly CDN proxy + fallbacks.
 */

const ME_CDN = 'https://img-cdn.magiceden.dev/rs:fill:400:0:0/plain/';

/** Known Mutant Apes collection art (Helius/ME metadata). */
const DEFAULT_MUTANT_APES_IMAGE =
  'https://gateway.pinit.io/ipfs/QmdxqeLySiNrNbeSjcQfr7AoJ8b4LHGRibdz5JyPg3xqys/0';

function encodeCdnUrl(url) {
  return ME_CDN + encodeURIComponent(url);
}

/**
 * Prefer Magic Eden CDN for off-chain/IPFS URLs so images load in browsers.
 * @param {string|null|undefined} url
 * @returns {string|null}
 */
function normalizeCollectionImageUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('https://img-cdn.magiceden.dev/')) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return encodeCdnUrl(trimmed);
  return trimmed;
}

module.exports = {
  DEFAULT_MUTANT_APES_IMAGE,
  normalizeCollectionImageUrl,
};
