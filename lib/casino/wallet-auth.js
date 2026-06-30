const nacl = require('tweetnacl');
const { PublicKey } = require('@solana/web3.js');
const { AUTH_MAX_AGE_SEC } = require('./constants');

function buildCasinoMessage(action, walletAddress, timestampSec) {
  return `XapeLabz Casino|${action}|${walletAddress}|${timestampSec}`;
}

function decodeSignature(signature) {
  if (!signature) throw new Error('signature required');
  if (typeof signature === 'string') {
    if (/^[A-Za-z0-9+/=]+$/.test(signature) && signature.length % 4 === 0) {
      return Buffer.from(signature, 'base64');
    }
    const bs58 = require('bs58');
    return Buffer.from(bs58.decode(signature));
  }
  if (signature instanceof Uint8Array) return Buffer.from(signature);
  throw new Error('Invalid signature format');
}

function verifyCasinoAuth(req, action, walletAddress) {
  const body = req.body || {};
  const message =
    String(req.headers['x-wallet-message'] || body.walletMessage || body.message || '').trim();
  const signature = req.headers['x-wallet-signature'] || body.walletSignature || body.signature;
  if (!message || !signature) {
    throw new Error('Wallet signature required (connect Phantom and approve the sign request)');
  }
  const parts = message.split('|');
  if (parts.length !== 4 || parts[0] !== 'XapeLabz Casino') {
    throw new Error('Invalid signed message format');
  }
  if (parts[1] !== action) throw new Error('Signed action mismatch');
  if (parts[2] !== walletAddress) throw new Error('Signed wallet mismatch');
  const ts = Number(parts[3]);
  if (!Number.isFinite(ts)) throw new Error('Invalid message timestamp');
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > AUTH_MAX_AGE_SEC) throw new Error('Signed message expired');

  const msgBytes = new TextEncoder().encode(message);
  const sigBytes = decodeSignature(signature);
  const pubkey = new PublicKey(walletAddress).toBytes();
  if (!nacl.sign.detached.verify(msgBytes, sigBytes, pubkey)) {
    throw new Error('Invalid wallet signature');
  }
  return true;
}

module.exports = { buildCasinoMessage, verifyCasinoAuth };
