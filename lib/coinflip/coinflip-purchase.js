// POST /api/coinflip-purchase — verify on-chain XMA transfer, then credit flips
const { applyCors, getSupabase, parseWallet } = require('../casino/http');
const { verifyCasinoAuth } = require('../casino/wallet-auth');
const { recordVerifiedPurchase } = require('../casino/record-purchase');

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const body = req.body || {};
    const walletAddress = parseWallet(body);
    verifyCasinoAuth(req, 'purchase-coinflip', walletAddress);

    const result = await recordVerifiedPurchase({
      supabase,
      walletAddress,
      gameType: 'coinflip',
      txSignature: body.txSignature,
      creditsGranted: body.numFlips,
      costPerUnit: body.costPerFlip,
    });

    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Purchase failed' });
  }
};
