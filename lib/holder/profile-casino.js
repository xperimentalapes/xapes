/**
 * Per-wallet casino stats for profile modal.
 */
const { PublicKey } = require('@solana/web3.js');
const { createClient } = require('@supabase/supabase-js');

const TOKEN_DECIMALS = 6;

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function fromTokenUnits(raw) {
  return Number(raw || 0) / Math.pow(10, TOKEN_DECIMALS);
}

function emptyGame(label) {
  return {
    label,
    totalSpins: 0,
    totalWon: 0,
    totalWagered: 0,
    unclaimedRewards: 0,
    balance: 0,
    balanceLabel: '',
  };
}

/**
 * @param {string} walletAddress
 * @returns {Promise<{ games: object[] }>}
 */
async function getProfileCasinoStats(walletAddress) {
  const wallet = String(walletAddress || '').trim();
  if (!wallet) return { games: [] };
  try {
    new PublicKey(wallet);
  } catch (_) {
    return { games: [] };
  }

  const supabase = getSupabase();
  if (!supabase) {
    return {
      games: [emptyGame('Slots'), emptyGame('Roulette'), emptyGame('Coin Flip')],
      error: 'Database not configured',
    };
  }

  const [slotsRes, rouletteRes, coinflipRes, coinflipRoundsRes] = await Promise.all([
    supabase
      .from('slots_players')
      .select('total_spins, total_won, total_wagered, unclaimed_rewards, spins_remaining')
      .eq('wallet_address', wallet)
      .maybeSingle(),
    supabase
      .from('roulette_players')
      .select('total_spins, total_won, total_wagered, unclaimed_rewards, chips_balance')
      .eq('wallet_address', wallet)
      .maybeSingle(),
    supabase
      .from('coinflip_players')
      .select('total_won, total_wagered, flips_remaining')
      .eq('wallet_address', wallet)
      .maybeSingle(),
    supabase.from('coinflip_rounds').select('id', { count: 'exact', head: true }).eq('wallet_address', wallet),
  ]);

  const slots = slotsRes.data;
  const roulette = rouletteRes.data;
  const coinflip = coinflipRes.data;
  const coinflipFlips = coinflipRoundsRes.count || 0;

  const games = [
    {
      label: 'Slots',
      totalSpins: slots ? Number(slots.total_spins || 0) : 0,
      totalWon: slots ? fromTokenUnits(slots.total_won) : 0,
      totalWagered: slots ? fromTokenUnits(slots.total_wagered) : 0,
      unclaimedRewards: slots ? fromTokenUnits(slots.unclaimed_rewards) : 0,
      balance: slots ? Number(slots.spins_remaining || 0) : 0,
      balanceLabel: 'Spins left',
    },
    {
      label: 'Roulette',
      totalSpins: roulette ? Number(roulette.total_spins || 0) : 0,
      totalWon: roulette ? fromTokenUnits(roulette.total_won) : 0,
      totalWagered: roulette ? fromTokenUnits(roulette.total_wagered) : 0,
      unclaimedRewards: roulette ? fromTokenUnits(roulette.unclaimed_rewards) : 0,
      balance: roulette ? Number(roulette.chips_balance || 0) : 0,
      balanceLabel: 'Chips',
    },
    {
      label: 'Coin Flip',
      totalSpins: coinflipFlips,
      totalWon: coinflip ? fromTokenUnits(coinflip.total_won) : 0,
      totalWagered: coinflip ? fromTokenUnits(coinflip.total_wagered) : 0,
      unclaimedRewards: 0,
      balance: coinflip ? Number(coinflip.flips_remaining || 0) : 0,
      balanceLabel: 'Flips left',
    },
  ];

  return { games };
}

module.exports = { getProfileCasinoStats };
