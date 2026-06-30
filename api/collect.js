const { applyCors, getSupabase, parseWallet } = require('../lib/casino/http');
const { prepareSignedCollect } = require('../lib/casino/secure-collect');
const { TOKEN_DECIMALS } = require('../lib/casino/constants');

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const body = req.body || {};
    const walletAddress = parseWallet(body, 'userWallet');
    const gameType = body.gameType === 'roulette' ? 'roulette' : 'slots';
    const playersTable = gameType === 'roulette' ? 'roulette_players' : 'slots_players';

    if (gameType === 'roulette') {
      const { data: player } = await supabase
        .from('roulette_players')
        .select('chips_balance, cost_per_chip, unclaimed_rewards')
        .eq('wallet_address', walletAddress)
        .single();
      const chips = Number(player?.chips_balance || 0);
      const costPerChip = Number(player?.cost_per_chip || 0);
      if (chips > 0 && costPerChip > 0) {
        const chipValueRaw = BigInt(Math.floor(chips * costPerChip * Math.pow(10, TOKEN_DECIMALS)));
        const newUnclaimed = BigInt(player.unclaimed_rewards || 0) + chipValueRaw;
        const { data: cashed } = await supabase
          .from('roulette_players')
          .update({
            chips_balance: 0,
            unclaimed_rewards: newUnclaimed.toString(),
            updated_at: new Date().toISOString(),
          })
          .eq('wallet_address', walletAddress)
          .eq('chips_balance', chips)
          .select('wallet_address')
          .maybeSingle();
        if (!cashed) {
          return res.status(409).json({ error: 'Could not cash chips — refresh and try again' });
        }
      }
    }

    const result = await prepareSignedCollect({
      req,
      walletAddress,
      gameType,
      supabase,
      playersTable,
      rewardsField: 'unclaimed_rewards',
    });

    return res.status(200).json(result);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Collect failed' });
  }
};
