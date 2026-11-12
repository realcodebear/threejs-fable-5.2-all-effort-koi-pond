window.SITE = {
 "title": "Koi Pond Effort Test \u00b7 Claude Fable 5.2",
 "brand": "Koi Pond Effort Test",
 "accent": "#ff8a1f",
 "eyebrow": "Claude Fable 5.2 \u00b7 three.js \u00b7 one prompt, five effort levels",
 "h1": "One koi pond, five effort levels",
 "lede": "We gave Claude Fable 5.2 the same prompt five times and changed only the effort setting, from low to max. Each run built a koi pond scene in three.js, from code alone, with no help. Here is what came out, and what each one cost.",
 "chips": [
  "three.js r170",
  "no images, no models: code only",
  "one run each",
  "no human help",
  "$113.68 in API cost"
 ],
 "runs": [
  {
   "id": "fable-low",
   "label": "Low",
   "short": "Low",
   "sub": "low",
   "color": "#7d8796",
   "url": "scenes/fable-low/index.html",
   "base": "scenes/fable-low/",
   "stills": [
    "img/fable-low_4s.jpg",
    "img/fable-low_10s.jpg",
    "img/fable-low_20s.jpg"
   ],
   "stats": {
    "run": "fable-low",
    "tool_calls": 35,
    "shots": 5,
    "images_viewed": 4,
    "in_tok": 82754,
    "cached_tok": 676484,
    "out_tok": 64336,
    "reason_tok": 0,
    "cost_usd": 4.032640799999999,
    "turns": 36,
    "status": "done",
    "model": "claude-fable-5-2",
    "effort": "low",
    "duration_s": 695,
    "files": [
     {
      "path": "index.html",
      "lines": 19,
      "bytes": 581
     },
     {
      "path": "main.js",
      "lines": 961,
      "bytes": 50899
     }
    ],
    "lines": 980,
    "bytes": 51480,
    "has_index": true,
    "fps": 60
   },
   "strip": "12 min \u00b7 $4.03",
   "notes_html": "<h3>Koi pond at dusk</h3>\n<p>Open <code>index.html</code> (served over http, e.g. via <code>../shot.sh</code>). Files: <code>index.html</code>, <code>main.js</code>, and the provided <code>./three</code> (r170, untouched). Everything is generated in code; no textures, models or network requests.</p>\n<h3>What is in the scene</h3>\n<ul>\n<li>An irregular pond ringed with mossy stones, boulders and a small rock island.</li>\n<li>11 koi in 8 colour varieties (kohaku, sanke, showa, ogon, tancho, ...), swimming with body and tail undulation.</li>\n<li>Water with planar reflections, moving ripples, and expanding ring ripples where fish surface.</li>\n<li>Lily pads in clusters, 9 pink and white water lilies, fallen maple leaves on the water.</li>\n<li>Lanterns: 4 floating paper lanterns that drift and bob, a string of 5 round paper lanterns between bamboo poles, and a stone lantern on the bank. All reflect in the water.</li>\n<li>A red Japanese maple, bamboo groves, grass and reeds that sway, shrubs, fireflies, and a dusk sky with afterglow, clouds, stars, crescent moon and layered hills.</li>\n</ul>\n<h3>How it works</h3>\n<ul>\n<li><b>Water</b>: three.js <code>Reflector</code> (mirror-camera render) with a custom shader. Ripple normals come from summed, noise-warped sine waves plus up to 10 ring ripples passed as uniforms. The normals distort the reflection lookup and drive a Fresnel term; premultiplied alpha lets the fish and pond bed show through at steep angles.</li>\n<li><b>Koi</b>: one procedural geometry (body tube plus fins) and a custom shader. The vertex shader bends the body with a travelling wave and with the current turn curvature; the fragment shader paints patterns from 3D noise per fish. Motion is simple steering in JS: wander, turn away from the shore and island, keep apart.</li>\n<li><b>Lanterns</b>: unlit emissive &quot;paper&quot; shader with HDR values, picked up by <code>UnrealBloomPass</code>. Six point lights (no shadows) light the surroundings.</li>\n<li><b>Everything else</b>: instanced meshes (stones, pads, petals, leaves, 16k grass blades, bamboo) with vertex colours; the sky is one shader on a sphere.</li>\n<li><b>Post</b>: <code>EffectComposer</code> with 4x MSAA half-float target, bloom, ACES tone mapping.</li>\n<li><b>Camera</b>: <code>OrbitControls</code> (drag to orbit, scroll to zoom, damping). The automatic motion is a slow sweep about \u00b145\u00b0 around the starting view, which resumes after the viewer lets go; if they dragged far away it drifts back toward that range.</li>\n<li><b>Performance</b>: pixel ratio is capped at 1.5 and drops automatically if the frame rate stays under 40 fps. <code>shot.sh</code> reported ~60 fps at 1920x1080.</li>\n</ul>\n<h3>Known problems / not verified</h3>\n<ul>\n<li>Only checked through <code>shot.sh</code> screenshots: mouse drag/zoom and the long-run camera sweep reversal were not tested by hand.</li>\n<li>No shadows; stones and lanterns rely on dark ground tones instead.</li>\n<li>Fish are not refracted by the water surface, and they ignore lily pads and floating lanterns (they pass underneath).</li>\n<li>Reflection distortion is done in screen space, so strong ripples can smear reflections a little near the edges of the pond.</li>\n<li>The crescent moon sits above the default framing; it shows when the viewer tilts or zooms out.</li>\n</ul>",
   "hint": ""
  },
  {
   "id": "fable-medium",
   "label": "Medium",
   "short": "Medium",
   "sub": "medium",
   "color": "#a7a08e",
   "url": "scenes/fable-medium/index.html",
   "base": "scenes/fable-medium/",
   "stills": [
    "img/fable-medium_4s.jpg",
    "img/fable-medium_10s.jpg",
    "img/fable-medium_20s.jpg"
   ],
   "stats": {
    "run": "fable-medium",
    "tool_calls": 92,
    "shots": 16,
    "images_viewed": 14,
    "in_tok": 161950,
    "cached_tok": 2610170,
    "out_tok": 118692,
    "reason_tok": 0,
    "cost_usd": 7.860562,
    "turns": 93,
    "status": "done",
    "model": "claude-fable-5-2",
    "effort": "medium",
    "duration_s": 1326,
    "files": [
     {
      "path": "index.html",
      "lines": 19,
      "bytes": 604
     },
     {
      "path": "js/common.js",
      "lines": 118,
      "bytes": 6143
     },
     {
      "path": "js/fish.js",
      "lines": 272,
      "bytes": 12837
     },
     {
      "path": "js/lanterns.js",
      "lines": 151,
      "bytes": 8595
     },
     {
      "path": "js/main.js",
      "lines": 214,
      "bytes": 10790
     },
     {
      "path": "js/scenery.js",
      "lines": 636,
      "bytes": 34152
     },
     {
      "path": "js/water.js",
      "lines": 154,
      "bytes": 6532
     }
    ],
    "lines": 1564,
    "bytes": 79653,
    "has_index": true,
    "fps": 60
   },
   "strip": "22 min \u00b7 $7.86",
   "notes_html": "<h3>Koi pond at dusk</h3>\n<p>Open <code>index.html</code> (through any local web server). Everything is generated in code with three.js r170 from <code>./three</code>; there are no images, models, sounds or network requests.</p>\n<h3>What is in the scene</h3>\n<ul>\n<li>An irregular pond with 13 koi of different varieties (kohaku, sanke, showa, ogon, tancho, ...).</li>\n<li>Water with real ripples (fish wakes, fish &quot;kissing&quot; the surface, random drops, lantern bobbing),</li>\n<p>mirror reflections and a tinted view of the pond bed and fish below.</p>\n<li>Lily pads in clusters, about a third of them with pink or white flowers; fallen maple leaves.</li>\n<li>A ring of mossy stones, pebbles, stepping stones, reeds, grass tufts and clipped shrubs.</li>\n<li>Lanterns: four paper lanterns floating on the water, five round paper lanterns on a line</li>\n<p>across the back of the pond, and one stone lantern on the bank. All of them light the garden and reflect in the water.</p>\n<li>A red Japanese maple, a bamboo grove, a slatted fence, tree silhouettes, fireflies,</li>\n<p>and a dusk sky with afterglow, drifting clouds, stars and a crescent moon.</p>\n</ul>\n<h3>How it works</h3>\n<p>| File | Role | | --- | --- | | <code>js/main.js</code> | Renderer, lights, camera, the three render passes per frame, post-processing | | <code>js/water.js</code> | Ripple simulation and the water surface shader | | <code>js/fish.js</code> | Koi geometry, swimming shader, colour patterns, steering behaviour | | <code>js/scenery.js</code> | Sky, terrain, stones, lilies, grass, shrubs, maple, bamboo, fence, fireflies | | <code>js/lanterns.js</code> | Floating, hanging and stone lanterns with flickering point lights | | <code>js/common.js</code> | Seeded random, noise, pond shape function, shared shader snippets |</p>\n<p><b>Water.</b> A 512x512 height field is advanced with a wave equation on the GPU (ping-pong render targets, fixed 60 Hz step). Fish, lanterns and random drops add small bumps; the shoreline is a fixed boundary so waves bounce off it. Each frame the scene is drawn three times:</p>\n<ul>\n<li>below-surface view (terrain, stones, fish) with a depth texture,</li>\n<li>a mirrored view at half resolution for reflections (clipped at the water plane),</li>\n<li>the final view, where the water shader mixes the two by a Fresnel term, bends both with the</li>\n<p>ripple normals, and tints the underwater part by how much water the view ray passes through.</p>\n</ul>\n<p><b>Koi.</b> One shared mesh (body rings plus tail, dorsal and paired fins). The vertex shader bends it with a travelling wave that grows toward the tail and curves the body into turns. Patterns come from 3D noise thresholds per fish. Each fish wanders toward changing &quot;home&quot; points, steers away from the shore and from other fish, varies speed and depth, and occasionally rises to the surface.</p>\n<p><b>Look.</b> Half-float HDR pipeline, 4x MSAA, bloom, vignette, ACES tone mapping. One static shadow map from the afterglow direction (computed once). Ten small point lights for the lanterns.</p>\n<p><b>Camera.</b> Starts on a front view toward the sunset and sweeps slowly left and right across the front of the pond while gently changing height and distance. Drag to orbit, scroll to zoom; about 2.5 seconds after letting go the slow motion resumes from wherever the camera is.</p>\n<h3>Checked</h3>\n<ul>\n<li><code>../shot.sh</code> at 1920x1080, 1280x720 and 900x1200: about 60 fps in headless Chrome, no console errors.</li>\n<li>Views from the front, both ends of the sweep, behind the maple, and a close-up of the water.</li>\n</ul>\n<h3>Known problems</h3>\n<ul>\n<li>Frame rate was only measured through <code>shot.sh</code>, not on a physical MacBook display. Internal</li>\n<p>resolution is capped at about 2560x1440 pixels, and it drops automatically in steps if the frame rate stays under 40 fps.</p>\n<li>After the viewer zooms or tilts, the automatic motion slowly eases back to its own height and</li>\n<p>distance, so a manual zoom does not stay forever.</p>\n<li>If the viewer orbits to the back, the camera can sit inside the maple leaves or bamboo; the</li>\n<p>automatic sweep avoids that side and will drift back to the front.</p>\n<li>The shadow map is static, so swaying grass, leaves and the lanterns do not cast moving shadows,</li>\n<p>and fish cast no shadows on the pond bed.</p>\n<li>Ripples change the water&#x27;s shading and reflections only; lily pads and floating lanterns do not</li>\n<p>physically ride the waves.</p>\n<li>Distant trees are simple silhouettes and look blocky if examined closely.</li>\n</ul>",
   "hint": ""
  },
  {
   "id": "fable-high",
   "label": "High",
   "short": "High",
   "sub": "high",
   "color": "#e8b45a",
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
   "id": "fable-xhigh",
   "label": "XHigh",
   "short": "XHigh",
   "sub": "xhigh",
   "color": "#ff8a1f",
   "url": "scenes/fable-xhigh/index.html",
   "base": "scenes/fable-xhigh/",
   "stills": [
    "img/fable-xhigh_4s.jpg",
    "img/fable-xhigh_10s.jpg",
    "img/fable-xhigh_20s.jpg"
   ],
   "stats": {
    "run": "fable-xhigh",
    "tool_calls": 286,
    "shots": 39,
    "images_viewed": 33,
    "in_tok": 521338,
    "cached_tok": 41702598,
    "out_tok": 384841,
    "reason_tok": 0,
    "cost_usd": 32.0736476,
    "turns": 288,
    "status": "done",
    "model": "claude-fable-5-2",
    "effort": "xhigh",
    "duration_s": 4397,
    "files": [
     {
      "path": "index.html",
      "lines": 17,
      "bytes": 617
     },
     {
      "path": "js/common.js",
      "lines": 222,
      "bytes": 10794
     },
     {
      "path": "js/flora.js",
      "lines": 676,
      "bytes": 34637
     },
     {
      "path": "js/fx.js",
      "lines": 80,
      "bytes": 4161
     },
     {
      "path": "js/koi.js",
      "lines": 496,
      "bytes": 25223
     },
     {
      "path": "js/lanterns.js",
      "lines": 216,
      "bytes": 11781
     },
     {
      "path": "js/lilies.js",
      "lines": 202,
      "bytes": 9343
     },
     {
      "path": "js/main.js",
      "lines": 263,
      "bytes": 12338
     },
     {
      "path": "js/sky.js",
      "lines": 193,
      "bytes": 7827
     },
     {
      "path": "js/stones.js",
      "lines": 178,
      "bytes": 8714
     },
     {
      "path": "js/terrain.js",
      "lines": 120,
      "bytes": 5453
     },
     {
      "path": "js/water.js",
      "lines": 345,
      "bytes": 16851
     }
    ],
    "lines": 3008,
    "bytes": 147739,
    "has_index": true,
    "fps": 46
   },
   "strip": "73 min \u00b7 $32.07",
   "notes_html": "<h3>Koi pond at dusk</h3>\n<p>A small Japanese garden pond just after sunset, built entirely in code with three.js r170 (no images, models, sounds or network requests). Open <code>index.html</code> from a local web server.</p>\n<h3>What is in the scene</h3>\n<ul>\n<li><b>Koi</b> \u2013 twelve fish in different varieties (kohaku, sanke, showa, ogon, tancho, asagi, bekko \u2026)</li>\n<p>with scales, translucent fins and soft shadows on the pond bed.</p>\n<li><b>Water</b> \u2013 ripples from fish &quot;kissing&quot; the surface, fish wakes, falling leaves, bobbing</li>\n<p>lanterns and insects; mirror reflections, refraction and depth tint.</p>\n<li><b>Lily pads and water lilies</b> \u2013 several dozen notched, veined pads in loose rafts; open blossoms and buds.</li>\n<li><b>Stones</b> \u2013 edging stones around the pond, feature boulders, island stones, stepping stones.</li>\n<li><b>Lanterns</b> \u2013 four hanging paper lanterns (three on wooden posts, one in the maple), three</li>\n<p>floating paper lanterns drifting on the water, and a stone snow-viewing lantern. All flicker, light their surroundings and reflect on the water.</p>\n<li><b>Extras</b> \u2013 a red Japanese maple that sheds leaves onto the water, a bamboo fence, clipped</li>\n<p>shrubs, grass and reeds, a ring of garden trees and cedars, fireflies, low evening mist, and a dusk sky with lit clouds, stars, a crescent moon and hazy hills.</p>\n</ul>\n<h3>Camera</h3>\n<p>Starts on a three-quarter view of the pond and sweeps slowly back and forth around it while gently rising, falling and moving in and out. Drag to orbit, scroll to zoom; on release the slow motion eases back in from wherever the camera was left. Zoom and tilt are limited so the camera stays above ground and inside the fence.</p>\n<h3>How it works</h3>\n<p>Files: <code>index.html</code>, <code>js/main.js</code> (assembly, camera, loop) and one module per subject (<code>water</code>, <code>koi</code>, <code>lilies</code>, <code>lanterns</code>, <code>stones</code>, <code>terrain</code>, <code>flora</code>, <code>sky</code>, <code>fx</code>, <code>common</code>).</p>\n<ul>\n<li><b>Three passes per frame.</b> A refraction pass (pond bed, stones, fish) and a mirrored</li>\n<p>reflection pass feed the water shader in the main pass. Both helper passes are restricted to the pond&#x27;s screen rectangle. The fish are drawn only in the refraction pass, so they are always seen through the water.</p>\n<li><b>Water shader.</b> Surface slope = a tileable swell texture + a 768\u00b2 wave-equation ripple</li>\n<p>simulation. Reflection is sampled along the perturbed reflected ray; refraction is offset in screen space with a depth check and tinted by the length of the underwater path. Lantern glints on the ripples are added analytically, and mirrored lanterns are brightened a little beyond what physics gives so they read clearly.</p>\n<li><b>Koi.</b> One procedural mesh (lofted body, fins, eyes). Each fish steers with wander, bank</li>\n<p>and island avoidance, a turning-circle limit and personal space. The body follows the path the head actually swam, plus a travelling swimming wave; the spine is sent to the vertex shader as 22 joints. Patterns are 3D noise in the fish&#x27;s rest pose.</p>\n<li><b>Everything else is procedural geometry</b>, mostly instanced. Most materials are</li>\n<p><code>MeshStandardMaterial</code> with injected procedural colour/bump code, so they keep three&#x27;s lighting; distant foliage, fish, water, sky and lantern paper use hand-written shaders.</p>\n<li><b>Lighting.</b> Image-based ambient light generated from the procedural sky, one after-glow</li>\n<p>directional light with a shadow map rendered once, eight flickering point lights, and a blurred top-down occlusion map used as soft contact shadows.</p>\n<li><b>Post.</b> 4\u00d7 MSAA HDR target \u2192 bloom \u2192 one final pass (vignette, ACES tone curve, light</li>\n<p>grade, grain).</p>\n</ul>\n<h3>Performance</h3>\n<p>About 59\u201360 fps at 1920\u00d71080 in the provided screenshot tool (headless Chrome, GPU), from several camera positions. The drawing buffer is capped at about 2.6 million pixels on high-DPI screens, and if the frame rate stays under ~40 fps the resolution steps down automatically. Scene materials are compiled before the first frame, which then fades in from black.</p>\n<h3>Known problems / limits</h3>\n<ul>\n<li>I could only judge still frames, not video, so motion (fish, ripples, camera) is checked by</li>\n<p>comparing frames at different times rather than by watching it play.</p>\n<li>Not tested in a normal Chrome window on a MacBook, only through the screenshot tool.</li>\n<li>Refraction is a screen-space approximation: the pond looks a little deeper than real water</li>\n<p>would, and there are no caustics.</p>\n<li>Fish avoid each other loosely and can still overlap for a moment, mostly at different depths.</li>\n<li>The background trees&#x27; leafy sprays are left out of the water reflection (only their dark</li>\n<p>cores are mirrored), and grass is not reflected.</p>\n<li>Shadows from the after-glow are baked once; the lanterns light things but cast no shadows.</li>\n<li>The mist is computed on surfaces, not as a volume, so it does not veil the lanterns or sky.</li>\n<li>A falling leaf that lands on a stone or lily pad at the water&#x27;s edge may be partly hidden.</li>\n<li>Scales are stylised: lily pads, blossoms and maple leaves are a bit larger than life so they</li>\n<p>read on screen.</p>\n<li>The seasons are mixed on purpose (red maple, water lilies and fireflies together).</li>\n<li>No sound.</li>\n</ul>",
   "hint": ""
  },
  {
   "id": "fable-max",
   "label": "Max",
   "short": "Max",
   "sub": "max",
   "color": "#ff4f2e",
   "url": "scenes/fable-max/index.html",
   "base": "scenes/fable-max/",
   "stills": [
    "img/fable-max_4s.jpg",
    "img/fable-max_10s.jpg",
    "img/fable-max_20s.jpg"
   ],
   "stats": {
    "run": "fable-max",
    "tool_calls": 399,
    "shots": 70,
    "images_viewed": 45,
    "in_tok": 1128181,
    "cached_tok": 70056837,
    "out_tok": 491214,
    "reason_tok": 0,
    "cost_usd": 51.70823140000002,
    "turns": 400,
    "status": "done",
    "model": "claude-fable-5-2",
    "effort": "max",
    "duration_s": 6078,
    "files": [
     {
      "path": "index.html",
      "lines": 16,
      "bytes": 448
     },
     {
      "path": "js/common.js",
      "lines": 318,
      "bytes": 14430
     },
     {
      "path": "js/debug.js",
      "lines": 17,
      "bytes": 1255
     },
     {
      "path": "js/flora.js",
      "lines": 746,
      "bytes": 36751
     },
     {
      "path": "js/koi.js",
      "lines": 557,
      "bytes": 27555
     },
     {
      "path": "js/lanterns.js",
      "lines": 362,
      "bytes": 16729
     },
     {
      "path": "js/lighting.js",
      "lines": 254,
      "bytes": 12389
     },
     {
      "path": "js/lilies.js",
      "lines": 345,
      "bytes": 15527
     },
     {
      "path": "js/main.js",
      "lines": 374,
      "bytes": 18417
     },
     {
      "path": "js/noisetex.js",
      "lines": 95,
      "bytes": 4600
     },
     {
      "path": "js/particles.js",
      "lines": 68,
      "bytes": 3171
     },
     {
      "path": "js/post.js",
      "lines": 193,
      "bytes": 10089
     },
     {
      "path": "js/sky.js",
      "lines": 173,
      "bytes": 7683
     },
     {
      "path": "js/stones.js",
      "lines": 190,
      "bytes": 8704
     },
     {
      "path": "js/terrain.js",
      "lines": 133,
      "bytes": 6079
     },
     {
      "path": "js/tree.js",
      "lines": 314,
      "bytes": 14808
     },
     {
      "path": "js/water.js",
      "lines": 429,
      "bytes": 20485
     },
     {
      "path": "style.css",
      "lines": 23,
      "bytes": 321
     }
    ],
    "lines": 4607,
    "bytes": 219441,
    "has_index": true,
    "fps": 50
   },
   "strip": "101 min \u00b7 $51.71",
   "notes_html": "<h3>Koi pond at dusk \u2014 notes</h3>\n<p>Open <code>index.html</code> (through any static web server; <code>../shot.sh . shots/check.png 6</code> does this). Everything on screen is generated in code at start-up: no image, model, sound or network request. The only library is three.js r170 from <code>./three</code>, loaded through the required import map.</p>\n<h3>What is in the scene</h3>\n<ul>\n<li>A gourd-shaped pond in a small walled Japanese garden, a few minutes after sunset:</li>\n<p>afterglow in the west with thin lit clouds and layered hills, a young crescent moon, the first stars, deep blue overhead.</p>\n<li><b>16 koi</b> of different varieties (kohaku, sanke, showa, tancho, ogon, yamabuki, platinum,</li>\n<p>utsuri, bekko, asagi, a few with long &quot;butterfly&quot; fins). They cruise, turn, follow each other in loose lines, pass over and under one another, put on the occasional burst of speed and now and then rise to &quot;kiss&quot; the surface, which starts a ring of ripples.</p>\n<li><b>Water</b> with real-time reflections, refraction with depth-dependent tint, a ripple</li>\n<p>simulation (koi wakes, surface kisses, falling leaves, bobbing lanterns, small random touches) and a faint breeze texture that comes and goes in patches.</p>\n<li><b>Lily pads</b> in clusters (they bob and tilt on the ripples and calm the water under them),</li>\n<p>pink and white <b>water lilies</b> and buds.</p>\n<li><b>Stones</b> all round the edge: wet and dark at the waterline, mossy on top, more of them</li>\n<p>under water and scattered over the moss.</p>\n<li><b>Paper lanterns</b>: three floating on the pond, one on a wooden post, one hanging from a</li>\n<p>branch of the maple, plus a stone &quot;snow-viewing&quot; lantern with paper windows. Each has a flickering light that warms the stones, plants, leaves and the koi passing under it, and each is mirrored in the water.</p>\n<li>Extras: a red Japanese maple leaning over the water (its leaves keep drifting down and</li>\n<p>make ripples when they land on the pond), a bamboo grove, clipped azalea mounds (some in bloom), irises and grasses along the bank, a bamboo fence, cloud-pruned pines beyond it, fireflies.</p>\n</ul>\n<h3>Camera</h3>\n<p>The view starts on a composed frame and then orbits the pond very slowly (one turn in 3.5 minutes) while gently rising and sinking. Drag to orbit, scroll (or pinch) to zoom. While you interact the automatic motion stops exactly where the camera is; about a second after you let go it eases back in from your view. Zoom is limited to 2.6 \u2013 11 m so the camera stays inside the garden. The mouse pointer hides itself after 2.5 s without movement.</p>\n<h3>How it works</h3>\n<p>Files (<code>js/</code>):</p>\n<p>| file | contents | |---|---| | <code>main.js</code> | renderer, scene assembly, camera behaviour, frame loop, resolution watchdog | | <code>common.js</code> | seeded random numbers, pond outline as a signed-distance grid, terrain height, GLSL noise, helper for patching three.js standard materials | | <code>noisetex.js</code> | tileable 2D and 3D noise textures (built once, used instead of per-pixel procedural noise) | | <code>sky.js</code> | sky shader (gradient, clouds, stars, moon, hills) and the environment map made from it | | <code>lighting.js</code> | shared cheap lighting for custom shaders, ambient cube, one-time ground light bake | | <code>terrain.js</code> | ground mesh and shader (moss, earth, pebbles, silt) | | <code>stones.js</code> | rock shapes, placement, stone material | | <code>water.js</code> | ripple simulation, reflection and refraction passes, water surface shader | | <code>koi.js</code> | fish geometry, swim deformation, pattern shader, behaviour | | <code>lilies.js</code> | lily pads, water lilies, irises | | <code>lanterns.js</code> | the three kinds of lantern and their lights | | <code>flora.js</code> | grasses, azaleas, bamboo, fence, pines | | <code>tree.js</code> | the maple and its falling leaves | | <code>particles.js</code> | fireflies | | <code>post.js</code> | bloom, tone mapping, grading | | <code>debug.js</code> | development switches (all off) |</p>\n<p><b>Frame.</b> Each frame renders: (1) the scene mirrored in the water plane into a half-size target (reflection), (2) only what is under water into a full-size target with a depth texture (refraction), (3) the main view into a 4x multisampled HDR target, (4) a bloom pyramid, then tone mapping (ACES), a light grade, vignette and dither. Objects are tagged for the passes they belong to, so nothing is drawn where it cannot be seen (the koi and the pond bed exist only in the refraction pass, for example).</p>\n<p><b>Water surface.</b> The shader takes the surface slope from the ripple simulation plus three scrolling layers of a tileable normal texture, then</p>\n<ul>\n<li>looks up the reflection with a parallax-corrected offset: the reflected ray is followed</li>\n<p>for a distance estimated by marching the pond&#x27;s distance field, and that point is projected into the mirrored camera. Reflections therefore stay attached to stones at the waterline and stretch into streaks further away. A blurred mip level is used, more blurred where the breeze ruffles the water;</p>\n<li>looks up the refraction with an offset from the refracted ray, checks depth so that</li>\n<p>nothing in front of the water bleeds in, and tints by the water thickness (red is absorbed first, plus a little scattering);</p>\n<li>blends the two with Fresnel and fades to nothing at the shoreline.</li>\n</ul>\n<p><b>Ripples.</b> A height field (768 x 1024, two half-float channels) is advanced with the discrete wave equation at a fixed 60 steps per second, independent of the frame rate. Disturbances are drawn into it as small additive splats: oscillating &quot;drops&quot; that send out a few concentric rings, and for each koi near the surface a positive/negative pair (bow and stern) that leaves a wake. The shore absorbs waves and lily pads damp them. The pads and flowers read the same texture in their vertex shader to ride the waves.</p>\n<p><b>Koi.</b> The body is lofted from width/height profiles along the spine; fins are thin sheets. The vertex shader bends the fish with a travelling wave that grows towards the tail plus an arc that follows the current turn, and moves the fins. Tail-beat rate and amplitude come from the swimming speed and acceleration, so fish that speed up work harder and fish that slow down glide. Colour patterns, scales, gill line and eyes are procedural. Behaviour is a small steering model: wander, roam to random spots, follow a leader for a while, avoid the banks using the distance field, keep apart sideways and in depth.</p>\n<p><b>Light.</b> There are no real-time shadows. Instead, once at start-up the sky is sampled in 56 directions and for each one a depth map of the whole garden is rendered and its light accumulated onto the ground (plus the directional afterglow). The result is a texture of sky light with soft shadows and contact shading under stones, shrubs, bamboo and the tree; ground and grass read it at run time. An &quot;ambient cube&quot; integrated from the same sky shader lights plants and trees, the lanterns are added as simple diffuse lights, and the few glossy materials (stones, lily pads, koi, lantern wood) use three.js physically based shading with an environment map rendered from the sky.</p>\n<p><b>Performance.</b> Measures that mattered: noise from textures instead of per-pixel hashing, the baked ground light, pass culling as described above, the sky drawn last so hidden sky is never shaded, splatted ripple sources, instancing for everything that repeats, and a bloom chain that starts at quarter resolution. The internal resolution is the window size times the device pixel ratio, capped at about 3 megapixels. A watchdog lowers the resolution in steps if the frame rate stays under 44 fps; if lowering it does not help (the browser is limiting the frame rate itself) it restores the resolution and stops.</p>\n<p>Measured with <code>../shot.sh</code> (headless Chrome, Apple M4 Pro, 1920 x 1080): 60 fps, the cap of the tool. To see the headroom I rendered every frame several times over: four times per frame at 2304 x 1296 still ran at about 54 fps, i.e. roughly 4.6 ms for one frame, so there is about three and a half times headroom at 60 fps on that machine.</p>\n<p><code>shots/</code> holds screenshots of the finished scene: the opening view, 20 s later, from the side, from behind, from above, a close-up and a low view across the water.</p>\n<h3>Development switches</h3>\n<p><code>js/debug.js</code> has flags for a fixed camera, starting further round the orbit, skipping ahead in time, logging the frame rate, a stress test, a benchmark that switches parts of the frame off one by one, a simulated drag/zoom test, and lifting koi out of the water to inspect the model. All are off.</p>\n<h3>Known problems and limits</h3>\n<ul>\n<li>I could only test in the headless Chrome of <code>../shot.sh</code> on an M4 Pro. I have not seen it on</li>\n<p>a slower M-series MacBook; the headroom above and the resolution watchdog are what I am relying on there. Drag and zoom were tested with synthetic pointer and wheel events, not by hand.</p>\n<li>Start-up takes a moment (ground light bake and shader compilation) before the picture</li>\n<p>fades in from black.</p>\n<li>Lantern light casts no shadows, and the baked ground light does not change when the</li>\n<p>floating lanterns drift or leaves move.</p>\n<li>Reflections are planar with an approximate ripple offset: at the very edge of the screen</li>\n<p>the reflection can smear slightly, and the red maple canopy reflects as a fairly soft mass rather than individual leaves.</p>\n<li>Koi are drawn only through the water surface, so a fin never actually breaks the surface;</li>\n<p>two fish can still touch or overlap briefly when their paths cross.</p>\n<li>Ripples are a non-dispersive wave model: rings do not break up the way real capillary</li>\n<p>waves do, and the floating lanterns do not block them.</p>\n<li>The camera does not collide with anything. On its automatic path it stays clear, but by</li>\n<p>hand you can put it inside the maple, a shrub or the tall grasses.</p>\n<li>After many hours the animation would slowly lose smoothness because time is kept in a</li>\n<p>32-bit float in the shaders; reload to reset.</p>\n<li>It needs WebGL 2 with float render targets (fine on Apple GPUs; not tried elsewhere).</li>\n</ul>",
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
  4
 ],
 "prompt": "Build a 3D koi pond scene that runs in a web browser. Work only inside the current folder.\n\nThe scene: a small Japanese-style koi pond at dusk. It should have koi fish swimming naturally, water with ripples and reflections, lily pads (some with flowers), stones around the edge, and a few glowing paper lanterns that reflect on the water. Add anything else you think makes it look beautiful. Keep it simple, but make it look great on screen: it will be shown full screen in a YouTube video.\n\nRules:\n- Output: index.html in this folder. You may add your own .js / .css files next to it. Everything the page needs must be in this folder.\n- Use three.js r170, already in ./three (do not change it). Import it with this import map:\n  {\"imports\":{\"three\":\"./three/build/three.module.js\",\"three/addons/\":\"./three/examples/jsm/\"}}\n  You may use anything in ./three/examples/jsm (controls, post-processing, etc.). No other libraries.\n- Everything is made in code: no downloaded or generated images, textures, 3D models or sounds, and no network requests.\n- The page fills the whole window, handles resizing, and shows no text or UI on screen.\n- The camera starts on a good framing and moves slowly on its own. The viewer can drag to orbit and scroll to zoom; after they let go, the slow camera motion carries on.\n- It must run smoothly (30 fps or more) at 1920x1080 in Chrome on an Apple M-series MacBook.\n- To check your work, ../shot.sh <folder> <out.png> [seconds] [width] [height] opens the folder's index.html in real Chrome with the GPU, waits, saves a screenshot, and prints the frame rate and any console errors. Example: ../shot.sh . shots/check.png 6\n  It takes turns with other agents on this machine, so it may wait a little. Keep screenshots in ./shots.\n- Nobody will answer questions, so make your own decisions. Work until you are happy with the result.\n- When you finish, write NOTES.md: what you built, how it works, and any known problems.",
 "costSub": "API price from the run log",
 "numLede": "Time, tokens and cost come from each run's own log. Frame rate is our own test: Chrome on an M-series MacBook at 1920\u00d71080.",
 "numFoot": "Input (new) = fresh input tokens plus cache writes. Input (cached) = tokens re-read from the prompt cache, which bills at a small fraction. Screenshots = how many times the model used the screenshot tool to check its own work. Lines = non-empty lines in the files the model wrote.",
 "setup": [
  [
   "Harness",
   "Claude Code (<code>claude -p --effort &lt;level&gt;</code>), one fresh session per level. No MCP servers, hooks, memory or custom instructions."
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
