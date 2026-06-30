// POST /api/coinflip-flip — server-authoritative flip with wallet auth + CAS
const { applyCors, getSupabase, parseWallet } = require('../casino/http');
const { verifyCasinoAuth } = require('../casino/wallet-auth');

const TOKEN_DECIMALS = 6;
const WIN_MULTIPLIER = 1.9;

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const body = req.body || {};
    const walletAddress = parseWallet(body);
    const { prediction } = body;
    verifyCasinoAuth(req, 'coinflip-flip', walletAddress);

    if (!prediction || !['heads', 'tails'].includes(prediction)) {
      return res.status(400).json({ error: 'prediction must be heads or tails' });
    }

    const { data: player, error: fetchErr } = await supabase
      .from('coinflip_players')
      .select('flips_remaining, cost_per_flip, total_won')
      .eq('wallet_address', walletAddress)
      .single();

    if (fetchErr?.code === 'PGRST116' || !player) {
      return res.status(400).json({ error: 'No flips remaining. Purchase flips first.' });
    }

    const flipsRemaining = Number(player.flips_remaining || 0);
    if (flipsRemaining < 1) return res.status(400).json({ error: 'No flips remaining' });

    const costPerFlipLamports = BigInt(player.cost_per_flip || 0);
    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const won = result === prediction;
    const wonLamports = won
      ? BigInt(Math.floor(Number(costPerFlipLamports) * WIN_MULTIPLIER))
      : 0n;
    const newTotalWon = BigInt(player.total_won || 0) + wonLamports;
    const newFlipsRemaining = flipsRemaining - 1;

    await supabase.from('coinflip_rounds').insert({
      wallet_address: walletAddress,
      bet_amount: costPerFlipLamports.toString(),
      prediction,
      result,
      won_amount: wonLamports.toString(),
    });

    const { data: updated, error: updateErr } = await supabase
      .from('coinflip_players')
      .update({
        flips_remaining: newFlipsRemaining,
        total_won: newTotalWon.toString(),
        updated_at: new Date().toISOString(),
      })
      .eq('wallet_address', walletAddress)
      .eq('flips_remaining', flipsRemaining)
      .select('wallet_address')
      .maybeSingle();

    if (updateErr || !updated) {
      return res.status(409).json({ error: 'Flip conflict — please try again' });
    }

    return res.status(200).json({
      result,
      won,
      wonAmount: Number(wonLamports) / Math.pow(10, TOKEN_DECIMALS),
      flipsRemaining: newFlipsRemaining,
      totalWon: Number(newTotalWon) / Math.pow(10, TOKEN_DECIMALS),
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Flip failed' });
  }
};
