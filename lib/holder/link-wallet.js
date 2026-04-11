// POST /api/holder/link-wallet — session Discord + body.walletAddress; upsert link; stamp nfts.discord_user_id
const { PublicKey } = require('@solana/web3.js');
const { createClient } = require('@supabase/supabase-js');

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

module.exports = async function holderLinkWallet(req, res) {
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

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  const discordUserId = String(discord.id);
  const displayName =
    (discord.global_name && String(discord.global_name).trim()) ||
    (discord.username && String(discord.username).trim()) ||
    null;
  const { error: upErr } = await supabase.from('discord_wallet_links').upsert(
    {
      discord_user_id: discordUserId,
      wallet_address: walletAddress,
      discord_display_name: displayName,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'wallet_address' }
  );
  if (upErr) {
    console.error('holder link-wallet upsert', upErr);
    return res.status(500).json({ error: 'Failed to save wallet link' });
  }

  const { error: nftErr } = await supabase
    .from('nfts')
    .update({ discord_user_id: discordUserId, updated_at: new Date().toISOString() })
    .eq('owner_wallet', walletAddress);

  if (nftErr) {
    console.warn('holder link-wallet nfts update', nftErr.message);
  }

  return res.json({ ok: true, discordUserId, walletAddress });
};
