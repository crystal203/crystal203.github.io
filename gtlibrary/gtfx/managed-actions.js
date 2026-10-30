// Native composite managers choose a source action cycle before execution.
// ManualBranchComboBattleActionManager.IsConditionMatch (ARM64 0x88f7de0):
// first matching self buff must exist and GetScore >= TriggerStack (default 0).
export function expandManagedStyle(native,style,{buffScores={}}={}){
 if(!style)return style;
 const branches=[];
 function expand(name,chain=[]){
  const a=native.actions?.[name];if(!a?.ComboAction||style.nativeManagers?.some(m=>m.manager===name&&m.active))return [name];
  if(chain.includes(name))throw Error('Cyclic native action manager: '+[...chain,name].join(' -> '));
  let selected=a.ComboAction;
  if(a.ExtraAction?.length){
   if(!a.BuffName)throw Error('Native extra-action manager lacks its buff condition: '+name);
   const present=Object.hasOwn(buffScores,a.BuffName),score=buffScores[a.BuffName],threshold=a.TriggerStack??0;
   const active=present&&Number.isFinite(score)&&score>=threshold;
   branches.push({manager:name,buff:a.BuffName,threshold,active,combo:a.ComboAction.slice(),extra:a.ExtraAction.slice()});
   if(active)selected=a.ExtraAction;
  }
  return selected.flatMap(n=>expand(n,[...chain,name]));
 }
 return {...style,ManualBattleActions:(style.ManualBattleActions||style.BattleActions||[]).flatMap(n=>expand(n)),managedBranches:branches};
}
