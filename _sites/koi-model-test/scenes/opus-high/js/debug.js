// Development switches used while building the scene (all off for the final build).
export const DEBUG = {
  waterMode: 0, // 0 normal, 1 water shows reflection only, 2 water shows refraction only
  noBloom: false,
  noEnv: false,
  cam: null, // [x,y,z, tx,ty,tz] fixed camera, disables auto-rotate
  stress: 1, // render N times per frame (perf headroom test)
  noAdapt: false, // disable adaptive resolution
  skip: 0, // fast-forward the simulation by N seconds at startup
};
