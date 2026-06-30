const { applyCors, getSupabase, parseWallet } = require('../lib/casino/http');
const { verifyCasinoAuth } = require('../lib/casino/wallet-auth');
const { verifyXmaTransferToTreasury } = require('../lib/casino/verify-xma-transfer');
const { BRONZE_TREASURY_WALLET, CHEST_PRICE_RAW } = require('../lib/casino/constants');
const { enforceRateLimit } = require('../lib/casino/rate-limit');

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const body = req.body || {};
    const userWallet = parseWallet(body, 'userWallet');
    verifyCasinoAuth(req, 'purchase-chest', userWallet);
    enforceRateLimit(userWallet, 'purchase-chest', 5);

    const sig = String(body.txSignature || '').trim();
    if (!sig) return res.status(400).json({ error: 'txSignature required' });

    const { data: existing } = await supabase
      .from('chest_purchase_txs')
      .select('tx_signature')
      .eq('tx_signature', sig)
      .maybeSingle();
    if (existing) {
      const { data: row } = await supabase
        .from('chest_opens_available')
        .select('opens_remaining')
        .eq('user_wallet', userWallet)
        .maybeSingle();
      return res.status(200).json({ ok: true, opens: (row && row.opens_remaining) || 0 });
    }

    await verifyXmaTransferToTreasury({
      txSignature: sig,
      userWallet,
      treasuryWallet: BRONZE_TREASURY_WALLET,
      expectedAmountRaw: CHEST_PRICE_RAW,
    });

    await supabase.from('chest_purchase_txs').insert({ tx_signature: sig, user_wallet: userWallet });

    const { data: current } = await supabase
      .from('chest_opens_available')
      .select('opens_remaining')
      .eq('user_wallet', userWallet)
      .maybeSingle();
    const newOpens = (current?.opens_remaining ?? 0) + 1;
    await supabase.from('chest_opens_available').upsert(
      { user_wallet: userWallet, opens_remaining: newOpens, updated_at: new Date().toISOString() },
      { onConflict: 'user_wallet' }
    );

    return res.status(200).json({ ok: true, opens: newOpens });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to record purchase' });
  }
};
