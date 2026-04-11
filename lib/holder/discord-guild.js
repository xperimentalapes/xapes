/**
 * Discord REST: guild membership and role add/remove (bot token).
 */
const axios = require('axios');

const BASE = 'https://discord.com/api/v10';

async function discordRequest(method, path, botToken, body) {
  const url = BASE + path;
  const res = await axios({
    method,
    url,
    headers: {
      Authorization: 'Bot ' + botToken,
      'Content-Type': 'application/json',
    },
    data: body,
    validateStatus: () => true,
    timeout: 15000,
  });
  return res;
}

/**
 * @returns {{ inGuild: boolean, roleIds: string[] } | null} null on hard error
 */
async function getGuildMember(guildId, userId, botToken) {
  const res = await discordRequest('GET', `/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}`, botToken);
  if (res.status === 200 && res.data) {
    return { inGuild: true, roleIds: (res.data.roles || []).map(String) };
  }
  if (res.status === 404) {
    return { inGuild: false, roleIds: [] };
  }
  console.warn('Discord getGuildMember', res.status, res.data);
  return null;
}

async function addGuildMemberRole(guildId, userId, roleId, botToken) {
  const res = await discordRequest(
    'PUT',
    `/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}`,
    botToken
  );
  return res.status === 204 || res.status === 200;
}

async function removeGuildMemberRole(guildId, userId, roleId, botToken) {
  const res = await discordRequest(
    'DELETE',
    `/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}`,
    botToken
  );
  return res.status === 204 || res.status === 200;
}

/**
 * Adds/removes only roles that appear in managedRoleIds.
 * @param {Set<string>|string[]} expectedRoleIds
 * @param {Set<string>|string[]} managedRoleIds - all discord_role_id from DB we own
 */
async function syncMemberRolesToExpected(guildId, userId, botToken, currentRoleIds, expectedRoleIds, managedRoleIds) {
  const expected = new Set(expectedRoleIds);
  const managed = new Set(managedRoleIds);
  const current = new Set((currentRoleIds || []).map(String));

  const added = [];
  const removed = [];

  for (const rid of expected) {
    if (!managed.has(rid)) continue;
    if (!current.has(rid)) {
      const ok = await addGuildMemberRole(guildId, userId, rid, botToken);
      if (ok) added.push(rid);
    }
  }

  for (const rid of current) {
    if (!managed.has(rid)) continue;
    if (!expected.has(rid)) {
      const ok = await removeGuildMemberRole(guildId, userId, rid, botToken);
      if (ok) removed.push(rid);
    }
  }

  return { added, removed };
}

module.exports = {
  getGuildMember,
  addGuildMemberRole,
  removeGuildMemberRole,
  syncMemberRolesToExpected,
};
