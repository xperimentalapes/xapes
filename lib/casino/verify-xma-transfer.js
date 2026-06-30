const { PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress } = require('@solana/spl-token');
const { getConnection } = require('./rpc');
const { XMA_TOKEN_MINT } = require('./constants');

async function verifyXmaTransferToTreasury({
  txSignature,
  userWallet,
  treasuryWallet,
  expectedAmountRaw,
}) {
  const sig = String(txSignature || '').trim();
  if (!sig) throw new Error('txSignature required');

  const connection = getConnection();
  const tx = await connection.getParsedTransaction(sig, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
  if (!tx || !tx.meta || tx.meta.err) throw new Error('Transaction not found or failed');

  const userPubkey = new PublicKey(userWallet);
  const treasuryPubkey = new PublicKey(treasuryWallet);
  const mintPubkey = new PublicKey(XMA_TOKEN_MINT);
  const userAta = await getAssociatedTokenAddress(mintPubkey, userPubkey);
  const treasuryAta = await getAssociatedTokenAddress(mintPubkey, treasuryPubkey);
  const userAtaStr = userAta.toString();
  const treasuryAtaStr = treasuryAta.toString();
  const expected = BigInt(expectedAmountRaw);

  let transferred = 0n;
  const instructions = tx.transaction?.message?.instructions || [];
  for (const ix of instructions) {
    const p = ix.parsed;
    if (!p || p.type !== 'transfer') continue;
    const info = p.info || {};
    const amountStr = typeof info.amount === 'string' ? info.amount : info.amount?.amount;
    const amt = amountStr ? BigInt(amountStr) : 0n;
    const source = info.source || info.authority || '';
    const dest = info.destination || '';
    const src = typeof source === 'string' ? source : source?.toString?.() || '';
    const dst = typeof dest === 'string' ? dest : dest?.toString?.() || '';
    if (src === userAtaStr && dst === treasuryAtaStr) transferred += amt;
  }

  if (transferred !== expected) {
    throw new Error('Transaction XMA amount does not match expected purchase');
  }

  const signer = tx.transaction?.message?.accountKeys?.find((k) => k.signer)?.pubkey?.toString?.()
    || tx.transaction?.message?.accountKeys?.[0]?.pubkey?.toString?.();
  if (signer && signer !== userPubkey.toString()) {
    throw new Error('Transaction signer does not match wallet');
  }

  return { signature: sig, amountRaw: transferred };
}

module.exports = { verifyXmaTransferToTreasury };
