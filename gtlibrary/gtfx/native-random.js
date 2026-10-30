// Recovered from Unity 2022.3 native instructions. See native-random.md.
const f32 = Math.fround;
const INIT_MULTIPLIER = 0x6c078965;
const FLOAT_SCALE = f32(1 / 0x7fffff);
const initNext = x => (Math.imul(x, INIT_MULTIPLIER) + 1) >>> 0;

export const nativeRandom01 = bits => f32((bits & 0x7fffff) * FLOAT_SCALE);

export class UnityRand {
  constructor(seed) { this.setSeed(seed); }
  setSeed(seed) {
    this.x = seed >>> 0;
    this.y = initNext(this.x);
    this.z = initNext(this.y);
    this.w = initNext(this.z);
  }
  getState() { return [this.x,this.y,this.z,this.w]; }
  setState(state) {
    if(!Array.isArray(state)||state.length!==4||state.some(x=>!Number.isInteger(x)||x<0||x>0xffffffff))throw Error('Unity random state requires four uint32 words');
    [this.x,this.y,this.z,this.w]=state;
  }
  nextUint() {
    const t = this.x ^ (this.x << 11), w = this.w;
    this.x = this.y; this.y = this.z; this.z = w;
    this.w = (w ^ (w >>> 19) ^ t ^ (t >>> 8)) >>> 0;
    return this.w;
  }
  nextFloat() { return nativeRandom01(this.nextUint()); }
}

// Utils.GetRandomInt (Scripts.dll 0x5dad9e4): float32 multiply, truncate,
// remainder, then add min. Unity value is inclusive, so value==1 wraps to min.
export function nativeScriptRandomInt(rng,min,maxExclusive){
 const span=maxExclusive-min;if(span<=0)return min;
 return min+Math.trunc(f32(rng.nextFloat()*f32(span)))%span;
}

export class UnityRand4 {
  constructor(seed) { this.setSeed(seed); }
  // A module seed expands into four lanes. Particle-derived seeds instead
  // use the explicit four-seed overload; they must not get this lane offset.
  setSeed(seed) { this.setSeeds(Array.from({length: 4}, (_, i) => (seed + i * 367) >>> 0)); }
  setSeeds(seeds) { this.lanes = Array.from(seeds, seed => new UnityRand(seed)); }
  nextUint4() { return this.lanes.map(lane => lane.nextUint()); }
  nextFloat4() { return this.lanes.map(lane => lane.nextFloat()); }
}

export function nativeParticleFlip(particleSeed, flip = {}) {
  return [0x294fb5c7, 0x00d4cb82].map((offset, i) =>
    new UnityRand((particleSeed + offset) >>> 0).nextFloat() < f32(flip[i ? 'y' : 'x'] || 0) ? 1 : 0);
}

// CalculateMeshParticleTransform: one derived stream, three consecutive draws.
// Mesh flip changes the geometry scale, unlike the billboard UV flip above.
export function nativeMeshParticleFlip(particleSeed, flip = {}) {
  const rng=new UnityRand((particleSeed+0xee4f2bc1)>>>0);
  return ['x','y','z'].map(axis=>rng.nextFloat()<f32(flip[axis]||0)?1:0);
}

export function nativeParticleRandom(seed,offset,count=1){
  const rng=new UnityRand((seed+offset)>>>0);
  return Array.from({length:count},()=>rng.nextFloat());
}

// InitialModule::Start (APK c931b8). Draws occur even for constant curves.
// The renderer's flip and StartVelocity use derived streams, not this stream.
export function nativeInitialBatch(rng,initial){
  const seeds=rng.nextUint4(),life=rng.nextFloat4(),sizeX=rng.nextFloat4();
  const sizeY=initial.size3D?rng.nextFloat4():sizeX,sizeZ=initial.size3D?rng.nextFloat4():sizeX;
  const rotationZ=rng.nextFloat4();
  const rotationX=initial.rotation3D?rng.nextFloat4():[0,0,0,0],rotationY=initial.rotation3D?rng.nextFloat4():[0,0,0,0];
  const color=rng.nextFloat4();
  return seeds.map((seed,i)=>({randomSeed:seed,
    r:[life[i],nativeParticleRandom(seed,0x96aa4de3)[0],color[i],sizeX[i],sizeY[i],sizeZ[i],rotationX[i],rotationY[i],rotationZ[i]],
    rotationSign:nativeParticleRandom(seed,0xff2bb1a4)[0]>(initial.randomizeRotationDirection||0)?1:-1}));
}

// Unity's SIMD trigonometric approximation, including float32 rounding.
// ARM64 uses signed 2^23 addition/subtraction to round to the nearest integer.
function roundNative(x) {
  const large = x < 0 ? -8388608 : 8388608;
  return f32(f32(x + large) - large);
}
function foldedCos(x) {
  const p = f32(.25 - Math.abs(f32(x - roundNative(x))));
  const p2 = f32(p * p), p4 = f32(p2 * p2), p8 = f32(p4 * p4);
  const low = f32(6.283185005187988 - f32(41.34165954589844 * p2));
  const high = f32(f32(81.60182189941406 - f32(76.56861877441406 * p2)) * p4);
  return f32(p * f32(f32(low + high) + f32(39.65703201293945 * p8)));
}
export function nativeSinCos(radians) {
  const turns = f32(f32(radians) * 0.15915493667125702);
  return [foldedCos(turns), foldedCos(f32(turns - .25))];
}

// ShapeModule::StartCircle<0>, before the shape/emitter transform. Independent
// from InitialModule's stream, and advances all four lanes even for 1-3 births.
export function nativeCircleBatch(rng, shape) {
  const angles = rng.nextFloat4(), radial = rng.nextFloat4();
  const arc = f32(f32(shape.arc?.value ?? 360) * 0.01745329238474369);
  const spread = f32(arc * f32(shape.arc?.spread ?? 0));
  const min = f32(1 - f32(shape.radiusThickness ?? 1)), min2 = f32(min * min);
  const range = f32(1 - min2), radius = f32(shape.radius?.value ?? 1);
  return angles.map((random, lane) => {
    const angle = spread > 0
      ? f32(Math.floor(f32(f32(random * f32(spread * Math.ceil(f32(arc / spread)))) / spread)) * spread)
      : f32(random * arc);
    const [x, y] = nativeSinCos(angle);
    const distance = f32(radius * f32(Math.sqrt(f32(min2 + f32(range * radial[lane])))));
    return {position: [f32(x * distance), f32(y * distance), 0], direction: [x, y, 0]};
  });
}

// Per-particle module offsets recovered from the APK and matched to the
// corresponding native module using Unity's public development symbols.
export const nativeModuleOffsets = Object.freeze({
  color:0x591bc05c,size:0x8d2c8431,sizeBySpeed:0xf3857f6f,
  rotation:0x6aed452e,rotationBySpeed:0xdec4aea1,
  velocity:0xe0fbd834,speedModifier:0xba821f34,force:0x12460f3b,
  orbital:0xd1293bac,orbitalOffset:0x348bbbc3,radial:0xcab3921d,
  clamp:0x13371337,drag:0xa6790296,inherit:0x0033e627,gravity:0xe2b7c3c3,
  uvStart:0x56b3dbb0,uvFrame:0x13740583,uvRow:0xaf502044
});
export function nativeModuleRandoms(seed){
  return Object.fromEntries(Object.entries(nativeModuleOffsets).map(([name,offset])=>{
    const values=nativeParticleRandom(seed,offset,['velocity','force','orbital','orbitalOffset'].includes(name)?3:1);
    return [name,values.length===1?values[0]:values];
  }));
}
