// POST /api/holder-unlink-wallet — remove wallet from Discord user; re-sync roles from remaining links
const { PublicKey } = require('@solana/web3.js');
const { createClient } = require('@supabase/supabase-js');
const { reconcileDiscordUserRoles } = require('./reconcile-user-roles');

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

module.exports = async function holderUnlinkWallet(req, res) {
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

  const { data: existing, error: findErr } = await supabase
    .from('discord_wallet_links')
    .select('wallet_address')
    .eq('discord_user_id', discordUserId)
    .eq('wallet_address', walletAddress)
    .maybeSingle();

  if (findErr) {
    console.error('holder unlink-wallet find', findErr);
    return res.status(500).json({ error: 'Failed to look up wallet link' });
  }
  if (!existing) {
    return res.status(404).json({ error: 'Wallet is not linked to your Discord account' });
  }

  const { error: delErr } = await supabase
    .from('discord_wallet_links')
    .delete()
    .eq('discord_user_id', discordUserId)
    .eq('wallet_address', walletAddress);

  if (delErr) {
    console.error('holder unlink-wallet delete', delErr);
    return res.status(500).json({ error: 'Failed to unlink wallet' });
  }

  const { error: nftErr } = await supabase
    .from('nfts')
    .update({ discord_user_id: null, updated_at: new Date().toISOString() })
    .eq('owner_wallet', walletAddress)
    .eq('discord_user_id', discordUserId);

  if (nftErr) {
    console.warn('holder unlink-wallet nfts clear', nftErr.message);
  }

  const { data: remainingRows } = await supabase
    .from('discord_wallet_links')
    .select('wallet_address')
    .eq('discord_user_id', discordUserId);
  const linkedWallets = (remainingRows || []).map((r) => r.wallet_address).filter(Boolean);

  let roleSync = { rolesSynced: false, message: null };
  try {
    roleSync = await reconcileDiscordUserRoles(discordUserId);
  } catch (e) {
    console.warn('holder unlink-wallet role sync', e.message);
    roleSync = { rolesSynced: false, message: 'Wallet unlinked; role sync failed — verify again to refresh roles.' };
  }

  return res.json({
    ok: true,
    walletAddress,
    linkedWallets,
    ...roleSync,
  });
};
