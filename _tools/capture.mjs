// node capture.mjs <folder> <outPrefix> [times=4,10,20] -> <outPrefix>_<t>s.png per time + prints JSON {fps, errors}
// Same conditions for every run: Chrome + GPU, 1920x1080, timed from page load, fps averaged from 2 s to the last still.
import puppeteer from 'puppeteer-core'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const [dir, pre, tl = '4,10,20'] = process.argv.slice(2); const times = tl.split(',').map(Number);
const root = path.resolve(dir), types = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(root, p), (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); }).listen(0);
await new Promise(r => srv.once('listening', r));
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist', '--hide-scrollbars', '--window-size=1920,1080'] });
const errs = [];
try {
  const pg = await b.newPage(); await pg.setViewport({ width: 1920, height: 1080 });
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.location()?.url || '')) errs.push(m.text()); });
  const t0 = Date.now(); await pg.goto(`http://localhost:${srv.address().port}/index.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.evaluate(() => { window.__f = 0; const t = () => { window.__f++; requestAnimationFrame(t); }; requestAnimationFrame(t); });
  let f0 = null, tf0 = 0;
  for (const t of times) {
    const wait = t * 1000 - (Date.now() - t0); if (wait > 0) await new Promise(r => setTimeout(r, wait));
    if (f0 == null) { f0 = await pg.evaluate(() => window.__f); tf0 = Date.now(); }
    await pg.screenshot({ path: `${pre}_${t}s.png` });
  }
  const fps = (await pg.evaluate(() => window.__f) - f0) / ((Date.now() - tf0) / 1000);
  console.log(JSON.stringify({ fps: Math.round(fps), errors: errs.slice(0, 10) }));
} finally { await b.close(); srv.close(); }
