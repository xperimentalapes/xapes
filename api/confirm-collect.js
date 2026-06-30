const { applyCors, getSupabase, parseWallet } = require('../lib/casino/http');
const { confirmCollect, restoreFailedPayout } = require('../lib/casino/secure-collect');
const { TOKEN_DECIMALS } = require('../lib/casino/constants');

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const body = req.body || {};
    const walletAddress = parseWallet(body, 'userWallet');
    const { signature, payoutId, amountRaw, failed } = body;
    const gameType = body.gameType === 'roulette' ? 'roulette' : 'slots';
    const playersTable = gameType === 'roulette' ? 'roulette_players' : 'slots_players';

    if (failed === true && payoutId) {
      await restoreFailedPayout({
        supabase,
        payoutId,
        playersTable,
        rewardsField: 'unclaimed_rewards',
      });
      return res.status(200).json({ ok: true, restored: true });
    }

    if (!signature || !payoutId || !amountRaw) {
      return res.status(400).json({ error: 'signature, payoutId, and amountRaw required' });
    }

    await confirmCollect({
      supabase,
      walletAddress,
      signature,
      payoutId,
      amountRaw: String(amountRaw),
      gameType,
    });

    const amount = Number(amountRaw) / Math.pow(10, TOKEN_DECIMALS);
    return res.status(200).json({ success: true, amount });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Confirm failed' });
  }
};
