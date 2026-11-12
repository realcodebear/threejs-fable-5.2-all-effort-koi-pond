// node shot.mjs <folder> <out.png> [seconds=5] [width=1920] [height=1080]
// Serves <folder> on a local port, opens index.html in Chrome (GPU), waits, screenshots, prints FPS + console errors.
import puppeteer from 'puppeteer-core';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const [dir, out, secs = '5', W = '1920', H = '1080'] = process.argv.slice(2);
if (!dir || !out) { console.error('usage: shot <folder> <out.png> [seconds] [w] [h]'); process.exit(1); }
const root = path.resolve(dir);
const types = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.wasm':'application/wasm', '.glsl':'text/plain' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(b); });
}).listen(0);
await new Promise(r => srv.once('listening', r));
const url = `http://localhost:${srv.address().port}/index.html${process.env.QS || ''}`;
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new',
  args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--hide-scrollbars', `--window-size=${W},${H}`] });
try {
  const pg = await b.newPage(); await pg.setViewport({ width: +W, height: +H });
  const errs = []; pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') { if (!/favicon/.test(m.location()?.url || '')) errs.push(m.type() + ': ' + m.text()); } }); pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await pg.goto(url, { waitUntil: 'load', timeout: 60000 });
  await pg.evaluate(() => { window.__f = 0; const t = () => { window.__f++; requestAnimationFrame(t); }; requestAnimationFrame(t); });
  const t0 = Date.now(); await new Promise(r => setTimeout(r, +secs * 1000));
  const fps = await pg.evaluate(() => window.__f) / ((Date.now() - t0) / 1000);
  await pg.screenshot({ path: out });
  console.log(`saved ${out}  ~${fps.toFixed(0)} fps (headless Chrome, approx)`);
  if (errs.length) console.log('console:\n' + errs.slice(0, 20).join('\n'));
} finally { await b.close(); srv.close(); }
