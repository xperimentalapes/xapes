const { PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress } = require('@solana/spl-token');
const { getConnection } = require('./rpc');

async function verifyTransferFromTreasury({
  txSignature,
  userWallet,
  treasuryWallet,
  mintAddress,
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
  const mintPubkey = new PublicKey(mintAddress);
  const userAta = (await getAssociatedTokenAddress(mintPubkey, userPubkey)).toString();
  const treasuryAta = (await getAssociatedTokenAddress(mintPubkey, treasuryPubkey)).toString();
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
    throw new Error('Prize transfer amount mismatch');
  }
  return true;
}

module.exports = { verifyTransferFromTreasury };
