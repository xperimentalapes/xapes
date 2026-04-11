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

const discordInteractionsExpress = require('../lib/discord/express-interactions');
const app = require('../site-template/server');

function readRawBodyBuffer(req) {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === 'string') return Promise.resolve(Buffer.from(req.body, 'utf8'));
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const DASHBOARD_API = /^\/api\/(discord|verify|collections|holders|prices|blunana-ohlc|coinflip-state|coinflip-stats|coinflip-flip|coinflip-purchase|coinflip-collect|coinflip-confirm-collect|holder-link-wallet|holder-verify)(\/|$|\?)/;

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

module.exports = async function dashboardApi(req, res) {
  const { pathname, q } = getPathAndQuery(req);
  const interactionsPath = pathname.replace(/\/$/, '') === '/api/discord/interactions';

  // Handle here so we never rely on Express route registration on Vercel (avoids "Cannot POST …" 404).
  if (req.method === 'POST' && interactionsPath) {
    try {
      const buf = await readRawBodyBuffer(req);
      const fakeReq = { body: buf, headers: req.headers || {} };
      fakeReq.get = function (name) {
        return fakeReq.headers[String(name).toLowerCase()];
      };
      return discordInteractionsExpress(fakeReq, res);
    } catch (e) {
      console.error('Discord interactions body read error', e);
      if (!res.headersSent) res.status(500).end();
      return;
    }
  }

  if (!DASHBOARD_API.test(pathname)) {
    return res.status(404).end();
  }
  req.url = pathname + q;
  return app(req, res);
};

/** Let Express read the raw body for POST /api/discord/interactions (Discord Ed25519 signature). */
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
