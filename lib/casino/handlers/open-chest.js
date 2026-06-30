const { PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount } = require('@solana/spl-token');
const { applyCors, getSupabase, parseWallet } = require('../http');
const { verifyCasinoAuth } = require('../wallet-auth');
const { fetchTreasuryInventory, rollChestOutcome } = require('../chest-outcome');
const { BRONZE_TREASURY_WALLET } = require('../constants');
const { enforceRateLimit } = require('../rate-limit');
const { getConnection } = require('../rpc');

async function reservePrize(supabase, userWallet, outcome) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
  const connection = getConnection();
  const treasuryPubkey = new PublicKey(BRONZE_TREASURY_WALLET);

  if (outcome.kind === 'nft') {
    const mintPubkey = new PublicKey(outcome.mint);
    const treasuryTokenAccount = await getAssociatedTokenAddress(mintPubkey, treasuryPubkey);
    try {
      const treasuryAccount = await getAccount(connection, treasuryTokenAccount);
      if (Number(treasuryAccount.amount) < 1) return null;
    } catch (_) {
      return null;
    }
    const { data: existing } = await supabase
      .from('chest_reservations')
      .select('id')
      .eq('prize_type', 'nft')
      .eq('mint', outcome.mint)
      .gt('expires_at', now.toISOString())
      .maybeSingle();
    if (existing) return null;

    const { data, error } = await supabase
      .from('chest_reservations')
      .insert({
        user_wallet: userWallet,
        prize_type: 'nft',
        mint: outcome.mint,
        amount: 1,
        decimals: 0,
        expires_at: expiresAt,
        status: 'reserved',
      })
      .select('id')
      .single();
    if (error) return null;
    return data.id;
  }

  const dec = Math.max(0, Number(outcome.decimals));
  const requestedRaw = BigInt(Math.floor(Number(outcome.amount) * Math.pow(10, dec)));
  const mintPubkey = new PublicKey(outcome.tokenMint);
  const treasuryTokenAccount = await getAssociatedTokenAddress(mintPubkey, treasuryPubkey);
  let availableRaw;
  try {
    const treasuryAccount = await getAccount(connection, treasuryTokenAccount);
    availableRaw = BigInt(treasuryAccount.amount.toString());
  } catch (_) {
    return null;
  }

  const { data: reservedRows } = await supabase
    .from('chest_reservations')
    .select('amount')
    .eq('prize_type', 'token')
    .eq('token_mint', outcome.tokenMint)
    .gt('expires_at', now.toISOString());

  let alreadyReservedRaw = 0n;
  for (const row of reservedRows || []) {
    if (row.amount != null) alreadyReservedRaw += BigInt(row.amount.toString());
  }
  if (availableRaw < alreadyReservedRaw + requestedRaw) return null;

  const { data, error } = await supabase
    .from('chest_reservations')
    .insert({
      user_wallet: userWallet,
      prize_type: 'token',
      token_mint: outcome.tokenMint,
      amount: requestedRaw.toString(),
      decimals: dec,
      expires_at: expiresAt,
      status: 'reserved',
    })
    .select('id')
    .single();
  if (error) return null;
  return data.id;
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const userWallet = parseWallet(req.body, 'userWallet');
    verifyCasinoAuth(req, 'open-chest', userWallet);
    enforceRateLimit(userWallet, 'open-chest', 10);

    const { data: row, error: fetchErr } = await supabase
      .from('chest_opens_available')
      .select('opens_remaining')
      .eq('user_wallet', userWallet)
      .single();

    if (fetchErr || !row || (row.opens_remaining || 0) < 1) {
      return res.status(400).json({ error: 'No unopened chest found. Buy a chest first.' });
    }

    const current = row.opens_remaining;
    const { data: consumed, error: consumeErr } = await supabase
      .from('chest_opens_available')
      .update({ opens_remaining: current - 1, updated_at: new Date().toISOString() })
      .eq('user_wallet', userWallet)
      .eq('opens_remaining', current)
      .select('opens_remaining')
      .maybeSingle();

    if (consumeErr || !consumed) {
      return res.status(409).json({ error: 'Could not consume chest open — try again' });
    }

    let outcome;
    try {
      const inventory = await fetchTreasuryInventory();
      outcome = rollChestOutcome(inventory);
    } catch (invErr) {
      console.error('open-chest inventory error:', invErr);
      outcome = { type: 'loss' };
    }

    let reservationId = null;
    if (outcome.type === 'win') {
      reservationId = await reservePrize(supabase, userWallet, outcome);
      if (!reservationId) outcome = { type: 'loss' };
    }

    return res.status(200).json({
      ok: true,
      opens: consumed.opens_remaining,
      outcome,
      reservationId,
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Failed to open chest' });
  }
};
