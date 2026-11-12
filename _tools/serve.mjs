// Local-only static server for the hub: 127.0.0.1, refuses hidden paths and logs. Also rebuilds hub.json every 60 s.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { execFile } from 'node:child_process';
const root = path.join(process.env.HOME, 'koi-arena'), port = +(process.argv[2] || 8800);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.woff2':'font/woff2', '.md':'text/plain; charset=utf-8', '.svg':'image/svg+xml' };
http.createServer((q, r) => {
  let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.normalize(path.join(root, p));
  if (!f.startsWith(root + '/') || /\/\.|\/_logs\/|\/_queue\//.test(f.slice(root.length))) { r.writeHead(403); r.end(); return; }
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); r.end(b); });
}).listen(port, '127.0.0.1', () => console.log('hub on http://127.0.0.1:' + port));
const rebuild = () => execFile('python3', [path.join(root, '_tools/hub.py')], () => {}); rebuild(); setInterval(rebuild, 60000);
