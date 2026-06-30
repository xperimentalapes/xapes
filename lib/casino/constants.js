const TOKEN_DECIMALS = 6;
const XMA_TOKEN_MINT = (
  process.env.XMA_TOKEN_MINT ||
  process.env.BLUNA_TOKEN_MINT ||
  process.env.TOKEN_MINT ||
  'HVSruatutKcgpZJXYyeRCWAnyT7mzYq1io9YoJ6F4yMP'
).trim();

const SLOTS_TREASURY_WALLET = '6auNHk39Mut82FhjY9iBZXjqm7xJabFVrY3bVgrYSMvj';
const BRONZE_TREASURY_WALLET = '9iyfxFga7a9FAkkgpgeP7PSscKEKdShihvso44GiMT4H';

const CHEST_PRICE_RAW = BigInt(700000) * BigInt(10 ** TOKEN_DECIMALS);
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
  BRONZE_TREASURY_WALLET,
  CHEST_PRICE_RAW,
  MAX_WIN_AMOUNT_XMA,
  MAX_COST_PER_SPIN,
  MAX_SPINS_PER_PURCHASE,
  MAX_CHIPS_PER_PURCHASE,
  MAX_COST_PER_CHIP,
  AUTH_MAX_AGE_SEC,
  ALLOWED_ORIGINS,
};
