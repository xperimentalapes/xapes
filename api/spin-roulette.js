const { applyCors, getSupabase, parseWallet } = require('../lib/casino/http');
const { verifyCasinoAuth } = require('../lib/casino/wallet-auth');
const { spinResult, calculateWinnings, validateBets } = require('../lib/casino/roulette-engine');
const { TOKEN_DECIMALS } = require('../lib/casino/constants');
const { enforceRateLimit } = require('../lib/casino/rate-limit');

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const walletAddress = parseWallet(req.body);
    verifyCasinoAuth(req, 'spin-roulette', walletAddress);
    enforceRateLimit(walletAddress, 'spin-roulette', 30);
    const { bets } = req.body || {};
    if (!bets || typeof bets !== 'object') {
      return res.status(400).json({ error: 'bets object required' });
    }

    const { data: player, error: fetchErr } = await supabase
      .from('roulette_players')
      .select('chips_balance, cost_per_chip, total_spins, total_wagered, total_won, unclaimed_rewards')
      .eq('wallet_address', walletAddress)
      .single();

    if (fetchErr || !player) {
      return res.status(400).json({ error: 'No chips available. Buy chips first.' });
    }

    const chipBalance = Number(player.chips_balance || 0);
    const costPerChip = Number(player.cost_per_chip || 1);
    validateBets(bets, chipBalance);

    let totalStaked = 0;
    for (const key of Object.keys(bets)) totalStaked += Number(bets[key] || 0);

    const result = spinResult();
    const win = calculateWinnings(result, bets);
    const newChipBalance = chipBalance - totalStaked + win.totalReturned;
    const profitRaw = BigInt(Math.floor(win.profit * costPerChip * Math.pow(10, TOKEN_DECIMALS)));
    const wagerRaw = BigInt(Math.floor(totalStaked * costPerChip * Math.pow(10, TOKEN_DECIMALS)));

    const { data: updated, error: updateErr } = await supabase
      .from('roulette_players')
      .update({
        chips_balance: Math.max(0, Math.floor(newChipBalance)),
        total_spins: (player.total_spins || 0) + 1,
        total_wagered: (BigInt(player.total_wagered || 0) + wagerRaw).toString(),
        total_won: (BigInt(player.total_won || 0) + profitRaw).toString(),
        updated_at: new Date().toISOString(),
      })
      .eq('wallet_address', walletAddress)
      .eq('chips_balance', chipBalance)
      .select('wallet_address')
      .maybeSingle();

    if (updateErr || !updated) {
      return res.status(409).json({ error: 'Spin conflict — please try again' });
    }

    await supabase.from('roulette_game_history').insert({
      wallet_address: walletAddress,
      spin_cost: wagerRaw.toString(),
      result_number: String(result),
      won_amount: profitRaw.toString(),
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json({
      ok: true,
      result,
      profit: win.profit,
      totalReturned: win.totalReturned,
      chipBalance: Math.max(0, Math.floor(newChipBalance)),
      costPerChip,
    });
  } catch (err) {
    const status = err.status || (err.message?.includes('chip') ? 400 : 500);
    return res.status(status).json({ error: err.message || 'Spin failed' });
  }
};
