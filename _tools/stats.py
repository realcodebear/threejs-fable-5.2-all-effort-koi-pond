#!/usr/bin/env python3
"""Collect numbers for every koi run -> _tools/stats.json.
Claude: per-message usage from the session transcript (+ total_cost_usd from the result event).
Codex: token counts from turn.completed events."""
import json, re, os
from pathlib import Path

A = Path.home() / "koi-arena"
RUNS = ["fable-low", "fable-medium", "fable-high", "fable-xhigh", "fable-max", "opus-high", "astra-high"]
SHOT = re.compile(r"shot\.sh\s+\S+\s+\S+\.png")
CODE_EXT = {".html", ".js", ".mjs", ".css", ".glsl"}


def code_stats(d):
    files, lines, size = [], 0, 0
    for p in sorted(d.rglob("*")):
        rel = p.relative_to(d)
        if not p.is_file() or rel.parts[0] in ("three", "shots") or p.suffix not in CODE_EXT:
            continue
        txt = p.read_text(errors="replace")
        n = sum(1 for l in txt.splitlines() if l.strip())
        files.append({"path": str(rel), "lines": n, "bytes": p.stat().st_size})
        lines += n; size += p.stat().st_size
    return files, lines, size


def run_stats(r):
    L = A / "_logs" / r
    s = {"run": r, "tool_calls": 0, "shots": 0, "images_viewed": 0, "in_tok": 0, "cached_tok": 0,
         "out_tok": 0, "reason_tok": 0, "cost_usd": None, "turns": None, "status": "running"}
    t = [json.loads(l) for l in open(L / "timing.jsonl")] if (L / "timing.jsonl").exists() else []
    st = next((x for x in t if x["event"] == "start"), None); en = next((x for x in t if x["event"] == "end"), None)
    if st: s["model"], s["effort"] = st["model"], st["effort"]
    if st and en: s["duration_s"] = en["t"] - st["t"]; s["status"] = "done"
    seen = {}
    for line in open(L / "run.jsonl") if (L / "run.jsonl").exists() else []:
        try: e = json.loads(json.loads(line)["e"])
        except Exception: continue
        ty = e.get("type", "")
        if ty == "assistant":
            m = e.get("message", {})
            if m.get("id") and m.get("usage"):
                u = m["usage"]
                if m["id"] not in seen or u.get("output_tokens", 0) >= seen[m["id"]].get("output_tokens", 0): seen[m["id"]] = u
            for c in m.get("content", []):
                if c.get("type") == "tool_use":
                    s["tool_calls"] += 1; inp = c.get("input", {})
                    if c["name"] == "Bash": s["shots"] += len(SHOT.findall(inp.get("command", "")))
                    if c["name"] == "Read" and re.search(r"\.(png|jpe?g)$", str(inp.get("file_path", "")), re.I): s["images_viewed"] += 1
        elif ty == "result":
            s["cost_usd"] = e.get("total_cost_usd"); s["turns"] = e.get("num_turns")
            if e.get("is_error") or e.get("subtype") != "success": s["status"] = "error: " + str(e.get("subtype"))
        elif ty == "item.started":
            it = e.get("item", {})
            if it.get("type") == "command_execution":
                s["tool_calls"] += 1
                s["shots"] += len(SHOT.findall(str(it.get("command"))))
            elif it.get("type") not in ("agent_message", "reasoning"): s["tool_calls"] += 1
        elif ty == "item.completed":
            if e.get("item", {}).get("type") in ("image_view", "view_image"): s["images_viewed"] += 1
        elif ty == "turn.completed":
            u = e.get("usage", {})
            s["in_tok"] += u.get("input_tokens", 0) - u.get("cached_input_tokens", 0)
            s["cached_tok"] += u.get("cached_input_tokens", 0)
            s["out_tok"] += u.get("output_tokens", 0); s["reason_tok"] += u.get("reasoning_output_tokens", 0)
        elif ty in ("turn.failed", "error"):
            s["status"] = "error"
    sid = (L / "run.sid").read_text().strip() if (L / "run.sid").exists() else None
    tr = Path.home() / ".claude" / "projects" / ("-Users-you-koi-arena-" + r) / f"{sid}.jsonl" if sid else None
    if tr and tr.exists():
        um = {}
        for l in open(tr):
            try: d = json.loads(l)
            except Exception: continue
            m = d.get("message") if isinstance(d.get("message"), dict) else {}
            if d.get("type") == "assistant" and m.get("id") and m.get("usage"):
                u = m["usage"]
                if m["id"] not in um or u.get("output_tokens", 0) >= um[m["id"]].get("output_tokens", 0): um[m["id"]] = u
        seen = um or seen
    if seen:
        s["in_tok"] = sum(u.get("input_tokens", 0) + u.get("cache_creation_input_tokens", 0) for u in seen.values())
        s["cached_tok"] = sum(u.get("cache_read_input_tokens", 0) for u in seen.values())
        s["out_tok"] = sum(u.get("output_tokens", 0) for u in seen.values())
    s["files"], s["lines"], s["bytes"] = code_stats(A / r)
    s["has_index"] = (A / r / "index.html").exists()
    return s


if __name__ == "__main__":
    out = {r: run_stats(r) for r in RUNS if (A / "_logs" / r).exists()}
    (A / "_tools" / "stats.json").write_text(json.dumps(out, indent=1))
    for r, s in out.items():
        print(f"{r:13} {s['status']:8} {s.get('duration_s', 0)/60:6.1f} min  ${s['cost_usd'] or 0:6.2f}  out {s['out_tok']:>8,}  "
              f"tools {s['tool_calls']:>3}  shots {s['shots']:>2}  lines {s['lines']:>5}")
