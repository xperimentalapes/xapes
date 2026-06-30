/**
 * Shared Helius JSON-RPC helper (same URL pattern as sync-nfts / casino).
 */
const axios = require('axios');

function getHeliusApiKey() {
  return (process.env.HELIUS_API_KEY || '').trim().replace(/^["']|["']$/g, '');
}

function getHeliusRpcPostUrl() {
  const custom = (process.env.HELIUS_RPC_URL || '').trim();
  const key = getHeliusApiKey();
  if (custom) {
    if (/api[-_]?key=/i.test(custom)) return custom;
    if (key) {
      const sep = custom.includes('?') ? '&' : '?';
      return custom + sep + 'api-key=' + encodeURIComponent(key);
    }
    return custom;
  }
  if (!key) return null;
  return 'https://mainnet.helius-rpc.com/?api-key=' + encodeURIComponent(key);
}

/**
 * @param {string} method
 * @param {unknown} params
 * @param {{ timeoutMs?: number }} [opts]
 */
async function heliusPost(method, params, opts) {
  const url = getHeliusRpcPostUrl();
  if (!url) throw new Error('HELIUS_API_KEY not set');
  const timeoutMs = opts?.timeoutMs ?? 60000;
  const res = await axios.post(
    url,
    { jsonrpc: '2.0', id: 'xapes', method, params },
    { timeout: timeoutMs, validateStatus: () => true }
  );
  if (res.data?.error) {
    const msg = res.data.error.message || JSON.stringify(res.data.error);
    throw new Error(msg);
  }
  return res.data?.result;
}

module.exports = {
  getHeliusApiKey,
  getHeliusRpcPostUrl,
  heliusPost,
};
