/**
 * Convert a base58 private key to JSON array format for Vercel env vars.
 * Usage: node scripts/base58-to-json-key.js "YOUR_BASE58_KEY"
 * Or:    echo "YOUR_BASE58_KEY" | node scripts/base58-to-json-key.js
 *
 * Copy the output and set TREASURY_PRIVATE_KEY (or XMA_REWARDS_TREASURY_KEY) in Vercel.
 */
const bs58 = require('bs58');

const input = process.argv[2] || require('fs').readFileSync(0, 'utf8').trim();
if (!input) {
  console.error('Usage: node scripts/base58-to-json-key.js "BASE58_PRIVATE_KEY"');
  process.exit(1);
}

try {
  const decoded = bs58.decode(input);
  if (decoded.length !== 64) {
    console.error('Error: decoded length is', decoded.length, '(expected 64)');
    process.exit(1);
  }
  const arr = Array.from(decoded);
  const json = JSON.stringify(arr);
  console.log('Paste this as your env value in Vercel (no quotes around it):');
  console.log(json);
} catch (e) {
  console.error('Invalid base58:', e.message);
  process.exit(1);
}
