# Koi pond at dusk

A small Japanese garden pond just after sunset, built entirely in code with three.js r170.
Open `index.html` (served over http, like any ES-module page). No UI, no text, no network requests, no image/model/sound files.

## What is in the scene

- **Pond** (about 7.6 × 5 m, organic outline) with a sloping bed, pebbles, and a ring of shore stones.
- **14 koi** in several varieties (kohaku, sanke, showa, tancho, ogon, asagi, utsuri …), 0.5–1 m long.
- **Water** with real ripple rings, planar reflections and refraction with depth-dependent murk.
- **Lily pads** in clusters (about 60), **water lilies** (open flowers and buds, white and pink), stems visible under water.
- **Lanterns**: three floating paper lanterns, five paper lanterns on a rope behind the far shore, one stone lantern. All flicker slightly, light their surroundings and reflect in the water.
- **Extras**: Japanese maple in autumn colour with falling/floating leaves, bamboo clumps, bamboo fence, clipped shrubs (some in bloom), iris/reed clumps, moss lawn, stepping stones, fireflies, a dusk sky with afterglow, streaky clouds, stars, crescent moon and layered hills.

## Files

| File | Contents |
| --- | --- |
| `index.html` | Canvas + import map, nothing else |
| `main.js` | Renderer, lights, post-processing, camera rig, resize, main loop |
| `common.js` | Pond outline (shared by JS and GLSL), terrain height, noise, layer helpers |
| `water.js` | Ripple simulation, water surface shader, reflection/refraction passes |
| `koi.js` | Koi mesh, bending/pattern shader, swimming behaviour |
| `garden.js` | Terrain, stones, grass, bamboo, maple, fence, shrubs |
| `lily.js` | Pads, flowers, stems |
| `lanterns.js` | Floating, hanging and stone lanterns + their lights |
| `extras.js` | Fireflies, falling leaves |
| `sky.js` | Sky dome shader |
| `shots/` | Screenshots taken while working (`v07.png` is the opening view) |

## How it works

**Frame.** Each frame renders: (1) ripple simulation step(s), (2) an *underwater* pass (pond bed, koi, stems, stones) into a colour + depth target, (3) a *mirror* pass from a camera reflected about the water plane (oblique near plane, 0.6× resolution, mip-mapped), (4) the main view with 4× MSAA into a half-float target, then bloom and a final pass (ACES tone mapping, vignette, sRGB, a little static dither against banding). Three render layers decide what each pass sees; the koi exist only in the underwater pass and are seen through the water shader.

**Water.** The surface normal is the gradient of a 640² wave-equation height field (ping-pong half-float targets, fixed 60 Hz step, damped at the shore) plus four scrolling layers of a tileable wavelet texture generated at start-up. Drops are injected by koi swimming near the surface, koi "kissing" the surface, falling leaves, bobbing lanterns and occasional random touches. Reflection: the reflected ray is followed a fixed distance and projected into the mirror camera, which stretches reflections naturally at grazing angles; a second, blurrier tap with different wavelets stands in for unresolved ripples. Refraction: the underwater image is sampled with a normal-dependent offset (rejected where it would pick up something above the surface) and attenuated by the path length through the water and by depth. Reflection and refraction are mixed with a Fresnel term that is deliberately stronger than physical so that both the sky and the fish read well.

**Koi.** One instanced mesh (lofted body, tail, dorsal, pectoral and pelvic fins). The vertex shader bends the spine with a travelling wave whose amplitude grows towards the tail, plus a curvature term driven by the turn rate (the tail uses a delayed copy so it lags the head); pectoral fins paddle. Colour patterns are 3D noise thresholds in body space with per-fish seed, colours and thresholds. Behaviour is steering: a random-walk turn rate, three whisker probes against the pond outline, separation from and loose alignment with neighbours, glide/cruise/burst speeds, tail-beat frequency tied to speed, slow depth changes and the occasional rise to the surface.

**Lighting.** Image-based light from the sky dome (PMREM), a warm low directional "afterglow", a cool fill, and seven point lights for the lanterns. No shadow maps (dusk light is soft); koi and lily pads get cheap blob shadows under water.

**Camera.** OrbitControls for drag/zoom (pan disabled, limits keep the camera above ground and inside the bamboo). When nobody is interacting the rig slowly swings back and forth across a ~145° arc on the front side of the pond while height and distance breathe; after a drag or zoom it waits about a second and eases back in from wherever the viewer left it.

**Resolution.** Render size follows the window and device pixel ratio, capped at about 3 MP. If the frame rate stays below 40 fps the internal resolution steps down (and can step back up once if there is room).

## Checked

- `../shot.sh` at 1920×1080: no console errors, ~57–60 fps (the harness is vsync-limited). Rendering every frame four times still held 30 fps, so there is roughly 2× headroom over 60 fps on this machine.
- Also checked 1280×720 and a portrait window (900×1300), the opening view, both ends of the camera swing, close-ups, a top-down view, and the state after 40–90 s.

## Known problems / limits

- Motion was judged from still frames (including frozen-time pairs half a second apart), not from watching it live; drag and zoom were not exercised by the screenshot tool and rely on stock OrbitControls behaviour.
- Koi avoid each other but can still cross over one another at different depths; they do not react to the viewer.
- Ripples pass through lily pads, floating lanterns and stones in the water; pads do not ride the waves.
- Reflections are a planar approximation: with strong ripples they shimmer rather than blur physically, and things touching the waterline are cut exactly at water level.
- No cast shadows.
- At the left end of the automatic swing the camera comes close to the maple, so foliage fills part of the frame for a while.
- On a machine that cannot hold 40 fps the resolution step is a visible one-off change in sharpness.
- `DEBUG_VIEW` / `DEBUG_WARP` in `main.js` are development aids (fixed close-up view, pre-run simulation); both are off.
