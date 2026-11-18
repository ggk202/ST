// Cache-busting for the no-build setup: rewrites the import map in index.html so every module URL carries a short content hash.
// A browser (or iPad Safari) that cached an old module then fetches the new one as soon as index.html is fresh. Run before committing: node tools/stamp.mjs
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const files = []; (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) { if (f !== 'vendor') walk(p); } else if (f.endsWith('.js')) files.push(p); } })(path.join(root, 'js'));
files.sort();
const imports = { three: './js/vendor/three.module.min.js' };
for (const p of files) { const rel = './' + path.relative(root, p).split(path.sep).join('/'); imports[rel] = rel + '?v=' + crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex').slice(0, 8); }
const map = '<script type="importmap">\n' + JSON.stringify({ imports }, null, 1) + '\n</script>';
const ip = path.join(root, 'index.html'); let t = fs.readFileSync(ip, 'utf8');
t = t.replace(/<script type="importmap">[\s\S]*?<\/script>/, () => map);
t = t.replace(/<script type="module"[^>]*>[\s\S]*?<\/script>|<script type="module" src="js\/main\.js"><\/script>/, '<script type="module">import "./js/main.js";</script>');
fs.writeFileSync(ip, t); console.log('stamped', files.length, 'modules');
