/** Native ToolInterpolateType curves used by imported action graphs. */
export function graphEase(type,progress){
 const t=Math.max(0,Math.min(1,progress));
 if(type==='Linear')return t;
 const match=/^Ease(InOut|In|Out)(Quad|Cubic|Quart|Quint|Sine|Expo|Circ)$/.exec(type);
 if(!match)throw Error('Unsupported graph interpolation '+type);
 const [,mode,curve]=match,power={Quad:2,Cubic:3,Quart:4,Quint:5}[curve];
 let into;
 if(power)into=x=>x**power;
 else if(curve==='Sine')into=x=>1-Math.cos(x*Math.PI/2);
 else if(curve==='Expo')into=x=>x===0?0:2**(10*x-10);
 else into=x=>1-Math.sqrt(Math.max(0,1-x*x));
 if(mode==='In')return into(t);
 if(mode==='Out')return 1-into(1-t);
 return t<.5?into(2*t)/2:1-into(2-2*t)/2;
}

/** Read consumption from the interpreted native graph, including graph variables.
 * Flat BattleAction.StaminaPerAction is optional; weapon MagazineSize is unrelated.
 */
export function graphStaminaMagazine(run,capacity){
 let stamina=capacity,time=0,position=[0,0,0],first=run({stamina,initialPosition:position});
 if(!(first.graphTrace?.stamina?.after<stamina))return null;
 const tracks=[],clips=[],graphPath=[],spinePath=[],alpha=[],sorting=[],sequence=[];
 while(stamina>0){
  if(sequence.length>=256)throw Error('Stamina magazine exceeds preview limit');
  const m=first||run({stamina,initialPosition:position});first=null;
  const after=m.graphTrace.stamina.after;
  if(!(after<stamina)||!(m.actor.end>0))throw Error('Stamina action must consume stamina and advance time');
  sequence.push({time,round:sequence.length+1,before:stamina,remaining:after,breakAttack:m.graphTrace.stamina.breakAttack??after===0});
  tracks.push(...m.tracks.map(t=>({...t,at:time+t.at})));
  clips.push(...m.actor.clips.map(c=>({...c,start:time+c.start,end:time+(c.end??m.actor.end)})));
  for(const [key,destination] of [['graphPath',graphPath],['spinePath',spinePath]])for(const p of m.actor[key]||[])if(p.time<=m.actor.end+1e-9)destination.push({...p,time:time+p.time});
  alpha.push(...(m.actor.alpha||[]).map(a=>({...a,at:time+a.at})));
  sorting.push(...(m.actor.sorting||[]).map(s=>({...s,at:time+s.at})));
  position=m.actor.graphPath.filter(p=>p.time<=m.actor.end+1e-9).at(-1)?.position.slice()||position;
  time+=m.actor.end;stamina=after;
 }
 return {id:'basic-magazine',label:'整弹匣连射（'+sequence.length+' 发）',actor:{end:time,clips,graphPath,spinePath,alpha,sorting},tracks,
  duration:Math.max(time,...tracks.map(t=>t.at+t.link.fxEnd)),magazine:{capacity,remaining:stamina,sequence}};
}
