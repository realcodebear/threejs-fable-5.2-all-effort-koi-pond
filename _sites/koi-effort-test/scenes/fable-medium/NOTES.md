# Koi pond at dusk

Open `index.html` (through any local web server). Everything is generated in code with
three.js r170 from `./three`; there are no images, models, sounds or network requests.

## What is in the scene

- An irregular pond with 13 koi of different varieties (kohaku, sanke, showa, ogon, tancho, ...).
- Water with real ripples (fish wakes, fish "kissing" the surface, random drops, lantern bobbing),
  mirror reflections and a tinted view of the pond bed and fish below.
- Lily pads in clusters, about a third of them with pink or white flowers; fallen maple leaves.
- A ring of mossy stones, pebbles, stepping stones, reeds, grass tufts and clipped shrubs.
- Lanterns: four paper lanterns floating on the water, five round paper lanterns on a line
  across the back of the pond, and one stone lantern on the bank. All of them light the garden
  and reflect in the water.
- A red Japanese maple, a bamboo grove, a slatted fence, tree silhouettes, fireflies,
  and a dusk sky with afterglow, drifting clouds, stars and a crescent moon.

## How it works

| File | Role |
| --- | --- |
| `js/main.js` | Renderer, lights, camera, the three render passes per frame, post-processing |
| `js/water.js` | Ripple simulation and the water surface shader |
| `js/fish.js` | Koi geometry, swimming shader, colour patterns, steering behaviour |
| `js/scenery.js` | Sky, terrain, stones, lilies, grass, shrubs, maple, bamboo, fence, fireflies |
| `js/lanterns.js` | Floating, hanging and stone lanterns with flickering point lights |
| `js/common.js` | Seeded random, noise, pond shape function, shared shader snippets |

**Water.** A 512x512 height field is advanced with a wave equation on the GPU (ping-pong render
targets, fixed 60 Hz step). Fish, lanterns and random drops add small bumps; the shoreline is a
fixed boundary so waves bounce off it. Each frame the scene is drawn three times:

1. below-surface view (terrain, stones, fish) with a depth texture,
2. a mirrored view at half resolution for reflections (clipped at the water plane),
3. the final view, where the water shader mixes the two by a Fresnel term, bends both with the
   ripple normals, and tints the underwater part by how much water the view ray passes through.

**Koi.** One shared mesh (body rings plus tail, dorsal and paired fins). The vertex shader bends it
with a travelling wave that grows toward the tail and curves the body into turns. Patterns come
from 3D noise thresholds per fish. Each fish wanders toward changing "home" points, steers away
from the shore and from other fish, varies speed and depth, and occasionally rises to the surface.

**Look.** Half-float HDR pipeline, 4x MSAA, bloom, vignette, ACES tone mapping. One static shadow
map from the afterglow direction (computed once). Ten small point lights for the lanterns.

**Camera.** Starts on a front view toward the sunset and sweeps slowly left and right across the
front of the pond while gently changing height and distance. Drag to orbit, scroll to zoom; about
2.5 seconds after letting go the slow motion resumes from wherever the camera is.

## Checked

- `../shot.sh` at 1920x1080, 1280x720 and 900x1200: about 60 fps in headless Chrome, no console errors.
- Views from the front, both ends of the sweep, behind the maple, and a close-up of the water.

## Known problems

- Frame rate was only measured through `shot.sh`, not on a physical MacBook display. Internal
  resolution is capped at about 2560x1440 pixels, and it drops automatically in steps if the
  frame rate stays under 40 fps.
- After the viewer zooms or tilts, the automatic motion slowly eases back to its own height and
  distance, so a manual zoom does not stay forever.
- If the viewer orbits to the back, the camera can sit inside the maple leaves or bamboo; the
  automatic sweep avoids that side and will drift back to the front.
- The shadow map is static, so swaying grass, leaves and the lanterns do not cast moving shadows,
  and fish cast no shadows on the pond bed.
- Ripples change the water's shading and reflections only; lily pads and floating lanterns do not
  physically ride the waves.
- Distant trees are simple silhouettes and look blocky if examined closely.
