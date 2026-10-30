/** Oak.EffectDirectionSetter.SetActiveByDirection (native 0x8865cec).
 * The source component holds GameObject references, matching exported node IDs.
 */
export function effectDirectionNodes(effect,direction){
 const selected={back:'UpObject',right:'RightObject',front:'DownObject',left:'LeftObject'}[direction];
 if(!selected)return effect.nodes;
 const active=new Map();
 for(const script of effect.scripts||[]){
  if(script.type!=='EffectDirectionSetter'||script.fields?.m_Enabled===0)continue;
  for(const key of ['UpObject','DownObject','LeftObject','RightObject']){
   const ref=script.fields[key],id=ref?.m_PathID??ref?.fileID;
   if(id!=null&&String(id)!=='0')active.set(String(id),key===selected);
  }
 }
 return active.size?effect.nodes.map(node=>active.has(node.id)?{...node,active:active.get(node.id)}:node):effect.nodes;
}
