/**
 * Collection cards: Magic Eden stats + metadata with Helius/Supabase fallbacks.
 */
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { fetchMeStats, fetchMeCollectionMeta } = require('./magic-eden');
const { DEFAULT_MUTANT_APES_IMAGE, normalizeCollectionImageUrl } = require('./collection-image');

const HELIUS_RPC = 'https://mainnet.helius-rpc.com';
const RESPONSE_CACHE_MS = 2 * 60 * 1000;
let responseCache = { expires: 0, payload: null };

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

async function fetchCollectionImageFromSupabase(collectionMint) {
  const supabase = getSupabase();
  if (!supabase || !collectionMint) return null;
  try {
    const { data, error } = await supabase
      .from('nfts')
      .select('image_url')
      .eq('collection_mint', collectionMint)
      .not('image_url', 'is', null)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn('Supabase collection image failed', error.message);
      return null;
    }
    return data?.image_url || null;
  } catch (e) {
    console.warn('Supabase collection image', e.message);
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

function finalizeCollectionImage(out, col) {
  const raw =
    out.image ||
    col.imageFallback ||
    DEFAULT_MUTANT_APES_IMAGE;
  out.image = normalizeCollectionImageUrl(raw);
  if (out.animationUrl) {
    out.animationUrl = normalizeCollectionImageUrl(out.animationUrl);
  }
}

function applyStats(out, stats) {
  if (!stats) return;
  Object.assign(out, stats);
}

/**
 * @returns {Promise<{ collections: object[] }>}
 */
async function getCollectionsMarketData() {
  if (responseCache.payload && responseCache.expires > Date.now()) {
    return responseCache.payload;
  }

  const heliusKey = process.env.HELIUS_API_KEY;
  const useMeMeta = process.env.COLLECTIONS_USE_ME_METADATA === '1';
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

    const parallel = [
      fetchMeStats(col.slug, { timeoutMs: 3000 }),
      fetchHeliusCollectionMeta(col.collectionMint, heliusKey),
      fetchSupplyFromSupabase(col.collectionMint),
      fetchCollectionImageFromSupabase(col.collectionMint),
    ];
    if (useMeMeta) {
      parallel.splice(1, 0, fetchMeCollectionMeta(col.slug, { timeoutMs: 2500 }));
    }

    const settled = await Promise.allSettled(parallel);
    const statsSettled = settled[0];
    const meMetaSettled = useMeMeta ? settled[1] : null;
    const heliusIdx = useMeMeta ? 2 : 1;
    const supplySettled = settled[heliusIdx + 1];
    const supabaseImageSettled = settled[heliusIdx + 2];
    const heliusMetaSettled = settled[heliusIdx];

    if (statsSettled.status === 'fulfilled') applyStats(out, statsSettled.value);
    else console.warn('ME stats failed for', col.slug, statsSettled.reason?.message);

    if (meMetaSettled && meMetaSettled.status === 'fulfilled' && meMetaSettled.value) {
      applyMeta(out, meMetaSettled.value);
    } else if (meMetaSettled && meMetaSettled.status === 'rejected') {
      console.warn('ME metadata failed for', col.slug, meMetaSettled.reason?.message);
    }

    if (heliusMetaSettled.status === 'fulfilled') applyMeta(out, heliusMetaSettled.value);
    else if (heliusMetaSettled.status === 'rejected') {
      console.warn('Helius metadata failed for', col.slug, heliusMetaSettled.reason?.message);
    }

    if (supplySettled.status === 'fulfilled' && supplySettled.value != null) {
      out.supply = supplySettled.value;
    }

    if (supabaseImageSettled.status === 'fulfilled' && supabaseImageSettled.value && !out.image) {
      out.image = supabaseImageSettled.value;
    }

    finalizeCollectionImage(out, col);
    results.push(out);
  }

  const payload = { collections: results };
  responseCache = { expires: Date.now() + RESPONSE_CACHE_MS, payload };
  return payload;
}

module.exports = {
  getConfiguredCollections,
  getCollectionsMarketData,
};
