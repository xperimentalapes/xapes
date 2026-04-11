#!/usr/bin/env node
/**
 * Generate a new Solana keypair; prints public key and secret as JSON array for env vars.
 * WARNING: Creates a new wallet — only use when you intend to.
 */
const { Keypair } = require('@solana/web3.js');

const keypair = Keypair.generate();
const jsonArray = JSON.stringify(Array.from(keypair.secretKey));

console.log('\nPublic Key (address):', keypair.publicKey.toString());
console.log('\nPrivate key JSON array (save securely):');
console.log(jsonArray);
