const TOKEN_DECIMALS = 6;
const XMA_TOKEN_MINT = (
  process.env.XMA_TOKEN_MINT ||
  process.env.BLUNA_TOKEN_MINT ||
  process.env.TOKEN_MINT ||
  'HVSruatutKcgpZJXYyeRCWAnyT7mzYq1io9YoJ6F4yMP'
).trim();

/** Shared XMA treasury for slots, roulette, coinflip, and Discord reward claims. */
const SLOTS_TREASURY_WALLET = '6auNHk39Mut82FhjY9iBZXjqm7xJabFVrY3bVgrYSMvj';
const CASINO_TREASURY_WALLET = SLOTS_TREASURY_WALLET;

const MAX_WIN_AMOUNT_XMA = Number(process.env.CASINO_MAX_WIN_AMOUNT_XMA || '10000000');
const MAX_COST_PER_SPIN = 1500;
const MAX_SPINS_PER_PURCHASE = 500;
const MAX_CHIPS_PER_PURCHASE = 50000;
const MAX_COST_PER_CHIP = 1000;
const AUTH_MAX_AGE_SEC = 300;

const ALLOWED_ORIGINS = [
  'https://xapes.vercel.app',
  'https://www.xapelabz.com',
  'https://xapelabz.com',
  'http://localhost:3000',
  'http://localhost:8000',
];

module.exports = {
  TOKEN_DECIMALS,
  XMA_TOKEN_MINT,
  SLOTS_TREASURY_WALLET,
  CASINO_TREASURY_WALLET,
  MAX_WIN_AMOUNT_XMA,
  MAX_COST_PER_SPIN,
  MAX_SPINS_PER_PURCHASE,
  MAX_CHIPS_PER_PURCHASE,
  MAX_COST_PER_CHIP,
  AUTH_MAX_AGE_SEC,
  ALLOWED_ORIGINS,
};
