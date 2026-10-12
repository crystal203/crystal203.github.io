/** Character.Shake(radius,duration), separate from Position and Spine action tracks.
 * Source calls: ForestMainNewSection1.lua; Character.Shake -> SpineController.Shake.
 * The seeded sampler makes seeking repeatable; native random-number sequences are not preserved.
 */
export function characterShake(radius,elapsed,duration,seed=0){
 if(elapsed<0||elapsed>=duration-1e-9)return [0,0,0];
 const frame=Math.floor(elapsed*60),rand=k=>{const x=Math.sin((frame+1)*127.1+(seed+k)*311.7)*43758.5453123;return x-Math.floor(x);};
 const angle=rand(0)*Math.PI*2,length=Math.sqrt(rand(1))*radius;
 return [Math.cos(angle)*length,Math.sin(angle)*length,0];
}
