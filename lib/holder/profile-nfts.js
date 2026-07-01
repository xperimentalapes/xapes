/**
 * NFT gallery payload for profile modal (Helius assets + Supabase + metadata enrichment).
 */
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { getWalletHoldings, getCollections } = require('./wallet-holdings');
const { heliusPost, isHeliusConfigured } = require('./helius-rpc');

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function resolveIpfsUri(uri) {
  if (!uri || typeof uri !== 'string') return null;
  if (uri.startsWith('http://') || uri.startsWith('https://')) return uri;
  if (uri.startsWith('ipfs://')) return 'https://ipfs.io/ipfs/' + uri.slice(7);
  return uri;
}

function nftImageUrl(item, dbRow) {
  const content = item.content || {};
  const links = content.links || {};
  if (links.image) return String(links.image);
  const files = content.files;
  if (Array.isArray(files) && files[0]) {
    const f = files[0];
    if (f.cdn_uri) return String(f.cdn_uri);
    if (f.uri) return String(f.uri);
  }
  if (dbRow && dbRow.image_url) return String(dbRow.image_url);
  return '';
}

function parseNftNumber(name) {
  const s = String(name || '');
  const hash = s.match(/#\s*(\d+)\s*$/);
  if (hash) return hash[1];
  const tail = s.match(/(\d+)\s*$/);
  return tail ? tail[1] : '';
}

function nameFromMeta(meta) {
  if (!meta || typeof meta !== 'object') return '';
  const raw = meta.name || meta.title;
  if (!raw) return '';
  const s = String(raw).trim();
  if (!s || s.toLowerCase() === 'nft') return '';
  return s;
}

function stripNumberSuffix(name, number) {
  let display = String(name || '').trim();
  if (!display) return display;
  if (number && /#\s*\d+\s*$/.test(display)) {
    display = display.replace(/#\s*\d+\s*$/, '').trim();
  }
  return display;
}

function numberFromItem(item, name) {
  const fromName = parseNftNumber(name);
  if (fromName) return fromName;
  const comp = item && item.compression;
  if (comp && comp.leaf_id != null) return String(comp.leaf_id);
  if (comp && comp.seq != null) return String(comp.seq);
  return '';
}

async function fetchJsonUriName(item) {
  const jsonUri = item && item.content && item.content.json_uri;
  if (!jsonUri) return '';
  try {
    const url = resolveIpfsUri(jsonUri);
    if (!url) return '';
    const res = await axios.get(url, { timeout: 10000, validateStatus: () => true });
    if (res.status >= 400 || !res.data) return '';
    return nameFromMeta(res.data);
  } catch (_) {
    return '';
  }
}

/**
 * @param {string[]} mints
 * @returns {Promise<Map<string, object>>}
 */
async function enrichAssetsBatch(mints) {
  const map = new Map();
  if (!mints.length || !isHeliusConfigured()) return map;
  const unique = [...new Set(mints.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    try {
      const result = await heliusPost('getAssetBatch', { ids: chunk }, { timeoutMs: 30000 });
      const list = Array.isArray(result) ? result : [];
      for (const asset of list) {
        if (asset && asset.id) map.set(asset.id, asset);
      }
    } catch (e) {
      console.warn('[profile-nfts] getAssetBatch', e.message);
    }
  }
  return map;
}

/**
 * @param {object} item — Helius DAS asset
 * @param {object} [dbRow]
 * @param {object} [enrichedAsset]
 * @param {string} [collectionLabel]
 * @returns {Promise<{ mint: string, name: string, number: string, image: string }>}
 */
async function formatNftItem(item, dbRow, enrichedAsset, collectionLabel) {
  const mint = item.id || '';
  let name =
    nameFromMeta(dbRow && dbRow.metadata_json) ||
    (dbRow && dbRow.name && String(dbRow.name).trim().toLowerCase() !== 'nft'
      ? String(dbRow.name).trim()
      : '') ||
    nameFromMeta(item.content && item.content.metadata);

  if (!name && enrichedAsset) {
    name = nameFromMeta(enrichedAsset.content && enrichedAsset.content.metadata);
  }
  if (!name) {
    name = await fetchJsonUriName(item);
  }
  if (!name && enrichedAsset) {
    name = await fetchJsonUriName(enrichedAsset);
  }

  const number = numberFromItem(item, name);
  let displayName = stripNumberSuffix(name, number);
  if (!displayName) {
    displayName = collectionLabel || 'Xperimental Mutant Ape';
  }

  return {
    mint,
    name: displayName,
    number,
    image: nftImageUrl(item, dbRow) || (enrichedAsset ? nftImageUrl(enrichedAsset) : ''),
  };
}

/**
 * @param {string} walletAddress
 * @returns {Promise<{ nfts: object[], total: number }>}
 */
async function getProfileNfts(walletAddress) {
  const holdings = await getWalletHoldings(walletAddress);
  const items = holdings.collectionItems || [];
  const collectionLabel = getCollections()[0]?.name || 'Xperimental Mutant Ape';

  const mints = items.map((i) => i.id).filter(Boolean);
  const dbByMint = new Map();
  const supabase = getSupabase();
  if (supabase && mints.length) {
    const { data, error } = await supabase
      .from('nfts')
      .select('mint_address, name, image_url, metadata_json')
      .in('mint_address', mints);
    if (error) {
      console.warn('[profile-nfts] nfts lookup', error.message);
    } else {
      for (const row of data || []) {
        if (row.mint_address) dbByMint.set(row.mint_address, row);
      }
    }
  }

  const needsEnrich = [];
  for (const item of items) {
    const db = dbByMint.get(item.id);
    const dbName =
      nameFromMeta(db && db.metadata_json) ||
      (db && db.name && String(db.name).trim().toLowerCase() !== 'nft' ? String(db.name).trim() : '');
    const inlineName = nameFromMeta(item.content && item.content.metadata);
    if (!dbName && !inlineName) needsEnrich.push(item.id);
  }

  const enrichedMap = await enrichAssetsBatch(needsEnrich);

  const nfts = [];
  for (const item of items) {
    const enriched = enrichedMap.get(item.id);
    nfts.push(
      await formatNftItem(item, dbByMint.get(item.id), enriched, collectionLabel)
    );
  }

  nfts.sort(function (a, b) {
    const na = parseInt(a.number, 10);
    const nb = parseInt(b.number, 10);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return String(a.name).localeCompare(String(b.name), undefined, { numeric: true });
  });

  return { nfts, total: nfts.length };
}

module.exports = { getProfileNfts, formatNftItem };
