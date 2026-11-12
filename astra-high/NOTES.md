# Evening koi garden

A full-window, entirely procedural Three.js r170 scene. `index.html` loads `scene.js` and the supplied, unchanged `three` directory. There are no image assets, audio, external dependencies, remote requests, or visible interface elements.

## Scene

- Ten three-dimensional koi with cream, vermilion, black and golden markings, subtle scales, eyes, translucent fins, bending bodies and oscillating tails. They follow slow, individually varied swimming paths at slightly different depths.
- A clear teal pond with animated caustic light on its bed, small pebbles, concentric ripples, drifting maple leaves, and actual planar reflections distorted by a water shader.
- Notched lily pads with veins and three layered pink water-lily flowers.
- Rounded, procedurally mottled stones, moss, grasses, ferns, bamboo, a copper maple, stepping stones, and a stone garden lantern.
- Four ribbed paper lanterns, warm local lighting, subtle swaying, fireflies, soft shadows, bloom and a gentle vignette.

## Viewing and controls

Serve this folder through a local static HTTP server and open `index.html` in Chrome. ES modules require HTTP rather than opening the file directly. All requests remain local.

Drag to orbit and scroll to zoom. OrbitControls supplies damping and automatically resumes its slow orbit after interaction ends. Camera limits keep the view above the pond. Window resizing updates the renderer, post-processing and camera; narrow windows widen the vertical field of view to preserve the pond framing. The starting composition is designed for 1920 × 1080.

## Implementation and performance

Grass, maple foliage and submerged pebbles use instancing. Geometry is shared where useful. Materials use mathematical noise and geometry instead of texture files. Water uses a 1024 × 1024 reflection target, and rendering pixel density is capped at 1.5. Only the directional moon light casts shadows; the lanterns use inexpensive unshadowed point lights. Animation is time-based.

Checked with the supplied `../shot.sh` in GPU Chrome at 1920 × 1080: approximately 60 fps, with no console errors after the initial shader fix. A second 960 × 720 check also ran at approximately 60 fps with no console errors. JavaScript syntax also passed `node --check scene.js`. Screenshots are in `shots/`.

## Known limitations

This is a stylized scene, not a physical fluid simulation. Refraction and caustics are approximated; fish follow designed paths rather than full flocking or collision simulation and can occasionally overlap. Frame rate depends on GPU, browser, viewport and pixel density. The intended view is above the water, and camera controls enforce that constraint.
