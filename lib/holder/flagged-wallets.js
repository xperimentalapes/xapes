/**
 * Wallets flagged for display / policy (stolen, compromised, etc.).
 * Shown separately on the holders table and blocked from Discord linking.
 */

const STOLEN_WALLETS = new Set([
  /** GK founder — wallet compromised (Jun 2026). */
  '5ZpbzchZ6QacUDA5hAAXGkv6bcoqVaVqBrrry511fsw5',
]);

function isStolenWallet(wallet) {
  return STOLEN_WALLETS.has(String(wallet || '').trim());
}

function getFlaggedWalletMeta(wallet) {
  const w = String(wallet || '').trim();
  if (isStolenWallet(w)) {
    return { kind: 'stolen', label: 'Stolen wallet' };
  }
  return null;
}

function assertWalletLinkable(wallet) {
  if (isStolenWallet(wallet)) {
    const err = new Error('This wallet cannot be linked to Discord.');
    err.code = 'WALLET_FLAGGED';
    throw err;
  }
}

module.exports = {
  STOLEN_WALLETS,
  isStolenWallet,
  getFlaggedWalletMeta,
  assertWalletLinkable,
};
