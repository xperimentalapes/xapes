const { PublicKey, Transaction, Keypair } = require('@solana/web3.js');
const {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
  createAssociatedTokenAccountInstruction,
} = require('@solana/spl-token');
const { getConnection } = require('./rpc');
const { BRONZE_TREASURY_WALLET } = require('./constants');
const { verifyTransferFromTreasury } = require('./verify-prize-transfer');
const { verifyCasinoAuth } = require('./wallet-auth');
const { enforceRateLimit } = require('./rate-limit');

function parseBronzeKeypair() {
  const bronzePrivateKey = process.env.BRONZE_WALLET_KEY;
  if (!bronzePrivateKey) throw new Error('BRONZE_WALLET_KEY not set');
  if (bronzePrivateKey.startsWith('[')) {
    const arr = JSON.parse(bronzePrivateKey);
    if (!Array.isArray(arr) || arr.length !== 64) throw new Error('Invalid bronze key');
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }
  const bs58 = require('bs58');
  const decoded = bs58.decode(bronzePrivateKey);
  if (decoded.length !== 64) throw new Error('Invalid bronze key');
  return Keypair.fromSecretKey(decoded);
}

async function prepareChestCollect({
  req,
  supabase,
  userWallet,
  prizeType,
  mint,
  tokenMint,
  amount,
  decimals,
  reservationId,
}) {
  verifyCasinoAuth(req, 'collect-chest', userWallet);
  enforceRateLimit(userWallet, 'collect-chest', 5);

  if (!reservationId) throw new Error('reservationId required');

  const { data: reservation, error: resErr } = await supabase
    .from('chest_reservations')
    .select('*')
    .eq('id', reservationId)
    .single();
  if (resErr || !reservation) throw new Error('Reservation not found');

  const nowIso = new Date().toISOString();
  if (reservation.user_wallet !== userWallet) throw new Error('Reservation does not belong to this wallet');
  if (reservation.expires_at <= nowIso) throw new Error('Reservation expired');
  if (reservation.prize_type !== prizeType) throw new Error('Reservation prize type mismatch');
  const status = reservation.status || 'reserved';
  if (status !== 'reserved' && status !== 'pending_collect') {
    throw new Error('Reservation is not available for collect');
  }

  let mintPubkey;
  let transferAmountRaw;
  if (prizeType === 'nft') {
    if (!mint) throw new Error('mint required for nft');
    if (reservation.mint !== mint) throw new Error('Reservation mint mismatch');
    mintPubkey = new PublicKey(mint);
    transferAmountRaw = 1n;
  } else {
    if (!tokenMint || amount == null || decimals == null) {
      throw new Error('tokenMint, amount, decimals required for token');
    }
    if (reservation.token_mint !== tokenMint) throw new Error('Reservation token mint mismatch');
    const dec = Math.max(0, Number(decimals));
    transferAmountRaw = BigInt(Math.floor(Number(amount) * Math.pow(10, dec)));
    if (transferAmountRaw <= 0n) throw new Error('Invalid token amount');
    const reservedRaw = BigInt(reservation.amount.toString());
    if (reservedRaw !== transferAmountRaw) throw new Error('Reservation amount mismatch');
    mintPubkey = new PublicKey(tokenMint);
  }

  if (status === 'reserved') {
    const { data: locked, error: lockErr } = await supabase
      .from('chest_reservations')
      .update({ status: 'pending_collect' })
      .eq('id', reservationId)
      .eq('user_wallet', userWallet)
      .eq('status', 'reserved')
      .select('id')
      .maybeSingle();
    if (lockErr || !locked) throw new Error('Reservation already being collected');
  }

  const keypair = parseBronzeKeypair();
  if (keypair.publicKey.toString() !== BRONZE_TREASURY_WALLET) {
    throw new Error('BRONZE_WALLET_KEY does not match bronze treasury address');
  }

  const connection = getConnection();
  const userPublicKey = new PublicKey(userWallet);
  const treasuryPublicKey = keypair.publicKey;
  const treasuryTokenAccount = await getAssociatedTokenAddress(mintPubkey, treasuryPublicKey);
  const userTokenAccount = await getAssociatedTokenAddress(mintPubkey, userPublicKey);

  let userAccountExists = false;
  try {
    await getAccount(connection, userTokenAccount);
    userAccountExists = true;
  } catch (_) {}

  const treasuryAccount = await getAccount(connection, treasuryTokenAccount);
  if (BigInt(treasuryAccount.amount.toString()) < transferAmountRaw) {
    await supabase.from('chest_reservations').update({ status: 'reserved' }).eq('id', reservationId);
    const err = new Error('Insufficient treasury balance');
    err.status = 503;
    throw err;
  }

  const transaction = new Transaction();
  if (!userAccountExists) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        treasuryPublicKey,
        userTokenAccount,
        userPublicKey,
        mintPubkey
      )
    );
  }
  transaction.add(
    createTransferInstruction(
      treasuryTokenAccount,
      userTokenAccount,
      treasuryPublicKey,
      transferAmountRaw
    )
  );
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = treasuryPublicKey;
  transaction.sign(keypair);

  const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
  return {
    transaction: serialized.toString('base64'),
    reservationId,
    mintAddress: mintPubkey.toString(),
    amountRaw: transferAmountRaw.toString(),
  };
}

async function confirmChestCollect({
  supabase,
  userWallet,
  reservationId,
  signature,
  mintAddress,
  amountRaw,
}) {
  await verifyTransferFromTreasury({
    txSignature: signature,
    userWallet,
    treasuryWallet: BRONZE_TREASURY_WALLET,
    mintAddress,
    expectedAmountRaw: amountRaw,
  });

  const { data: reservation } = await supabase
    .from('chest_reservations')
    .select('*')
    .eq('id', reservationId)
    .single();
  if (!reservation) throw new Error('Reservation not found');
  if (reservation.user_wallet !== userWallet) throw new Error('Reservation wallet mismatch');

  const { error: delErr } = await supabase
    .from('chest_reservations')
    .delete()
    .eq('id', reservationId)
    .eq('user_wallet', userWallet);

  if (delErr) throw delErr;
  return { ok: true };
}

async function restoreChestReservation({ supabase, userWallet, reservationId }) {
  const { data: reservation } = await supabase
    .from('chest_reservations')
    .select('*')
    .eq('id', reservationId)
    .single();
  if (!reservation || reservation.user_wallet !== userWallet) return;
  if ((reservation.status || 'reserved') !== 'pending_collect') return;

  await supabase
    .from('chest_reservations')
    .update({ status: 'reserved' })
    .eq('id', reservationId)
    .eq('user_wallet', userWallet)
    .eq('status', 'pending_collect');
}

module.exports = {
  prepareChestCollect,
  confirmChestCollect,
  restoreChestReservation,
};
