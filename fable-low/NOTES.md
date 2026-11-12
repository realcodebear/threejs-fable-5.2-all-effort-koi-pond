# Koi pond at dusk

Open `index.html` (served over http, e.g. via `../shot.sh`). Files: `index.html`, `main.js`, and the provided `./three` (r170, untouched). Everything is generated in code; no textures, models or network requests.

## What is in the scene
- An irregular pond ringed with mossy stones, boulders and a small rock island.
- 11 koi in 8 colour varieties (kohaku, sanke, showa, ogon, tancho, ...), swimming with body and tail undulation.
- Water with planar reflections, moving ripples, and expanding ring ripples where fish surface.
- Lily pads in clusters, 9 pink and white water lilies, fallen maple leaves on the water.
- Lanterns: 4 floating paper lanterns that drift and bob, a string of 5 round paper lanterns between bamboo poles, and a stone lantern on the bank. All reflect in the water.
- A red Japanese maple, bamboo groves, grass and reeds that sway, shrubs, fireflies, and a dusk sky with afterglow, clouds, stars, crescent moon and layered hills.

## How it works
- **Water**: three.js `Reflector` (mirror-camera render) with a custom shader. Ripple normals come from summed, noise-warped sine waves plus up to 10 ring ripples passed as uniforms. The normals distort the reflection lookup and drive a Fresnel term; premultiplied alpha lets the fish and pond bed show through at steep angles.
- **Koi**: one procedural geometry (body tube plus fins) and a custom shader. The vertex shader bends the body with a travelling wave and with the current turn curvature; the fragment shader paints patterns from 3D noise per fish. Motion is simple steering in JS: wander, turn away from the shore and island, keep apart.
- **Lanterns**: unlit emissive "paper" shader with HDR values, picked up by `UnrealBloomPass`. Six point lights (no shadows) light the surroundings.
- **Everything else**: instanced meshes (stones, pads, petals, leaves, 16k grass blades, bamboo) with vertex colours; the sky is one shader on a sphere.
- **Post**: `EffectComposer` with 4x MSAA half-float target, bloom, ACES tone mapping.
- **Camera**: `OrbitControls` (drag to orbit, scroll to zoom, damping). The automatic motion is a slow sweep about ±45° around the starting view, which resumes after the viewer lets go; if they dragged far away it drifts back toward that range.
- **Performance**: pixel ratio is capped at 1.5 and drops automatically if the frame rate stays under 40 fps. `shot.sh` reported ~60 fps at 1920x1080.

## Known problems / not verified
- Only checked through `shot.sh` screenshots: mouse drag/zoom and the long-run camera sweep reversal were not tested by hand.
- No shadows; stones and lanterns rely on dark ground tones instead.
- Fish are not refracted by the water surface, and they ignore lily pads and floating lanterns (they pass underneath).
- Reflection distortion is done in screen space, so strong ripples can smear reflections a little near the edges of the pond.
- The crescent moon sits above the default framing; it shows when the viewer tilts or zooms out.
