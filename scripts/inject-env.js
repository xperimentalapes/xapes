/**
 * Build script: copies site-template (new dashboard) + game pages to public/.
 * - New homepage: site-template index.html, css/, js/, assets/
 * - Games: slots, chests, casino (and roulette if present at root) from repo root
 * - Injects HELIUS_API_KEY into chests.html when copying.
 * Reads HELIUS_API_KEY from process.env (Vercel) or root .env.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');
const templateDir = path.join(root, 'site-template');

// Load .env if present (for local builds)
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^HELIUS_API_KEY=(.*)$/);
    if (m) process.env.HELIUS_API_KEY = m[1].trim().replace(/^["']|["']$/g, '');
  });
}
const key = (process.env.HELIUS_API_KEY || '').trim().replace(/^["']|["']$/g, '');

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

// 1) New dashboard from site-template (replaces old homepage)
['index.html', 'css', 'js', 'assets'].forEach((name) => {
  const src = path.join(templateDir, name);
  const dest = path.join(publicDir, name);
  if (!fs.existsSync(src)) return;
  if (fs.statSync(src).isDirectory()) copyDir(src, dest);
  else fs.copyFileSync(src, dest);
});

// 2) Game pages and assets from root (keep /casino, /slots, /chests, /roulette working)
const gameFiles = [
  'slots.html', 'slots.css', 'slots.js',
  'chests.html', 'chests.css', 'chests.js',
  'casino.html',
  'roulette.html',
];
gameFiles.forEach((file) => {
  const src = path.join(root, file);
  const dest = path.join(publicDir, file);
  if (!fs.existsSync(src)) return;
  let data = fs.readFileSync(src, 'utf8');
  if (file === 'chests.html') {
    data = data.replace(/__HELIUS_API_KEY__/g, key.replace(/'/g, "\\'"));
  }
  fs.writeFileSync(dest, data);
});

// 3) Images for games (logo, banner, symbols, etc.)
const imagesSrc = path.join(root, 'images');
if (fs.existsSync(imagesSrc)) {
  copyDir(imagesSrc, path.join(publicDir, 'images'));
}

console.log('Build done. New dashboard + games in public/. HELIUS_API_KEY', key ? 'injected' : 'not set.');