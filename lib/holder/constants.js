/** XMA (Xperimental Mutant Apes) SPL token — single source of truth for holder/casino code. */
const DEFAULT_XMA_TOKEN_MINT = 'HVSruatutKcgpZJXYyeRCWAnyT7mzYq1io9YoJ6F4yMP';

function getXmaTokenMint() {
  return (
    process.env.XMA_TOKEN_MINT ||
    process.env.BLUNA_TOKEN_MINT ||
    process.env.TOKEN_MINT ||
    DEFAULT_XMA_TOKEN_MINT
  )
    .trim()
    .replace(/^["']|["']$/g, '');
}

function getXmaDecimals() {
  return parseInt(process.env.XMA_DECIMALS || process.env.BLUNA_DECIMALS || '6', 10);
}

module.exports = {
  DEFAULT_XMA_TOKEN_MINT,
  getXmaTokenMint,
  getXmaDecimals,
};
