// Reserve a chest prize for a user so the same NFT/token amount isn't given twice.

const { PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, getAccount } = require('@solana/spl-token');
const { applyCors, getSupabase, parseWallet } = require('../lib/casino/http');
const { verifyCasinoAuth } = require('../lib/casino/wallet-auth');
const { BRONZE_TREASURY_WALLET } = require('../lib/casino/constants');
const { getConnection } = require('../lib/casino/rpc');

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  try {
    const userWallet = parseWallet(req.body, 'userWallet');
    verifyCasinoAuth(req, 'reserve-chest', userWallet);

    const { prizeType, mint, tokenMint, amount, decimals } = req.body;
    if (prizeType !== 'nft' && prizeType !== 'token') {
      return res.status(400).json({ error: 'prizeType must be nft or token' });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
    const connection = getConnection();
    const treasuryPubkey = new PublicKey(BRONZE_TREASURY_WALLET);

    if (prizeType === 'nft') {
      if (!mint) return res.status(400).json({ error: 'mint required for nft' });
      const mintPubkey = new PublicKey(mint);
      const treasuryTokenAccount = await getAssociatedTokenAddress(mintPubkey, treasuryPubkey);
      try {
        const treasuryAccount = await getAccount(connection, treasuryTokenAccount);
        if (Number(treasuryAccount.amount) < 1) {
          return res.status(200).json({ reserved: false, error: 'NFT no longer in treasury' });
        }
      } catch (e) {
        return res.status(200).json({ reserved: false, error: 'Treasury NFT account not found' });
      }

      const { data: existing } = await supabase
        .from('chest_reservations')
        .select('id')
        .eq('prize_type', 'nft')
        .eq('mint', mint)
        .gt('expires_at', now.toISOString())
        .maybeSingle();
      if (existing) return res.status(200).json({ reserved: false, reason: 'already_reserved' });

      const { data, error } = await supabase
        .from('chest_reservations')
        .insert({
          user_wallet: userWallet,
          prize_type: 'nft',
          mint,
          amount: 1,
          decimals: 0,
          expires_at: expiresAt,
        })
        .select('id')
        .single();
      if (error) return res.status(500).json({ error: 'Failed to reserve NFT prize' });
      return res.status(200).json({ reserved: true, reservationId: data.id });
    }

    if (!tokenMint || amount == null || decimals == null) {
      return res.status(400).json({ error: 'tokenMint, amount, decimals required for token' });
    }
    const dec = Math.max(0, Number(decimals));
    const requestedRaw = BigInt(Math.floor(Number(amount) * Math.pow(10, dec)));
    if (!isFinite(Number(amount)) || requestedRaw <= 0n) {
      return res.status(400).json({ error: 'Invalid token amount' });
    }

    const mintPubkey = new PublicKey(tokenMint);
    const treasuryTokenAccount = await getAssociatedTokenAddress(mintPubkey, treasuryPubkey);
    let availableRaw;
    try {
      const treasuryAccount = await getAccount(connection, treasuryTokenAccount);
      availableRaw = BigInt(treasuryAccount.amount.toString());
    } catch (e) {
      return res.status(200).json({ reserved: false, error: 'Treasury token account not found' });
    }

    const { data: reservedRows, error: sumErr } = await supabase
      .from('chest_reservations')
      .select('amount')
      .eq('prize_type', 'token')
      .eq('token_mint', tokenMint)
      .gt('expires_at', now.toISOString());
    if (sumErr) return res.status(500).json({ error: 'Failed to check reservations' });

    let alreadyReservedRaw = 0n;
    for (const row of reservedRows || []) {
      if (row.amount != null) alreadyReservedRaw += BigInt(row.amount.toString());
    }
    if (availableRaw < alreadyReservedRaw + requestedRaw) {
      return res.status(200).json({ reserved: false, reason: 'insufficient_treasury' });
    }

    const { data, error } = await supabase
      .from('chest_reservations')
      .insert({
        user_wallet: userWallet,
        prize_type: 'token',
        token_mint: tokenMint,
        amount: requestedRaw.toString(),
        decimals: dec,
        expires_at: expiresAt,
      })
      .select('id')
      .single();
    if (error) return res.status(500).json({ error: 'Failed to reserve token prize' });
    return res.status(200).json({ reserved: true, reservationId: data.id });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Failed to reserve chest prize' });
  }
};
