// POST /api/coinflip-collect — debit total_won then sign treasury payout
const { applyCors, getSupabase, parseWallet } = require('../casino/http');
const { prepareSignedCollect } = require('../casino/secure-collect');

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const walletAddress = parseWallet(req.body);
    const result = await prepareSignedCollect({
      req,
      walletAddress,
      gameType: 'coinflip',
      supabase,
      playersTable: 'coinflip_players',
      rewardsField: 'total_won',
    });
    return res.status(200).json(result);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Collect failed' });
  }
};
