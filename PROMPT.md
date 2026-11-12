Build a 3D koi pond scene that runs in a web browser. Work only inside the current folder.

The scene: a small Japanese-style koi pond at dusk. It should have koi fish swimming naturally, water with ripples and reflections, lily pads (some with flowers), stones around the edge, and a few glowing paper lanterns that reflect on the water. Add anything else you think makes it look beautiful. Keep it simple, but make it look great on screen: it will be shown full screen in a YouTube video.

Rules:
- Output: index.html in this folder. You may add your own .js / .css files next to it. Everything the page needs must be in this folder.
- Use three.js r170, already in ./three (do not change it). Import it with this import map:
  {"imports":{"three":"./three/build/three.module.js","three/addons/":"./three/examples/jsm/"}}
  You may use anything in ./three/examples/jsm (controls, post-processing, etc.). No other libraries.
- Everything is made in code: no downloaded or generated images, textures, 3D models or sounds, and no network requests.
- The page fills the whole window, handles resizing, and shows no text or UI on screen.
- The camera starts on a good framing and moves slowly on its own. The viewer can drag to orbit and scroll to zoom; after they let go, the slow camera motion carries on.
- It must run smoothly (30 fps or more) at 1920x1080 in Chrome on an Apple M-series MacBook.
- To check your work, ../shot.sh <folder> <out.png> [seconds] [width] [height] opens the folder's index.html in real Chrome with the GPU, waits, saves a screenshot, and prints the frame rate and any console errors. Example: ../shot.sh . shots/check.png 6
  It takes turns with other agents on this machine, so it may wait a little. Keep screenshots in ./shots.
- Nobody will answer questions, so make your own decisions. Work until you are happy with the result.
- When you finish, write NOTES.md: what you built, how it works, and any known problems.
