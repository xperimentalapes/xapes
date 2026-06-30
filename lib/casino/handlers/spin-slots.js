const { applyCors, getSupabase, parseWallet } = require('../http');
const { verifyCasinoAuth } = require('../wallet-auth');
const { spinReels, calculateWinAmount } = require('../slots-engine');
const { TOKEN_DECIMALS } = require('../constants');
const { enforceRateLimit } = require('../rate-limit');

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const walletAddress = parseWallet(req.body);
    verifyCasinoAuth(req, 'spin-slots', walletAddress);
    enforceRateLimit(walletAddress, 'spin-slots', 60);

    const { data: player, error: fetchErr } = await supabase
      .from('slots_players')
      .select('spins_remaining, cost_per_spin, total_spins, total_wagered, total_won, unclaimed_rewards')
      .eq('wallet_address', walletAddress)
      .single();

    if (fetchErr || !player) {
      return res.status(400).json({ error: 'No spins available. Purchase spins first.' });
    }

    const spinsRemaining = Number(player.spins_remaining || 0);
    if (spinsRemaining < 1) {
      return res.status(400).json({ error: 'No spins remaining' });
    }

    const costPerSpin = Number(player.cost_per_spin || 100);
    const { positions, symbols } = spinReels();
    const wonAmount = calculateWinAmount(symbols, costPerSpin);
    const wonRaw = BigInt(Math.floor(wonAmount * Math.pow(10, TOKEN_DECIMALS)));
    const wagerRaw = BigInt(Math.floor(costPerSpin * Math.pow(10, TOKEN_DECIMALS)));
    const newSpinsRemaining = spinsRemaining - 1;
    const newUnclaimed = BigInt(player.unclaimed_rewards || 0) + wonRaw;
    const newTotalWagered = BigInt(player.total_wagered || 0) + wagerRaw;
    const newTotalWon = BigInt(player.total_won || 0) + wonRaw;

    const { data: updated, error: updateErr } = await supabase
      .from('slots_players')
      .update({
        spins_remaining: newSpinsRemaining,
        total_spins: (player.total_spins || 0) + 1,
        total_wagered: newTotalWagered.toString(),
        total_won: newTotalWon.toString(),
        unclaimed_rewards: newUnclaimed.toString(),
        cost_per_spin: newSpinsRemaining > 0 ? Math.floor(costPerSpin) : null,
        updated_at: new Date().toISOString(),
      })
      .eq('wallet_address', walletAddress)
      .eq('spins_remaining', spinsRemaining)
      .select('wallet_address')
      .maybeSingle();

    if (updateErr || !updated) {
      return res.status(409).json({ error: 'Spin conflict — please try again' });
    }

    await supabase.from('slots_game_history').insert({
      wallet_address: walletAddress,
      spin_cost: wagerRaw.toString(),
      result_symbols: symbols,
      won_amount: wonRaw.toString(),
      timestamp: new Date().toISOString(),
    });

    const unclaimedXma = Number(newUnclaimed) / Math.pow(10, TOKEN_DECIMALS);
    return res.status(200).json({
      ok: true,
      positions,
      symbols,
      wonAmount,
      spinsRemaining: newSpinsRemaining,
      unclaimedRewards: unclaimedXma,
      costPerSpin,
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Spin failed' });
  }
};
