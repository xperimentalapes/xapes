/**
 * Build script: copies apps/web (dashboard + casino games) into public/.
 * - Dashboard: apps/web index.html, css/, js/, assets/
 * - Games: apps/web/games/* (HTML, JS, shared + per-game CSS) → public/ (flat paths for existing URLs)
 * - Injects HELIUS_API_KEY into coinflip.html / slots.html / roulette.html when copying.
 * Reads HELIUS_API_KEY from process.env (Vercel) or root .env.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');
const webDir = path.join(root, 'apps', 'web');
const gamesDir = path.join(webDir, 'games');

// Load .env if present (for local builds)
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^HELIUS_API_KEY=(.*)$/);
    if (m) process.env.HELIUS_API_KEY = m[1].trim().replace(/^["']|["']$/g, '');
    const m2 = line.match(/^BASE_URL=(.*)$/);
    if (m2) process.env.BASE_URL = m2[1].trim().replace(/^["']|["']$/g, '');
    const m3 = line.match(/^SITE_URL=(.*)$/);
    if (m3) process.env.SITE_URL = m3[1].trim().replace(/^["']|["']$/g, '');
  });
}
const key = (process.env.HELIUS_API_KEY || '').trim().replace(/^["']|["']$/g, '');
const siteUrl = (process.env.SITE_URL || process.env.BASE_URL || 'https://xapes.vercel.app').replace(/\/$/, '');

// Server-side runtime fallback (bundled with api/dashboard on Vercel)
const buildEnvPath = path.join(root, 'lib', 'holder', 'build-env.json');
fs.writeFileSync(
  buildEnvPath,
  JSON.stringify(
    {
      HELIUS_API_KEY: key || null,
      XMA_TOKEN_MINT: (process.env.XMA_TOKEN_MINT || 'HVSruatutKcgpZJXYyeRCWAnyT7mzYq1io9YoJ6F4yMP').trim(),
    },
    null,
    0
  ) + '\n'
);

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  fs.readdirSync(src).forEach((name) => {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  });
}

// 1) Dashboard from apps/web
['index.html', 'css', 'js', 'assets'].forEach((name) => {
  const src = path.join(webDir, name);
  const dest = path.join(publicDir, name);
  if (!fs.existsSync(src)) return;
  if (fs.statSync(src).isDirectory()) copyDir(src, dest);
  else if (name === 'index.html') {
    let html = fs.readFileSync(src, 'utf8');
    html = html.replace(/__SITE_URL__/g, siteUrl);
    const cssPath = path.join(webDir, 'css', 'styles.css');
    const cssVer = fs.existsSync(cssPath) ? Math.floor(fs.statSync(cssPath).mtimeMs) : Date.now();
    html = html.replace(/href="css\/styles\.css"/, `href="css/styles.css?v=${cssVer}"`);
    fs.writeFileSync(dest, html);
  } else fs.copyFileSync(src, dest);
});
// Use repo logo for favicon/embed: overwrite public/assets/logo.png with images/logo.png
const repoLogo = path.join(root, 'images', 'logo.png');
if (fs.existsSync(repoLogo)) {
  fs.copyFileSync(repoLogo, path.join(publicDir, 'assets', 'logo.png'));
}

// 2) Game pages, scripts, and CSS (flat public/ paths — matches vercel.json rewrites)
const gameFiles = [
  'casino-auth.js',
  'casino-buy-tiers.js',
  'slots.html',
  'slots.js',
  'casino.html',
  'roulette.html',
  'roulette.js',
  'coinflip.html',
  'coinflip.js',
  'styles.css',
  'slots.css',
  'coinflip.css',
  'roulette.css',
];
gameFiles.forEach((file) => {
  const src = path.join(gamesDir, file);
  const dest = path.join(publicDir, file);
  if (!fs.existsSync(src)) return;
  let data = fs.readFileSync(src, 'utf8');
  if (file === 'coinflip.html' || file === 'slots.html' || file === 'roulette.html') {
    data = data.replace(/__HELIUS_API_KEY__/g, key.replace(/'/g, "\\'"));
  }
  fs.writeFileSync(dest, data);
});

// 3) Images for games (logo, banner, symbols, etc.)
const imagesSrc = path.join(root, 'images');
if (fs.existsSync(imagesSrc)) {
  copyDir(imagesSrc, path.join(publicDir, 'images'));
}

console.log('Build done. Dashboard + games in public/. HELIUS_API_KEY', key ? 'injected' : 'not set.');
