import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// All surfaces, patterns and silhouettes are made here, without image assets.
let seed = 14731;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const rr = (a,b) => a+(b-a)*rand();
const scene = new THREE.Scene();
scene.background = new THREE.Color('#172735');
scene.fog = new THREE.FogExp2('#172735', .029);
const renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(41,innerWidth/innerHeight,.1,100);
camera.position.set(6.7,10.5,12.8);
const controls = new OrbitControls(camera,renderer.domElement);
controls.target.set(0,.4,0);
controls.enableDamping=true; controls.dampingFactor=.045;
controls.enablePan=false; controls.minDistance=10; controls.maxDistance=29;
controls.minPolarAngle=.33; controls.maxPolarAngle=1.26;
controls.autoRotate=true; controls.autoRotateSpeed=.13;
controls.update();
scene.add(new THREE.HemisphereLight('#afcbd5','#253b31',2.1));
const moon = new THREE.DirectionalLight('#b6d7ed',2.0);
moon.position.set(-4,11,5); moon.castShadow=true;
moon.shadow.mapSize.set(2048,2048); Object.assign(moon.shadow.camera,{left:-12,right:12,top:12,bottom:-12,near:1,far:30});
moon.shadow.normalBias=.035; moon.shadow.bias=-.0002; scene.add(moon);
const sunset = new THREE.DirectionalLight('#d99c6e',.6); sunset.position.set(-8,4,-8);scene.add(sunset);
const time = {value:0};
const noiseGLSL = `
float hash(vec3 p){p=fract(p*.3183099+vec3(.13,.71,.27));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
`;
function surfaceMaterial(color, roughness=1, type='stone') {
 const m=new THREE.MeshStandardMaterial({color,roughness});
 m.onBeforeCompile=s=>{
  s.uniforms.uTime=time;
  s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vP;').replace('#include <begin_vertex>','#include <begin_vertex>\nvP=position;');
  s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec3 vP; uniform float uTime; ${noiseGLSL}`);
  s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
  float n=noise(vP*7.)*.5+noise(vP*25.)*.3+noise(vP*80.)*.2;
  diffuseColor.rgb*=.64+.65*n;
  ${type==='stone' ? 'float moss=smoothstep(.08,.48,vP.y)*smoothstep(.46,.72,noise(vP*5.)); diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.10,.18,.065),moss*.4);' : ''}
  ${type==='bed' ? 'float a=sin(vP.x*8.+sin(vP.z*6.+uTime*.5)*1.6+uTime*.4); float b=sin(vP.z*9.+sin(vP.x*7.-uTime*.4)*1.3); float c=pow(max(0.,1.-abs(a+b)*.6),12.); diffuseColor.rgb+=vec3(.014,.045,.038)*c;' : ''}
  `);
 }; m.customProgramCacheKey=()=>type; return m;
}
const stoneMat=surfaceMaterial('#596968');
const darkStone=surfaceMaterial('#364c4c');
const groundMat=surfaceMaterial('#273c2e',1,'ground');
const woodMat=surfaceMaterial('#3a2927',.92,'wood');
const mossMat=new THREE.MeshStandardMaterial({color:'#4c6032',roughness:1});
const mesh=(geo,mat,parent=scene)=>{const o=new THREE.Mesh(geo,mat);parent.add(o);return o;};
function boundary(a){return 1+.034*Math.sin(a*3+.4)+.025*Math.sin(a*7);}
function diskGeometry(rings=1, outer=1, inner=0){
 const p=[],uv=[],indices=[],N=160;
 for(let j=0;j<=rings;j++)for(let i=0;i<=N;i++){
  const a=i/N*Math.PI*2,r=inner+(outer-inner)*j/rings,b=boundary(a);
  p.push(Math.cos(a)*6.5*r*b,0,Math.sin(a)*4.65*r*b);uv.push(.5+Math.cos(a)*r*.5,.5+Math.sin(a)*r*.5);
 }
 for(let j=0;j<rings;j++)for(let i=0;i<N;i++){let a=j*(N+1)+i,b=a+N+1;indices.push(a,a+1,b,b,a+1,b+1);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
const ground=mesh(diskGeometry(12,20,1.01),groundMat);ground.position.y=-.09;ground.receiveShadow=true;
const bed=mesh(diskGeometry(7,1.04),surfaceMaterial('#24564d',.8,'bed'));bed.position.y=-.72;bed.receiveShadow=true;
// A gently irregular, moss-flecked stone shoreline.
const rockGeo=mergeVertices(new THREE.IcosahedronGeometry(1,3));
const rp=rockGeo.attributes.position;
for(let i=0;i<rp.count;i++){const x=rp.getX(i),y=rp.getY(i),z=rp.getZ(i),f=1+.1*Math.sin(x*8+z*4)*Math.cos(y*7-z*3);rp.setXYZ(i,x*f,y*f,z*f);}rockGeo.computeVertexNormals();
function rock(x,y,z,sx,sy,sz,mat=stoneMat){const o=mesh(rockGeo,mat);o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.rotation.set(rr(-.13,.13),rr(0,6.28),rr(-.13,.13));o.castShadow=true;o.receiveShadow=true;return o;}
for(let i=0;i<64;i++){const a=i/64*Math.PI*2,b=boundary(a);rock(Math.cos(a)*6.65*b,rr(.05,.18),Math.sin(a)*4.78*b,rr(.42,.73),rr(.24,.5),rr(.43,.73));}
for(let i=0;i<65;i++){const a=rr(0,6.28),r=rr(1.05,1.25);rock(Math.cos(a)*6.5*r,-.02,Math.sin(a)*4.7*r,rr(.11,.33),rr(.08,.18),rr(.1,.28),darkStone);}
for(let i=0;i<7;i++){const a=rr(3.1,6),r=rr(1.1,1.25);rock(Math.cos(a)*6.7*r,.3,Math.sin(a)*4.9*r,rr(.65,1.2),rr(.4,.85),rr(.5,.9));}
// Small gravel, visible through the clear shallows.
const pebble=new THREE.InstancedMesh(rockGeo,darkStone,350);scene.add(pebble);
const dummy=new THREE.Object3D();
for(let i=0;i<350;i++){const a=rr(0,6.28),r=Math.sqrt(rr(.25,1));dummy.position.set(Math.cos(a)*6.25*r,-.67,Math.sin(a)*4.4*r);dummy.scale.set(rr(.025,.1),rr(.02,.055),rr(.04,.12));dummy.rotation.set(rand(),rand()*6,rand());dummy.updateMatrix();pebble.setMatrixAt(i,dummy.matrix);}

// A planar reflection with animated refraction-like ripples; the transparent
// surface lets the actual three-dimensional fish and pond bed remain visible.
const waterShader={
 uniforms:{color:{value:new THREE.Color('#44736f')},tDiffuse:{value:null},textureMatrix:{value:null},uTime:time},
 vertexShader:`uniform mat4 textureMatrix;varying vec4 vMirror;varying vec3 vWorld;void main(){vMirror=textureMatrix*vec4(position,1.);vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
 fragmentShader:`uniform sampler2D tDiffuse;uniform float uTime;varying vec4 vMirror;varying vec3 vWorld;
 void main(){vec2 p=vWorld.xz;float t=uTime;
 vec2 wave=vec2(sin(p.x*3.2+p.y*2.9+t*.8)+sin(p.y*6.1-t*.65)*.36,cos(p.y*3.7-p.x*1.9+t*.7)+sin(p.x*5.4+t*.6)*.3);
 float rings=0.;
 for(int i=0;i<5;i++){float fi=float(i);vec2 origin=vec2(sin(fi*7.1)*4.6,cos(fi*3.7)*3.1);float d=length(p-origin);float age=mod(t*.25+fi*.73,3.4);float ring=sin(d*32.-age*23.);float env=exp(-pow((d-age*1.4)*2.7,2.))*exp(-age*.8);rings+=ring*env;wave+=normalize(p-origin+.001)*ring*env*.5;}
 vec2 uv=vMirror.xy/vMirror.w+wave*.0028;
 vec3 reflection=texture2D(tDiffuse,uv).rgb;
 vec3 eye=normalize(cameraPosition-vWorld);float fresnel=pow(1.-max(eye.y,0.),3.);
 vec3 tint=vec3(.035,.13,.145);
 vec3 col=mix(tint,reflection,.67+fresnel*.25);
 col+=vec3(.12,.23,.24)*max(0.,rings)*.15;
 float glint=pow(max(0.,sin(p.x*7.5+p.y*9.+t*.6)*sin(p.y*8.-p.x*2.+t*.4)),28.);
 col+=glint*vec3(.045,.07,.075);
 gl_FragColor=vec4(col,.34+fresnel*.45);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`
};
// Reflector expects a local XY plane.
const waterGeo=diskGeometry(1,1.025);waterGeo.rotateX(Math.PI/2);
const water=new Reflector(waterGeo,{textureWidth:1024,textureHeight:1024,clipBias:.003,multisample:0,shader:waterShader});
water.rotation.x=-Math.PI/2;water.position.y=.025;water.material.transparent=true;water.material.depthWrite=false;water.renderOrder=5;scene.add(water);

// Koi are tapered ring meshes with individual ink patterns and moving tails.
const fish=[];
function koiGeometry(){
 const p=[],uv=[],idx=[],N=48,M=32;
 for(let i=0;i<=N;i++){
 const u=i/N,x=.72-u*1.45;
 const width=.245*Math.pow(Math.sin(Math.PI*Math.pow(u,.7)),.8)+.018;
 const h=width*.76;
 for(let j=0;j<=M;j++){const a=j/M*6.283185;p.push(x,Math.cos(a)*h,Math.sin(a)*width);uv.push(u,j/M);}
 }
 for(let i=0;i<N;i++)for(let j=0;j<M;j++){let a=i*(M+1)+j,b=a+M+1;idx.push(a,b,a+1,b,b+1,a+1);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}
const bodyGeo=koiGeometry();
function fishMaterial(i){
 const mat=new THREE.MeshStandardMaterial({color:'#fff3dc',roughness:.34,metalness:.1});
 mat.onBeforeCompile=s=>{
 s.uniforms.uTime=time;s.uniforms.uSeed={value:i*12.7};
 s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nuniform float uTime;uniform float uSeed;varying vec3 vLocal;varying vec2 vFishUv;')
 .replace('#include <begin_vertex>',`#include <begin_vertex>
 vLocal=position;vFishUv=uv;float bend=pow(clamp((.38-position.x)/1.2,0.,1.),1.6);transformed.z+=sin(uTime*2.6+position.x*4.+uSeed)*.12*bend;`);
 s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>\nuniform float uSeed;varying vec3 vLocal;varying vec2 vFishUv;${noiseGLSL}`)
 .replace('#include <color_fragment>',`#include <color_fragment>
 vec3 p=vLocal*vec3(4.4,6.,6.);float n=noise(p+uSeed)+noise(p*2.4+uSeed)*.23;
 vec3 cream=vec3(.93,.88,.70),red=vec3(.85,.12,.035),ink=vec3(.018,.028,.028);
 float marking=smoothstep(.52,.57,n);vec3 pigment=mix(cream,red,marking);
 ${i%4===1?'pigment=mix(pigment,ink,smoothstep(.64,.7,noise(p*1.6+uSeed+30.)));':''}
 ${i%4===2?'pigment=mix(vec3(.92,.43,.035),vec3(1.,.75,.24),smoothstep(.35,.7,n));':''}
 ${i%4===3?'pigment=mix(cream,ink,smoothstep(.53,.58,n));pigment=mix(pigment,red,smoothstep(.67,.7,noise(p*.8+12.)));':''}
 float rows=vFishUv.x*43.;float col=vFishUv.y*24.+mod(floor(rows),2.)*.5;
 float scaleLine=smoothstep(.36,.49,length(vec2(fract(rows)-.5,(fract(col)-.5)*.75)));
 pigment*=1.-scaleLine*.085;
 diffuseColor.rgb=pigment;`);
 };mat.customProgramCacheKey=()=>`fish${i}`;return mat;
}
const finMat=new THREE.MeshStandardMaterial({color:'#e4c78c',transparent:true,opacity:.7,side:THREE.DoubleSide,roughness:.42,depthWrite:false});
function finGeometry(points){const shape=new THREE.Shape();shape.moveTo(...points[0]);for(let i=1;i<points.length;i++)shape.lineTo(...points[i]);shape.closePath();const g=new THREE.ShapeGeometry(shape);g.rotateX(-Math.PI/2);return g;}
const eyeMat=new THREE.MeshStandardMaterial({color:'#030c0d',roughness:.1});
const eyeRim=new THREE.MeshStandardMaterial({color:'#d6ac59',roughness:.4});
for(let i=0;i<10;i++){
 const group=new THREE.Group();scene.add(group);
 const body=mesh(bodyGeo,fishMaterial(i),group);body.castShadow=true;
 const tail=new THREE.Group();tail.position.x=-.64;group.add(tail);
 const tailFin=mesh(finGeometry([[0,0],[-.43,-.3],[-.34,-.12],[-.3,0],[-.34,.12],[-.43,.3]]),finMat,tail);
 const fins=[];
 for(const side of [-1,1]){
 const f=mesh(finGeometry([[0,0],[-.18,side*.27],[-.39,side*.34],[-.32,side*.08]]),finMat,group);f.position.set(.25,-.055,side*.16);fins.push(f);
 const e=mesh(new THREE.SphereGeometry(.036,10,8),eyeRim,group);e.position.set(.49,.075,side*.145);e.scale.set(1,.8,.6);
 const pupil=mesh(new THREE.SphereGeometry(.026,10,8),eyeMat,group);pupil.position.set(.499,.088,side*.16);
 }
 const dorsal=mesh(finGeometry([[.18,0],[-.15,.12],[-.49,.05],[-.5,0]]),finMat,group);dorsal.rotation.x=Math.PI/2;dorsal.position.y=.13;
 const scale= i<3?rr(1.05,1.3):rr(.72,1.05);group.scale.setScalar(scale);
 fish.push({group,tail,fins,phase:i*.628+rr(-.12,.12),rx:i>7?rr(1.3,2):rr(3.1,4.9),rz:i>7?rr(1,1.6):rr(2,3.2),speed:rr(.045,.082)*(i%3===0?-1:1),depth:rr(-.27,-.17),offset:rr(-.5,.5)});
}

// Lily pads: shallow curved disks with the characteristic open slit and veins.
const lilyMat=new THREE.MeshStandardMaterial({color:'#477442',roughness:.52,metalness:.05,side:THREE.DoubleSide});
const lilyDark=new THREE.MeshStandardMaterial({color:'#315d39',roughness:.65,side:THREE.DoubleSide});
const veinMat=new THREE.LineBasicMaterial({color:'#789044',transparent:true,opacity:.3});
function lilyGeometry(){const p=[0,0,0],uv=[.5,.5],idx=[];const N=64;for(let i=0;i<=N;i++){const a=.12+i/N*(Math.PI*2-.25);p.push(Math.cos(a)*(1+.025*Math.sin(a*5)),.025*Math.sin(a*3)+.025,Math.sin(a));uv.push(.5+Math.cos(a)*.5,.5+Math.sin(a)*.5);if(i>0)idx.push(0,i+1,i);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;}
const lilyGeo=lilyGeometry(),lilies=[];
function pad(x,z,s,angle){const g=new THREE.Group();g.position.set(x,.065,z);g.rotation.y=angle;scene.add(g);const p=mesh(lilyGeo,rand()>.5?lilyMat:lilyDark,g);p.scale.set(s,1,s);p.receiveShadow=true;
 const pts=[];for(let j=0;j<9;j++){const a=.4+j/9*5.6;pts.push(new THREE.Vector3(0,.033,0),new THREE.Vector3(Math.cos(a)*s*.94,.055,Math.sin(a)*s*.94));}
 g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),veinMat));lilies.push({group:g,phase:rand()*6});return g;}
const pads=[[-3.9,1.4,.6],[-3.2,2,.48],[-4.7,.8,.5],[-4.45,2.1,.38],[-3.8,2.65,.42],[-2.8,2.65,.34],[3.4,-1.7,.66],[4.2,-1.2,.48],[3.9,-2.5,.44],[2.8,-2.4,.4],[4.65,-.45,.35],[-.5,-3.5,.47],[.3,-3.7,.38],[.7,-3.25,.32]];
pads.forEach(([x,z,s])=>pad(x,z,s,rr(0,6.28)));
const petalGeo=new THREE.SphereGeometry(1,12,8);
const petalMats=['#f9c6c4','#f5a5b4','#e8839f'].map(c=>new THREE.MeshStandardMaterial({color:c,roughness:.45,emissive:c,emissiveIntensity:.07}));
function flower(x,z,size){const g=new THREE.Group();scene.add(g);g.position.set(x,.14,z);g.scale.setScalar(size);
 for(let ring=0;ring<3;ring++){const n=ring===2?7:10;for(let j=0;j<n;j++){const a=j/n*6.28+ring*.32;const p=mesh(petalGeo,petalMats[ring],g);const r=.21-ring*.055;p.position.set(Math.cos(a)*r,.075+ring*.055,Math.sin(a)*r);p.scale.set(.09-ring*.012,.04,.24-ring*.05);p.rotation.y=-a+Math.PI/2;p.rotation.x=-(.15+ring*.32);}}
 const core=mesh(new THREE.SphereGeometry(.09,12,8),new THREE.MeshStandardMaterial({color:'#ffcd64',emissive:'#d48022',emissiveIntensity:.3}),g);core.position.y=.21;
 for(let i=0;i<18;i++){const a=i*2.4,r=.07*Math.sqrt(rand());const st=mesh(new THREE.SphereGeometry(.015,5,4),core.material,g);st.position.set(Math.cos(a)*r,.25+rr(0,.04),Math.sin(a)*r);}
 return g;
}
flower(-3.92,1.4,1.2);flower(3.4,-1.7,1);flower(-.55,-3.5,.8);

// Tufts of curved grass are instanced to keep the garden inexpensive to draw.
const grassG=new THREE.BufferGeometry();grassG.setAttribute('position',new THREE.Float32BufferAttribute([-.035,0,0,.035,0,0,-.023,.4,.04,.023,.4,.04,0,.78,.17],3));grassG.setIndex([0,1,2,1,3,2,2,3,4]);grassG.computeVertexNormals();
const grassMat=new THREE.MeshStandardMaterial({color:'#a1ac77',side:THREE.DoubleSide,roughness:1});
const grasses=new THREE.InstancedMesh(grassG,grassMat,2200);scene.add(grasses);
for(let i=0;i<2200;i++){const a=rr(0,6.28),r=rr(1.08,1.48);dummy.position.set(Math.cos(a)*6.7*r,rr(-.03,.08),Math.sin(a)*4.9*r);dummy.rotation.set(0,rand()*6.28,rr(-.2,.2));dummy.scale.setScalar(rr(.35,.95));dummy.updateMatrix();grasses.setMatrixAt(i,dummy.matrix);grasses.setColorAt(i,new THREE.Color().setHSL(rr(.2,.27),rr(.22,.4),rr(.15,.3)));}
function branch(points,radius,material=woodMat){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));const o=mesh(new THREE.TubeGeometry(curve,16,radius,7,false),material);o.castShadow=true;return o;}
function rod(a,b,r,mat,parent=scene){const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=B.clone().sub(A);const o=mesh(new THREE.CylinderGeometry(r*.8,r,d.length(),8),mat,parent);o.position.copy(A).add(B).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());o.castShadow=true;return o;}
// A sculptural maple on the far bank, with many individually cut leaves.
branch([[-6.5,0,-2.5],[-6.2,1.1,-2.6],[-6.5,2.4,-2.7],[-5.9,3.8,-2.6],[-5.25,4.8,-2.6]],.23);
branch([[-6.3,2.1,-2.6],[-5.1,3,-2.4],[-3.7,3.7,-2.65],[-2.1,4.3,-3.1]],.11);
branch([[-6.2,3,-2.6],[-7.4,3.9,-1.8],[-8.1,4.5,-1.3]],.12);
branch([[-5.7,4,-2.7],[-5.8,4.8,-4],[-4.9,5.4,-4.7]],.075);
branch([[-4.4,3.4,-2.55],[-4,4.5,-1.7],[-3,4.9,-1.2]],.055);
for(const [x,y,z] of [[-5.7,4.35,-2.5],[-4.3,4,-2.5],[-3,4.1,-2.9],[-7.4,4.1,-1.8],[-5.6,4.8,-4]]) {
 for(let j=0;j<4;j++){const a=j*1.57;rod([x,y-.3,z],[x+Math.cos(a)*.75,y+.25,z+Math.sin(a)*.5],.025,woodMat);}
}
const leafShape=new THREE.Shape();const leafPts=[[0,-.18],[-.07,-.04],[-.2,-.09],[-.14,.02],[-.29,.14],[-.12,.13],[-.12,.28],[-.035,.19],[0,.39],[.05,.19],[.16,.29],[.14,.12],[.3,.15],[.16,.02],[.21,-.1],[.07,-.04]];leafShape.moveTo(...leafPts[0]);leafPts.slice(1).forEach(p=>leafShape.lineTo(...p));leafShape.closePath();const leafGeo=new THREE.ShapeGeometry(leafShape);leafGeo.rotateX(-Math.PI/2);
const leafMat=new THREE.MeshStandardMaterial({color:'#df9868',side:THREE.DoubleSide,roughness:.8});
const leaves=new THREE.InstancedMesh(leafGeo,leafMat,1800);scene.add(leaves);leaves.castShadow=true;
const clusters=[[-5.6,4.7,-2.4,1.6],[-3.9,4.55,-2.6,1.4],[-2.6,4.55,-3.1,1.15],[-7.45,4.65,-1.5,1.3],[-5.5,5.15,-4.2,1.3],[-3.3,4.9,-1.3,.85]];
for(let i=0;i<1800;i++){const c=clusters[i%clusters.length],a=rr(0,6.28),r=Math.sqrt(rand())*c[3];dummy.position.set(c[0]+Math.cos(a)*r,c[1]+rr(-.46,.44)*(1-r/c[3]*.4),c[2]+Math.sin(a)*r*.62);dummy.rotation.set(rr(-.6,.6),rand()*6.28,rr(-.5,.5));dummy.scale.setScalar(rr(.35,.72));dummy.updateMatrix();leaves.setMatrixAt(i,dummy.matrix);leaves.setColorAt(i,new THREE.Color().setHSL(rr(.015,.095),rr(.5,.72),rr(.26,.42)));}
// A few fallen maple leaves drift between the lily pads.
const fallenMat=new THREE.MeshStandardMaterial({color:'#b45d30',side:THREE.DoubleSide,roughness:.8});
const fallen=[];for(let i=0;i<17;i++){const o=mesh(leafGeo,fallenMat);o.scale.setScalar(rr(.25,.45));o.position.set(rr(-4.5,4.5),.07,rr(-3,3));o.rotation.y=rand()*6.28;fallen.push(o);}

// Fern clumps soften the stones and frame the close edge of the water.
const fernPos=[],fernColors=[];
function fern(x,z,size){
 for(let f=0;f<9;f++){const a=f/9*Math.PI*2+rand()*.3,reach=size*rr(.65,1.05);
  const pts=[];
  for(let k=0;k<12;k++){const u=k/11,r=reach*u;const y=.04+size*(Math.sin(u*Math.PI*.8)*.47+u*.08);pts.push([x+Math.cos(a)*r,y,z+Math.sin(a)*r]);}
  for(let k=1;k<11;k++){const u=k/11,mid=pts[k],next=pts[k+1],w=Math.sin(u*Math.PI)*size*.16;
   for(const side of [-1,1]){const tip=[mid[0]+Math.cos(a+side*1.05)*w,mid[1]+.025,mid[2]+Math.sin(a+side*1.05)*w];const end=[next[0],next[1],next[2]];
    fernPos.push(...mid,...tip,...end);const c=new THREE.Color().setHSL(.26,.35,.17+u*.1);for(let n=0;n<3;n++)fernColors.push(c.r,c.g,c.b);
   }
  }
 }
}
for(const [x,z,s] of [[-6.1,2.9,1.3],[-5.7,3.9,1.1],[-6.9,1.9,1],[-4.9,4.7,1],[6.4,2.2,1.2],[6.6,3.1,1.25],[3.3,-5.2,1.05],[2.6,-5.3,.9],[-5.8,-4.6,1]])fern(x,z,s);
const fernGeo=new THREE.BufferGeometry();fernGeo.setAttribute('position',new THREE.Float32BufferAttribute(fernPos,3));fernGeo.setAttribute('color',new THREE.Float32BufferAttribute(fernColors,3));fernGeo.computeVertexNormals();mesh(fernGeo,new THREE.MeshStandardMaterial({color:'#709358',vertexColors:true,side:THREE.DoubleSide,roughness:.8}));

// Bamboo silhouettes and a quiet stepping-stone path behind the pond.
const bambooMat=new THREE.MeshStandardMaterial({color:'#314b39',roughness:.8});
const bambooLeafMat=new THREE.MeshStandardMaterial({color:'#203e32',side:THREE.DoubleSide});
const blade=new THREE.Shape();blade.moveTo(0,0);blade.quadraticCurveTo(.35,.2,.85,.05);blade.quadraticCurveTo(.35,-.1,0,0);const bladeGeo=new THREE.ShapeGeometry(blade);
for(let i=0;i<17;i++){const x=rr(3.9,9),z=rr(-9,-6.2),h=rr(3.5,7);rod([x,0,z],[x+.15,h,z],rr(.035,.065),bambooMat);
 for(let k=1;k<h/.48;k++){const y=k*.48;const ring=mesh(new THREE.TorusGeometry(.052,.013,4,8),bambooMat);ring.position.set(x+y/h*.15,y,z);ring.rotation.x=Math.PI/2;}
 for(let k=0;k<5;k++){const y=rr(2,h),sgn=rand()>.5?1:-1;rod([x,y,z],[x+sgn*.8,y+.3,z+.1],.012,bambooMat);for(let j=0;j<5;j++){const l=mesh(bladeGeo,bambooLeafMat);l.position.set(x+sgn*j*.15,y+j*.05,z+.1);l.rotation.set(rr(-.6,.6),sgn<0?Math.PI:0,rr(-1,.5));l.scale.setScalar(rr(.5,.9));}}
}
for(let i=0;i<8;i++){const o=rock(-1.9+i*.82,-.04,-6.3-Math.sin(i*.55)*.45,.5,.12,.36,darkStone);o.rotation.y=rr(-.4,.4);}

// Handmade paper lanterns: luminous paper, close-set ribs and dark end caps.
const paperMat=new THREE.MeshStandardMaterial({color:'#ffd99a',emissive:'#ffad4e',emissiveIntensity:1.8,roughness:.8});
const ribMat=new THREE.MeshStandardMaterial({color:'#965d32',emissive:'#ba6424',emissiveIntensity:.45,roughness:.85});
const metalMat=new THREE.MeshStandardMaterial({color:'#29282a',roughness:.7});
const lanterns=[];
function lantern(x,y,z,s=1){const g=new THREE.Group();scene.add(g);g.position.set(x,y,z);g.scale.setScalar(s);
 const globe=mesh(new THREE.SphereGeometry(.34,32,24),paperMat,g);globe.scale.y=1.28;
 for(let j=0;j<15;j++){const a=-1.34+j/14*2.68;const r=.341*Math.cos(a);const rib=mesh(new THREE.TorusGeometry(r,.006,4,48),ribMat,g);rib.rotation.x=Math.PI/2;rib.position.y=Math.sin(a)*.436;}
 for(const side of [-1,1]){const c=mesh(new THREE.CylinderGeometry(.125,.125,.055,16),metalMat,g);c.position.y=side*.425;}
 const light=new THREE.PointLight('#ffb657',6.5,6,2);light.position.y=-.05;g.add(light);lanterns.push({group:g,light,phase:rand()*6});return g;
}
lantern(-4.5,2.28,-2.15,1.05);rod([-4.5,2.75,-2.15],[-4.5,3.63,-2.15],.012,metalMat);
lantern(-2.5,2.9,-3.1,.75);rod([-2.5,3.24,-3.1],[-2.5,4.25,-3.1],.01,metalMat);
// Low lanterns at the water's edge on cedar platforms.
for(const [x,z,s] of [[4.95,1.35,.83],[-1.8,-4.75,.7]]){
 const base=mesh(new THREE.BoxGeometry(.85,.12,.75),woodMat);base.position.set(x,.23,z);base.castShadow=true;lantern(x,.72,z,s);
}
// Stone garden lantern with a broad, curved roof.
const stoneLamp=new THREE.Group();scene.add(stoneLamp);stoneLamp.position.set(4.6,.1,-4.5);
function lampPart(geo,y,mat=stoneMat){const o=mesh(geo,mat,stoneLamp);o.position.y=y;o.castShadow=true;o.receiveShadow=true;return o;}
lampPart(new THREE.CylinderGeometry(.48,.65,.22,8),.13);
lampPart(new THREE.CylinderGeometry(.19,.28,1.12,8),.78);
lampPart(new THREE.CylinderGeometry(.55,.3,.2,8),1.4);
lampPart(new THREE.BoxGeometry(.63,.68,.63),1.82,darkStone);
const warmStone=new THREE.MeshStandardMaterial({color:'#ffca79',emissive:'#ffb34f',emissiveIntensity:3});
for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]){const o=lampPart(new THREE.PlaneGeometry(.34,.4),1.83,warmStone);o.position.x=Math.sin(a)*.321;o.position.z=Math.cos(a)*.321;o.rotation.y=a;const bar=mesh(new THREE.BoxGeometry(.035,.44,.025),darkStone,stoneLamp);bar.position.copy(o.position);bar.position.z+=Math.cos(a)*.01;bar.position.x+=Math.sin(a)*.01;bar.rotation.y=a;}
const roofPts=[new THREE.Vector2(0,0),new THREE.Vector2(.83,.04),new THREE.Vector2(.67,.12),new THREE.Vector2(.48,.29),new THREE.Vector2(.28,.39),new THREE.Vector2(.1,.42),new THREE.Vector2(0,.42)];
lampPart(new THREE.LatheGeometry(roofPts,4),2.16).rotation.y=Math.PI/4;
lampPart(new THREE.SphereGeometry(.13,12,8),2.67);
const stoneGlow=new THREE.PointLight('#ffbb6c',5,5,2);stoneGlow.position.set(4.6,1.85,-4.5);scene.add(stoneGlow);

// Fireflies, tiny points with shader-made halos (no sprite textures).
const fireflyCount=38,fp=new Float32Array(fireflyCount*3),fs=new Float32Array(fireflyCount);
for(let i=0;i<fireflyCount;i++){fp[i*3]=rr(-7,7);fp[i*3+1]=rr(.3,2.8);fp[i*3+2]=rr(-5,4);fs[i]=rr(0,20);}
const fireGeo=new THREE.BufferGeometry();fireGeo.setAttribute('position',new THREE.BufferAttribute(fp,3));fireGeo.setAttribute('aSeed',new THREE.BufferAttribute(fs,1));
const fireMat=new THREE.ShaderMaterial({uniforms:{uTime:time},vertexShader:`uniform float uTime;attribute float aSeed;varying float vGlow;void main(){vec3 p=position;p.x+=sin(uTime*.24+aSeed)*.35;p.y+=sin(uTime*.5+aSeed*3.)*.16;p.z+=cos(uTime*.3+aSeed)*.3;vec4 mv=modelViewMatrix*vec4(p,1.);vGlow=pow(.5+.5*sin(uTime*1.25+aSeed),3.);gl_PointSize=(45./-mv.z)*(1.+vGlow);gl_Position=projectionMatrix*mv;}`,fragmentShader:`varying float vGlow;void main(){float r=length(gl_PointCoord-.5)*2.;float a=exp(-r*r*5.)*vGlow;gl_FragColor=vec4(vec3(1.8,1.4,.45),a);}`,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false});scene.add(new THREE.Points(fireGeo,fireMat));

const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.36,.65,1.1);composer.addPass(bloom);
const vignette=new ShaderPass({uniforms:{tDiffuse:{value:null}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`uniform sampler2D tDiffuse;varying vec2 vUv;void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;vec2 p=(vUv-.5)*vec2(1.,.9);float v=smoothstep(.2,.75,length(p));c*=1.-v*.29;gl_FragColor=vec4(c,1.);}`});composer.addPass(vignette);composer.addPass(new OutputPass());
const clock=new THREE.Clock();
function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05),t=clock.elapsedTime;time.value=t;water.material.uniforms.uTime.value=t;
 for(const f of fish){const a=f.phase+t*f.speed;const x=Math.cos(a)*f.rx+Math.sin(a*2)*.25,z=Math.sin(a)*f.rz+f.offset;const dx=(-Math.sin(a)*f.rx+.5*Math.cos(a*2))*f.speed,dz=Math.cos(a)*f.rz*f.speed;f.group.position.set(x,f.depth+Math.sin(t*.7+f.phase)*.025,z);f.group.rotation.y=Math.atan2(-dz,dx);f.tail.rotation.y=Math.sin(t*2.6+f.phase)*.25;f.fins.forEach((fin,j)=>fin.rotation.x=Math.sin(t*2+f.phase+j)*.12);}
 for(const l of lilies){l.group.position.y=.064+Math.sin(t*.7+l.phase)*.012;l.group.rotation.z=Math.sin(t*.6+l.phase)*.012;}
 for(const l of lanterns){l.group.rotation.z=Math.sin(t*.65+l.phase)*.025;l.light.intensity=6.5*(1.+.04*Math.sin(t*2.7+l.phase));}
 for(let i=0;i<fallen.length;i++){fallen[i].rotation.y+=dt*.018;fallen[i].position.y=.072+Math.sin(t*.8+i)*.008;}
 controls.update(dt);composer.render();
}
animate();
function resize(){camera.aspect=innerWidth/innerHeight;camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(41)/2)*Math.max(1,1.6/camera.aspect)));camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);}
addEventListener('resize',resize);resize();
