/**
 * Vercel: dashboard API handler. Invoked via rewrites from /api/discord/*, /api/verify, etc.
 * Uses req.query.__path (set by vercel.json rewrites) and forwards to site-template Express app.
 */
const path = require('path');

const root = path.resolve(path.join(__dirname, '..'));
const envPath = path.join(root, '.env');
if (require('fs').existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

const app = require('../site-template/server');

const DASHBOARD_API = /^\/api\/(discord|verify|collections|holders|prices|blunana-ohlc|coinflip-state|coinflip-stats|coinflip-flip|coinflip-purchase|coinflip-collect|coinflip-confirm-collect)(\/|$|\?)/;

function getPathAndQuery(req) {
  const __path = req.query && req.query.__path;
  if (__path != null && typeof __path === 'string' && __path.length > 0) {
    const pathname = '/api/' + __path.replace(/^\/+/, '');
    const qs = { ...req.query };
    delete qs.__path;
    const q = Object.keys(qs).length ? '?' + new URLSearchParams(qs).toString() : '';
    return { pathname, q };
  }
  let raw = (req.url || req.path || '').split('?')[0];
  if (raw.startsWith('http')) {
    try {
      raw = new URL(raw).pathname;
    } catch (_) {}
  }
  if (!raw.startsWith('/')) raw = '/' + raw;
  const rawUrl = req.url || req.path || '';
  const q = rawUrl.includes('?') ? '?' + rawUrl.split('?').slice(1).join('?') : '';
  return { pathname: raw, q };
}

module.exports = (req, res) => {
  const { pathname, q } = getPathAndQuery(req);
  if (!DASHBOARD_API.test(pathname)) {
    return res.status(404).end();
  }
  req.url = pathname + q;
  return app(req, res);
};
