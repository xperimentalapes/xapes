// Script to convert Solana private key to JSON array format for Vercel environment variable
// Usage: node get-treasury-key.js <base58-private-key>

const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');

// Get private key from command line argument
const privateKeyBase58 = process.argv[2];

if (!privateKeyBase58) {
    console.error('Usage: node get-treasury-key.js <base58-private-key>');
    console.error('');
    console.error('Example:');
    console.error('  node get-treasury-key.js 5J7s8k9...');
    process.exit(1);
}

try {
    // Decode base58 private key
    const secretKey = bs58.decode(privateKeyBase58);
    
    // Create keypair to verify it's valid
    const keypair = Keypair.fromSecretKey(secretKey);
    
    // Convert to JSON array format
    const jsonArray = JSON.stringify(Array.from(secretKey));
    
    console.log('\n✅ Private key converted successfully!');
    console.log('\nPublic Key:', keypair.publicKey.toString());
    console.log('\nEnvironment Variable Value:');
    console.log(jsonArray);
    console.log('\n📋 Copy the JSON array above and paste it as the value for TREASURY_PRIVATE_KEY in Vercel');
    console.log('');
    
} catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nMake sure you have:');
    console.error('1. Installed dependencies: npm install');
    console.error('2. Provided a valid base58 private key');
    process.exit(1);
}
