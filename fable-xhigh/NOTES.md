# Koi pond at dusk

A small Japanese garden pond just after sunset, built entirely in code with three.js r170
(no images, models, sounds or network requests). Open `index.html` from a local web server.

## What is in the scene

- **Koi** – twelve fish in different varieties (kohaku, sanke, showa, ogon, tancho, asagi, bekko …)
  with scales, translucent fins and soft shadows on the pond bed.
- **Water** – ripples from fish "kissing" the surface, fish wakes, falling leaves, bobbing
  lanterns and insects; mirror reflections, refraction and depth tint.
- **Lily pads and water lilies** – several dozen notched, veined pads in loose rafts; open blossoms and buds.
- **Stones** – edging stones around the pond, feature boulders, island stones, stepping stones.
- **Lanterns** – four hanging paper lanterns (three on wooden posts, one in the maple), three
  floating paper lanterns drifting on the water, and a stone snow-viewing lantern. All flicker,
  light their surroundings and reflect on the water.
- **Extras** – a red Japanese maple that sheds leaves onto the water, a bamboo fence, clipped
  shrubs, grass and reeds, a ring of garden trees and cedars, fireflies, low evening mist, and
  a dusk sky with lit clouds, stars, a crescent moon and hazy hills.

## Camera

Starts on a three-quarter view of the pond and sweeps slowly back and forth around it while
gently rising, falling and moving in and out. Drag to orbit, scroll to zoom; on release the
slow motion eases back in from wherever the camera was left. Zoom and tilt are limited so the
camera stays above ground and inside the fence.

## How it works

Files: `index.html`, `js/main.js` (assembly, camera, loop) and one module per subject
(`water`, `koi`, `lilies`, `lanterns`, `stones`, `terrain`, `flora`, `sky`, `fx`, `common`).

- **Three passes per frame.** A refraction pass (pond bed, stones, fish) and a mirrored
  reflection pass feed the water shader in the main pass. Both helper passes are restricted to
  the pond's screen rectangle. The fish are drawn only in the refraction pass, so they are
  always seen through the water.
- **Water shader.** Surface slope = a tileable swell texture + a 768² wave-equation ripple
  simulation. Reflection is sampled along the perturbed reflected ray; refraction is offset in
  screen space with a depth check and tinted by the length of the underwater path. Lantern
  glints on the ripples are added analytically, and mirrored lanterns are brightened a little
  beyond what physics gives so they read clearly.
- **Koi.** One procedural mesh (lofted body, fins, eyes). Each fish steers with wander, bank
  and island avoidance, a turning-circle limit and personal space. The body follows the path
  the head actually swam, plus a travelling swimming wave; the spine is sent to the vertex
  shader as 22 joints. Patterns are 3D noise in the fish's rest pose.
- **Everything else is procedural geometry**, mostly instanced. Most materials are
  `MeshStandardMaterial` with injected procedural colour/bump code, so they keep three's
  lighting; distant foliage, fish, water, sky and lantern paper use hand-written shaders.
- **Lighting.** Image-based ambient light generated from the procedural sky, one after-glow
  directional light with a shadow map rendered once, eight flickering point lights, and a
  blurred top-down occlusion map used as soft contact shadows.
- **Post.** 4× MSAA HDR target → bloom → one final pass (vignette, ACES tone curve, light
  grade, grain).

## Performance

About 59–60 fps at 1920×1080 in the provided screenshot tool (headless Chrome, GPU), from
several camera positions. The drawing buffer is capped at about 2.6 million pixels on
high-DPI screens, and if the frame rate stays under ~40 fps the resolution steps down
automatically. Scene materials are compiled before the first frame, which then fades in from black.

## Known problems / limits

- I could only judge still frames, not video, so motion (fish, ripples, camera) is checked by
  comparing frames at different times rather than by watching it play.
- Not tested in a normal Chrome window on a MacBook, only through the screenshot tool.
- Refraction is a screen-space approximation: the pond looks a little deeper than real water
  would, and there are no caustics.
- Fish avoid each other loosely and can still overlap for a moment, mostly at different depths.
- The background trees' leafy sprays are left out of the water reflection (only their dark
  cores are mirrored), and grass is not reflected.
- Shadows from the after-glow are baked once; the lanterns light things but cast no shadows.
- The mist is computed on surfaces, not as a volume, so it does not veil the lanterns or sky.
- A falling leaf that lands on a stone or lily pad at the water's edge may be partly hidden.
- Scales are stylised: lily pads, blossoms and maple leaves are a bit larger than life so they
  read on screen.
- The seasons are mixed on purpose (red maple, water lilies and fireflies together).
- No sound.
