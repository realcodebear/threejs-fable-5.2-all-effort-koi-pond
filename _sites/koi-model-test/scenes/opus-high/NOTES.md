# Koi Pond at Dusk — notes

A real-time three.js (r170) scene of a small Japanese garden pond at dusk. Open `index.html`
from a local web server (it uses ES modules and an import map). Everything is generated in code:
there are no textures, models, images, sounds or network requests.

## What's in the scene

- **Koi (12)**: procedurally built bodies (elliptical cross-section rings), forked tail, dorsal,
  pectoral and pelvic fins. The varieties are kohaku ×3, sanke ×2, showa, tancho, yamabuki ogon,
  platinum ogon, orange/white, asagi and chagoi. Their patterns are made per-pixel from 3D simplex
  noise in the fish's local space, so each fish has its own crisp red, black or white patches, plus
  scale shimmer, eyes and fin rays.
- **Water**: planar reflection (mirror camera with an oblique clip plane), screen-space
  refraction of the underwater view with depth-based absorption, procedural small waves (sines plus
  noise, with a slowly drifting "breeze" mask so some patches go mirror-calm), expanding ripple
  rings, warm light scattering near lanterns, and specular glints from every lantern and the moon.
- **Ripples** come from koi rising to "kiss" the surface, maple leaves landing on the water, and
  occasional random drips.
- **Lily pads (~24)** with veins and red rims bob gently on the water. **Water lilies** (pink and
  white, layered petals with golden stamens) sit on some of the pads.
- **Stones**: about 90 noise-displaced, faceted rocks, mostly ringing the edge, plus two rising
  out of the water and a scattering on the bank. They have moss on their top
  faces, lichen specks, and a darker, glossier wet band at the waterline. Pebbles cover the pond
  floor.
- **Lanterns**:
  - three paper chōchin hang from the maple's branches over the water
  - one more hangs from a bamboo pole that reaches over the pond
  - a stone tōrō (kasuga-style) has a glowing firebox
  - three floating paper lanterns (tōrō nagashi) drift on a slow circulating current
  
  All of them flicker softly, light the scene with point lights, and reflect and glint on the water.
- **Japanese maple** in autumn red overhangs the pond. Its leaves sway, and individual leaves
  flutter down, land on the water with a ripple, drift, then sink.
- Also: grass clumps and iris with violet flowers at the water's edge, pruned shrubs (one
  flowering), a bamboo grove, a tiered cedar tree line, low drifting mist, fireflies, and a dusk sky
  with sunset afterglow, clouds, stars and a moon.
- **Post-processing**: HDR rendering with 4× MSAA, Unreal bloom, ACES tone mapping, then a final pass
  for vignette, a slight split tone and dithering.

## How it works

`js/main.js` renders three passes every frame:

1. **Reflection** at half resolution through a mirrored camera. The surface items (water, pads,
   floating leaves) and the underwater items (koi, pebbles) are hidden.
2. **Refraction** at 0.75× resolution with 4× MSAA plus a depth texture. Only the pond bed, rocks,
   pebbles and koi are visible.
3. **Main** through the EffectComposer. The koi and pebbles are hidden here, because the opaque
   water shader composites them from the refraction texture. Thickness is computed from the depth
   texture and colour is absorbed per channel. If the distorted sample hits something in front of
   the water, the shader falls back to the undistorted one.

Files:

| File | What it holds |
|---|---|
| `js/util.js` | Seeded RNG, CPU value noise, GLSL simplex noise, a `patchMaterial` helper that injects code into built-in materials |
| `js/pond.js` | Pond shape (signed distance), terrain height and mesh, pond-bed pebbles |
| `js/rocks.js` | Stone material and procedural rocks |
| `js/water.js` | Water shader, ripple buffer (20 rings), mirror and refraction targets |
| `js/koi.js` | Koi geometry, swim-deformation shader, patterns, steering |
| `js/plants.js` | Lily pads and flowers, grass and iris, shrubs, bamboo and cedars, maple, falling leaves |
| `js/lanterns.js` | Hanging, stone and floating lanterns, the current field, fireflies |
| `js/sky.js` | Dusk sky dome; a simplified copy of it is baked into a PMREM environment map |
| `js/mist.js` | Two noise-driven mist layers |
| `js/debug.js` | Development switches (all off) |

**Koi steering** combines several pieces:

- wander uses a smooth noise turn rate
- a look-ahead on the pond's signed distance steers them along the shore and back inside, with a
  hard containment step as a backstop
- soft separation keeps fish apart, with slight alignment to nearby fish
- cruise speed varies with occasional bursts
- depth drifts slowly and is kept above the pond bed

Tail-beat frequency follows speed. The body bends into turns (curvature = turn rate / speed), and the
swimming wave is a travelling sine whose amplitude grows toward the tail. Normals are corrected for
the bend. The simulation was fast-forwarded 10 minutes during testing; the fish stayed spread out
and inside the pond.

**Camera**: OrbitControls with damping and slow auto-rotate (one orbit takes about 3 minutes). Drag
orbits and the wheel zooms between distances 3.5 and 13; pan is disabled and the polar angle is
limited. When the user lets go, auto-rotate carries on from wherever they left the camera.

## Performance

- The scene renders at most about 1080p worth of pixels: pixel ratio = min(devicePixelRatio,
  √(1920·1080 / window area)). On a Retina MacBook a full-screen window is therefore not rendered at
  4K.
- An adaptive step lowers resolution (to as little as 70%) only after two consecutive 2-second
  windows below 40 fps.
- In the test harness at 1920×1080 the page runs at the 60 fps cap. A stress test that rendered
  every frame 3× still ran at ~38 fps, so a normal frame takes about 9 ms of GPU time.
- Shader cost was kept down in three ways: the sky is drawn last at depth 1, so only pixels not
  covered by anything else pay for it; the stone and terrain noise uses few octaves; and the mist is
  two layers of two-octave noise that are discarded outside the pond.

## Known issues and limitations

- Refraction is screen-space. At the very edges of the screen, or behind a rock that pokes through
  the surface, the distorted sample may fall back to the undistorted one, so a little detail is lost.
- When a koi rises to the surface, any part of its back above the water line is not drawn, because
  koi only appear through the water. This is hard to notice since they only touch the surface.
- Lily pads and floating leaves are left out of the reflection pass on purpose, because their mirror
  images coincide with themselves.
- Koi swim under lily pads instead of avoiding them, and their separation is soft, so two fish can
  briefly overlap.
- There are 8 point lights, which is the main fixed lighting cost. Lantern reflections on the water
  come from the mirror render; the glints and glow are analytic.
- The PMREM environment uses a simplified sky (no clouds, stars or moon) with a NaN/clamp guard. With
  the full sky shader, one sun direction produced NaNs in the prefiltered map and the whole frame
  went black.
- The screenshot tool seems to stop waiting at about 30 s, so longer runs were checked with the
  `skip` fast-forward switch in `js/debug.js` rather than in real time.
- Screenshots from development are in `./shots` (`final_start.png` shows the opening framing).
