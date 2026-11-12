// node pageshot.mjs <url> <out.png> [width=1440] [height=900] [full=1]  -> full-page screenshot + console errors
import puppeteer from 'puppeteer-core';
const [url, out, W = '1440', H = '900', full = '1'] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--enable-gpu', '--use-angle=metal', '--hide-scrollbars'] });
const pg = await b.newPage(); await pg.setViewport({ width: +W, height: +H, deviceScaleFactor: 1 });
const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && errs.push(m.text()));
await pg.goto(url, { waitUntil: 'networkidle0', timeout: 60000 }); await new Promise(r => setTimeout(r, 2500));
await pg.screenshot({ path: out, fullPage: full === '1' }); console.log('saved', out, errs.length ? '\nerrors:\n' + errs.join('\n') : ''); await b.close();
