#!/usr/bin/env python3
"""Build one of the two koi sites from the arena runs.
usage: build.py effort|models <out_dir>
Copies each run's own files into scenes/<run>/ (the shared three.js r170 goes to vendor/three once and the
import paths are pointed there), copies stills + fonts, writes data.js and index.html."""
import json, re, shutil, sys, html
from pathlib import Path

A = Path.home() / "koi-arena"; T = A / "_tools"; HERE = Path(__file__).parent
FONTS = Path.home() / "code-bear-channel/_ref/blender-fable-5.2/vendor/fonts"
TIMES = [4, 10, 20]
PROMPT = (A / "PROMPT.md").read_text().strip()

SITES = {
    "effort": dict(
        title="Koi Pond Effort Test · Claude Fable 5.2", brand="Koi Pond Effort Test", accent="#ff8a1f",
        desc="Claude Fable 5.2 built the same three.js koi pond five times, at low, medium, high, xhigh and max effort. Watch each one live, compare frames, and see what each took.",
        eyebrow="Claude Fable 5.2 · three.js · one prompt, five effort levels",
        h1="One koi pond, five effort levels",
        lede="We gave Claude Fable 5.2 the same prompt five times and changed only the effort setting, from low to max. "
             "Each run built a koi pond scene in three.js, from code alone, with no help. Here is what came out, and what each one cost.",
        runs=[("fable-low", "Low", "low"), ("fable-medium", "Medium", "medium"), ("fable-high", "High", "high"),
              ("fable-xhigh", "XHigh", "xhigh"), ("fable-max", "Max", "max")],
        colors=["#7d8796", "#a7a08e", "#e8b45a", "#ff8a1f", "#ff4f2e"],
        cmpDefault=[0, 4],
        costSub="API price from the run log",
    ),
    "models": dict(
        title="Koi Pond Model Test · Fable 5.2 vs Opus 5.5 vs GPT-6 Astra", brand="Koi Pond Model Test", accent="#4fb3ff",
        desc="The same three.js koi pond prompt, built by Claude Fable 5.2, Claude Opus 5.5 and GPT-6 Astra, all at high effort. Watch each live and compare.",
        eyebrow="Fable 5.2 vs Opus 5.5 vs GPT-6 Astra · all at high effort",
        h1="Three models, one koi pond",
        lede="Claude Fable 5.2, Claude Opus 5.5 and GPT-6 Astra each got the exact same prompt at high effort: build a koi pond at dusk in three.js, "
             "from code alone. Each ran in its own maker's coding tool, with no help. Here are the three ponds side by side.",
        runs=[("fable-high", "Fable 5.2", "Claude Fable 5.2 · high"), ("opus-high", "Opus 5.5", "Claude Opus 5.5 · high"),
              ("astra-high", "GPT-6 Astra", "GPT-6 Astra · high")],
        colors=["#ff8a1f", "#d4a373", "#4fb3ff"],
        cmpDefault=[0, 2],
        costSub="API price; Codex logs tokens only",
    ),
}


def md_to_html(md):
    """Tiny Markdown subset for NOTES.md: headings, lists, paragraphs, inline code, bold."""
    out, para, inlist = [], [], False
    def inline(s):
        s = html.escape(s)
        s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
        return re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", s)
    def flush():
        nonlocal para
        if para: out.append("<p>" + inline(" ".join(para)) + "</p>"); para = []
    for line in md.splitlines():
        l = line.rstrip()
        if l.startswith("```"): continue
        m = re.match(r"^(#{1,6})\s+(.*)", l); li = re.match(r"^\s*(?:[-*]|\d+\.)\s+(.*)", l)
        if m or not l.strip() or li:
            flush()
            if inlist and not li: out.append("</ul>"); inlist = False
        if m: out.append(f"<h3>{inline(m.group(2))}</h3>")
        elif li:
            if not inlist: out.append("<ul>"); inlist = True
            out.append(f"<li>{inline(li.group(1))}</li>")
        elif l.strip(): para.append(l.strip())
    flush()
    if inlist: out.append("</ul>")
    return "\n".join(out)


def build(kind, out):
    cfg = SITES[kind]; out = Path(out); out.mkdir(parents=True, exist_ok=True)
    stats = json.loads((T / "stats.json").read_text()); cap = json.loads((T / "captures.json").read_text())
    for sub in ("vendor/three", "vendor/fonts"):
        if (out / sub).exists(): shutil.rmtree(out / sub)
    shutil.copytree(A / "_vendor/three", out / "vendor/three"); shutil.copytree(FONTS, out / "vendor/fonts")
    (out / "img").mkdir(exist_ok=True)
    runs = []
    for (r, label, sub), color in zip(cfg["runs"], cfg["colors"]):
        src, dst = A / r, out / "scenes" / r
        if dst.exists(): shutil.rmtree(dst)
        shutil.copytree(src, dst, ignore=shutil.ignore_patterns("three", "shots", ".*"))
        for p in dst.rglob("*"):
            if p.suffix in (".html", ".js", ".mjs"):
                t = p.read_text(errors="replace")
                depth = len(p.relative_to(dst).parts) - 1
                up = "../" * (depth + 2) + "vendor/three/"
                t2 = re.sub(r"""(["'])\./three/""", lambda m: m.group(1) + up, t)
                t2 = re.sub(r"""(["'])(\.\./)+three/(build|examples)/""", lambda m: m.group(1) + up + m.group(3) + "/", t2) if depth else t2
                if t2 != t: p.write_text(t2)
        stills = []
        for t in TIMES:
            jpg = out / "img" / f"{r}_{t}s.jpg"
            shutil.copy(T / "stills" / f"{r}_{t}s.jpg", jpg); stills.append(f"img/{jpg.name}")
        s = dict(stats[r]); s["fps"] = cap.get(r, {}).get("fps")
        if s.get("cost_usd") is None and r.startswith("astra"):
            # Codex logs tokens, not price. Estimate at the widely reported GPT-6 Astra list price ($10 in / $1 cached / $50 out per 1M);
            # the run used the priority tier, which is billed higher, so the real figure is above this.
            s["cost_usd"] = round((s["in_tok"] * 10 + s["cached_tok"] * 1 + s["out_tok"] * 50) / 1e6, 2); s["cost_note"] = "estimate, see note"; s["cost_est"] = True
        if s.get("reason_tok"): s["reason_note"] = f"incl. {s['reason_tok']:,} reasoning"
        notes = (src / "NOTES.md").read_text(errors="replace") if (src / "NOTES.md").exists() else ""
        runs.append(dict(id=r, label=label, short=label, sub=sub, color=color, url=f"scenes/{r}/index.html", base=f"scenes/{r}/",
                         stills=stills, stats=s, strip=(f"{round(s['duration_s']/60)} min · ${s['cost_usd']:.2f}" + (" est." if s.get("cost_est") else "")) if s.get("duration_s") else sub, notes_html=md_to_html(notes), hint=cap.get(r, {}).get("hint", "")))
    total = sum(x["stats"].get("cost_usd") or 0 for x in runs)
    site = dict(
        title=cfg["title"], brand=cfg["brand"], accent=cfg["accent"], eyebrow=cfg["eyebrow"], h1=cfg["h1"], lede=cfg["lede"],
        chips=["three.js r170", "no images, no models: code only", "one run each", "no human help", f"${total:,.2f} in API cost" if total else ""],
        runs=runs, heroStill=1, stillTimes=TIMES, cmpDefault=cfg["cmpDefault"], prompt=PROMPT, costSub=cfg["costSub"],
        numLede="Time, tokens and cost come from each run's own log. Frame rate is our own test: Chrome on an M-series MacBook at 1920×1080.",
        numFoot="Input (new) = fresh input tokens plus cache writes. Input (cached) = tokens re-read from the prompt cache, which bills at a small fraction. " +
                ("GPT-6 Astra's cost is our estimate from its token counts at the reported list price ($10 per 1M input, $1 cached, $50 output); it ran on the priority tier, which costs more. " if kind == "models" else "") +
                "Screenshots = how many times the model used the screenshot tool to check its own work. Lines = non-empty lines in the files the model wrote.",
        setup=[
            ["Harness", "Claude models ran in Claude Code (<code>claude -p</code>), GPT-6 Astra in Codex (<code>codex exec</code>). No MCP servers, hooks, memory or custom instructions."
                         if kind == "models" else "Claude Code (<code>claude -p --effort &lt;level&gt;</code>), one fresh session per level. No MCP servers, hooks, memory or custom instructions."],
            ["Tools", "File read/write/edit, a few read-only shell commands, and <code>../shot.sh</code>: a screenshot of the scene in real Chrome with the GPU, plus frame rate and console errors."],
            ["Machine", "One MacBook (Apple M-series, 24 GB). Runs shared the machine; the screenshot tool served one request at a time for all of them."],
        ],
        foot1="Made by <a href=\"https://www.youtube.com/@thecodebear\">The Code Bear</a>. Scenes © their runs; three.js is MIT.",
        foot2="Every scene is the model's own output, unedited except for the three.js import path.",
    )
    site["chips"] = [c for c in site["chips"] if c]
    (out / "data.js").write_text("window.SITE = " + json.dumps(site, indent=1) + ";\n")
    page = (HERE / "page.html").read_text()
    page = page.replace("{{TITLE}}", html.escape(cfg["title"])).replace("{{DESC}}", html.escape(cfg["desc"])).replace("{{OG}}", runs[-1]["stills"][1])
    (out / "index.html").write_text(page)
    print("built", out, len(runs), "runs")


if __name__ == "__main__":
    build(sys.argv[1], sys.argv[2])
