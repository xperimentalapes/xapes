const { applyCors, getSupabase, parseWallet } = require('../casino/http');
const { verifyCasinoAuth } = require('../casino/wallet-auth');
const { confirmCollect, restoreFailedPayout } = require('../casino/secure-collect');

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const body = req.body || {};
    const walletAddress = parseWallet(body);
    const { signature, payoutId, amountRaw, failed, failSignature } = body;

    if (failed === true && payoutId) {
      verifyCasinoAuth(req, 'collect-restore', walletAddress);
      await restoreFailedPayout({
        supabase,
        payoutId,
        walletAddress,
        playersTable: 'coinflip_players',
        rewardsField: 'total_won',
        failSignature,
      });
      return res.status(200).json({ ok: true, restored: true });
    }

    if (!signature || !payoutId || !amountRaw) {
      return res.status(400).json({ error: 'signature, payoutId, and amountRaw required' });
    }

    verifyCasinoAuth(req, 'confirm-collect', walletAddress);
    await confirmCollect({
      supabase,
      walletAddress,
      signature,
      payoutId,
      amountRaw: String(amountRaw),
      gameType: 'coinflip',
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Confirm failed' });
  }
};
