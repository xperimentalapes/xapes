const { applyCors, getSupabase, parseWallet } = require('../lib/casino/http');

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  return res.status(410).json({
    error: 'Use POST /api/open-chest instead (server-authoritative chest open).',
  });
};
