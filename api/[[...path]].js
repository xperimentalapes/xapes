/**
 * Vercel: dashboard API catch-all. Forwards discord|verify|collections|holders|prices|blunana-ohlc
 * to the site-template Express app. Other /api/* routes are handled by specific serverless functions.
 */
const path = require('path');

// Load env from repo root so template server gets BASE_URL, DISCORD_*, etc.
const root = path.resolve(path.join(__dirname, '..'));
const envPath = path.join(root, '.env');
if (require('fs').existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

const app = require('../site-template/server');

const DASHBOARD_API = /^\/api\/(discord|verify|collections|holders|prices|blunana-ohlc)(\/|$|\?)/;

module.exports = (req, res) => {
  let raw = (req.url || req.path || '').split('?')[0];
  if (raw.startsWith('http')) {
    try {
      raw = new URL(raw).pathname;
    } catch (_) {}
  }
  if (!raw.startsWith('/')) raw = '/' + raw;

  const q = (req.url || '').includes('?') ? '?' + (req.url || '').split('?').slice(1).join('?') : '';
  if (DASHBOARD_API.test(raw)) {
    req.url = raw + q;
    return app(req, res);
  }

  res.status(404).end();
};
