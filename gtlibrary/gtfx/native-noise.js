// Unity 2022.3.62f2 ARM64 Perlin1D derivative (e27490), not sine noise.
import {UnityRand,nativeParticleRandom} from './native-random.js';
const f=Math.fround;
const permutation=[151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180,151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180];
export function nativePerlin1D(position,frequency){
 const x=f(f(position)*f(frequency)),floor=Math.floor(x),t=f(x-floor),i=floor&255;
 const a=permutation[i]&1?-1:1,b=permutation[i+1]&1?-1:1;
 const factor=f(f(t*f(t-2))+1),slope=f(f(t*f(t*30))*factor);
 const fade=f(f(t*f(t*t))*f(f(t*f(f(t*6)-15))+10));
 const delta=f(f(f(t-1)*b)-f(t*a));
 const derivative=f(f(a+f(slope*delta))+f(fade*f(b-a)));
 return f(f(frequency+frequency)*derivative);
}
export function noiseSeedOffset(seed){const r=new UnityRand(seed);return [r.nextFloat(),r.nextFloat(),r.nextFloat()].map(x=>f(x*100));}
export function nativeNoiseField(noise,seedOffset,randomSeed,position,scroll,u,evaluate){
 if((noise.quality||0)!==0||(noise.octaves||1)!==1||noise.remapEnabled)return null;
 const frequency=f(Math.max(.000001,noise.frequency??.5)),damping=noise.damping?f(1/frequency):1;
 const strengths=nativeParticleRandom(randomSeed,0x3edcba94,3);
 const pos=position.map((x,i)=>f(f(x)+seedOffset[i]));
 // Curl of the three one-dimensional potentials; the second potential is
 // translated by 100 units, matching CalculateNoiseJob<1,0,0>.
 const raw=[nativePerlin1D(f(pos[1]+scroll),frequency),nativePerlin1D(f(pos[2]+scroll),frequency),nativePerlin1D(f(f(pos[0]+100)+scroll),frequency)];
 const field=raw.map((n,i)=>{
  const strength=evaluate(noise.separateAxes&&i?noise['strength'+['X','Y','Z'][i]]:noise.strength,u,strengths[noise.separateAxes?i:0]);
  return f(n*f(strength*damping));
 });
 const amount=evaluate(noise.positionAmount,u,nativeParticleRandom(randomSeed,0xb77ce39a)[0],1);
 const size=evaluate(noise.sizeAmount,u,nativeParticleRandom(randomSeed,0x38683aaf)[0]);
 return {field,velocity:field.map(n=>f(n*amount)),size:field.map(n=>Math.max(0,f(1+f(f(size*.5)*n))))};
}
