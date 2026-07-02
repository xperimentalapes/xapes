// GET /api/holder/aggregated-holdings — session Discord; sum holdings across linked wallets
const { createClient } = require('@supabase/supabase-js');
const { getAggregatedHoldingsForWallets } = require('./aggregated-holdings');

function corsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && ['https://xapes.vercel.app', 'http://localhost:8000', 'http://localhost:3000'].includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

module.exports = async function holderAggregatedHoldings(req, res) {
  corsHeaders(req, res);
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const discord = req.session && req.session.discord;
  if (!discord || !discord.id) {
    return res.status(401).json({ error: 'Discord login required' });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  const { data: links, error } = await supabase
    .from('discord_wallet_links')
    .select('wallet_address')
    .eq('discord_user_id', String(discord.id));

  if (error) {
    console.error('aggregated-holdings links', error);
    return res.status(500).json({ error: 'Failed to load linked wallets' });
  }

  const linkedWallets = (links || []).map((r) => r.wallet_address).filter(Boolean);
  const holdings = await getAggregatedHoldingsForWallets(linkedWallets);

  return res.json({
    linkedWallets,
    ...holdings,
  });
};
