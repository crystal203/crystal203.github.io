// Concatenate source action segments without clipping their independent effects.
export function sequenceActionModules(parts,{id='basic-magazine',label='耐力耗尽连贯攻击',source}={}){
 let at=0;const tracks=[],clips=[],graphPath=[],spinePath=[],skinPath=[],hits=[],aims=[];
 for(const m of parts){tracks.push(...m.tracks.map(t=>({...t,at:(t.at||0)+at})));clips.push(...(m.actor.clips||[]).map(c=>({...c,start:c.start+at,end:(c.end??m.actor.end)+at})));for(const [k,out] of [['graphPath',graphPath],['spinePath',spinePath]])out.push(...(m.actor[k]||[]).map(p=>({...p,time:p.time+at})));skinPath.push(...(m.actor.skinPath||[]).map(p=>({...p,at:p.at+at,end:p.end+at})));hits.push(...(m.projectileHits||[]).map(h=>({...h,time:h.time+at})));if(m.actor.nativeAim)aims.push({...m.actor.nativeAim,windows:m.actor.nativeAim.windows.map(w=>({...w,at:w.at+at,end:w.end+at}))});at+=m.actor.end;}
 return {id,label,source,actor:{end:at,clips,graphPath,spinePath,skinPath,...(aims.length?{nativeAim:{...aims[0],windows:aims.flatMap(a=>a.windows)}}:{})},tracks,duration:Math.max(at,...tracks.map(t=>(t.at||0)+t.link.fxEnd)),projectileHits:hits};
}
