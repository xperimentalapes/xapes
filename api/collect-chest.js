const { applyCors, getSupabase, parseWallet } = require('../lib/casino/http');
const { prepareChestCollect } = require('../lib/casino/secure-chest-collect');

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const body = req.body || {};
    const userWallet = parseWallet(body, 'userWallet');
    const { prizeType, mint, tokenMint, amount, decimals, reservationId } = body;
    if (prizeType !== 'nft' && prizeType !== 'token') {
      return res.status(400).json({ error: 'prizeType must be nft or token' });
    }

    const result = await prepareChestCollect({
      req,
      supabase,
      userWallet,
      prizeType,
      mint,
      tokenMint,
      amount,
      decimals,
      reservationId,
    });

    return res.status(200).json(result);
  } catch (err) {
    const status = err.status || 400;
    return res.status(status).json({ error: err.message || 'Collect failed' });
  }
};
