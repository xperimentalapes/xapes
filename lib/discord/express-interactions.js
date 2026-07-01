/**
 * POST /api/discord/interactions — Discord slash commands & modals.
 * Env: DISCORD_PUBLIC_KEY, DISCORD_BOT_TOKEN, DISCORD_APPLICATION_ID (or DISCORD_CLIENT_ID),
 *      SUPABASE_*, MUTANT_APES_COLLECTION_MINT, NFT_EDITION_NAME_PREFIX (default XMA),
 *      HELIUS_API_KEY, XMA token mint envs,
 *      DISCORD_ADMIN_ROLE_IDS (optional comma-separated role IDs).
 */
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { verifyDiscordRequest } = require('./verify-signature');
const { sumXmaForWallets } = require('../holder/wallet-holdings');

/**
 * Vercel freezes the Node process once the HTTP response is sent; deferred Discord
 * follow-ups (PATCH webhook) must run inside waitUntil or they never execute.
 */
function waitUntilOrAwait(promise) {
  try {
    const { waitUntil } = require('@vercel/functions');
    if (typeof waitUntil === 'function') {
      waitUntil(promise);
      return true;
    }
  } catch (_) {
    /* optional dep or non-Vercel */
  }
  return false;
}

function getRequestHeader(req, name) {
  if (req && typeof req.get === 'function') {
    const v = req.get(name);
    if (v != null && v !== '') return v;
  }
  const key = String(name).toLowerCase();
  const h = req && req.headers;
  if (!h) return undefined;
  return h[key] ?? h[name];
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function appId() {
  return process.env.DISCORD_APPLICATION_ID || process.env.DISCORD_CLIENT_ID || '';
}

function collectionMint() {
  return process.env.MUTANT_APES_COLLECTION_MINT || '';
}

/** Metadata display name for /nft modal edition N, e.g. XMA #55 */
function nftMetadataNameForEdition(edition) {
  const prefix = (process.env.NFT_EDITION_NAME_PREFIX || 'XMA').trim() || 'XMA';
  return `${prefix} #${edition}`;
}

function helpLogoUrl() {
  const base = (process.env.PUBLIC_SITE_URL || process.env.BASE_URL || 'https://xapes.vercel.app').replace(/\/$/, '');
  return `${base}/assets/logo.png`;
}

function userAvatarUrl(user) {
  if (!user || !user.id) return null;
  if (user.avatar) {
    const ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=128`;
  }
  const disc = parseInt(user.discriminator, 10);
  const idx = Number.isFinite(disc) ? disc % 5 : 0;
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

function displayNameFromUser(user) {
  if (!user) return 'Unknown';
  return user.global_name || user.username || 'User';
}

async function fetchDiscordUserProfile(userId) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || !userId) return null;
  try {
    const r = await axios.get(`https://discord.com/api/v10/users/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bot ${token}` },
      validateStatus: () => true,
      timeout: 8000,
    });
    if (r.status === 200 && r.data) return r.data;
  } catch (_) {}
  return null;
}

/** User shown in embed (self from interaction, or fetched profile for admin target). */
async function subjectUserForTarget(interaction, targetId) {
  const self = interaction.member?.user || interaction.user;
  if (self && String(targetId) === String(self.id)) return self;
  const fetched = await fetchDiscordUserProfile(targetId);
  return fetched || self;
}

/** Administrator permission bit */
function hasAdminPermission(member) {
  if (!member || member.permissions == null) return false;
  try {
    const p = BigInt(member.permissions);
    return (p & 8n) === 8n;
  } catch {
    return false;
  }
}

function hasAdminRole(member) {
  const csv = process.env.DISCORD_ADMIN_ROLE_IDS || '';
  if (!csv.trim() || !member || !Array.isArray(member.roles)) return false;
  const allowed = new Set(csv.split(',').map((s) => s.trim()).filter(Boolean));
  return member.roles.some((id) => allowed.has(id));
}

function isPrivilegedAdmin(member) {
  return hasAdminPermission(member) || hasAdminRole(member);
}

/**
 * Resolve target Discord snowflake from optional USER option.
 * @returns {{ ok: boolean, targetId?: string, error?: string }}
 */
function resolveTargetMember(interaction) {
  const self = interaction.member?.user || interaction.user;
  const selfId = self?.id;
  if (!selfId) return { ok: false, error: 'Could not resolve your user.' };

  const opts = interaction.data?.options || [];
  const memberOpt = opts.find((o) => o.name === 'member' && o.type === 6);
  const requested = memberOpt?.value ? String(memberOpt.value) : null;

  if (!requested || requested === selfId) {
    return { ok: true, targetId: selfId };
  }

  if (!isPrivilegedAdmin(interaction.member)) {
    return { ok: false, error: 'Only administrators can use the `member` option.' };
  }
  return { ok: true, targetId: requested };
}

async function fetchLinkedWallets(supabase, discordUserId) {
  const { data, error } = await supabase
    .from('discord_wallet_links')
    .select('wallet_address, discord_display_name')
    .eq('discord_user_id', discordUserId);
  if (error) throw new Error(error.message);
  return (data || []).map((r) => r.wallet_address).filter(Boolean);
}

async function followupEditOriginal(interaction, payload) {
  const id = appId();
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!id || !token) throw new Error('Discord bot not configured');
  const url = `https://discord.com/api/v10/webhooks/${id}/${interaction.token}/messages/@original`;
  await axios.patch(url, payload, {
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    validateStatus: () => true,
    timeout: 15000,
  });
}

function embedBase(user, title) {
  return {
    color: 0x2dd4bf,
    title,
    author: {
      name: displayNameFromUser(user),
      icon_url: userAvatarUrl(user) || undefined,
    },
    thumbnail: userAvatarUrl(user) ? { url: userAvatarUrl(user) } : undefined,
  };
}

async function handleMyNfts(interaction, supabase, targetId) {
  const user = await subjectUserForTarget(interaction, targetId);
  const mint = collectionMint();
  if (!mint) {
    await followupEditOriginal(interaction, { content: 'Collection mint is not configured on the server.', embeds: [] });
    return;
  }
  const wallets = await fetchLinkedWallets(supabase, targetId);
  if (!wallets.length) {
    await followupEditOriginal(interaction, {
      embeds: [
        {
          ...embedBase(user, 'Your NFTs'),
          description: 'No wallets linked yet. Connect on the site and verify to link a wallet.',
        },
      ],
    });
    return;
  }
  const { data: rows, error } = await supabase
    .from('nfts')
    .select('is_crown, is_cowboy, is_burn_squad')
    .eq('collection_mint', mint)
    .in('owner_wallet', wallets);
  if (error) throw new Error(error.message);

  let apes = 0;
  let crowns = 0;
  let cowboys = 0;
  let burn = 0;
  for (const r of rows || []) {
    apes += 1;
    if (r.is_crown) crowns += 1;
    if (r.is_cowboy) cowboys += 1;
    if (r.is_burn_squad) burn += 1;
  }

  await followupEditOriginal(interaction, {
    embeds: [
      {
        ...embedBase(user, 'NFT holdings'),
        fields: [
          { name: 'Apes', value: String(apes), inline: true },
          { name: 'Crowns', value: String(crowns), inline: true },
          { name: 'Cowboys', value: String(cowboys), inline: true },
          { name: 'Burn squad', value: String(burn), inline: true },
        ],
        footer: { text: 'Indexed from on-chain owners + your linked wallets' },
      },
    ],
  });
}

async function handleMyWallets(interaction, supabase, targetId) {
  const user = await subjectUserForTarget(interaction, targetId);
  const { data, error } = await supabase
    .from('discord_wallet_links')
    .select('wallet_address, discord_display_name')
    .eq('discord_user_id', targetId);
  if (error) throw new Error(error.message);
  const rows = data || [];
  if (!rows.length) {
    await followupEditOriginal(interaction, {
      embeds: [
        {
          ...embedBase(user, 'Linked wallets'),
          description: 'No wallets linked. Use the site (Connect Discord + wallet + verify) to link.',
        },
      ],
    });
    return;
  }
  const lines = rows.map((r) => {
    const short =
      r.wallet_address.length > 16
        ? `${r.wallet_address.slice(0, 6)}…${r.wallet_address.slice(-4)}`
        : r.wallet_address;
    return `• \`${short}\` — [Solscan](https://solscan.io/account/${encodeURIComponent(r.wallet_address)})`;
  });
  await followupEditOriginal(interaction, {
    embeds: [
      {
        ...embedBase(user, 'Connected wallets'),
        description: lines.join('\n').slice(0, 4000),
      },
    ],
  });
}

async function handleMyXma(interaction, supabase, targetId) {
  const user = await subjectUserForTarget(interaction, targetId);
  const wallets = await fetchLinkedWallets(supabase, targetId);
  if (!wallets.length) {
    await followupEditOriginal(interaction, {
      embeds: [
        {
          ...embedBase(user, '$XMA balance'),
          description: 'No linked wallets. Link a wallet on the site first.',
        },
      ],
    });
    return;
  }
  const total = await sumXmaForWallets(wallets);
  const formatted =
    total >= 1e9
      ? `${(total / 1e9).toFixed(2)}B`
      : total >= 1e6
        ? `${(total / 1e6).toFixed(2)}M`
        : total >= 1e3
          ? `${(total / 1e3).toFixed(2)}K`
          : total.toFixed(2);
  await followupEditOriginal(interaction, {
    embeds: [
      {
        ...embedBase(user, '$XMA balance'),
        description: `**${formatted}** XMA across **${wallets.length}** linked wallet(s).`,
      },
    ],
  });
}

async function handleMyCasino(interaction, supabase, targetId) {
  const user = await subjectUserForTarget(interaction, targetId);
  const wallets = await fetchLinkedWallets(supabase, targetId);
  if (!wallets.length) {
    await followupEditOriginal(interaction, {
      embeds: [
        {
          ...embedBase(user, 'Casino stats'),
          description: 'No linked wallets — casino stats are tied to your Solana wallet on the site.',
        },
      ],
    });
    return;
  }

  let slotsSpins = 0;
  let rouletteSpins = 0;
  let coinflipPlays = 0;

  try {
    const { data: slotRows } = await supabase.from('slots_players').select('total_spins').in('wallet_address', wallets);
    for (const r of slotRows || []) slotsSpins += r.total_spins || 0;
  } catch (_) {}

  try {
    const { data: rRows } = await supabase.from('roulette_players').select('total_spins').in('wallet_address', wallets);
    for (const r of rRows || []) rouletteSpins += r.total_spins || 0;
  } catch (_) {}

  try {
    const { count, error: cErr } = await supabase
      .from('coinflip_rounds')
      .select('*', { count: 'exact', head: true })
      .in('wallet_address', wallets);
    if (!cErr && count != null) coinflipPlays = count;
  } catch (_) {}

  const totalGames = slotsSpins + rouletteSpins + coinflipPlays;

  await followupEditOriginal(interaction, {
    embeds: [
      {
        ...embedBase(user, 'Casino activity'),
        description: `**Total plays (tracked):** ${totalGames}`,
        fields: [
          { name: 'Slots (spins)', value: String(slotsSpins), inline: true },
          { name: 'Roulette (spins)', value: String(rouletteSpins), inline: true },
          { name: 'Coin flip (plays)', value: String(coinflipPlays), inline: true },
        ],
      },
    ],
  });
}

async function handleHelp(interaction) {
  await followupEditOriginal(interaction, {
    embeds: [
      {
        color: 0x2dd4bf,
        title: 'XapeLabz bot',
        description: 'Slash commands for linked wallets (link via the website).',
        thumbnail: { url: helpLogoUrl() },
        fields: [
          {
            name: '/my_nfts',
            value: 'Apes, crowns, cowboys & burn squad counts (from DB).',
            inline: false,
          },
          { name: '/my_wallets', value: 'Wallets linked to your Discord.', inline: false },
          { name: '/my_xma', value: 'Total $XMA on linked wallets (Helius).', inline: false },
          {
            name: '/my_casino',
            value: 'Slots spins, roulette spins, and coin flip plays.',
            inline: false,
          },
          { name: '/nft', value: 'Enter N to look up the NFT named **XMA #N** (prefix: env `NFT_EDITION_NAME_PREFIX`).', inline: false },
          {
            name: 'Admins',
            value: 'Use optional **member** on `/my_*` to view another user.',
            inline: false,
          },
        ],
      },
    ],
  });
}

function modalNftResponse() {
  return {
    type: 9,
    data: {
      custom_id: 'nft_edition_modal',
      title: 'NFT by edition',
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: 'edition_number',
              label: 'Edition number (1 … supply)',
              style: 1,
              min_length: 1,
              max_length: 8,
              placeholder: 'e.g. 42',
              required: true,
            },
          ],
        },
      ],
    },
  };
}

function formatTraits(metadata) {
  const attrs = metadata && Array.isArray(metadata.attributes) ? metadata.attributes : [];
  if (!attrs.length) return '_No traits in metadata_';
  const lines = attrs.map((a) => {
    const t = a.trait_type != null ? String(a.trait_type) : '';
    const v = a.value != null ? String(a.value) : '';
    return `**${t}:** ${v}`;
  });
  return lines.join('\n').slice(0, 3500);
}

async function handleNftModal(interaction, supabase) {
  const mint = collectionMint();
  if (!mint) {
    return { type: 4, data: { embeds: [{ description: 'Collection mint not configured.', color: 0xff0000 }] } };
  }

  const rows = interaction.data?.components || [];
  let raw = '';
  for (const row of rows) {
    for (const c of row.components || []) {
      if (c.custom_id === 'edition_number') raw = String(c.value || '').trim();
    }
  }
  const edition = parseInt(raw, 10);
  if (!Number.isFinite(edition) || edition < 1) {
    return {
      type: 4,
      data: { embeds: [{ description: 'Enter a valid edition number (1 or higher).', color: 0xff0000 }] },
    };
  }

  const expectedName = nftMetadataNameForEdition(edition);
  const { data: nameRows, error } = await supabase
    .from('nfts')
    .select('mint_address, name, image_url, metadata_json, owner_wallet')
    .eq('collection_mint', mint)
    .eq('name', expectedName)
    .limit(1);

  if (error) {
    return {
      type: 4,
      data: { embeds: [{ description: `Database error: ${error.message}`, color: 0xff0000 }] },
    };
  }
  const nft = nameRows && nameRows[0];
  if (!nft) {
    return {
      type: 4,
      data: {
        embeds: [
          {
            description: `No NFT with name **${expectedName}** in this collection. Check sync or \`NFT_EDITION_NAME_PREFIX\` if your metadata uses a different prefix.`,
            color: 0xff0000,
          },
        ],
      },
    };
  }

  let ownerLine = nft.owner_wallet
    ? `\`${nft.owner_wallet.slice(0, 4)}…${nft.owner_wallet.slice(-4)}\` [Solscan](https://solscan.io/account/${encodeURIComponent(nft.owner_wallet)})`
    : 'Unknown';

  if (nft.owner_wallet) {
    const { data: link } = await supabase
      .from('discord_wallet_links')
      .select('discord_display_name')
      .eq('wallet_address', nft.owner_wallet)
      .maybeSingle();
    if (link && link.discord_display_name) {
      ownerLine = `**${link.discord_display_name}** (${ownerLine})`;
    }
  }

  const traitText = formatTraits(nft.metadata_json);
  const metaName = (nft.name || '').trim() || '—';
  const embed = {
    color: 0x2dd4bf,
    title: `#${edition}`,
    url: `https://solscan.io/token/${encodeURIComponent(nft.mint_address)}`,
    image: nft.image_url ? { url: nft.image_url } : undefined,
    fields: [
      { name: 'Name', value: metaName.slice(0, 1024), inline: false },
      { name: 'Owner', value: ownerLine.slice(0, 1024), inline: false },
      { name: 'Traits', value: traitText.slice(0, 1024) || '—', inline: false },
    ],
    footer: { text: `${nft.mint_address.slice(0, 4)}…${nft.mint_address.slice(-4)}` },
  };

  if (traitText.length > 1024) {
    embed.description = traitText.slice(0, 4096);
    embed.fields = [
      { name: 'Name', value: metaName.slice(0, 1024), inline: false },
      { name: 'Owner', value: ownerLine.slice(0, 1024), inline: false },
    ];
  }

  return { type: 4, data: { embeds: [embed] } };
}

async function handleApplicationCommand(interaction) {
  const name = interaction.data?.name;
  const supabase = getSupabase();
  if (!supabase) {
    await followupEditOriginal(interaction, { content: 'Database is not configured.', embeds: [] });
    return;
  }

  const resolved = resolveTargetMember(interaction);
  if (!resolved.ok) {
    await followupEditOriginal(interaction, {
      embeds: [{ description: resolved.error, color: 0xff0000 }],
    });
    return;
  }
  const targetId = resolved.targetId;

  switch (name) {
    case 'my_nfts':
      await handleMyNfts(interaction, supabase, targetId);
      break;
    case 'my_wallets':
      await handleMyWallets(interaction, supabase, targetId);
      break;
    case 'my_xma':
      await handleMyXma(interaction, supabase, targetId);
      break;
    case 'my_casino':
      await handleMyCasino(interaction, supabase, targetId);
      break;
    case 'help':
      await handleHelp(interaction);
      break;
    default:
      await followupEditOriginal(interaction, { content: 'Unknown command.', embeds: [] });
  }
}

/**
 * `nft` command: first ACK clears initial deferred message, then we must send a new message with modal.
 * Discord flow: respond to interaction with type 9 (MODAL) on the **initial** response, not after defer.
 * So /nft cannot use the same defer pattern — handle without defer.
 */
async function processInteraction(interaction, res) {
  if (interaction.type === 1) {
    res.status(200).json({ type: 1 });
    return;
  }

  if (interaction.type === 5) {
    const supabase = getSupabase();
    if (!supabase) {
      res.status(200).json({
        type: 4,
        data: { embeds: [{ description: 'Database not configured.', color: 0xff0000 }] },
      });
      return;
    }
    const out = await handleNftModal(interaction, supabase);
    res.status(200).json(out);
    return;
  }

  if (interaction.type !== 2) {
    res.status(200).json({ type: 4, data: { content: 'Unsupported interaction.' } });
    return;
  }

  const cmd = interaction.data?.name;
  if (cmd === 'nft') {
    res.status(200).json(modalNftResponse());
    return;
  }

  const deferredWork = (async () => {
    try {
      await handleApplicationCommand(interaction);
    } catch (e) {
      console.error('Discord slash command error', e);
      try {
        await followupEditOriginal(interaction, {
          embeds: [{ description: `Error: ${e.message || 'Something went wrong'}`, color: 0xff0000 }],
        });
      } catch (_) {}
    }
  })();

  // Register with Vercel before ending the response, or the runtime may freeze before PATCH runs.
  if (waitUntilOrAwait(deferredWork)) {
    res.status(200).json({ type: 5 });
    return;
  }

  res.status(200).json({ type: 5 });
  await deferredWork;
}

/**
 * Express middleware handler (req.body = raw Buffer from express.raw).
 */
module.exports = async function discordInteractionsExpress(req, res) {
  const signature = getRequestHeader(req, 'x-signature-ed25519');
  const timestamp = getRequestHeader(req, 'x-signature-timestamp');
  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');

  if (!publicKey) {
    return res.status(503).send('DISCORD_PUBLIC_KEY not set');
  }

  if (!verifyDiscordRequest(rawBody, signature, timestamp, publicKey)) {
    return res.status(401).send('Invalid signature');
  }

  let interaction;
  try {
    interaction = JSON.parse(rawBody);
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  await processInteraction(interaction, res);
};