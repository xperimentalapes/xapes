/**
 * Discord engagement tracking (messages, reactions, voice) → Supabase `discord_engagement_events`.
 *
 * **This repo:** run the Gateway with `npm run royal-bot-gateway` (`scripts/royal-bot-gateway.js`).
 * Slash commands use Vercel `POST /api/discord/interactions` (HTTP); same bot token, one WebSocket session.
 *
 * **One bot token = one Gateway session** — do not run two Node processes that both `client.login` with the same token.
 *
 * Add more ROYAL listeners in `registerRoyalBotGatewayHandlers` in `scripts/royal-bot-gateway.js`, or merge manually:
 *
 * @example
 * const { Client } = require('discord.js');
 * const { attachEngagementTracking, mergeEngagementClientOptions } = require('./engagement-gateway');
 * const { intents, partials } = mergeEngagementClientOptions(yourIntents, yourPartials);
 * const client = new Client({ intents, partials });
 * attachEngagementTracking(client);
 * client.login(process.env.DISCORD_BOT_TOKEN);
 */

const { GatewayIntentBits, Partials, Events } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

const MIN_MESSAGE_CHARS = 10;
const MAX_MSG_PER_15M = 5;
const MAX_MSG_PER_24H = 250;

/** Intents required for engagement (merge into your bot’s Client). */
const ENGAGEMENT_INTENT_BITS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildMessageReactions,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.GuildMembers,
];

const ENGAGEMENT_PARTIALS = [Partials.Message, Partials.Channel, Partials.Reaction];

/**
 * Merge engagement intents/partials into an existing discord.js Client config (dedupe by value).
 * Use when ROYAL BOT already declares intents — spread the result into `new Client({ ... })`.
 *
 * @param {number[]} [existingIntents] GatewayIntentBits values
 * @param {number[]} [existingPartials] Partials enum values
 * @returns {{ intents: number[], partials: number[] }}
 */
function mergeEngagementClientOptions(existingIntents = [], existingPartials = []) {
  const intents = [...new Set([...existingIntents, ...ENGAGEMENT_INTENT_BITS])];
  const partials = [...new Set([...existingPartials, ...ENGAGEMENT_PARTIALS])];
  return { intents, partials };
}

function parseIdList(v) {
  if (!v || typeof v !== 'string') return null;
  const ids = v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.length ? new Set(ids) : null;
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

  peekAllow(userId, now) {
    const { arr, in15 } = this._windowed(userId, now);
    if (in15.length >= MAX_MSG_PER_15M) return false;
    if (arr.length >= MAX_MSG_PER_24H) return false;
    return true;
  }

  record(userId, now) {
    const dayMs = 24 * 60 * 60 * 1000;
    let arr = this.timestamps.get(userId) || [];
    arr = arr.filter((t) => now - t <= dayMs);
    arr.push(now);
    this.timestamps.set(userId, arr);
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} row
 * @returns {Promise<boolean>}
 */
async function insertEvent(supabase, row) {
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

/**
 * @param {import('discord.js').Client} client
 * @param {object} [options]
 * @param {string} [options.guildId] — default `process.env.DISCORD_GUILD_ID`
 * @param {import('@supabase/supabase-js').SupabaseClient} [options.supabase] — default from service env
 * @param {Set<string>|null} [options.channelWhitelist] — default from `DISCORD_ENGAGEMENT_CHANNEL_IDS`
 * @param {Set<string>} [options.channelBlacklist] — default from `DISCORD_ENGAGEMENT_IGNORE_CHANNEL_IDS`
 * @param {boolean} [options.skipIfDisabled] — if true and `DISCORD_ENGAGEMENT_DISABLED=1`, no-op
 * Env `DISCORD_ENGAGEMENT_DEBUG=1` — log why MessageCreate rows are skipped or stored
 * @returns {boolean} whether listeners were registered
 */
function attachEngagementTracking(client, options = {}) {
  if (options.skipIfDisabled !== false && process.env.DISCORD_ENGAGEMENT_DISABLED === '1') {
    console.log('[engagement] DISCORD_ENGAGEMENT_DISABLED=1 — skipping attach');
    return false;
  }

  const guildId = options.guildId || process.env.DISCORD_GUILD_ID;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  let supabase = options.supabase;
  if (!supabase) {
    if (!url || !key) {
      console.error('[engagement] attach skipped: missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
      return false;
    }
    supabase = createClient(url, key);
  }

  if (!guildId) {
    console.error('[engagement] attach skipped: missing guildId / DISCORD_GUILD_ID');
    return false;
  }

  const guildIdNorm = String(guildId).trim();
  const debugEngagement = process.env.DISCORD_ENGAGEMENT_DEBUG === '1';
  function dbg(...args) {
    if (debugEngagement) console.log('[engagement][debug]', ...args);
  }

  const channelWhitelist =
    options.channelWhitelist !== undefined
      ? options.channelWhitelist
      : parseIdList(process.env.DISCORD_ENGAGEMENT_CHANNEL_IDS);
  const channelBlacklist =
    options.channelBlacklist !== undefined
      ? options.channelBlacklist
      : parseIdList(process.env.DISCORD_ENGAGEMENT_IGNORE_CHANNEL_IDS) || new Set();

  function channelAllowed(channelId) {
    if (!channelId) return false;
    if (channelBlacklist.has(channelId)) return false;
    if (channelWhitelist && !channelWhitelist.has(channelId)) return false;
    return true;
  }

  const messageLimiter = new MessageRateLimiter();
  /** @type {Map<string, number>} */
  const voiceJoin = new Map();

  if (client.__xapesEngagementAttached) {
    console.warn('[engagement] listeners already attached; skip duplicate attachEngagementTracking');
    return false;
  }

  client.on(Events.MessageCreate, async (message) => {
    try {
      if (!message.guild) {
        dbg('MessageCreate skip: no guild');
        return;
      }
      if (message.guild.id !== guildIdNorm) {
        dbg('MessageCreate skip: other guild', message.guild.id);
        return;
      }
      if (message.author.bot) {
        dbg('MessageCreate skip: author is bot');
        return;
      }
      if (!message.channelId || !channelAllowed(message.channelId)) {
        dbg('MessageCreate skip: channel not allowed', message.channelId, {
          whitelist: channelWhitelist ? [...channelWhitelist] : null,
        });
        return;
      }
      const content = (message.content || '').trim();
      if (content.length < MIN_MESSAGE_CHARS) {
        dbg('MessageCreate skip: too short', content.length);
        return;
      }
      const now = Date.now();
      if (!messageLimiter.peekAllow(message.author.id, now)) {
        dbg('MessageCreate skip: rate limit', message.author.id);
        return;
      }
      const ok = await insertEvent(supabase, {
        guild_id: message.guild.id,
        discord_user_id: message.author.id,
        event_type: 'message',
        channel_id: message.channelId,
        metadata: { length: content.length },
      });
      if (ok) {
        messageLimiter.record(message.author.id, now);
        dbg('MessageCreate stored', message.channelId, 'len', content.length);
      }
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
      if (!guild || guild.id !== guildIdNorm) return;
      const chId = reaction.message.channelId;
      if (!chId || !channelAllowed(chId)) return;
      let emoji = reaction.emoji.name;
      if (reaction.emoji.id) emoji = `${reaction.emoji.name}:${reaction.emoji.id}`;
      await insertEvent(supabase, {
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
      if (!guild || guild.id !== guildIdNorm) return;
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
            await insertEvent(supabase, {
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
            await insertEvent(supabase, {
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

  client.__xapesEngagementAttached = true;
  console.log('[engagement] listeners attached for guild', guildIdNorm);
  return true;
}

module.exports = {
  attachEngagementTracking,
  ENGAGEMENT_INTENT_BITS,
  ENGAGEMENT_PARTIALS,
  mergeEngagementClientOptions,
  MessageRateLimiter,
  insertEvent,
};
