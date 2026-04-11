#!/usr/bin/env node
/**
 * Convert a Solana private key (base58) to JSON array format for env vars (e.g. Vercel).
 * Usage: node scripts/solana-keypair-from-base58.js <base58-private-key>
 */
const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');

const privateKeyBase58 = process.argv[2];

if (!privateKeyBase58) {
  console.error('Usage: node scripts/solana-keypair-from-base58.js <base58-private-key>');
  process.exit(1);
}

try {
  const secretKey = bs58.decode(privateKeyBase58);
  const keypair = Keypair.fromSecretKey(secretKey);
  const jsonArray = JSON.stringify(Array.from(secretKey));
  console.log('\nPublic Key:', keypair.publicKey.toString());
  console.log('\nJSON array (secret — store safely):');
  console.log(jsonArray);
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
