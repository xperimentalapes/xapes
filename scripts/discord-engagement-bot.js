/**
 * Discord Gateway bot: records engagement into Supabase (discord_engagement_events).
 *
 * Prereqs:
 *   1. Run database/migration_discord_engagement.sql in Supabase.
 *   2. Developer Portal → Bot → enable intents: Server Members (if needed), Message Content,
 *      Message Intent (Guild Messages), Guild Message Reactions, Guild Voice States.
 *   3. Env: DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, SUPABASE_URL, SUPABASE_SERVICE_KEY
 *
 * Optional: DISCORD_ENGAGEMENT_CHANNEL_IDS=id1,id2 (whitelist). If unset, all guild text channels.
 *           DISCORD_ENGAGEMENT_IGNORE_CHANNEL_IDS=id1,id2 (blacklist).
 *
 * Run: npm run discord-engagement-bot
 * Deploy: long-running process (Railway, Fly, VPS) — not Vercel serverless.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const MIN_MESSAGE_CHARS = 10;
const MAX_MSG_PER_15M = 5;
const MAX_MSG_PER_24H = 250;

function parseIdList(v) {
  if (!v || typeof v !== 'string') return null;
  const ids = v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length ? new Set(ids) : null;
}

const CHANNEL_WHITELIST = parseIdList(process.env.DISCORD_ENGAGEMENT_CHANNEL_IDS);
const CHANNEL_BLACKLIST = parseIdList(process.env.DISCORD_ENGAGEMENT_IGNORE_CHANNEL_IDS) || new Set();

if (!TOKEN || !GUILD_ID || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    'Missing env: DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, SUPABASE_URL, SUPABASE_SERVICE_KEY'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/** @param {object} row @returns {Promise<boolean>} */
async function insertEvent(row) {
  const { error } = await supabase.from('discord_engagement_events').insert({
    guild_id: row.guild_id,
    discord_user_id: row.discord_user_id,
    event_type: row.event_type,
    channel_id: row.channel_id || null,
    metadata: row.metadata || {},
  });
  if (error) {
    console.error('[engagement] insert failed', error.message, row.event_type);
    return false;
  }
  return true;
}

class MessageRateLimiter {
  constructor() {
    /** @type {Map<string, number[]>} */
    this.timestamps = new Map();
  }

  _windowed(userId, now) {
    const fifteenMs = 15 * 60 * 1000;
    const dayMs = 24 * 60 * 60 * 1000;
    let arr = this.timestamps.get(userId) || [];
    arr = arr.filter((t) => now - t <= dayMs);
    const in15 = arr.filter((t) => now - t <= fifteenMs);
    return { arr, in15 };
  }

  /** True if a new qualifying message is allowed (does not record yet). */
  peekAllow(userId, now) {
    const { arr, in15 } = this._windowed(userId, now);
    if (in15.length >= MAX_MSG_PER_15M) return false;
    if (arr.length >= MAX_MSG_PER_24H) return false;
    return true;
  }

  /** Call after a successful DB write for a qualifying message. */
  record(userId, now) {
    const dayMs = 24 * 60 * 60 * 1000;
    let arr = this.timestamps.get(userId) || [];
    arr = arr.filter((t) => now - t <= dayMs);
    arr.push(now);
    this.timestamps.set(userId, arr);
  }
}

const messageLimiter = new MessageRateLimiter();
/** @type {Map<string, number>} key guildId:userId -> joinedAt ms */
const voiceJoin = new Map();

function channelAllowed(channelId) {
  if (CHANNEL_BLACKLIST.has(channelId)) return false;
  if (CHANNEL_WHITELIST && !CHANNEL_WHITELIST.has(channelId)) return false;
  return true;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.once(Events.ClientReady, (c) => {
  console.log('[engagement] logged in as', c.user.tag, 'guild', GUILD_ID);
});

client.on(Events.MessageCreate, async (message) => {
  try {
    if (!message.guild || message.guild.id !== GUILD_ID) return;
    if (message.author.bot) return;
    if (!message.channelId || !channelAllowed(message.channelId)) return;
    const content = (message.content || '').trim();
    if (content.length < MIN_MESSAGE_CHARS) return;
    const now = Date.now();
    if (!messageLimiter.peekAllow(message.author.id, now)) return;
    const ok = await insertEvent({
      guild_id: message.guild.id,
      discord_user_id: message.author.id,
      event_type: 'message',
      channel_id: message.channelId,
      metadata: { length: content.length },
    });
    if (ok) messageLimiter.record(message.author.id, now);
  } catch (e) {
    console.error('[engagement] MessageCreate', e);
  }
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  try {
    if (user.partial) {
      try {
        await user.fetch();
      } catch (_) {
        return;
      }
    }
    if (user.bot) return;
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (_) {
        return;
      }
    }
    if (reaction.message.partial) {
      try {
        await reaction.message.fetch();
      } catch (_) {
        return;
      }
    }
    const guild = reaction.message.guild;
    if (!guild || guild.id !== GUILD_ID) return;
    const chId = reaction.message.channelId;
    if (!chId || !channelAllowed(chId)) return;
    let emoji = reaction.emoji.name;
    if (reaction.emoji.id) emoji = `${reaction.emoji.name}:${reaction.emoji.id}`;
    await insertEvent({
      guild_id: guild.id,
      discord_user_id: user.id,
      event_type: 'reaction_add',
      channel_id: chId,
      metadata: { emoji: emoji || 'unknown' },
    });
  } catch (e) {
    console.error('[engagement] MessageReactionAdd', e);
  }
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  try {
    const guild = newState.guild;
    if (!guild || guild.id !== GUILD_ID) return;
    if (newState.member?.user?.bot) return;
    const userId = newState.id;
    const key = `${guild.id}:${userId}`;
    const now = Date.now();

    if (!oldState.channelId && newState.channelId) {
      voiceJoin.set(key, now);
      return;
    }

    if (oldState.channelId && !newState.channelId) {
      const start = voiceJoin.get(key);
      voiceJoin.delete(key);
      if (start) {
        const seconds = Math.floor((now - start) / 1000);
        if (seconds > 0) {
          await insertEvent({
            guild_id: guild.id,
            discord_user_id: userId,
            event_type: 'voice_session',
            channel_id: oldState.channelId,
            metadata: { seconds },
          });
        }
      }
      return;
    }

    if (
      oldState.channelId &&
      newState.channelId &&
      oldState.channelId !== newState.channelId
    ) {
      const start = voiceJoin.get(key);
      voiceJoin.delete(key);
      if (start) {
        const seconds = Math.floor((now - start) / 1000);
        if (seconds > 0) {
          await insertEvent({
            guild_id: guild.id,
            discord_user_id: userId,
            event_type: 'voice_session',
            channel_id: oldState.channelId,
            metadata: { seconds },
          });
        }
      }
      voiceJoin.set(key, now);
    }
  } catch (e) {
    console.error('[engagement] VoiceStateUpdate', e);
  }
});

client.login(TOKEN).catch((e) => {
  console.error('[engagement] login failed', e.message);
  process.exit(1);
});
