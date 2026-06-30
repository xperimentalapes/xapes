const { createClient } = require('@supabase/supabase-js');
const { ALLOWED_ORIGINS } = require('./constants');

function applyCors(req, res, methods = 'POST') {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-wallet-message, x-wallet-signature');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function parseWallet(body, field = 'walletAddress') {
  const { PublicKey } = require('@solana/web3.js');
  const wallet = String((body && body[field]) || (body && body.userWallet) || '').trim();
  if (!wallet) throw new Error('walletAddress required');
  try {
    new PublicKey(wallet);
  } catch (_) {
    throw new Error('Invalid wallet address');
  }
  return wallet;
}

module.exports = { applyCors, getSupabase, parseWallet };
