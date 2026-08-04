const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'public');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(root, 'index.html'), path.join(out, 'index.html'));
fs.copyFileSync(path.join(root, 'tree.html'), path.join(out, 'tree.html'));
fs.copyFileSync(path.join(root, 'client-crawler.js'), path.join(out, 'client-crawler.js'));
fs.writeFileSync(path.join(out, '_routes.json'), JSON.stringify({ version: 1, include: ['/api/*'], exclude: [] }, null, 2));
fs.writeFileSync(path.join(out, '_headers'), '/api/*\n  Cache-Control: no-store\n');

console.log('Built Cloudflare Pages output in public/');
