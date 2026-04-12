/**
 * GET /api/discord-rewards/status — session Discord; unclaimed XMA, 24h stats, linked wallets.
 * POST /api/discord-rewards/claim — session + body.walletAddress; treasury sends XMA on-chain, zeros unclaimed.
 */
const { createClient } = require('@supabase/supabase-js');
const {
  Connection,
  PublicKey,
  Transaction,
  Keypair,
} = require('@solana/web3.js');
const {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
  createAssociatedTokenAccountInstruction,
} = require('@solana/spl-token');
const bs58 = require('bs58');
const {
  nextMidnightIsoInTimeZone,
  startOfCurrentDayIsoInTimeZone,
} = require('./daily-grant-schedule');

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function guildId() {
  return (process.env.DISCORD_GUILD_ID || '').trim();
}

function accrualRates() {
  const msg = Number(process.env.DISCORD_XMA_PER_MESSAGE || '300');
  const react = Number(process.env.DISCORD_XMA_PER_REACTION || '200');
  const voice = Number(process.env.DISCORD_XMA_PER_VOICE_MINUTE || '100');
  return {
    message: Number.isFinite(msg) && msg > 0 ? msg : 300,
    reaction: Number.isFinite(react) && react > 0 ? react : 200,
    voiceMinute: Number.isFinite(voice) && voice > 0 ? voice : 100,
  };
}

function dailyAccrualCapXma() {
  const n = Number(process.env.DISCORD_XMA_DAILY_ACCRUAL_CAP || '100000');
  return Number.isFinite(n) && n > 0 ? n : 100000;
}

function dailyAccrualTimezone() {
  const t = (process.env.DAILY_GRANT_TIMEZONE || 'America/New_York').trim();
  return t || 'America/New_York';
}

function publicRewardsMetaPayload() {
  const tz = dailyAccrualTimezone();
  return {
    accrualRates: accrualRates(),
    dailyAccrualCapXma: dailyAccrualCapXma(),
    dailyAccrualTimezone: tz,
    nextDailyResetAt: nextMidnightIsoInTimeZone(tz),
    nextResetLabel: 'Daily cap resets (ET)',
  };
}

async function handlePublicMeta(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=30');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    return res.json(publicRewardsMetaPayload());
  } catch (e) {
    console.error('discord-rewards/meta', e);
    return res.status(500).json({ error: 'Failed to load meta' });
  }
}

function claimThresholdXma() {
  const n = Number(process.env.DISCORD_XMA_CLAIM_THRESHOLD || '1000000');
  return Number.isFinite(n) && n > 0 ? n : 1000000;
}

function tokenMintStr() {
  return (
    process.env.XMA_TOKEN_MINT ||
    process.env.BLUNA_TOKEN_MINT ||
    process.env.TOKEN_MINT ||
    'HVSruatutKcgpZJXYyeRCWAnyT7mzYq1io9YoJ6F4yMP'
  ).trim();
}

function tokenDecimals() {
  return Math.max(0, parseInt(process.env.BLUNA_DECIMALS || process.env.XMA_DECIMALS || '6', 10) || 6);
}

function rpcUrl() {
  const u = process.env.HELIUS_RPC_URL;
  if (u && String(u).trim()) return String(u).trim();
  const k = process.env.HELIUS_API_KEY;
  if (k) return 'https://mainnet.helius-rpc.com/?api-key=' + encodeURIComponent(k);
  return 'https://api.mainnet-beta.solana.com';
}

/** Parse non-negative decimal string to token raw units (bigint). */
function xmaToRawUnits(str, decimals) {
  const s = String(str || '0').trim();
  if (!s || s === '0') return 0n;
  const neg = s.startsWith('-');
  const t = neg ? s.slice(1) : s;
  const parts = t.split('.');
  const whole = parts[0].replace(/^\D+/, '') || '0';
  let frac = (parts[1] || '').replace(/\D/g, '');
  if (frac.length > decimals) frac = frac.slice(0, decimals);
  frac = frac.padEnd(decimals, '0');
  const w = BigInt(whole || '0');
  const f = frac ? BigInt(frac) : 0n;
  const raw = w * BigInt(10 ** decimals) + f;
  return neg ? -raw : raw;
}

function rawUnitsToNumberString(raw, decimals) {
  if (raw === 0n) return '0';
  const neg = raw < 0n;
  const v = neg ? -raw : raw;
  const d = BigInt(10 ** decimals);
  const whole = v / d;
  const frac = v % d;
  if (frac === 0n) return (neg ? '-' : '') + whole.toString();
  let fs = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return (neg ? '-' : '') + whole.toString() + (fs ? '.' + fs : '');
}

function loadTreasuryKeypair() {
  const raw = process.env.XMA_REWARDS_TREASURY_KEY || process.env.DISCORD_XMA_REWARDS_WALLET_KEY;
  if (!raw || !String(raw).trim()) return { error: 'XMA_REWARDS_TREASURY_KEY not set' };
  const expectedPub = (
    process.env.XMA_REWARDS_TREASURY_WALLET ||
    process.env.DISCORD_XMA_REWARDS_TREASURY_WALLET ||
    ''
  ).trim();
  let keypair;
  try {
    const s = String(raw).trim();
    if (s.startsWith('[')) {
      const arr = JSON.parse(s);
      if (!Array.isArray(arr) || arr.length !== 64) throw new Error('Invalid JSON key length');
      keypair = Keypair.fromSecretKey(Uint8Array.from(arr));
    } else {
      const decoded = bs58.decode(s);
      if (decoded.length !== 64) throw new Error('Invalid base58 key length');
      keypair = Keypair.fromSecretKey(decoded);
    }
  } catch (e) {
    return { error: 'Invalid rewards treasury key: ' + (e.message || '') };
  }
  if (expectedPub && keypair.publicKey.toString() !== expectedPub) {
    return { error: 'XMA_REWARDS_TREASURY_KEY does not match XMA_REWARDS_TREASURY_WALLET' };
  }
  return { keypair };
}

async function handleStatus(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const discord = req.session && req.session.discord;
  if (!discord || !discord.id) {
    return res.status(401).json({ error: 'Discord login required' });
  }
  const gid = guildId();
  if (!gid) {
    return res.status(503).json({ error: 'DISCORD_GUILD_ID not configured' });
  }
  const supabase = getSupabase();
  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }
  const uid = String(discord.id);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  /** Engagement counts are primary; rewards / wallet link queries are best-effort (extra migrations). */
  let messages24h = 0;
  let reactions24h = 0;
  let voiceMinutes = 0;
  let unclaimedStr = '0';
  let linkedWallets = [];
  let claimedXmaToday = '0';

  try {
    const tz = dailyAccrualTimezone();
    const claimDayStartIso = startOfCurrentDayIsoInTimeZone(tz);
    const claimDayEndIso = nextMidnightIsoInTimeZone(tz);

    const msgRes = await supabase
      .from('discord_engagement_events')
      .select('id', { count: 'exact', head: true })
      .eq('discord_user_id', uid)
      .eq('guild_id', gid)
      .eq('event_type', 'message')
      .gte('created_at', since);
    if (msgRes.error) {
      console.error('[discord-rewards/status] messages24h', msgRes.error.message);
    } else {
      messages24h = msgRes.count ?? 0;
    }

    const reactRes = await supabase
      .from('discord_engagement_events')
      .select('id', { count: 'exact', head: true })
      .eq('discord_user_id', uid)
      .eq('guild_id', gid)
      .eq('event_type', 'reaction_add')
      .gte('created_at', since);
    if (reactRes.error) {
      console.error('[discord-rewards/status] reactions24h', reactRes.error.message);
    } else {
      reactions24h = reactRes.count ?? 0;
    }

    const voiceRes = await supabase
      .from('discord_engagement_events')
      .select('metadata')
      .eq('discord_user_id', uid)
      .eq('guild_id', gid)
      .eq('event_type', 'voice_session')
      .gte('created_at', since)
      .limit(5000);
    if (voiceRes.error) {
      console.error('[discord-rewards/status] voice_sessions', voiceRes.error.message);
    } else {
      for (const row of voiceRes.data || []) {
        const sec = row.metadata && Number(row.metadata.seconds);
        if (Number.isFinite(sec) && sec > 0) voiceMinutes += sec / 60;
      }
    }

    const rewardsRes = await supabase
      .from('discord_xma_rewards')
      .select('unclaimed_xma')
      .eq('discord_user_id', uid)
      .eq('guild_id', gid)
      .maybeSingle();
    if (rewardsRes.error) {
      console.warn('[discord-rewards/status] discord_xma_rewards', rewardsRes.error.message);
    } else if (rewardsRes.data && rewardsRes.data.unclaimed_xma != null) {
      unclaimedStr = String(rewardsRes.data.unclaimed_xma);
    }

    const linksRes = await supabase
      .from('discord_wallet_links')
      .select('wallet_address')
      .eq('discord_user_id', uid);
    if (linksRes.error) {
      console.warn('[discord-rewards/status] discord_wallet_links', linksRes.error.message);
    } else {
      linkedWallets = (linksRes.data || []).map((r) => r.wallet_address).filter(Boolean);
    }

    const claimsTodayRes = await supabase
      .from('discord_xma_claims')
      .select('amount_xma')
      .eq('discord_user_id', uid)
      .eq('guild_id', gid)
      .gte('created_at', claimDayStartIso)
      .lt('created_at', claimDayEndIso);
    if (claimsTodayRes.error) {
      console.warn('[discord-rewards/status] discord_xma_claims today', claimsTodayRes.error.message);
    } else {
      let sum = 0;
      for (const row of claimsTodayRes.data || []) {
        const n = Number(row.amount_xma);
        if (Number.isFinite(n)) sum += n;
      }
      claimedXmaToday = String(sum);
    }

    return res.json({
      ...publicRewardsMetaPayload(),
      unclaimedXma: unclaimedStr,
      claimedXmaToday,
      claimThresholdXma: claimThresholdXma(),
      messages24h,
      reactions24h,
      voiceMinutes24h: Math.round(voiceMinutes * 100) / 100,
      linkedWallets,
      rewardsTreasuryConfigured: !!(process.env.XMA_REWARDS_TREASURY_KEY || process.env.DISCORD_XMA_REWARDS_WALLET_KEY),
    });
  } catch (e) {
    console.error('discord-rewards status', e);
    return res.status(500).json({ error: 'Failed to load rewards status' });
  }
}

async function handleClaim(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const discord = req.session && req.session.discord;
  if (!discord || !discord.id) {
    return res.status(401).json({ error: 'Discord login required' });
  }
  const gid = guildId();
  if (!gid) {
    return res.status(503).json({ error: 'DISCORD_GUILD_ID not configured' });
  }
  const walletAddress = (req.body && String(req.body.walletAddress || '').trim()) || '';
  if (!walletAddress) {
    return res.status(400).json({ error: 'walletAddress required' });
  }
  try {
    new PublicKey(walletAddress);
  } catch (_) {
    return res.status(400).json({ error: 'Invalid wallet address' });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  const uid = String(discord.id);
  const threshold = claimThresholdXma();
  const dec = tokenDecimals();
  const mintPk = new PublicKey(tokenMintStr());

  const { data: linkRow } = await supabase
    .from('discord_wallet_links')
    .select('wallet_address')
    .eq('discord_user_id', uid)
    .eq('wallet_address', walletAddress)
    .maybeSingle();
  if (!linkRow) {
    return res.status(403).json({ error: 'Wallet is not linked to your Discord account' });
  }

  const { data: rewardRow, error: rewErr } = await supabase
    .from('discord_xma_rewards')
    .select('unclaimed_xma')
    .eq('discord_user_id', uid)
    .eq('guild_id', gid)
    .maybeSingle();
  if (rewErr) {
    console.error('claim select rewards', rewErr);
    return res.status(500).json({ error: 'Database error' });
  }
  const unclaimedStr =
    rewardRow && rewardRow.unclaimed_xma != null ? String(rewardRow.unclaimed_xma) : '0';
  const unclaimedNum = Number(unclaimedStr);
  if (!Number.isFinite(unclaimedNum) || unclaimedNum < threshold) {
    return res.status(400).json({
      error: 'Unclaimed balance below claim threshold',
      unclaimedXma: unclaimedStr,
      claimThresholdXma: threshold,
    });
  }

  const transferRaw = xmaToRawUnits(unclaimedStr, dec);
  if (transferRaw <= 0n) {
    return res.status(400).json({ error: 'Nothing to claim' });
  }

  const kpRes = loadTreasuryKeypair();
  if (kpRes.error) {
    return res.status(503).json({ error: kpRes.error });
  }
  const treasuryKp = kpRes.keypair;
  const userPk = new PublicKey(walletAddress);
  const connection = new Connection(rpcUrl(), 'confirmed');

  let userAta;
  let treasuryAta;
  try {
    [userAta, treasuryAta] = await Promise.all([
      getAssociatedTokenAddress(mintPk, userPk),
      getAssociatedTokenAddress(mintPk, treasuryKp.publicKey),
    ]);
  } catch (e) {
    return res.status(500).json({ error: 'Token account resolution failed: ' + (e.message || '') });
  }

  let userAtaExists = false;
  try {
    await getAccount(connection, userAta);
    userAtaExists = true;
  } catch (_) {}

  try {
    const ta = await getAccount(connection, treasuryAta);
    if (BigInt(ta.amount.toString()) < transferRaw) {
      return res.status(503).json({ error: 'Rewards treasury has insufficient XMA balance' });
    }
  } catch (e) {
    return res.status(503).json({ error: 'Treasury token account missing or unreadable' });
  }

  const tx = new Transaction();
  if (!userAtaExists) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        treasuryKp.publicKey,
        userAta,
        userPk,
        mintPk
      )
    );
  }
  tx.add(
    createTransferInstruction(
      treasuryAta,
      userAta,
      treasuryKp.publicKey,
      transferRaw
    )
  );

  let signature;
  try {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = treasuryKp.publicKey;
    tx.sign(treasuryKp);
    signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed'
    );
  } catch (e) {
    console.error('claim send tx', e);
    return res.status(502).json({ error: 'Transfer failed: ' + (e.message || String(e)) });
  }

  const { error: upErr } = await supabase
    .from('discord_xma_rewards')
    .update({
      unclaimed_xma: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('discord_user_id', uid)
    .eq('guild_id', gid);

  if (upErr) {
    console.error('claim zero balance failed after tx', upErr, signature);
    return res.status(500).json({
      error: 'Payment sent but failed to update balance — contact support',
      signature,
    });
  }

  await supabase.from('discord_xma_claims').insert({
    discord_user_id: uid,
    guild_id: gid,
    wallet_address: walletAddress,
    amount_xma: unclaimedStr,
    tx_signature: signature,
  });

  return res.json({
    ok: true,
    signature,
    claimedXma: unclaimedStr,
    walletAddress,
  });
}

module.exports = {
  handleStatus,
  handleClaim,
  handlePublicMeta,
  claimThresholdXma,
};
