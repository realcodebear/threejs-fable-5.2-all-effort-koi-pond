# Koi Pond Effort Test

One prompt, seven runs. Claude Fable 5.2 built the same three.js koi pond at five effort levels (low, medium, high, xhigh, max). Claude Opus 5.5 and GPT-6 Astra got the same prompt at high effort.

**Live site:** https://realcodebear.github.io/threejs-fable-5.2-all-effort-koi-pond/

- [Hub](https://realcodebear.github.io/threejs-fable-5.2-all-effort-koi-pond/): every scene, full screen, use ← → to flip between them
- [Effort test](https://realcodebear.github.io/threejs-fable-5.2-all-effort-koi-pond/_sites/koi-effort-test/): Fable 5.2 low → max, side by side, with the numbers
- [Model test](https://realcodebear.github.io/threejs-fable-5.2-all-effort-koi-pond/_sites/koi-model-test/): Fable 5.2 vs Opus 5.5 vs GPT-6 Astra at high

## The runs

| Run | Time | API cost | Output tokens | Lines of code | Self-check screenshots | Links |
|---|---|---|---|---|---|---|
| Fable 5.2 · Low | 12 min | $4.03 | 64k | 980 | 5 | [open](https://realcodebear.github.io/threejs-fable-5.2-all-effort-koi-pond/view.html?r=fable-low) · [code](fable-low/) · [notes](fable-low/NOTES.md) |
| Fable 5.2 · Medium | 22 min | $7.86 | 119k | 1,564 | 16 | [open](https://realcodebear.github.io/threejs-fable-5.2-all-effort-koi-pond/view.html?r=fable-medium) · [code](fable-medium/) · [notes](fable-medium/NOTES.md) |
| Fable 5.2 · High | 44 min | $18.01 | 239k | 2,394 | 27 | [open](https://realcodebear.github.io/threejs-fable-5.2-all-effort-koi-pond/view.html?r=fable-high) · [code](fable-high/) · [notes](fable-high/NOTES.md) |
| Fable 5.2 · XHigh | 73 min | $32.07 | 385k | 3,008 | 39 | [open](https://realcodebear.github.io/threejs-fable-5.2-all-effort-koi-pond/view.html?r=fable-xhigh) · [code](fable-xhigh/) · [notes](fable-xhigh/NOTES.md) |
| Fable 5.2 · Max | 101 min | $51.71 | 491k | 4,607 | 70 | [open](https://realcodebear.github.io/threejs-fable-5.2-all-effort-koi-pond/view.html?r=fable-max) · [code](fable-max/) · [notes](fable-max/NOTES.md) |
| Opus 5.5 · High | 35 min | $8.92 | 177k | 2,369 | 26 | [open](https://realcodebear.github.io/threejs-fable-5.2-all-effort-koi-pond/view.html?r=opus-high) · [code](opus-high/) · [notes](opus-high/NOTES.md) |
| GPT-6 Astra · High | 7 min | n/a | 18k | 298 | 7 | [open](https://realcodebear.github.io/threejs-fable-5.2-all-effort-koi-pond/view.html?r=astra-high) · [code](astra-high/) · [notes](astra-high/NOTES.md) |

Time, tokens and cost come from each run's own log. No cost is listed for GPT-6 Astra because its run log did not report one.

## The prompt

The exact text every run got is in [PROMPT.md](PROMPT.md). Nobody answered questions or gave feedback during a run.

## How it was run

- Each model ran in its own harness with no MCP servers, hooks, memory or custom instructions: [run.sh](run.sh)
- Tools: file read/write/edit, a few read-only shell commands, and [shot.sh](shot.sh), which opens the scene in real Chrome with the GPU, saves a screenshot and prints the frame rate and console errors
- One MacBook (Apple M-series, 24 GB). The screenshot tool served one request at a time
- three.js r170 was given to every run in `./three`. Everything else is code the model wrote: no downloaded images, textures, models or sounds

## What is in this repo

| Path | What |
|---|---|
| `fable-low/` … `fable-max/`, `opus-high/`, `astra-high/` | Each run's folder as the model left it: scene code, its own `NOTES.md`, and the screenshots it took in `shots/` |
| `_sites/koi-effort-test/`, `_sites/koi-model-test/` | The two comparison sites (also written by Fable 5.2) |
| `index.html`, `view.html`, `hub.json` | The hub page and full-screen viewer |
| `_tools/` | Harness helpers: screenshot service, stats, site builder |
| `_vendor/` | three.js r170 and fonts |

Not included: raw run logs (large, and they contain local machine details). Home-folder paths in `run.sh` and `_tools/stats.py` were replaced with a placeholder. Scenes are unedited.

## Run it locally

```bash
python3 -m http.server 8800
```

Then open http://127.0.0.1:8800/

## Credits

Made by [The Code Bear](https://www.youtube.com/@thecodebear). three.js is MIT licensed. Fonts: Inter, Space Grotesk, JetBrains Mono (SIL Open Font License).
