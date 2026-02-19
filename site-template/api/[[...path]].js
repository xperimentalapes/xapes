/**
 * Vercel: all requests hit this handler. Serve static from project root, /api/* to Express.
 */
const fs = require('fs');
const path = require('path');
const app = require('../server');

const ROOT = path.resolve(path.join(__dirname, '..'));

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

function sendFile(res, filePath, ext) {
  try {
    const body = ['.css', '.js', '.json'].includes(ext)
      ? fs.readFileSync(filePath, 'utf8')
      : fs.readFileSync(filePath);
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    return res.status(200).send(body);
  } catch (e) {
    return res.status(404).end();
  }
}

module.exports = (req, res) => {
  let raw = (req.url || req.path || '').split('?')[0];
  if (raw.startsWith('http')) {
    try {
      raw = new URL(raw).pathname;
    } catch (_) {}
  }
  if (!raw.startsWith('/')) raw = '/' + raw;
  const pathSegments = req.query && req.query.path;
  if (pathSegments && !/^\/api\//.test(raw)) {
    const rest = Array.isArray(pathSegments) ? pathSegments.join('/') : String(pathSegments);
    raw = '/api/' + (rest ? rest.replace(/^\/+/, '') : '');
  }
  if (/^\/(discord|verify|collections|holders|prices|blunana-ohlc)(\/|$|\?)/.test(raw)) {
    raw = '/api' + raw;
  }
  const q = (req.url || '').includes('?') ? '?' + (req.url || '').split('?').slice(1).join('?') : '';

  const isApiRoute = /^\/api\/(discord|verify|collections|holders|prices|blunana-ohlc)(\/|$|\?)/.test(raw);
  if (isApiRoute) {
    req.url = raw + q;
    return app(req, res);
  }

  let u = raw;
  if (u.startsWith('/api/')) u = u.slice(4) || '/';
  else if (u === '/api') u = '/';
  if (u === '/Mnk3ys' || u === '/Mnk3ys/') u = '/';
  else if (u.startsWith('/Mnk3ys/')) u = u.slice(8) || '/';
  u = (u || '/').trim().replace(/\/+/g, '/').replace(/\/$/, '') || '/';

  if (u === '/favicon.ico') return res.status(204).end();

  const isRoot = u === '' || u === '/' || u === '/index.html';
  const rel = (u || '').replace(/^\/+/, '') || 'index.html';
  const filePath = path.join(ROOT, isRoot ? 'index.html' : rel);
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(path.resolve(ROOT))) return res.status(404).end();
  const ext = path.extname(isRoot ? 'index.html' : u);
  if (isRoot || u.startsWith('/css/') || u.startsWith('/js/') || u.startsWith('/assets/')) {
    try {
      const body = ['.css', '.js', '.json', '.html'].includes(ext)
        ? fs.readFileSync(resolvedPath, 'utf8')
        : fs.readFileSync(resolvedPath);
      res.setHeader('Content-Type', isRoot ? 'text/html; charset=utf-8' : (MIME[ext] || 'application/octet-stream'));
      return res.status(200).send(body);
    } catch (e) {
      if (isRoot) return res.status(500).send('index not found');
      res.setHeader('Content-Type', 'text/plain');
      return res.status(404).send('Not Found');
    }
  }

  req.url = raw + q;
  return app(req, res);
};
