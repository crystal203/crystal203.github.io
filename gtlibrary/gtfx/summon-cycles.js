/** Repeat an independently owned actor timeline using the source AI's idle/wait.
 * Each shot keeps its own FX lifetime; only actor clips stop at the next cast.
 * The caller enforces source target/master range before scheduling this cycle.
 */
export function composeSummonCycle(module,duration,ai={}){
 const wait=Number(ai.WaitingAttackTime??0),idle=Number(ai.IdleTime??0),period=module.actor.end+wait;
 if(!(period>0)||!Number.isFinite(period))throw Error('Invalid native summon action period');
 const tracks=[],clips=[],path=[],spinePath=[],alpha=[],sorting=[];let count=0;
 for(let at=Math.max(0,idle);at<duration-1e-9;at+=period){
  if(++count>10000)throw Error('Native summon cycle exceeds preview budget');
  tracks.push(...module.tracks.map(t=>({...t,at:at+(t.at||0)})));
  clips.push(...module.actor.clips.map(c=>({...c,start:at+c.start,end:Math.min(duration,at+(c.end??module.actor.end))})));
  for(const [source,destination,key]of [[module.actor.graphPath,path,'time'],[module.actor.spinePath,spinePath,'time'],[module.actor.alpha,alpha,'at'],[module.actor.sorting,sorting,'at']])for(const event of source||[])if(event[key]+at<=duration)destination.push({...event,[key]:event[key]+at});
 }
 return {...module,tracks,duration:Math.max(duration,...tracks.map(t=>t.at+t.link.fxEnd)),actor:{...module.actor,end:duration,clips,graphPath:path,spinePath,alpha,sorting},cycle:{count,period,idle,wait}};
}
