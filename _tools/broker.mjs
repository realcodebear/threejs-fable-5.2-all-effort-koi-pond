// Screenshot service: runs outside the agents' sandboxes. Agents write _queue/<id>.req (JSON); we run shot.mjs and write <id>.res.
import fs from 'node:fs'; import path from 'node:path'; import { execFile } from 'node:child_process';
const A = path.join(process.env.HOME, 'koi-arena'), Q = path.join(A, '_queue');
const busy = new Set(); let running = false;
function next() {
  if (running) return;
  const f = fs.readdirSync(Q).filter(n => n.endsWith('.req') && !busy.has(n)).sort()[0]; if (!f) return;
  busy.add(f); running = true; const id = f.slice(0, -4); let res = '';
  const done = (txt) => { fs.writeFileSync(path.join(Q, id + '.res.tmp'), txt); fs.renameSync(path.join(Q, id + '.res.tmp'), path.join(Q, id + '.res')); try { fs.unlinkSync(path.join(Q, f)); } catch {} busy.delete(f); running = false; setImmediate(next); };
  try {
    const r = JSON.parse(fs.readFileSync(path.join(Q, f), 'utf8'));
    const dir = path.resolve(r.dir), out = path.resolve(r.out);
    if (!dir.startsWith(A + '/') || !out.startsWith(A + '/') || dir.includes('/_')) return done('error: folder must be inside your run folder\n');
    const secs = String(Math.min(30, Math.max(1, +r.secs || 5))), w = String(Math.min(3840, +r.w || 1920)), h = String(Math.min(2160, +r.h || 1080));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    execFile('node', [path.join(A, '_tools/shot.mjs'), dir, out, secs, w, h], { timeout: 120000 }, (e, so, se) => done((so || '') + (e ? 'error: ' + (se || e.message).slice(0, 1500) + '\n' : '')));
  } catch (e) { done('error: ' + e.message + '\n'); }
}
setInterval(next, 500); console.log('broker up', new Date().toISOString());
