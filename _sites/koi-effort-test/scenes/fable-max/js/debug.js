// Development switches. Everything is off in the finished scene; they are kept because they
// are handy when changing something (see NOTES.md).
export const DEBUG = {
  cam: null,          // [x, y, z, tx, ty, tz]: fixed camera instead of the orbiting one
  orbit: 0,           // start the automatic orbit this many radians further round
  noAuto: false,      // stop the automatic camera motion
  timeSkip: 0,        // extra seconds of simulation to run before the first frame
  stress: 1,          // render each frame this many times (performance headroom test)
  log: false,         // print frame rate and CPU time (as console errors, so that ../shot.sh shows them)
  warnings: false,    // print console warnings as errors too
  noAdapt: false,     // disable the automatic resolution scaling
  bench: false,       // switch parts of the frame off one after another and report the frame rate of each
  benchOnly: null,    // optional list of benchmark names to run
  benchExtra: [['no flora', ['flora']], ['no maple', ['maple', 'falling-leaves']], ['no fireflies', ['fireflies']]],
  koiInspect: false,  // lift a few koi above the water to look at the model
  testInput: false,   // simulate a drag and a wheel zoom and log the camera state
};
