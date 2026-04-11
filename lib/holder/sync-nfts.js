/**
 * Full collection sync from Helius DAS + Discord role reconciliation for all linked users.
 */
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { inferTraitFlagsFromMetadata } = require('./trait-flags');
const { expectedDiscordRoleIds, ownedNftsFromDbRows } = require('./role-evaluator');
const { getGuildMember, syncMemberRolesToExpected } = require('./discord-guild');
const { getCollections, sumXmaForWallets } = require('./wallet-holdings');

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function heliusRpc(method, params) {
  const key = process.env.HELIUS_API_KEY;
  if (!key) throw new Error('HELIUS_API_KEY not set');
  const res = await axios.post(
    `https://mainnet.helius-rpc.com/?api-key=${key}`,
    { jsonrpc: '2.0', id: 'sync', method, params },
    { timeout: 60000, validateStatus: () => true }
  );
  if (res.data?.error) throw new Error(res.data.error.message || 'Helius error');
  return res.data?.result;
}

/**
 * Fetch all NFTs in collection via getAssetsByGroup.
 */
async function fetchCollectionAssets(collectionMint) {
  const all = [];
  let page = 1;
  const limit = 1000;
  while (true) {
    const result = await heliusRpc('getAssetsByGroup', {
      groupKey: 'collection',
      groupValue: collectionMint,
      page,
      limit,
      options: {
        showUnverifiedCollections: true,
      },
    });
    const items = result?.items || [];
    all.push(...items);
    if (typeof console !== 'undefined' && console.log) {
      console.log('[sync-nfts] getAssetsByGroup page %s +%s (running total %s)', page, items.length, all.length);
    }
    if (items.length < limit) break;
    page++;
    if (page > 500) break;
  }
  return all;
}

function assetToNftRow(asset, collectionMint, collectionName) {
  const mint = asset.id;
  const owner = asset.ownership?.owner || null;
  const meta = asset.content?.metadata || {};
  const name = meta.name || asset.content?.metadata?.name || mint;
  const image =
    asset.content?.links?.image ||
    (typeof meta.image === 'string' ? meta.image : null) ||
    null;
  const flags = inferTraitFlagsFromMetadata(meta);
  return {
    mint_address: mint,
    collection_mint: collectionMint,
    collection_name: collectionName || null,
    name,
    image_url: image,
    metadata_json: meta,
    is_crown: flags.is_crown,
    is_cowboy: flags.is_cowboy,
    is_burn_squad: flags.is_burn_squad,
    owner_wallet: owner,
    discord_user_id: null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Sync `nfts` table; set discord_user_id from discord_wallet_links per current owner.
 * Deletes rows for mints no longer returned (burned / left collection group).
 */
async function syncNftsTable(supabase, collectionMint, collectionName) {
  if (!collectionMint) {
    console.warn('syncNftsTable: no collection mint');
    return { upserted: 0, deleted: 0 };
  }

  const assets = await fetchCollectionAssets(collectionMint);
  const alive = assets.filter((a) => a.id && !a.burnt);
  const chainMints = new Set(alive.map((a) => a.id));

  const rows = alive.map((a) => assetToNftRow(a, collectionMint, collectionName));

  const owners = [...new Set(rows.map((r) => r.owner_wallet).filter(Boolean))];
  let walletToDiscord = new Map();
  if (owners.length) {
    const { data: links, error: linkErr } = await supabase
      .from('discord_wallet_links')
      .select('wallet_address, discord_user_id')
      .in('wallet_address', owners);
    if (linkErr) console.warn('discord_wallet_links fetch', linkErr.message);
    for (const l of links || []) {
      walletToDiscord.set(l.wallet_address, l.discord_user_id);
    }
  }

  for (const r of rows) {
    r.discord_user_id = r.owner_wallet ? walletToDiscord.get(r.owner_wallet) || null : null;
  }

  const batchSize = 200;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { error } = await supabase.from('nfts').upsert(chunk, { onConflict: 'mint_address' });
    if (error) throw error;
    upserted += chunk.length;
  }

  const { data: existing, error: exErr } = await supabase.from('nfts').select('mint_address').eq('collection_mint', collectionMint);
  if (exErr) throw exErr;

  let deleted = 0;
  const toDelete = (existing || []).map((r) => r.mint_address).filter((m) => !chainMints.has(m));
  for (let i = 0; i < toDelete.length; i += batchSize) {
    const chunk = toDelete.slice(i, i + batchSize);
    const { error } = await supabase.from('nfts').delete().in('mint_address', chunk);
    if (error) throw error;
    deleted += chunk.length;
  }

  return { upserted, deleted, chainCount: chainMints.size };
}

async function loadActiveRoles(supabase) {
  const { data, error } = await supabase
    .from('discord_roles')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

/**
 * Reconcile Discord roles for one Discord user using DB nft ownership only.
 */
async function reconcileDiscordUser(supabase, discordUserId, collectionMint, botToken, guildId, activeRoles, managedIds) {
  const { data: links, error: le } = await supabase
    .from('discord_wallet_links')
    .select('wallet_address')
    .eq('discord_user_id', discordUserId);
  if (le || !links?.length) return { skipped: true };

  const wallets = links.map((l) => l.wallet_address);
  const { data: nftsRows, error: ne } = await supabase
    .from('nfts')
    .select('mint_address, metadata_json, is_crown, is_cowboy, is_burn_squad, owner_wallet')
    .eq('collection_mint', collectionMint)
    .in('owner_wallet', wallets);
  if (ne) throw ne;

  const owned = ownedNftsFromDbRows(nftsRows || []);
  const totalXma = await sumXmaForWallets(wallets);
  const expected = expectedDiscordRoleIds(activeRoles, owned, collectionMint, totalXma);

  const member = await getGuildMember(guildId, discordUserId, botToken);
  if (!member || !member.inGuild) {
    return { notInGuild: true, discordUserId };
  }

  const result = await syncMemberRolesToExpected(
    guildId,
    discordUserId,
    botToken,
    member.roleIds,
    expected,
    managedIds
  );
  return { discordUserId, ...result };
}

/**
 * All distinct Discord users that appear in discord_wallet_links or nfts.discord_user_id.
 */
async function allDiscordUserIdsToReconcile(supabase) {
  const set = new Set();
  const { data: links } = await supabase.from('discord_wallet_links').select('discord_user_id');
  for (const l of links || []) {
    if (l.discord_user_id) set.add(l.discord_user_id);
  }
  const { data: nfts } = await supabase.from('nfts').select('discord_user_id');
  for (const n of nfts || []) {
    if (n.discord_user_id) set.add(n.discord_user_id);
  }
  return [...set];
}

async function reconcileAllDiscordRoles() {
  const supabase = getSupabase();
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  const cols = getCollections();
  const collectionMint = cols[0]?.collectionMint || '';
  const collectionName = cols[0]?.name || '';

  if (!supabase) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY missing');
    return;
  }
  if (!collectionMint) {
    console.error('MUTANT_APES_COLLECTION_MINT missing');
    return;
  }

  const activeRoles = await loadActiveRoles(supabase);
  const managedIds = activeRoles.map((r) => String(r.discord_role_id)).filter(Boolean);

  if (!botToken || !guildId) {
    console.warn('DISCORD_BOT_TOKEN or DISCORD_GUILD_ID missing — skipping role reconciliation');
    return { rolesSkipped: true };
  }

  const userIds = await allDiscordUserIdsToReconcile(supabase);
  const results = [];
  for (const uid of userIds) {
    try {
      const r = await reconcileDiscordUser(supabase, uid, collectionMint, botToken, guildId, activeRoles, managedIds);
      results.push(r);
    } catch (e) {
      console.warn('reconcileDiscordUser', uid, e.message);
      results.push({ discordUserId: uid, error: e.message });
    }
    await new Promise((res) => setTimeout(res, 250));
  }
  return { reconciled: results.length, results, activeRoles: activeRoles.length };
}

async function runFullSync() {
  const supabase = getSupabase();
  const cols = getCollections();
  const collectionMint = cols[0]?.collectionMint || '';
  const collectionName = cols[0]?.name || '';

  if (!supabase) throw new Error('Supabase not configured');
  if (!collectionMint) throw new Error('Collection mint not configured');

  const nftStats = await syncNftsTable(supabase, collectionMint, collectionName);
  const roleStats = await reconcileAllDiscordRoles();
  return { nftStats, roleStats };
}

/**
 * Upsert all collection NFTs into `nfts` only (no Discord reconciliation).
 * Uses MUTANT_APES_COLLECTION_MINT, COLLECTION_NAME, HELIUS_API_KEY, Supabase service key.
 */
async function runPopulateNftsOnly() {
  const supabase = getSupabase();
  const cols = getCollections();
  const collectionMint = cols[0]?.collectionMint || '';
  const collectionName = cols[0]?.name || '';

  if (!process.env.HELIUS_API_KEY) {
    throw new Error('HELIUS_API_KEY is not set');
  }
  if (!supabase) {
    throw new Error('Supabase not configured (SUPABASE_URL + SUPABASE_SERVICE_KEY)');
  }
  if (!collectionMint) {
    throw new Error('MUTANT_APES_COLLECTION_MINT is not set');
  }

  console.log('[populate-nfts] collection mint:', collectionMint);
  const nftStats = await syncNftsTable(supabase, collectionMint, collectionName);
  if (nftStats.chainCount === 0) {
    console.warn(
      '[populate-nfts] Helius returned 0 assets. Check MUTANT_APES_COLLECTION_MINT matches the Metaplex collection mint used in NFT metadata.'
    );
  } else {
    console.log('[populate-nfts] done:', nftStats);
  }
  return nftStats;
}

module.exports = {
  runFullSync,
  runPopulateNftsOnly,
  syncNftsTable,
  reconcileAllDiscordRoles,
  fetchCollectionAssets,
  getSupabase,
};
