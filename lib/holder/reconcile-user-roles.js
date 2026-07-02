/**
 * Reconcile Discord guild roles for one user from all remaining linked wallets.
 */
const { createClient } = require('@supabase/supabase-js');
const { getCollections, sumXmaForWallets } = require('./wallet-holdings');
const { expectedDiscordRoleIds, ownedNftsFromDbRows } = require('./role-evaluator');
const { getGuildMember, syncMemberRolesToExpected } = require('./discord-guild');
const { filterLinkableWallets } = require('./aggregated-holdings');

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function namedRoleDeltas(roleRows, addedIds, removedIds) {
  const map = new Map(
    (roleRows || []).map((r) => [
      String(r.discord_role_id),
      String(r.display_name || r.slug || 'Role').trim() || 'Role',
    ])
  );
  const name = (id) => map.get(String(id)) || 'Discord role';
  return {
    rolesAdded: addedIds || [],
    rolesRemoved: removedIds || [],
    rolesAddedNamed: (addedIds || []).map((id) => ({ id: String(id), name: name(id) })),
    rolesRemovedNamed: (removedIds || []).map((id) => ({ id: String(id), name: name(id) })),
  };
}

/**
 * @param {string} discordUserId
 * @returns {Promise<object>}
 */
async function reconcileDiscordUserRoles(discordUserId) {
  const supabase = getSupabase();
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  const cols = getCollections();
  const collectionMint = cols[0]?.collectionMint || '';

  if (!supabase) {
    return { rolesSynced: false, message: 'Database not configured' };
  }
  if (!botToken || !guildId) {
    return { rolesSynced: false, message: 'Discord bot not configured — roles skipped.' };
  }

  const { data: linkRows, error: linkErr } = await supabase
    .from('discord_wallet_links')
    .select('wallet_address')
    .eq('discord_user_id', discordUserId);
  if (linkErr) throw linkErr;

  const wallets = filterLinkableWallets((linkRows || []).map((r) => r.wallet_address));
  const { data: activeRoles, error: roleErr } = await supabase
    .from('discord_roles')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true });
  if (roleErr) throw roleErr;

  const roles = activeRoles || [];
  const managedIds = roles.map((r) => String(r.discord_role_id)).filter(Boolean);
  if (!managedIds.length) {
    return { rolesSynced: false, message: 'No active role rules in database.' };
  }

  const member = await getGuildMember(guildId, discordUserId, botToken);
  if (!member) {
    return { rolesSynced: false, message: 'Could not reach Discord API.' };
  }
  if (!member.inGuild) {
    return { rolesSynced: false, notInGuild: true, message: 'Join the Discord server to sync roles.' };
  }

  if (!wallets.length) {
    const syncResult = await syncMemberRolesToExpected(
      guildId,
      discordUserId,
      botToken,
      member.roleIds,
      [],
      managedIds
    );
    return {
      rolesSynced: true,
      message: 'All wallets unlinked — holder roles removed.',
      ...namedRoleDeltas(roles, syncResult.added, syncResult.removed),
    };
  }

  const { data: nftsRows, error: ne } = await supabase
    .from('nfts')
    .select('mint_address, metadata_json, is_crown, is_cowboy, is_burn_squad, owner_wallet')
    .eq('collection_mint', collectionMint)
    .in('owner_wallet', wallets);
  if (ne) throw ne;

  const owned = ownedNftsFromDbRows(nftsRows || []);
  const totalXma = await sumXmaForWallets(wallets);
  const expected = expectedDiscordRoleIds(roles, owned, collectionMint, totalXma);

  const syncResult = await syncMemberRolesToExpected(
    guildId,
    discordUserId,
    botToken,
    member.roleIds,
    expected,
    managedIds
  );

  return {
    rolesSynced: true,
    message: 'Discord roles updated from your remaining linked wallets.',
    ...namedRoleDeltas(roles, syncResult.added, syncResult.removed),
  };
}

module.exports = {
  reconcileDiscordUserRoles,
};
