#!/usr/bin/env python3
"""Write ~/koi-arena/index.html (hub: every run + both sites) and view.html (full-screen viewer with prev/next).
Re-run any time; the hub also re-reads hub.json every 30 s so status updates without a rebuild."""
import json, subprocess
from pathlib import Path

A = Path.home() / "koi-arena"; T = A / "_tools"
RUNS = [("fable-low", "Fable 5.2 · Low", "Effort test"), ("fable-medium", "Fable 5.2 · Medium", "Effort test"),
        ("fable-high", "Fable 5.2 · High", "Effort + model test"), ("fable-xhigh", "Fable 5.2 · XHigh", "Effort test"),
        ("fable-max", "Fable 5.2 · Max", "Effort test"), ("opus-high", "Opus 5.5 · High", "Model test"),
        ("astra-high", "GPT-6 Astra · High", "Model test")]
COLORS = {"fable-low": "#7d8796", "fable-medium": "#a7a08e", "fable-high": "#e8b45a", "fable-xhigh": "#ff8a1f",
          "fable-max": "#ff4f2e", "opus-high": "#d4a373", "astra-high": "#4fb3ff"}

subprocess.run(["python3", str(T / "stats.py")], capture_output=True)
stats = json.loads((T / "stats.json").read_text())
def pick(shots):
    """Newest full-size shot; prefer one named final*. Skips small/tall/resize test shots."""
    full = [p for p in shots if not any(k in p.stem.lower() for k in ("small", "tall", "resiz", "narrow", "mobile", "portrait"))] or shots
    fin = [p for p in full if p.stem.lower().startswith("final")]
    return (fin or full)[-1]


data = []
for r, label, group in RUNS:
    s = stats.get(r, {}); shots = sorted((A / r / "shots").glob("*.png"), key=lambda p: p.stat().st_mtime) if (A / r / "shots").exists() else []
    still = f"_tools/stills/{r}_10s.jpg" if (T / "stills" / f"{r}_10s.jpg").exists() else (f"{r}/shots/{pick(shots).name}" if shots else "")
    data.append(dict(id=r, label=label, group=group, color=COLORS[r], status=s.get("status", "waiting"), dur=s.get("duration_s"),
                     cost=s.get("cost_usd"), out=s.get("out_tok"), lines=s.get("lines"), shots=s.get("shots"),
                     ready=(A / r / "index.html").exists(), notes=(A / r / "NOTES.md").exists(), still=still))
sites = [dict(name="Effort test", sub="Fable 5.2 · low → max", href="_sites/koi-effort-test/index.html"),
         dict(name="Model test", sub="Fable 5.2 vs Opus 5.5 vs GPT-6 Astra · high", href="_sites/koi-model-test/index.html")]
for s in sites: s["ready"] = (A / s["href"]).exists()
(A / "hub.json").write_text(json.dumps(dict(runs=data, sites=sites)))

FONTS = '<link rel="stylesheet" href="_vendor/fonts/fonts.css">'
CSS = """:root{color-scheme:dark;--bg:#131417;--panel:#1e2025;--panel2:#272a30;--fg:#eef0f3;--soft:#cfd3da;--muted:#949ba6;--acc:#ff8a1f;
--display:"Space Grotesk",Inter,system-ui,sans-serif;--body:Inter,system-ui,-apple-system,sans-serif;--mono:"JetBrains Mono",ui-monospace,Menlo,monospace}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--body);-webkit-font-smoothing:antialiased}a{color:inherit}"""

hub = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Koi Pond Test Hub</title>{FONTS}<style>{CSS}
.in{{max-width:1240px;margin:0 auto;padding:0 max(16px,env(safe-area-inset-left))}}
header{{padding:44px 0 10px}}.eb{{font-family:var(--mono);font-size:.74rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}}
h1{{font-family:var(--display);font-size:clamp(2rem,5vw,3.4rem);letter-spacing:-.03em;line-height:1.02;margin:10px 0 8px}}
.lede{{color:var(--soft);max-width:64ch;margin:0}}h2{{font-family:var(--display);font-size:1.3rem;margin:38px 0 14px}}
.sites{{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}}
.site{{display:flex;justify-content:space-between;align-items:center;gap:12px;background:var(--panel);border-radius:14px;padding:18px 20px;text-decoration:none}}
.site b{{font-family:var(--display);font-size:1.15rem;display:block}}.site span{{color:var(--muted);font-size:.88rem}}
.site .go{{font-family:var(--mono);font-size:.78rem;background:var(--fg);color:#111;padding:7px 12px;border-radius:999px;white-space:nowrap}}
.site.off{{opacity:.55;pointer-events:none}}.site.off .go{{background:var(--panel2);color:var(--muted)}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}}
.card{{background:var(--panel);border-radius:14px;overflow:hidden;display:flex;flex-direction:column}}
.thumb{{position:relative;aspect-ratio:16/9;background:#0c0d0f;display:block;overflow:hidden}}.thumb img{{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}}
.thumb .st{{position:absolute;top:10px;left:10px;font-family:var(--mono);font-size:.7rem;background:rgba(0,0,0,.65);padding:4px 9px;border-radius:999px}}
.thumb .empty{{position:absolute;inset:0;display:grid;place-items:center;color:var(--muted);font-size:.9rem}}
.body{{padding:13px 15px 15px;display:flex;flex-direction:column;gap:8px;flex:1}}
.name{{font-family:var(--display);font-weight:600;font-size:1.08rem;display:flex;align-items:center;gap:8px}}
.dot{{width:10px;height:10px;border-radius:50%;background:var(--c);flex:none}}.grp{{font-size:.78rem;color:var(--muted)}}
.nums{{display:flex;flex-wrap:wrap;gap:6px}}.nums span{{font-family:var(--mono);font-size:.72rem;background:var(--bg);color:var(--soft);padding:4px 8px;border-radius:7px}}
.acts{{display:flex;gap:8px;margin-top:auto;padding-top:4px}}.btn{{font-size:.84rem;text-decoration:none;background:var(--panel2);padding:8px 12px;border-radius:9px;color:var(--soft)}}
.btn.p{{background:var(--fg);color:#111;font-weight:600}}.btn.off{{opacity:.4;pointer-events:none}}
.live{{animation:pulse 1.6s infinite}}@keyframes pulse{{50%{{opacity:.45}}}}
footer{{color:var(--muted);font-size:.82rem;padding:40px 0}}
@media(max-width:640px){{.sites{{grid-template-columns:1fr}}}}
</style></head><body><div class="in">
<header><div class="eb">Koi pond test · three.js · one prompt</div><h1>Koi Pond Test Hub</h1>
<p class="lede">Seven runs of the same prompt. Five Claude Fable 5.2 effort levels, plus Claude Opus 5.5 and GPT-6 Astra at high. Open any scene full screen and use ← → to flip between them.</p></header>
<h2>Comparison sites</h2><div class="sites" id="sites"></div>
<h2>All scenes</h2><div class="grid" id="grid"></div>
<footer>Status refreshes every 30 s. Local page: everything here runs from this folder.</footer></div>
<script>
const f={{min:s=>s==null?null:Math.round(s/60)+' min',usd:v=>v==null?null:'$'+v.toFixed(2),k:v=>!v?null:v>=1e3?Math.round(v/1e3)+'k tok':v+' tok'}};
function draw(d){{
  document.getElementById('sites').innerHTML=d.sites.map(s=>`<a class="site ${{s.ready?'':'off'}}" href="${{s.href}}"><div><b>${{s.name}}</b><span>${{s.sub}}</span></div><span class="go">${{s.ready?'Open →':'Building…'}}</span></a>`).join('');
  document.getElementById('grid').innerHTML=d.runs.map(r=>{{const done=r.status==='done',run=r.status==='running';
    const st=done?'Done':run?'<span class=live>● Running</span>':r.status;
    const nums=[f.min(r.dur),f.usd(r.cost),f.k(r.out),r.lines?r.lines.toLocaleString()+' lines':null,r.shots?r.shots+' shots':null].filter(Boolean).map(x=>`<span>${{x}}</span>`).join('');
    return `<div class="card" style="--c:${{r.color}}"><a class="thumb" href="${{r.ready?'view.html?r='+r.id:'#'}}">${{r.still?`<img src="${{r.still}}?v=${{Date.now()>>15}}" alt="${{r.label}}" loading="lazy">`:'<div class=empty>No screenshot yet</div>'}}<span class="st">${{st}}</span></a>
    <div class="body"><div class="name"><span class="dot"></span>${{r.label}}</div><div class="grp">${{r.group}}</div><div class="nums">${{nums}}</div>
    <div class="acts"><a class="btn p ${{r.ready&&done?'':'off'}}" href="view.html?r=${{r.id}}">Open full screen</a><a class="btn ${{r.notes?'':'off'}}" href="${{r.id}}/NOTES.md" target="_blank">Notes</a></div></div></div>`}}).join('');
}}
const load=()=>fetch('hub.json?'+Date.now()).then(r=>r.json()).then(draw).catch(()=>{{}});load();setInterval(load,30000);
</script></body></html>"""

view = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Koi Pond Viewer</title>{FONTS}<style>{CSS}
html,body{{height:100%;overflow:hidden;background:#000}}iframe{{position:fixed;inset:0;width:100%;height:100%;border:0}}
.bar{{position:fixed;top:12px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:6px;background:rgba(19,20,23,.78);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);padding:6px;border-radius:999px;z-index:2;transition:opacity .4s;max-width:calc(100vw - 24px)}}
.bar.hide{{opacity:0}}.bar:hover{{opacity:1}}.bar a,.bar button{{border:0;cursor:pointer;font:inherit;font-size:.84rem;text-decoration:none;background:transparent;color:var(--soft);padding:7px 12px;border-radius:999px;white-space:nowrap}}
.bar a:hover,.bar button:hover{{background:#2a2d33;color:var(--fg)}}.ttl{{font-family:var(--display);font-weight:600;padding:0 10px;display:flex;align-items:center;gap:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
.dot{{width:9px;height:9px;border-radius:50%;background:var(--c);flex:none}}
</style></head><body><div class="bar" id="bar"><a href="index.html">← Hub</a><button id="prev" aria-label="Previous scene">‹</button><span class="ttl" id="ttl"></span><button id="next" aria-label="Next scene">›</button><button id="fs">Full screen</button></div>
<iframe id="f" title="Scene" allow="fullscreen"></iframe>
<script>
fetch('hub.json?'+Date.now()).then(r=>r.json()).then(d=>{{
  const R=d.runs.filter(r=>r.ready);let i=Math.max(0,R.findIndex(r=>r.id===new URLSearchParams(location.search).get('r')));
  const show=()=>{{const r=R[i];document.getElementById('f').src=r.id+'/index.html';document.getElementById('ttl').innerHTML=`<span class=dot style="--c:${{r.color}}"></span>${{r.label}} <span style="color:var(--muted);font-weight:400">${{i+1}}/${{R.length}}</span>`;history.replaceState(null,'','?r='+r.id);document.title=r.label+' · Koi Pond';}};
  const step=k=>{{i=(i+k+R.length)%R.length;show();}};
  document.getElementById('prev').onclick=()=>step(-1);document.getElementById('next').onclick=()=>step(1);
  document.getElementById('fs').onclick=()=>document.documentElement.requestFullscreen();
  addEventListener('keydown',e=>{{if(e.key==='ArrowRight')step(1);if(e.key==='ArrowLeft')step(-1);if(e.key==='Escape')location='index.html';}});
  document.getElementById('f').onload=()=>{{try{{document.getElementById('f').contentWindow.addEventListener('keydown',e=>{{if(e.key==='ArrowRight')step(1);if(e.key==='ArrowLeft')step(-1);}});}}catch{{}}}};
  let t;const bar=document.getElementById('bar');const wake=()=>{{bar.classList.remove('hide');clearTimeout(t);t=setTimeout(()=>bar.classList.add('hide'),2500);}};addEventListener('mousemove',wake);wake();
  show();
}});
</script></body></html>"""
(A / "index.html").write_text(hub); (A / "view.html").write_text(view)
print("hub written:", sum(r["ready"] for r in data), "scenes ready")
