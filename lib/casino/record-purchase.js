const {
  TOKEN_DECIMALS,
  SLOTS_TREASURY_WALLET,
  MAX_COST_PER_SPIN,
  MAX_SPINS_PER_PURCHASE,
  MAX_COST_PER_CHIP,
  MAX_CHIPS_PER_PURCHASE,
} = require('./constants');
const { verifyXmaTransferToTreasury } = require('./verify-xma-transfer');

async function recordVerifiedPurchase({
  supabase,
  walletAddress,
  gameType,
  txSignature,
  creditsGranted,
  costPerUnit,
}) {
  const sig = String(txSignature || '').trim();
  if (!sig) throw new Error('txSignature required');
  const credits = Math.floor(Number(creditsGranted));
  const cost = Number(costPerUnit);
  if (!credits || credits <= 0) throw new Error('Invalid credits');
  if (!cost || cost <= 0) throw new Error('Invalid cost per unit');

  if (gameType === 'slots') {
    if (cost > MAX_COST_PER_SPIN) throw new Error(`Cost per spin capped at ${MAX_COST_PER_SPIN}`);
    if (credits > MAX_SPINS_PER_PURCHASE) throw new Error(`Max ${MAX_SPINS_PER_PURCHASE} spins per purchase`);
  } else if (gameType === 'roulette') {
    if (cost > MAX_COST_PER_CHIP) throw new Error(`Cost per chip capped at ${MAX_COST_PER_CHIP}`);
    if (credits > MAX_CHIPS_PER_PURCHASE) throw new Error(`Max ${MAX_CHIPS_PER_PURCHASE} chips per purchase`);
  } else if (gameType === 'coinflip') {
    if (cost > MAX_COST_PER_SPIN) throw new Error(`Cost per flip capped at ${MAX_COST_PER_SPIN}`);
    if (credits > MAX_SPINS_PER_PURCHASE) throw new Error(`Max ${MAX_SPINS_PER_PURCHASE} flips per purchase`);
  } else {
    throw new Error('Invalid gameType');
  }

  const amountRaw = BigInt(Math.floor(cost * credits * Math.pow(10, TOKEN_DECIMALS)));
  const costPerUnitRaw = BigInt(Math.floor(cost * Math.pow(10, TOKEN_DECIMALS)));

  const { data: existingTx } = await supabase
    .from('game_purchase_txs')
    .select('tx_signature')
    .eq('tx_signature', sig)
    .maybeSingle();
  if (existingTx) {
    return { ok: true, duplicate: true };
  }

  await verifyXmaTransferToTreasury({
    txSignature: sig,
    userWallet: walletAddress,
    treasuryWallet: SLOTS_TREASURY_WALLET,
    expectedAmountRaw: amountRaw,
  });

  const { error: insertTxErr } = await supabase.from('game_purchase_txs').insert({
    tx_signature: sig,
    wallet_address: walletAddress,
    game_type: gameType,
    credits_granted: credits,
    cost_per_unit_raw: costPerUnitRaw.toString(),
    amount_raw: amountRaw.toString(),
  });
  if (insertTxErr) throw insertTxErr;

  if (gameType === 'slots') {
    const { data: player } = await supabase
      .from('slots_players')
      .select('spins_remaining')
      .eq('wallet_address', walletAddress)
      .maybeSingle();
    if (player && Number(player.spins_remaining || 0) > 0) {
      throw new Error('Cannot purchase spins while spins are remaining');
    }
    const row = {
      wallet_address: walletAddress,
      spins_remaining: credits,
      cost_per_spin: Math.floor(cost),
      updated_at: new Date().toISOString(),
    };
    if (!player) {
      row.created_at = new Date().toISOString();
      row.total_spins = 0;
      row.total_wagered = '0';
      row.total_won = '0';
      row.unclaimed_rewards = '0';
    }
    const { error } = await supabase.from('slots_players').upsert(row, { onConflict: 'wallet_address' });
    if (error) throw error;
    return { ok: true, spinsRemaining: credits, costPerSpin: cost };
  }

  if (gameType === 'roulette') {
    const { data: player } = await supabase
      .from('roulette_players')
      .select('chips_balance')
      .eq('wallet_address', walletAddress)
      .maybeSingle();
    if (player && Number(player.chips_balance || 0) > 0) {
      throw new Error('Cannot buy chips while you have chips remaining');
    }
    const row = {
      wallet_address: walletAddress,
      chips_balance: credits,
      cost_per_chip: cost,
      updated_at: new Date().toISOString(),
    };
    if (!player) {
      row.created_at = new Date().toISOString();
      row.total_spins = 0;
      row.total_wagered = '0';
      row.total_won = '0';
      row.unclaimed_rewards = '0';
    }
    const { error } = await supabase.from('roulette_players').upsert(row, { onConflict: 'wallet_address' });
    if (error) throw error;
    return { ok: true, chipsBalance: credits, costPerChip: cost };
  }

  if (gameType === 'coinflip') {
    const { data: player } = await supabase
      .from('coinflip_players')
      .select('flips_remaining, total_wagered, total_won')
      .eq('wallet_address', walletAddress)
      .maybeSingle();
    if (player && Number(player.flips_remaining || 0) > 0) {
      throw new Error('Use or collect before buying more flips');
    }
    const totalWagered = (player ? BigInt(player.total_wagered || 0) : 0n) + amountRaw;
    const row = {
      wallet_address: walletAddress,
      flips_remaining: credits,
      cost_per_flip: costPerUnitRaw.toString(),
      total_wagered: totalWagered.toString(),
      total_won: player ? player.total_won || '0' : '0',
      updated_at: new Date().toISOString(),
    };
    if (!player) row.created_at = new Date().toISOString();
    const { error } = await supabase.from('coinflip_players').upsert(row, { onConflict: 'wallet_address' });
    if (error) throw error;
    return { ok: true, flipsRemaining: credits, costPerFlip: cost };
  }

  throw new Error('Unsupported gameType');
}

module.exports = { recordVerifiedPurchase };
