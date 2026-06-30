const { PublicKey, Transaction, Keypair } = require('@solana/web3.js');
const {
  getAssociatedTokenAddress,
  createTransferInstruction,
  getAccount,
  createAssociatedTokenAccountInstruction,
} = require('@solana/spl-token');
const { getConnection } = require('./rpc');
const {
  TOKEN_DECIMALS,
  XMA_TOKEN_MINT,
  SLOTS_TREASURY_WALLET,
  MAX_WIN_AMOUNT_XMA,
} = require('./constants');
const { verifyCasinoAuth } = require('./wallet-auth');

const rateLimitMap = new Map();
const MAX_REQUESTS_PER_MINUTE = 10;

function checkRateLimit(walletAddress) {
  const now = Date.now();
  const requests = (rateLimitMap.get(walletAddress) || []).filter((t) => now - t < 60000);
  if (requests.length >= MAX_REQUESTS_PER_MINUTE) return false;
  requests.push(now);
  rateLimitMap.set(walletAddress, requests);
  return true;
}

function parseTreasuryKeypair() {
  const treasuryPrivateKey = process.env.TREASURY_PRIVATE_KEY;
  if (!treasuryPrivateKey) throw new Error('TREASURY_PRIVATE_KEY not set');
  if (treasuryPrivateKey.startsWith('[')) {
    const arr = JSON.parse(treasuryPrivateKey);
    if (!Array.isArray(arr) || arr.length !== 64) throw new Error('Invalid treasury key');
    return Keypair.fromSecretKey(Uint8Array.from(arr));
  }
  const bs58 = require('bs58');
  const decoded = bs58.decode(treasuryPrivateKey);
  if (decoded.length !== 64) throw new Error('Invalid treasury key');
  return Keypair.fromSecretKey(decoded);
}

async function verifyPayoutTransaction(signature, userWallet, expectedAmountRaw) {
  const connection = getConnection();
  const tx = await connection.getParsedTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
  if (!tx || !tx.meta || tx.meta.err) throw new Error('Transaction not found or failed');

  const tokenMint = new PublicKey(XMA_TOKEN_MINT);
  const userPubkey = new PublicKey(userWallet);
  const treasuryPubkey = new PublicKey(SLOTS_TREASURY_WALLET);
  const userAta = (await getAssociatedTokenAddress(tokenMint, userPubkey)).toString();
  const treasuryAta = (await getAssociatedTokenAddress(tokenMint, treasuryPubkey)).toString();
  const expected = BigInt(expectedAmountRaw);

  let transferred = 0n;
  for (const ix of tx.transaction?.message?.instructions || []) {
    const p = ix.parsed;
    if (!p || p.type !== 'transfer') continue;
    const info = p.info || {};
    const amountStr = typeof info.amount === 'string' ? info.amount : info.amount?.amount;
    const amt = amountStr ? BigInt(amountStr) : 0n;
    const src = String(info.source || '');
    const dst = String(info.destination || '');
    if (src === treasuryAta && dst === userAta) transferred += amt;
  }
  if (transferred !== expected) {
    throw new Error('Payout transaction amount mismatch');
  }
  return true;
}

/**
 * Debit rewards in DB before signing treasury payout (prevents parallel double-collect).
 * @param {object} opts
 * @param {import('express').Request} opts.req
 * @param {string} opts.walletAddress
 * @param {string} opts.gameType slots|roulette|coinflip
 * @param {object} opts.supabase
 * @param {string} opts.playersTable
 * @param {string} opts.rewardsField unclaimed_rewards | total_won
 */
async function prepareSignedCollect({
  req,
  walletAddress,
  gameType,
  supabase,
  playersTable,
  rewardsField,
}) {
  verifyCasinoAuth(req, 'collect', walletAddress);
  if (!checkRateLimit(walletAddress)) {
    const err = new Error('Too many requests. Please wait before trying again.');
    err.status = 429;
    throw err;
  }

  const { data: player, error: fetchErr } = await supabase
    .from(playersTable)
    .select(rewardsField)
    .eq('wallet_address', walletAddress)
    .single();

  if (fetchErr || !player) {
    const err = new Error('Player not found');
    err.status = 400;
    throw err;
  }

  const amountRaw = BigInt(player[rewardsField] || 0);
  const amount = Number(amountRaw) / Math.pow(10, TOKEN_DECIMALS);
  if (amount <= 0) {
    const err = new Error('No rewards to collect');
    err.status = 400;
    throw err;
  }
  if (amount > MAX_WIN_AMOUNT_XMA) {
    const err = new Error(`Amount exceeds maximum of ${MAX_WIN_AMOUNT_XMA.toLocaleString()} XMA`);
    err.status = 400;
    throw err;
  }

  const { data: debited, error: debitErr } = await supabase
    .from(playersTable)
    .update({ [rewardsField]: '0', updated_at: new Date().toISOString() })
    .eq('wallet_address', walletAddress)
    .eq(rewardsField, amountRaw.toString())
    .select('wallet_address')
    .maybeSingle();

  if (debitErr || !debited) {
    const err = new Error('Rewards already collected or changed — refresh and try again');
    err.status = 409;
    throw err;
  }

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { data: payoutRow, error: payoutErr } = await supabase
    .from('casino_pending_payouts')
    .insert({
      wallet_address: walletAddress,
      game_type: gameType,
      amount_raw: amountRaw.toString(),
      status: 'signed',
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  if (payoutErr) {
    await supabase
      .from(playersTable)
      .update({ [rewardsField]: amountRaw.toString(), updated_at: new Date().toISOString() })
      .eq('wallet_address', walletAddress);
    throw payoutErr;
  }

  try {
    const treasuryKeypair = parseTreasuryKeypair();
    if (treasuryKeypair.publicKey.toString() !== SLOTS_TREASURY_WALLET) {
      throw new Error('Treasury key mismatch');
    }

    const connection = getConnection();
    const tokenMint = new PublicKey(XMA_TOKEN_MINT);
    const userPublicKey = new PublicKey(walletAddress);
    const treasuryPublicKey = treasuryKeypair.publicKey;
    const userTokenAccount = await getAssociatedTokenAddress(tokenMint, userPublicKey);
    const treasuryTokenAccount = await getAssociatedTokenAddress(tokenMint, treasuryPublicKey);

    let userAccountExists = false;
    try {
      await getAccount(connection, userTokenAccount);
      userAccountExists = true;
    } catch (_) {}

    const treasuryAccountInfo = await getAccount(connection, treasuryTokenAccount);
    if (BigInt(treasuryAccountInfo.amount.toString()) < amountRaw) {
      throw new Error('Insufficient treasury balance');
    }

    const transaction = new Transaction();
    if (!userAccountExists) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          treasuryPublicKey,
          userTokenAccount,
          userPublicKey,
          tokenMint
        )
      );
    }
    transaction.add(
      createTransferInstruction(
        treasuryTokenAccount,
        userTokenAccount,
        treasuryPublicKey,
        amountRaw
      )
    );
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = treasuryPublicKey;
    transaction.sign(treasuryKeypair);

    const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
    return {
      transaction: serialized.toString('base64'),
      actualAmount: amount,
      payoutId: payoutRow.id,
      amountRaw: amountRaw.toString(),
    };
  } catch (signErr) {
    await supabase
      .from(playersTable)
      .update({ [rewardsField]: amountRaw.toString(), updated_at: new Date().toISOString() })
      .eq('wallet_address', walletAddress);
    await supabase
      .from('casino_pending_payouts')
      .update({ status: 'failed' })
      .eq('id', payoutRow.id);
    throw signErr;
  }
}

async function confirmCollect({
  supabase,
  walletAddress,
  signature,
  payoutId,
  amountRaw,
  gameType,
}) {
  await verifyPayoutTransaction(signature, walletAddress, amountRaw);

  const { data: payout, error: payoutErr } = await supabase
    .from('casino_pending_payouts')
    .select('id, status, amount_raw, wallet_address, game_type')
    .eq('id', payoutId)
    .single();

  if (payoutErr || !payout) throw new Error('Payout record not found');
  if (payout.wallet_address !== walletAddress) throw new Error('Payout wallet mismatch');
  if (payout.game_type !== gameType) throw new Error('Payout game mismatch');
  if (payout.amount_raw !== amountRaw) throw new Error('Payout amount mismatch');
  if (payout.status === 'confirmed') return { ok: true, alreadyConfirmed: true };

  const { error: updateErr } = await supabase
    .from('casino_pending_payouts')
    .update({ status: 'confirmed', tx_signature: signature })
    .eq('id', payoutId)
    .eq('status', 'signed');

  if (updateErr) throw updateErr;
  return { ok: true };
}

async function restoreFailedPayout({
  supabase,
  payoutId,
  walletAddress,
  playersTable,
  rewardsField,
  failSignature,
}) {
  const { data: payout } = await supabase
    .from('casino_pending_payouts')
    .select('*')
    .eq('id', payoutId)
    .single();
  if (!payout || payout.status !== 'signed') {
    throw new Error('Payout is not eligible for restore');
  }
  if (payout.wallet_address !== walletAddress) {
    throw new Error('Payout wallet mismatch');
  }

  if (failSignature) {
    const connection = getConnection();
    const status = await connection.getSignatureStatus(failSignature);
    if (status?.value && !status.value.err) {
      await confirmCollect({
        supabase,
        walletAddress,
        signature: failSignature,
        payoutId,
        amountRaw: payout.amount_raw,
        gameType: payout.game_type,
      });
      throw new Error('Transaction succeeded on-chain');
    }
  } else if (payout.expires_at && new Date(payout.expires_at) > new Date()) {
    throw new Error('Payout still pending. Retry broadcast or pass failed transaction signature.');
  }

  const { data: player } = await supabase
    .from(playersTable)
    .select(rewardsField)
    .eq('wallet_address', payout.wallet_address)
    .single();

  const current = BigInt(player?.[rewardsField] || 0);
  const restore = current + BigInt(payout.amount_raw);
  const { error: restoreErr } = await supabase
    .from(playersTable)
    .update({ [rewardsField]: restore.toString(), updated_at: new Date().toISOString() })
    .eq('wallet_address', payout.wallet_address);
  if (restoreErr) throw restoreErr;

  await supabase
    .from('casino_pending_payouts')
    .update({ status: 'restored' })
    .eq('id', payoutId)
    .eq('status', 'signed');
}

module.exports = {
  prepareSignedCollect,
  confirmCollect,
  restoreFailedPayout,
  verifyPayoutTransaction,
};
