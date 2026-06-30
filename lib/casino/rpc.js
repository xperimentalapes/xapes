const { Connection } = require('@solana/web3.js');

function heliusRpcUrl() {
  const u = process.env.HELIUS_RPC_URL;
  if (u && String(u).trim()) return String(u).trim();
  const k = process.env.HELIUS_API_KEY;
  if (k) return 'https://mainnet.helius-rpc.com/?api-key=' + encodeURIComponent(k);
  return 'https://api.mainnet-beta.solana.com';
}

function getConnection() {
  return new Connection(heliusRpcUrl(), 'confirmed');
}

module.exports = { heliusRpcUrl, getConnection };
