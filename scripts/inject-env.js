/**
 * Build script: copies site files to public/ and injects HELIUS_API_KEY into chests.html.
 * Reads from process.env.HELIUS_API_KEY (set by Vercel) or from .env in project root.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');

// Load .env if present (for local builds)
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach((line) => {
    const m = line.match(/^HELIUS_API_KEY=(.*)$/);
    if (m) {
      const val = m[1].trim().replace(/^["']|["']$/g, '');
      process.env.HELIUS_API_KEY = val;
    }
  });
}

const key = process.env.HELIUS_API_KEY || '';

const filesToCopy = [
  'index.html',
  'styles.css',
  'script.js',
  'slots.html',
  'slots.css',
  'slots.js',
  'chests.html',
  'chests.css',
  'chests.js',
  'casino.html',
];

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

filesToCopy.forEach((file) => {
  const src = path.join(root, file);
  const dest = path.join(publicDir, file);
  if (!fs.existsSync(src)) return;
  let data = fs.readFileSync(src, 'utf8');
  if (file === 'chests.html') {
    data = data.replace(/__HELIUS_API_KEY__/g, key.replace(/'/g, "\\'"));
  }
  fs.writeFileSync(dest, data);
});

console.log('Build done. HELIUS_API_KEY', key ? 'injected' : 'not set (NFT metadata will use fallbacks).');
