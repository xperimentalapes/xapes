const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dest = path.join(root, 'api', 'static');

function copyDir(src, d) {
  fs.mkdirSync(d, { recursive: true });
  fs.readdirSync(src).forEach((name) => {
    const s = path.join(src, name);
    const t = path.join(d, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, t);
    else fs.copyFileSync(s, t);
  });
}

fs.mkdirSync(dest, { recursive: true });
['index.html', 'css', 'js', 'assets'].forEach((name) => {
  const src = path.join(root, name);
  if (!fs.existsSync(src)) return;
  const d = path.join(dest, name);
  if (fs.statSync(src).isDirectory()) copyDir(src, d);
  else fs.copyFileSync(src, d);
});
console.log('Static files copied to api/static');
