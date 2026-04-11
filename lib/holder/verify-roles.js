// POST /api/holder/verify — holdings + link + nfts stamp + Discord roles (if in guild)
const { PublicKey } = require('@solana/web3.js');
const { createClient } = require('@supabase/supabase-js');
const { getWalletHoldings, getCollections, sumXmaForWallets } = require('./wallet-holdings');
const { mergeLiveItemsWithDb, expectedDiscordRoleIds, ownedNftsFromDbRows } = require('./role-evaluator');
const { getGuildMember, syncMemberRolesToExpected } = require('./discord-guild');

function corsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && ['https://xapes.vercel.app', 'http://localhost:8000', 'http://localhost:3000'].includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function stripForClient(holdings) {
  const { collectionItems, ...rest } = holdings;
  return rest;
}

/** @param {object[]} roleRows - discord_roles rows */
function namedRoleDeltas(roleRows, addedIds, removedIds) {
  const map = new Map(
    (roleRows || []).map((r) => [
      String(r.discord_role_id),
      String(r.display_name || r.slug || 'Role').trim() || 'Role',
    ])
  );
  const name = (id) => map.get(String(id)) || 'Discord role';
  return {
    rolesAddedNamed: (addedIds || []).map((id) => ({ id: String(id), name: name(id) })),
    rolesRemovedNamed: (removedIds || []).map((id) => ({ id: String(id), name: name(id) })),
  };
}

module.exports = async function holderVerifyRoles(req, res) {
  corsHeaders(req, res);
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const discord = req.session && req.session.discord;
  if (!discord || !discord.id) {
    return res.status(401).json({ error: 'Discord login required' });
  }

  const walletAddress = (req.body && String(req.body.walletAddress || '').trim()) || '';
  if (!walletAddress) {
    return res.status(400).json({ error: 'walletAddress required' });
  }
  try {
    new PublicKey(walletAddress);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid wallet address' });
  }

  const holdings = await getWalletHoldings(walletAddress);
  const discordUserId = String(discord.id);
  const cols = getCollections();
  const collectionMint = cols[0]?.collectionMint || '';

  const supabase = getSupabase();
  const baseOut = { ...stripForClient(holdings), rolesSynced: false, notInGuild: false, message: null };

  if (!supabase) {
    baseOut.message = 'Database not configured — holdings only.';
    return res.json(baseOut);
  }

  const { error: upErr } = await supabase.from('discord_wallet_links').upsert(
    {
      discord_user_id: discordUserId,
      wallet_address: walletAddress,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'wallet_address' }
  );
  if (upErr) {
    console.error('holder verify upsert link', upErr);
    baseOut.message = 'Could not save wallet link.';
    return res.status(500).json(baseOut);
  }

  const { error: nftErr } = await supabase
    .from('nfts')
    .update({ discord_user_id: discordUserId, updated_at: new Date().toISOString() })
    .eq('owner_wallet', walletAddress);
  if (nftErr) {
    console.warn('holder verify nfts update', nftErr.message);
  }

  const { data: linkRows } = await supabase.from('discord_wallet_links').select('wallet_address').eq('discord_user_id', discordUserId);
  let linkedWallets = (linkRows || []).map((r) => r.wallet_address).filter(Boolean);
  if (!linkedWallets.length) linkedWallets = [walletAddress];

  const { data: dbNftRows } = await supabase
    .from('nfts')
    .select('*')
    .eq('collection_mint', collectionMint)
    .in('owner_wallet', linkedWallets);

  const byMint = new Map();
  for (const row of dbNftRows || []) {
    byMint.set(row.mint_address, ownedNftsFromDbRows([row])[0]);
  }
  const liveItems = holdings.collectionItems || [];
  for (const item of liveItems) {
    const dbR = (dbNftRows || []).find((r) => r.mint_address === item.id);
    const merged = mergeLiveItemsWithDb([item], dbR ? [dbR] : []);
    if (merged[0]) byMint.set(item.id, merged[0]);
  }
  const owned = [...byMint.values()];

  const totalXma = await sumXmaForWallets(linkedWallets);

  const { data: activeRoles, error: roleErr } = await supabase
    .from('discord_roles')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true });

  if (roleErr) {
    console.warn('discord_roles load', roleErr.message);
    baseOut.message = 'Could not load role rules.';
    return res.json(baseOut);
  }

  const roles = activeRoles || [];
  const managedIds = roles.map((r) => String(r.discord_role_id)).filter(Boolean);
  const expected = expectedDiscordRoleIds(roles, owned, collectionMint, totalXma);

  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!botToken || !guildId || !managedIds.length) {
    baseOut.rolesSynced = false;
    baseOut.message =
      !botToken || !guildId
        ? 'Discord bot or guild not configured — roles skipped.'
        : 'No active role rules in database — add rows in discord_roles.';
    return res.json(baseOut);
  }

  const member = await getGuildMember(guildId, discordUserId, botToken);
  if (!member) {
    baseOut.message = 'Could not reach Discord API.';
    return res.json(baseOut);
  }

  if (!member.inGuild) {
    baseOut.notInGuild = true;
    baseOut.message = 'Join the Discord server, then verify again (or wait for the next sync).';
    return res.json(baseOut);
  }

  const syncResult = await syncMemberRolesToExpected(
    guildId,
    discordUserId,
    botToken,
    member.roleIds,
    expected,
    managedIds
  );

  baseOut.rolesSynced = true;
  baseOut.rolesAdded = syncResult.added;
  baseOut.rolesRemoved = syncResult.removed;
  Object.assign(baseOut, namedRoleDeltas(roles, syncResult.added, syncResult.removed));
  return res.json(baseOut);
};
