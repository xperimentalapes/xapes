/**
 * Collection cards: Magic Eden stats + metadata with Helius/Supabase fallbacks.
 */
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { fetchMeStats, fetchMeCollectionMeta } = require('./magic-eden');

const HELIUS_RPC = 'https://mainnet.helius-rpc.com';

function getConfiguredCollections() {
  const slug = process.env.COLLECTION_ME_SLUG || 'mutant_apes';
  return [
    {
      slug,
      name: process.env.COLLECTION_NAME || 'Xperimental Mutant Apes',
      collectionMint: process.env.MUTANT_APES_COLLECTION_MINT || '',
      imageFallback: process.env.COLLECTION_IMAGE_URL || null,
      descriptionFallback: process.env.COLLECTION_DESCRIPTION || null,
      supplyFallback:
        process.env.COLLECTION_SUPPLY != null && process.env.COLLECTION_SUPPLY !== ''
          ? parseInt(process.env.COLLECTION_SUPPLY, 10)
          : null,
    },
  ];
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function fetchHeliusCollectionMeta(collectionMint, apiKey) {
  if (!collectionMint || !apiKey) return null;
  try {
    const res = await axios.post(
      HELIUS_RPC + '/?api-key=' + apiKey,
      {
        jsonrpc: '2.0',
        id: '1',
        method: 'getAssetsByGroup',
        params: {
          groupKey: 'collection',
          groupValue: collectionMint,
          page: 1,
          limit: 1,
          options: { showCollectionMetadata: true },
        },
      },
      { timeout: 10000, validateStatus: () => true }
    );
    const items = res.data?.result?.items || [];
    const meta = items[0]?.grouping?.find((g) => g.group_key === 'collection')?.collection_metadata;
    if (!meta) return null;
    return {
      name: meta.name || null,
      description: meta.description || null,
      image: meta.image || null,
      animationUrl: null,
      supply: null,
    };
  } catch (e) {
    console.warn('Helius collection meta failed', collectionMint.slice(0, 8), e.message);
    return null;
  }
}

async function fetchSupplyFromSupabase(collectionMint) {
  const supabase = getSupabase();
  if (!supabase || !collectionMint) return null;
  try {
    const { count, error } = await supabase
      .from('nfts')
      .select('mint_address', { count: 'exact', head: true })
      .eq('collection_mint', collectionMint);
    if (error) {
      console.warn('Supabase supply count failed', error.message);
      return null;
    }
    return count != null && count > 0 ? count : null;
  } catch (e) {
    console.warn('Supabase supply count', e.message);
    return null;
  }
}

function applyMeta(out, meta) {
  if (!meta) return;
  if (meta.name) out.name = meta.name;
  if (meta.description) out.description = meta.description;
  if (meta.image) out.image = meta.image;
  if (meta.animationUrl) out.animationUrl = meta.animationUrl;
  if (meta.supply != null && Number(meta.supply) > 1) out.supply = meta.supply;
}

function applyStats(out, stats) {
  if (!stats) return;
  Object.assign(out, stats);
}

/**
 * @returns {Promise<{ collections: object[] }>}
 */
async function getCollectionsMarketData() {
  const heliusKey = process.env.HELIUS_API_KEY;
  const cols = getConfiguredCollections();
  const results = [];

  for (const col of cols) {
    const out = {
      symbol: col.slug,
      name: col.name,
      description: col.descriptionFallback || null,
      image: col.imageFallback || null,
      animationUrl: null,
      supply: col.supplyFallback != null && !isNaN(col.supplyFallback) ? col.supplyFallback : null,
      listedCount: null,
      floorPrice: null,
      floorPriceSol: null,
      volumeAll: null,
      volumeAllSol: null,
      avgPrice24hr: null,
      avgPrice24hrSol: null,
      marketplaceUrl: 'https://magiceden.io/marketplace/' + col.slug,
    };

    const [statsSettled, meMetaSettled, heliusMetaSettled, supplySettled] = await Promise.allSettled([
      fetchMeStats(col.slug, { timeoutMs: 12000 }),
      fetchMeCollectionMeta(col.slug, { timeoutMs: 8000 }),
      fetchHeliusCollectionMeta(col.collectionMint, heliusKey),
      fetchSupplyFromSupabase(col.collectionMint),
    ]);

    if (statsSettled.status === 'fulfilled') applyStats(out, statsSettled.value);
    else console.warn('ME stats failed for', col.slug, statsSettled.reason?.message);

    if (meMetaSettled.status === 'fulfilled') applyMeta(out, meMetaSettled.value);
    else console.warn('ME metadata failed for', col.slug, meMetaSettled.reason?.message);

    if (heliusMetaSettled.status === 'fulfilled') applyMeta(out, heliusMetaSettled.value);
    else if (heliusMetaSettled.status === 'rejected') {
      console.warn('Helius metadata failed for', col.slug, heliusMetaSettled.reason?.message);
    }

    if (supplySettled.status === 'fulfilled' && supplySettled.value != null) {
      out.supply = supplySettled.value;
    }

    results.push(out);
  }

  return { collections: results };
}

module.exports = {
  getConfiguredCollections,
  getCollectionsMarketData,
};
