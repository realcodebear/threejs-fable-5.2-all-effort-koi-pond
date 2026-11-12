window.SITE = {
 "title": "Koi Pond Model Test \u00b7 Fable 5.2 vs Opus 5.5 vs GPT-6 Astra",
 "brand": "Koi Pond Model Test",
 "accent": "#4fb3ff",
 "eyebrow": "Fable 5.2 vs Opus 5.5 vs GPT-6 Astra \u00b7 all at high effort",
 "h1": "Three models, one koi pond",
 "lede": "Claude Fable 5.2, Claude Opus 5.5 and GPT-6 Astra each got the exact same prompt at high effort: build a koi pond at dusk in three.js, from code alone. Each ran in its own maker's coding tool, with no help. Here are the three ponds side by side.",
 "chips": [
  "three.js r170",
  "no images, no models: code only",
  "one run each",
  "no human help",
  "$29.34 in API cost"
 ],
 "runs": [
  {
   "id": "fable-high",
   "label": "Fable 5.2",
   "short": "Fable 5.2",
   "sub": "Claude Fable 5.2 \u00b7 high",
   "color": "#ff8a1f",
   "url": "scenes/fable-high/index.html",
   "base": "scenes/fable-high/",
   "stills": [
    "img/fable-high_4s.jpg",
    "img/fable-high_10s.jpg",
    "img/fable-high_20s.jpg"
   ],
   "stats": {
    "run": "fable-high",
    "tool_calls": 189,
    "shots": 27,
    "images_viewed": 23,
    "in_tok": 327196,
    "cached_tok": 16054112,
    "out_tok": 239118,
    "reason_tok": 0,
    "cost_usd": 18.009574399999998,
    "turns": 190,
    "status": "done",
    "model": "claude-fable-5-2",
    "effort": "high",
    "duration_s": 2634,
    "files": [
     {
      "path": "common.js",
      "lines": 172,
      "bytes": 8108
     },
     {
      "path": "extras.js",
      "lines": 128,
      "bytes": 5824
     },
     {
      "path": "garden.js",
      "lines": 615,
      "bytes": 29595
     },
     {
      "path": "index.html",
      "lines": 20,
      "bytes": 651
     },
     {
      "path": "koi.js",
      "lines": 416,
      "bytes": 21168
     },
     {
      "path": "lanterns.js",
      "lines": 201,
      "bytes": 10386
     },
     {
      "path": "lily.js",
      "lines": 211,
      "bytes": 10408
     },
     {
      "path": "main.js",
      "lines": 215,
      "bytes": 10487
     },
     {
      "path": "sky.js",
      "lines": 90,
      "bytes": 3840
     },
     {
      "path": "water.js",
      "lines": 326,
      "bytes": 14351
     }
    ],
    "lines": 2394,
    "bytes": 114818,
    "has_index": true,
    "fps": 59
   },
   "strip": "44 min \u00b7 $18.01",
   "notes_html": "<h3>Koi pond at dusk</h3>\n<p>A small Japanese garden pond just after sunset, built entirely in code with three.js r170. Open <code>index.html</code> (served over http, like any ES-module page). No UI, no text, no network requests, no image/model/sound files.</p>\n<h3>What is in the scene</h3>\n<ul>\n<li><b>Pond</b> (about 7.6 \u00d7 5 m, organic outline) with a sloping bed, pebbles, and a ring of shore stones.</li>\n<li><b>14 koi</b> in several varieties (kohaku, sanke, showa, tancho, ogon, asagi, utsuri \u2026), 0.5\u20131 m long.</li>\n<li><b>Water</b> with real ripple rings, planar reflections and refraction with depth-dependent murk.</li>\n<li><b>Lily pads</b> in clusters (about 60), <b>water lilies</b> (open flowers and buds, white and pink), stems visible under water.</li>\n<li><b>Lanterns</b>: three floating paper lanterns, five paper lanterns on a rope behind the far shore, one stone lantern. All flicker slightly, light their surroundings and reflect in the water.</li>\n<li><b>Extras</b>: Japanese maple in autumn colour with falling/floating leaves, bamboo clumps, bamboo fence, clipped shrubs (some in bloom), iris/reed clumps, moss lawn, stepping stones, fireflies, a dusk sky with afterglow, streaky clouds, stars, crescent moon and layered hills.</li>\n</ul>\n<h3>Files</h3>\n<p>| File | Contents | | --- | --- | | <code>index.html</code> | Canvas + import map, nothing else | | <code>main.js</code> | Renderer, lights, post-processing, camera rig, resize, main loop | | <code>common.js</code> | Pond outline (shared by JS and GLSL), terrain height, noise, layer helpers | | <code>water.js</code> | Ripple simulation, water surface shader, reflection/refraction passes | | <code>koi.js</code> | Koi mesh, bending/pattern shader, swimming behaviour | | <code>garden.js</code> | Terrain, stones, grass, bamboo, maple, fence, shrubs | | <code>lily.js</code> | Pads, flowers, stems | | <code>lanterns.js</code> | Floating, hanging and stone lanterns + their lights | | <code>extras.js</code> | Fireflies, falling leaves | | <code>sky.js</code> | Sky dome shader | | <code>shots/</code> | Screenshots taken while working (<code>v07.png</code> is the opening view) |</p>\n<h3>How it works</h3>\n<p><b>Frame.</b> Each frame renders: (1) ripple simulation step(s), (2) an *underwater* pass (pond bed, koi, stems, stones) into a colour + depth target, (3) a *mirror* pass from a camera reflected about the water plane (oblique near plane, 0.6\u00d7 resolution, mip-mapped), (4) the main view with 4\u00d7 MSAA into a half-float target, then bloom and a final pass (ACES tone mapping, vignette, sRGB, a little static dither against banding). Three render layers decide what each pass sees; the koi exist only in the underwater pass and are seen through the water shader.</p>\n<p><b>Water.</b> The surface normal is the gradient of a 640\u00b2 wave-equation height field (ping-pong half-float targets, fixed 60 Hz step, damped at the shore) plus four scrolling layers of a tileable wavelet texture generated at start-up. Drops are injected by koi swimming near the surface, koi &quot;kissing&quot; the surface, falling leaves, bobbing lanterns and occasional random touches. Reflection: the reflected ray is followed a fixed distance and projected into the mirror camera, which stretches reflections naturally at grazing angles; a second, blurrier tap with different wavelets stands in for unresolved ripples. Refraction: the underwater image is sampled with a normal-dependent offset (rejected where it would pick up something above the surface) and attenuated by the path length through the water and by depth. Reflection and refraction are mixed with a Fresnel term that is deliberately stronger than physical so that both the sky and the fish read well.</p>\n<p><b>Koi.</b> One instanced mesh (lofted body, tail, dorsal, pectoral and pelvic fins). The vertex shader bends the spine with a travelling wave whose amplitude grows towards the tail, plus a curvature term driven by the turn rate (the tail uses a delayed copy so it lags the head); pectoral fins paddle. Colour patterns are 3D noise thresholds in body space with per-fish seed, colours and thresholds. Behaviour is steering: a random-walk turn rate, three whisker probes against the pond outline, separation from and loose alignment with neighbours, glide/cruise/burst speeds, tail-beat frequency tied to speed, slow depth changes and the occasional rise to the surface.</p>\n<p><b>Lighting.</b> Image-based light from the sky dome (PMREM), a warm low directional &quot;afterglow&quot;, a cool fill, and seven point lights for the lanterns. No shadow maps (dusk light is soft); koi and lily pads get cheap blob shadows under water.</p>\n<p><b>Camera.</b> OrbitControls for drag/zoom (pan disabled, limits keep the camera above ground and inside the bamboo). When nobody is interacting the rig slowly swings back and forth across a ~145\u00b0 arc on the front side of the pond while height and distance breathe; after a drag or zoom it waits about a second and eases back in from wherever the viewer left it.</p>\n<p><b>Resolution.</b> Render size follows the window and device pixel ratio, capped at about 3 MP. If the frame rate stays below 40 fps the internal resolution steps down (and can step back up once if there is room).</p>\n<h3>Checked</h3>\n<ul>\n<li><code>../shot.sh</code> at 1920\u00d71080: no console errors, ~57\u201360 fps (the harness is vsync-limited). Rendering every frame four times still held 30 fps, so there is roughly 2\u00d7 headroom over 60 fps on this machine.</li>\n<li>Also checked 1280\u00d7720 and a portrait window (900\u00d71300), the opening view, both ends of the camera swing, close-ups, a top-down view, and the state after 40\u201390 s.</li>\n</ul>\n<h3>Known problems / limits</h3>\n<ul>\n<li>Motion was judged from still frames (including frozen-time pairs half a second apart), not from watching it live; drag and zoom were not exercised by the screenshot tool and rely on stock OrbitControls behaviour.</li>\n<li>Koi avoid each other but can still cross over one another at different depths; they do not react to the viewer.</li>\n<li>Ripples pass through lily pads, floating lanterns and stones in the water; pads do not ride the waves.</li>\n<li>Reflections are a planar approximation: with strong ripples they shimmer rather than blur physically, and things touching the waterline are cut exactly at water level.</li>\n<li>No cast shadows.</li>\n<li>At the left end of the automatic swing the camera comes close to the maple, so foliage fills part of the frame for a while.</li>\n<li>On a machine that cannot hold 40 fps the resolution step is a visible one-off change in sharpness.</li>\n<li><code>DEBUG_VIEW</code> / <code>DEBUG_WARP</code> in <code>main.js</code> are development aids (fixed close-up view, pre-run simulation); both are off.</li>\n</ul>",
   "hint": ""
  },
  {
   "id": "opus-high",
   "label": "Opus 5.5",
   "short": "Opus 5.5",
   "sub": "Claude Opus 5.5 \u00b7 high",
   "color": "#d4a373",
   "url": "scenes/opus-high/index.html",
   "base": "scenes/opus-high/",
   "stills": [
    "img/opus-high_4s.jpg",
    "img/opus-high_10s.jpg",
    "img/opus-high_20s.jpg"
   ],
   "stats": {
    "run": "opus-high",
    "tool_calls": 172,
    "shots": 26,
    "images_viewed": 23,
    "in_tok": 260439,
    "cached_tok": 16521848,
    "out_tok": 176738,
    "reason_tok": 0,
    "cost_usd": 8.9219056,
    "turns": 173,
    "status": "done",
    "model": "claude-opus-5-5",
    "effort": "high",
    "duration_s": 2083,
    "files": [
     {
      "path": "index.html",
      "lines": 19,
      "bytes": 651
     },
     {
      "path": "js/debug.js",
      "lines": 10,
      "bytes": 481
     },
     {
      "path": "js/koi.js",
      "lines": 342,
      "bytes": 14970
     },
     {
      "path": "js/lanterns.js",
      "lines": 297,
      "bytes": 14074
     },
     {
      "path": "js/main.js",
      "lines": 241,
      "bytes": 9697
     },
     {
      "path": "js/mist.js",
      "lines": 50,
      "bytes": 1824
     },
     {
      "path": "js/plants.js",
      "lines": 696,
      "bytes": 31210
     },
     {
      "path": "js/pond.js",
      "lines": 124,
      "bytes": 4924
     },
     {
      "path": "js/rocks.js",
      "lines": 141,
      "bytes": 6079
     },
     {
      "path": "js/sky.js",
      "lines": 94,
      "bytes": 4345
     },
     {
      "path": "js/util.js",
      "lines": 130,
      "bytes": 4897
     },
     {
      "path": "js/water.js",
      "lines": 225,
      "bytes": 9807
     }
    ],
    "lines": 2369,
    "bytes": 102959,
    "has_index": true,
    "fps": 60
   },
   "strip": "35 min \u00b7 $8.92",
   "notes_html": "<h3>Koi Pond at Dusk \u2014 notes</h3>\n<p>A real-time three.js (r170) scene of a small Japanese garden pond at dusk. Open <code>index.html</code> from a local web server (it uses ES modules and an import map). Everything is generated in code: there are no textures, models, images, sounds or network requests.</p>\n<h3>What&#x27;s in the scene</h3>\n<ul>\n<li><b>Koi (12)</b>: procedurally built bodies (elliptical cross-section rings), forked tail, dorsal,</li>\n<p>pectoral and pelvic fins. The varieties are kohaku \u00d73, sanke \u00d72, showa, tancho, yamabuki ogon, platinum ogon, orange/white, asagi and chagoi. Their patterns are made per-pixel from 3D simplex noise in the fish&#x27;s local space, so each fish has its own crisp red, black or white patches, plus scale shimmer, eyes and fin rays.</p>\n<li><b>Water</b>: planar reflection (mirror camera with an oblique clip plane), screen-space</li>\n<p>refraction of the underwater view with depth-based absorption, procedural small waves (sines plus noise, with a slowly drifting &quot;breeze&quot; mask so some patches go mirror-calm), expanding ripple rings, warm light scattering near lanterns, and specular glints from every lantern and the moon.</p>\n<li><b>Ripples</b> come from koi rising to &quot;kiss&quot; the surface, maple leaves landing on the water, and</li>\n<p>occasional random drips.</p>\n<li><b>Lily pads (~24)</b> with veins and red rims bob gently on the water. <b>Water lilies</b> (pink and</li>\n<p>white, layered petals with golden stamens) sit on some of the pads.</p>\n<li><b>Stones</b>: about 90 noise-displaced, faceted rocks, mostly ringing the edge, plus two rising</li>\n<p>out of the water and a scattering on the bank. They have moss on their top faces, lichen specks, and a darker, glossier wet band at the waterline. Pebbles cover the pond floor.</p>\n<li><b>Lanterns</b>:</li>\n<li>three paper ch\u014dchin hang from the maple&#x27;s branches over the water</li>\n<li>one more hangs from a bamboo pole that reaches over the pond</li>\n<li>a stone t\u014dr\u014d (kasuga-style) has a glowing firebox</li>\n<li>three floating paper lanterns (t\u014dr\u014d nagashi) drift on a slow circulating current</li>\n</ul>\n<p>All of them flicker softly, light the scene with point lights, and reflect and glint on the water.</p>\n<ul>\n<li><b>Japanese maple</b> in autumn red overhangs the pond. Its leaves sway, and individual leaves</li>\n<p>flutter down, land on the water with a ripple, drift, then sink.</p>\n<li>Also: grass clumps and iris with violet flowers at the water&#x27;s edge, pruned shrubs (one</li>\n<p>flowering), a bamboo grove, a tiered cedar tree line, low drifting mist, fireflies, and a dusk sky with sunset afterglow, clouds, stars and a moon.</p>\n<li><b>Post-processing</b>: HDR rendering with 4\u00d7 MSAA, Unreal bloom, ACES tone mapping, then a final pass</li>\n<p>for vignette, a slight split tone and dithering.</p>\n</ul>\n<h3>How it works</h3>\n<p><code>js/main.js</code> renders three passes every frame:</p>\n<ul>\n<li><b>Reflection</b> at half resolution through a mirrored camera. The surface items (water, pads,</li>\n<p>floating leaves) and the underwater items (koi, pebbles) are hidden.</p>\n<li><b>Refraction</b> at 0.75\u00d7 resolution with 4\u00d7 MSAA plus a depth texture. Only the pond bed, rocks,</li>\n<p>pebbles and koi are visible.</p>\n<li><b>Main</b> through the EffectComposer. The koi and pebbles are hidden here, because the opaque</li>\n<p>water shader composites them from the refraction texture. Thickness is computed from the depth texture and colour is absorbed per channel. If the distorted sample hits something in front of the water, the shader falls back to the undistorted one.</p>\n</ul>\n<p>Files:</p>\n<p>| File | What it holds | |---|---| | <code>js/util.js</code> | Seeded RNG, CPU value noise, GLSL simplex noise, a <code>patchMaterial</code> helper that injects code into built-in materials | | <code>js/pond.js</code> | Pond shape (signed distance), terrain height and mesh, pond-bed pebbles | | <code>js/rocks.js</code> | Stone material and procedural rocks | | <code>js/water.js</code> | Water shader, ripple buffer (20 rings), mirror and refraction targets | | <code>js/koi.js</code> | Koi geometry, swim-deformation shader, patterns, steering | | <code>js/plants.js</code> | Lily pads and flowers, grass and iris, shrubs, bamboo and cedars, maple, falling leaves | | <code>js/lanterns.js</code> | Hanging, stone and floating lanterns, the current field, fireflies | | <code>js/sky.js</code> | Dusk sky dome; a simplified copy of it is baked into a PMREM environment map | | <code>js/mist.js</code> | Two noise-driven mist layers | | <code>js/debug.js</code> | Development switches (all off) |</p>\n<p><b>Koi steering</b> combines several pieces:</p>\n<ul>\n<li>wander uses a smooth noise turn rate</li>\n<li>a look-ahead on the pond&#x27;s signed distance steers them along the shore and back inside, with a</li>\n<p>hard containment step as a backstop</p>\n<li>soft separation keeps fish apart, with slight alignment to nearby fish</li>\n<li>cruise speed varies with occasional bursts</li>\n<li>depth drifts slowly and is kept above the pond bed</li>\n</ul>\n<p>Tail-beat frequency follows speed. The body bends into turns (curvature = turn rate / speed), and the swimming wave is a travelling sine whose amplitude grows toward the tail. Normals are corrected for the bend. The simulation was fast-forwarded 10 minutes during testing; the fish stayed spread out and inside the pond.</p>\n<p><b>Camera</b>: OrbitControls with damping and slow auto-rotate (one orbit takes about 3 minutes). Drag orbits and the wheel zooms between distances 3.5 and 13; pan is disabled and the polar angle is limited. When the user lets go, auto-rotate carries on from wherever they left the camera.</p>\n<h3>Performance</h3>\n<ul>\n<li>The scene renders at most about 1080p worth of pixels: pixel ratio = min(devicePixelRatio,</li>\n<p>\u221a(1920\u00b71080 / window area)). On a Retina MacBook a full-screen window is therefore not rendered at 4K.</p>\n<li>An adaptive step lowers resolution (to as little as 70%) only after two consecutive 2-second</li>\n<p>windows below 40 fps.</p>\n<li>In the test harness at 1920\u00d71080 the page runs at the 60 fps cap. A stress test that rendered</li>\n<p>every frame 3\u00d7 still ran at ~38 fps, so a normal frame takes about 9 ms of GPU time.</p>\n<li>Shader cost was kept down in three ways: the sky is drawn last at depth 1, so only pixels not</li>\n<p>covered by anything else pay for it; the stone and terrain noise uses few octaves; and the mist is two layers of two-octave noise that are discarded outside the pond.</p>\n</ul>\n<h3>Known issues and limitations</h3>\n<ul>\n<li>Refraction is screen-space. At the very edges of the screen, or behind a rock that pokes through</li>\n<p>the surface, the distorted sample may fall back to the undistorted one, so a little detail is lost.</p>\n<li>When a koi rises to the surface, any part of its back above the water line is not drawn, because</li>\n<p>koi only appear through the water. This is hard to notice since they only touch the surface.</p>\n<li>Lily pads and floating leaves are left out of the reflection pass on purpose, because their mirror</li>\n<p>images coincide with themselves.</p>\n<li>Koi swim under lily pads instead of avoiding them, and their separation is soft, so two fish can</li>\n<p>briefly overlap.</p>\n<li>There are 8 point lights, which is the main fixed lighting cost. Lantern reflections on the water</li>\n<p>come from the mirror render; the glints and glow are analytic.</p>\n<li>The PMREM environment uses a simplified sky (no clouds, stars or moon) with a NaN/clamp guard. With</li>\n<p>the full sky shader, one sun direction produced NaNs in the prefiltered map and the whole frame went black.</p>\n<li>The screenshot tool seems to stop waiting at about 30 s, so longer runs were checked with the</li>\n<p><code>skip</code> fast-forward switch in <code>js/debug.js</code> rather than in real time.</p>\n<li>Screenshots from development are in <code>./shots</code> (<code>final_start.png</code> shows the opening framing).</li>\n</ul>",
   "hint": ""
  },
  {
   "id": "astra-high",
   "label": "GPT-6 Astra",
   "short": "GPT-6 Astra",
   "sub": "GPT-6 Astra \u00b7 high",
   "color": "#4fb3ff",
   "url": "scenes/astra-high/index.html",
   "base": "scenes/astra-high/",
   "stills": [
    "img/astra-high_4s.jpg",
    "img/astra-high_10s.jpg",
    "img/astra-high_20s.jpg"
   ],
   "stats": {
    "run": "astra-high",
    "tool_calls": 18,
    "shots": 7,
    "images_viewed": 0,
    "in_tok": 51552,
    "cached_tok": 990592,
    "out_tok": 18079,
    "reason_tok": 4463,
    "cost_usd": 2.41,
    "turns": null,
    "status": "done",
    "model": "gpt-6-astra",
    "effort": "high",
    "duration_s": 432,
    "files": [
     {
      "path": "index.html",
      "lines": 12,
      "bytes": 574
     },
     {
      "path": "scene.js",
      "lines": 286,
      "bytes": 27356
     }
    ],
    "lines": 298,
    "bytes": 27930,
    "has_index": true,
    "fps": 60,
    "cost_note": "estimate, see note",
    "cost_est": true,
    "reason_note": "incl. 4,463 reasoning"
   },
   "strip": "7 min \u00b7 $2.41 est.",
   "notes_html": "<h3>Evening koi garden</h3>\n<p>A full-window, entirely procedural Three.js r170 scene. <code>index.html</code> loads <code>scene.js</code> and the supplied, unchanged <code>three</code> directory. There are no image assets, audio, external dependencies, remote requests, or visible interface elements.</p>\n<h3>Scene</h3>\n<ul>\n<li>Ten three-dimensional koi with cream, vermilion, black and golden markings, subtle scales, eyes, translucent fins, bending bodies and oscillating tails. They follow slow, individually varied swimming paths at slightly different depths.</li>\n<li>A clear teal pond with animated caustic light on its bed, small pebbles, concentric ripples, drifting maple leaves, and actual planar reflections distorted by a water shader.</li>\n<li>Notched lily pads with veins and three layered pink water-lily flowers.</li>\n<li>Rounded, procedurally mottled stones, moss, grasses, ferns, bamboo, a copper maple, stepping stones, and a stone garden lantern.</li>\n<li>Four ribbed paper lanterns, warm local lighting, subtle swaying, fireflies, soft shadows, bloom and a gentle vignette.</li>\n</ul>\n<h3>Viewing and controls</h3>\n<p>Serve this folder through a local static HTTP server and open <code>index.html</code> in Chrome. ES modules require HTTP rather than opening the file directly. All requests remain local.</p>\n<p>Drag to orbit and scroll to zoom. OrbitControls supplies damping and automatically resumes its slow orbit after interaction ends. Camera limits keep the view above the pond. Window resizing updates the renderer, post-processing and camera; narrow windows widen the vertical field of view to preserve the pond framing. The starting composition is designed for 1920 \u00d7 1080.</p>\n<h3>Implementation and performance</h3>\n<p>Grass, maple foliage and submerged pebbles use instancing. Geometry is shared where useful. Materials use mathematical noise and geometry instead of texture files. Water uses a 1024 \u00d7 1024 reflection target, and rendering pixel density is capped at 1.5. Only the directional moon light casts shadows; the lanterns use inexpensive unshadowed point lights. Animation is time-based.</p>\n<p>Checked with the supplied <code>../shot.sh</code> in GPU Chrome at 1920 \u00d7 1080: approximately 60 fps, with no console errors after the initial shader fix. A second 960 \u00d7 720 check also ran at approximately 60 fps with no console errors. JavaScript syntax also passed <code>node --check scene.js</code>. Screenshots are in <code>shots/</code>.</p>\n<h3>Known limitations</h3>\n<p>This is a stylized scene, not a physical fluid simulation. Refraction and caustics are approximated; fish follow designed paths rather than full flocking or collision simulation and can occasionally overlap. Frame rate depends on GPU, browser, viewport and pixel density. The intended view is above the water, and camera controls enforce that constraint.</p>",
   "hint": ""
  }
 ],
 "heroStill": 1,
 "stillTimes": [
  4,
  10,
  20
 ],
 "cmpDefault": [
  0,
  2
 ],
 "prompt": "Build a 3D koi pond scene that runs in a web browser. Work only inside the current folder.\n\nThe scene: a small Japanese-style koi pond at dusk. It should have koi fish swimming naturally, water with ripples and reflections, lily pads (some with flowers), stones around the edge, and a few glowing paper lanterns that reflect on the water. Add anything else you think makes it look beautiful. Keep it simple, but make it look great on screen: it will be shown full screen in a YouTube video.\n\nRules:\n- Output: index.html in this folder. You may add your own .js / .css files next to it. Everything the page needs must be in this folder.\n- Use three.js r170, already in ./three (do not change it). Import it with this import map:\n  {\"imports\":{\"three\":\"./three/build/three.module.js\",\"three/addons/\":\"./three/examples/jsm/\"}}\n  You may use anything in ./three/examples/jsm (controls, post-processing, etc.). No other libraries.\n- Everything is made in code: no downloaded or generated images, textures, 3D models or sounds, and no network requests.\n- The page fills the whole window, handles resizing, and shows no text or UI on screen.\n- The camera starts on a good framing and moves slowly on its own. The viewer can drag to orbit and scroll to zoom; after they let go, the slow camera motion carries on.\n- It must run smoothly (30 fps or more) at 1920x1080 in Chrome on an Apple M-series MacBook.\n- To check your work, ../shot.sh <folder> <out.png> [seconds] [width] [height] opens the folder's index.html in real Chrome with the GPU, waits, saves a screenshot, and prints the frame rate and any console errors. Example: ../shot.sh . shots/check.png 6\n  It takes turns with other agents on this machine, so it may wait a little. Keep screenshots in ./shots.\n- Nobody will answer questions, so make your own decisions. Work until you are happy with the result.\n- When you finish, write NOTES.md: what you built, how it works, and any known problems.",
 "costSub": "API price; Codex logs tokens only",
 "numLede": "Time, tokens and cost come from each run's own log. Frame rate is our own test: Chrome on an M-series MacBook at 1920\u00d71080.",
 "numFoot": "Input (new) = fresh input tokens plus cache writes. Input (cached) = tokens re-read from the prompt cache, which bills at a small fraction. GPT-6 Astra's cost is our estimate from its token counts at the reported list price ($10 per 1M input, $1 cached, $50 output); it ran on the priority tier, which costs more. Screenshots = how many times the model used the screenshot tool to check its own work. Lines = non-empty lines in the files the model wrote.",
 "setup": [
  [
   "Harness",
   "Claude models ran in Claude Code (<code>claude -p</code>), GPT-6 Astra in Codex (<code>codex exec</code>). No MCP servers, hooks, memory or custom instructions."
  ],
  [
   "Tools",
   "File read/write/edit, a few read-only shell commands, and <code>../shot.sh</code>: a screenshot of the scene in real Chrome with the GPU, plus frame rate and console errors."
  ],
  [
   "Machine",
   "One MacBook (Apple M-series, 24 GB). Runs shared the machine; the screenshot tool served one request at a time for all of them."
  ]
 ],
 "foot1": "Made by <a href=\"https://www.youtube.com/@thecodebear\">The Code Bear</a>. Scenes \u00a9 their runs; three.js is MIT.",
 "foot2": "Every scene is the model's own output, unedited except for the three.js import path."
};
