import {UnityRand} from './native-random.js';

// ResetSeeds uses the ParticleSystemManager stream, independent of Initial,
// Shape and UnityEngine.Random. A recorded order is a flattened list of reset
// events (including children), not a request to recursively reset each entry.
// The prefab traversal fallback is deterministic but is not a captured game
// activation order. Explicit per-system seeds still consume their reset draw.
export function nativeSystemSeeds(effect,seed){
  const stream=new UnityRand(seed);if(effect.particleAutoSeedState)stream.setState(effect.particleAutoSeedState);
  const before=stream.getState(),systems=new Map(effect.systems.map(s=>[String(s.sourceId),s]));
  const seeds=Object.fromEntries(effect.systems.map(s=>[s.sourceId,s.seed>>>0])),events=[],issues=[];
  const order=effect.seedResetOrder??effect.systems.map(s=>String(s.sourceId));
  if(!Array.isArray(order))throw new TypeError('seedResetOrder must be an array of sourceId values');
  for(const id of order){
    const system=systems.get(String(id));if(!system)throw new Error('Unknown seed reset system: '+id);
    const automatic=system.autoRandomSeed!==false,assigned=automatic?stream.nextUint():system.seed>>>0;
    seeds[id]=assigned;events.push({system:String(id),automatic,seed:assigned,stateAfter:stream.getState()});
  }
  for(const [id,value] of Object.entries(effect.systemSeeds||{})){
    if(!systems.has(id))throw new Error('Unknown seeded system: '+id);
    if(!Number.isInteger(value)||value<0||value>0xffffffff)throw new RangeError('System seed requires uint32: '+id);
    seeds[id]=value;
  }
  if(!effect.seedResetOrder&&effect.systems.some(s=>s.autoRandomSeed!==false))issues.push({code:'automatic-seed-order',detail:'Prefab traversal is a preview allocation order, not a recorded game ResetSeeds sequence.'});
  return {before,after:stream.getState(),seeds,events,issues};
}
