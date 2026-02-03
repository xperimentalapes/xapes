// Script to generate a new Solana keypair and output the private key in JSON array format
// WARNING: This creates a NEW keypair. Only use if you need to create a new treasury wallet.

const { Keypair } = require('@solana/web3.js');

// Generate new keypair
const keypair = Keypair.generate();

// Convert to JSON array format
const jsonArray = JSON.stringify(Array.from(keypair.secretKey));

console.log('\n✅ New keypair generated!');
console.log('\nPublic Key (Treasury Address):', keypair.publicKey.toString());
console.log('\nPrivate Key (JSON Array for Vercel):');
console.log(jsonArray);
console.log('\n⚠️  WARNING: Save this private key securely!');
console.log('📋 Copy the JSON array above and paste it as the value for TREASURY_PRIVATE_KEY in Vercel');
console.log('📋 Update TREASURY_WALLET in api/collect.js to:', keypair.publicKey.toString());
console.log('');
