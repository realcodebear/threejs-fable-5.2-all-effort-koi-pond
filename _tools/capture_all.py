#!/usr/bin/env python3
"""Capture stills + fps for every finished run, one at a time, nothing else on the GPU. -> _tools/stills/*.jpg + captures.json"""
import json, subprocess, sys
from pathlib import Path
A = Path.home() / "koi-arena"; T = A / "_tools"; S = T / "stills"; S.mkdir(exist_ok=True)
runs = sys.argv[1:] or ["fable-low", "fable-medium", "fable-high", "fable-xhigh", "fable-max", "opus-high", "astra-high"]
cj = T / "captures.json"; cap = json.loads(cj.read_text()) if cj.exists() else {}
for r in runs:
    if not (A / r / "index.html").exists(): print(r, "no index.html"); continue
    p = subprocess.run(["node", str(T / "capture.mjs"), str(A / r), str(S / r), "4,10,20"], capture_output=True, text=True, timeout=180)
    try: res = json.loads(p.stdout.strip().splitlines()[-1])
    except Exception: print(r, "FAILED", p.stderr[-500:]); continue
    for t in (4, 10, 20):
        png = S / f"{r}_{t}s.png"
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(png), "-q:v", "3", str(S / f"{r}_{t}s.jpg")], check=True); png.unlink()
    cap[r] = {**cap.get(r, {}), **res}; print(r, res)
cj.write_text(json.dumps(cap, indent=1))
