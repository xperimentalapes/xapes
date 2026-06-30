const { applyCors, getSupabase, parseWallet } = require('../http');
const { verifyCasinoAuth } = require('../wallet-auth');
const { recordVerifiedPurchase } = require('../record-purchase');

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const body = req.body || {};
    const walletAddress = parseWallet(body);
    const gameType = String(body.gameType || '').trim();
    if (!['slots', 'roulette', 'coinflip'].includes(gameType)) {
      return res.status(400).json({ error: 'gameType must be slots, roulette, or coinflip' });
    }
    verifyCasinoAuth(req, `purchase-${gameType}`, walletAddress);

    const txSignature = body.txSignature;
    const creditsGranted =
      gameType === 'roulette'
        ? body.chipsPurchased ?? body.numChips
        : gameType === 'coinflip'
          ? body.numFlips
          : body.spinsPurchased ?? body.numSpins;
    const costPerUnit =
      gameType === 'roulette'
        ? body.costPerChip
        : gameType === 'coinflip'
          ? body.costPerFlip
          : body.costPerSpin ?? body.spinCost;

    const result = await recordVerifiedPurchase({
      supabase,
      walletAddress,
      gameType,
      txSignature,
      creditsGranted,
      costPerUnit,
    });

    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Purchase verification failed' });
  }
};
