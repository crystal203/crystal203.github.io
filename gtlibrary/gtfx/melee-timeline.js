// Movement and temporary-form operations shared by source-compiled Lua timelines.
const add=(a,b,k=1)=>a.map((x,i)=>x+b[i]*k);
const length=v=>Math.hypot(...v);
export function buildMeleeTimeline({plan,isBreak,evaluate,initial,target,forward,end}) {
 const moves=((isBreak?plan.breakMoves:plan.moves)||[]).map(m=>({...m,at:evaluate(m.at),duration:evaluate(m.duration),speed:evaluate(m.speed)}));
 const path=[],spinePath=[];let position=initial.slice();
 const times=new Set(Array.from({length:Math.ceil(end*60)+1},(_,frame)=>Math.min(end,frame/60)));
 // Include source boundaries so interpolation never starts a delayed dash early.
 for(const m of moves)for(const t of [m.at,m.at+m.duration])if(t>=0&&t<=end)times.add(t);
 for(const j of plan.spine||[])for(const t of [evaluate(j.at),evaluate(j.at)+evaluate(j.duration)])if(t>=0&&t<=end)times.add(t);
 for(const time of [...times].sort((a,b)=>a-b)){
  for(const m of moves){if(time<m.at)continue;
   if(!m.start){m.start=position.slice();
    if(m.op==='dash'){let distance=m.speed*m.duration/2;if(!m.free&&m.sign!==-1)distance=Math.min(distance,Math.max(0,length(add(target,m.start,-1))-.55-(m.stopOffset??0)));m.end=add(m.start,forward,distance*(m.sign||1));}
    else m.end=m.to==='origin'?initial.slice():add(add(target,forward,evaluate(m.offset)),[0,0,1],m.side||0);
   }
   const u=m.duration?Math.max(0,Math.min(1,(time-m.at)/m.duration)):1;
   position=add(m.start,add(m.end,m.start,-1),m.op==='dash'?u*(2-u):m.ease==='inQuad'?u*u:u);
  }
  path.push({time,position:position.slice()});let height=0;
  // JumpCalculator.UpdateFrame uses sine ramps with an optional apex plateau.
  // A Jump with allowAdd=false is ignored while a previous jump remains active.
  const accepted=[];
  for(const j of plan.spine||[]){const at=evaluate(j.at);if(at>time)continue;
   if(!j.allowAdd&&accepted.some(k=>at<evaluate(k.at)+evaluate(k.duration)))continue;accepted.push(j);
  }
  for(const j of accepted){const elapsed=time-evaluate(j.at),duration=evaluate(j.duration),aerial=evaluate(j.aerialDuration),flight=Math.max(0,duration-aerial),half=flight/2;
   if(elapsed>=duration)continue;
   if(flight===0)height+=evaluate(j.height);
   else if(elapsed<half)height+=evaluate(j.height)*Math.sin(Math.PI*elapsed/flight);
   else if(elapsed<=half+aerial)height+=evaluate(j.height);
   else height+=evaluate(j.height)*Math.sin(Math.PI*(elapsed-aerial)/flight);
  }
  if(plan.cancelJumpAtEnd&&time>=end)height=0;
  spinePath.push({time,position:[0,height,0]});
 }
 return {path,spinePath,skinPath:(plan.skinPath||[]).map(s=>({at:evaluate(s.at),end:evaluate(s.end),skin:s.skinField?evaluate(['field',s.skinField]):s.skin}))};
}
export function applyTimelineSkin(player,link,time){
 const skin=link.skinPath?.find(s=>time>=s.at&&time<s.end)?.skin||player.skin;
 if(player.skeleton.skin?.name!==skin){
  if(!player.skeleton.data.findSkin(skin))throw Error('Native temporary skin is missing: '+skin);
  player.skeleton.setSkinByName(skin);
 }
}
