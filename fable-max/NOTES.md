# Koi pond at dusk — notes

Open `index.html` (through any static web server; `../shot.sh . shots/check.png 6` does this).
Everything on screen is generated in code at start-up: no image, model, sound or network
request. The only library is three.js r170 from `./three`, loaded through the required
import map.

## What is in the scene

- A gourd-shaped pond in a small walled Japanese garden, a few minutes after sunset:
  afterglow in the west with thin lit clouds and layered hills, a young crescent moon,
  the first stars, deep blue overhead.
- **16 koi** of different varieties (kohaku, sanke, showa, tancho, ogon, yamabuki, platinum,
  utsuri, bekko, asagi, a few with long "butterfly" fins). They cruise, turn, follow each
  other in loose lines, pass over and under one another, put on the occasional burst of
  speed and now and then rise to "kiss" the surface, which starts a ring of ripples.
- **Water** with real-time reflections, refraction with depth-dependent tint, a ripple
  simulation (koi wakes, surface kisses, falling leaves, bobbing lanterns, small random
  touches) and a faint breeze texture that comes and goes in patches.
- **Lily pads** in clusters (they bob and tilt on the ripples and calm the water under them),
  pink and white **water lilies** and buds.
- **Stones** all round the edge: wet and dark at the waterline, mossy on top, more of them
  under water and scattered over the moss.
- **Paper lanterns**: three floating on the pond, one on a wooden post, one hanging from a
  branch of the maple, plus a stone "snow-viewing" lantern with paper windows. Each has a
  flickering light that warms the stones, plants, leaves and the koi passing under it, and
  each is mirrored in the water.
- Extras: a red Japanese maple leaning over the water (its leaves keep drifting down and
  make ripples when they land on the pond), a bamboo grove, clipped azalea mounds (some in
  bloom), irises and grasses along the bank, a bamboo fence, cloud-pruned pines beyond it,
  fireflies.

## Camera

The view starts on a composed frame and then orbits the pond very slowly (one turn in
3.5 minutes) while gently rising and sinking. Drag to orbit, scroll (or pinch) to zoom.
While you interact the automatic motion stops exactly where the camera is; about a second
after you let go it eases back in from your view. Zoom is limited to 2.6 – 11 m so the camera
stays inside the garden. The mouse pointer hides itself after 2.5 s without movement.

## How it works

Files (`js/`):

| file | contents |
|---|---|
| `main.js` | renderer, scene assembly, camera behaviour, frame loop, resolution watchdog |
| `common.js` | seeded random numbers, pond outline as a signed-distance grid, terrain height, GLSL noise, helper for patching three.js standard materials |
| `noisetex.js` | tileable 2D and 3D noise textures (built once, used instead of per-pixel procedural noise) |
| `sky.js` | sky shader (gradient, clouds, stars, moon, hills) and the environment map made from it |
| `lighting.js` | shared cheap lighting for custom shaders, ambient cube, one-time ground light bake |
| `terrain.js` | ground mesh and shader (moss, earth, pebbles, silt) |
| `stones.js` | rock shapes, placement, stone material |
| `water.js` | ripple simulation, reflection and refraction passes, water surface shader |
| `koi.js` | fish geometry, swim deformation, pattern shader, behaviour |
| `lilies.js` | lily pads, water lilies, irises |
| `lanterns.js` | the three kinds of lantern and their lights |
| `flora.js` | grasses, azaleas, bamboo, fence, pines |
| `tree.js` | the maple and its falling leaves |
| `particles.js` | fireflies |
| `post.js` | bloom, tone mapping, grading |
| `debug.js` | development switches (all off) |

**Frame.** Each frame renders: (1) the scene mirrored in the water plane into a half-size
target (reflection), (2) only what is under water into a full-size target with a depth
texture (refraction), (3) the main view into a 4x multisampled HDR target, (4) a bloom
pyramid, then tone mapping (ACES), a light grade, vignette and dither. Objects are tagged
for the passes they belong to, so nothing is drawn where it cannot be seen (the koi and the
pond bed exist only in the refraction pass, for example).

**Water surface.** The shader takes the surface slope from the ripple simulation plus three
scrolling layers of a tileable normal texture, then
- looks up the reflection with a parallax-corrected offset: the reflected ray is followed
  for a distance estimated by marching the pond's distance field, and that point is
  projected into the mirrored camera. Reflections therefore stay attached to stones at the
  waterline and stretch into streaks further away. A blurred mip level is used, more blurred
  where the breeze ruffles the water;
- looks up the refraction with an offset from the refracted ray, checks depth so that
  nothing in front of the water bleeds in, and tints by the water thickness (red is
  absorbed first, plus a little scattering);
- blends the two with Fresnel and fades to nothing at the shoreline.

**Ripples.** A height field (768 x 1024, two half-float channels) is advanced with the
discrete wave equation at a fixed 60 steps per second, independent of the frame rate.
Disturbances are drawn into it as small additive splats: oscillating "drops" that send out
a few concentric rings, and for each koi near the surface a positive/negative pair (bow and
stern) that leaves a wake. The shore absorbs waves and lily pads damp them. The pads and
flowers read the same texture in their vertex shader to ride the waves.

**Koi.** The body is lofted from width/height profiles along the spine; fins are thin
sheets. The vertex shader bends the fish with a travelling wave that grows towards the tail
plus an arc that follows the current turn, and moves the fins. Tail-beat rate and amplitude
come from the swimming speed and acceleration, so fish that speed up work harder and fish
that slow down glide. Colour patterns, scales, gill line and eyes are procedural. Behaviour
is a small steering model: wander, roam to random spots, follow a leader for a while, avoid
the banks using the distance field, keep apart sideways and in depth.

**Light.** There are no real-time shadows. Instead, once at start-up the sky is sampled in
56 directions and for each one a depth map of the whole garden is rendered and its light
accumulated onto the ground (plus the directional afterglow). The result is a texture of
sky light with soft shadows and contact shading under stones, shrubs, bamboo and the tree;
ground and grass read it at run time. An "ambient cube" integrated from the same sky shader
lights plants and trees, the lanterns are added as simple diffuse lights, and the few glossy
materials (stones, lily pads, koi, lantern wood) use three.js physically based shading with
an environment map rendered from the sky.

**Performance.** Measures that mattered: noise from textures instead of per-pixel hashing,
the baked ground light, pass culling as described above, the sky drawn last so hidden sky is
never shaded, splatted ripple sources, instancing for everything that repeats, and a bloom
chain that starts at quarter resolution. The internal resolution is the window size times the
device pixel ratio, capped at about 3 megapixels. A watchdog lowers the resolution in steps
if the frame rate stays under 44 fps; if lowering it does not help (the browser is limiting
the frame rate itself) it restores the resolution and stops.

Measured with `../shot.sh` (headless Chrome, Apple M4 Pro, 1920 x 1080): 60 fps, the cap of the
tool. To see the headroom I rendered every frame several times over: four times per frame at
2304 x 1296 still ran at about 54 fps, i.e. roughly 4.6 ms for one frame, so there is about
three and a half times headroom at 60 fps on that machine.

`shots/` holds screenshots of the finished scene: the opening view, 20 s later, from the side,
from behind, from above, a close-up and a low view across the water.

## Development switches

`js/debug.js` has flags for a fixed camera, starting further round the orbit, skipping ahead
in time, logging the frame rate, a stress test, a benchmark that switches parts of the frame
off one by one, a simulated drag/zoom test, and lifting koi out of the water to inspect the
model. All are off.

## Known problems and limits

- I could only test in the headless Chrome of `../shot.sh` on an M4 Pro. I have not seen it on
  a slower M-series MacBook; the headroom above and the resolution watchdog are what I am
  relying on there. Drag and zoom were tested with synthetic pointer and wheel events, not
  by hand.
- Start-up takes a moment (ground light bake and shader compilation) before the picture
  fades in from black.
- Lantern light casts no shadows, and the baked ground light does not change when the
  floating lanterns drift or leaves move.
- Reflections are planar with an approximate ripple offset: at the very edge of the screen
  the reflection can smear slightly, and the red maple canopy reflects as a fairly soft
  mass rather than individual leaves.
- Koi are drawn only through the water surface, so a fin never actually breaks the surface;
  two fish can still touch or overlap briefly when their paths cross.
- Ripples are a non-dispersive wave model: rings do not break up the way real capillary
  waves do, and the floating lanterns do not block them.
- The camera does not collide with anything. On its automatic path it stays clear, but by
  hand you can put it inside the maple, a shrub or the tall grasses.
- After many hours the animation would slowly lose smoothness because time is kept in a
  32-bit float in the shaders; reload to reset.
- It needs WebGL 2 with float render targets (fine on Apple GPUs; not tried elsewhere).
