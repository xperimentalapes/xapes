/**
 * Register guild slash commands (replaces all commands in that guild).
 * Env: DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, DISCORD_APPLICATION_ID (or DISCORD_CLIENT_ID)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');
const commands = require('../lib/discord/command-definitions');

const token = process.env.DISCORD_BOT_TOKEN;
const appId = process.env.DISCORD_APPLICATION_ID || process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !appId || !guildId) {
  console.error('Missing env: DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, and DISCORD_APPLICATION_ID (or DISCORD_CLIENT_ID)');
  process.exit(1);
}

const url = `https://discord.com/api/v10/applications/${encodeURIComponent(appId)}/guilds/${encodeURIComponent(guildId)}/commands`;

axios
  .put(url, commands, {
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    validateStatus: () => true,
  })
  .then((r) => {
    if (r.status >= 200 && r.status < 300) {
      const n = Array.isArray(r.data) ? r.data.length : '?';
      console.log('Registered guild commands:', n);
      return;
    }
    console.error('Discord API error', r.status, r.data);
    process.exit(1);
  })
  .catch((e) => {
    console.error(e.response?.data || e.message);
    process.exit(1);
  });
