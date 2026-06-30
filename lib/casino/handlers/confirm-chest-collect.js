const { applyCors, getSupabase, parseWallet } = require('../http');
const { verifyCasinoAuth } = require('../wallet-auth');
const {
  confirmChestCollect,
  restoreChestReservation,
} = require('../secure-chest-collect');

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const body = req.body || {};
    const userWallet = parseWallet(body, 'userWallet');
    const { reservationId, signature, mintAddress, amountRaw, failed } = body;

    if (failed === true && reservationId) {
      verifyCasinoAuth(req, 'collect-chest-restore', userWallet);
      await restoreChestReservation({ supabase, userWallet, reservationId });
      return res.status(200).json({ ok: true, restored: true });
    }

    if (!reservationId || !signature || !mintAddress || !amountRaw) {
      return res.status(400).json({ error: 'reservationId, signature, mintAddress, amountRaw required' });
    }

    verifyCasinoAuth(req, 'confirm-chest-collect', userWallet);
    await confirmChestCollect({
      supabase,
      userWallet,
      reservationId,
      signature,
      mintAddress,
      amountRaw: String(amountRaw),
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Confirm failed' });
  }
};
