// ConditionHelper.EvalSingle: empty groups pass; checkType 1 is OR, 0 is AND.
export function evaluateConditions(fields,actual){
 const groups=['Switch','Brazier','Tesla','Elimination','FiledObjectDestroyed'].filter(k=>fields[k+'Conditions']?.length);
 if(!groups.length)return !!fields.OpenOnStart;
 const matches=groups.map(k=>{const values=fields[k+'Conditions'].map(c=>actual(k,c.handleName)===c.condition);return fields[k+'ConditionsCheckType']===1?values.some(Boolean):values.every(Boolean);});
 return fields.ConditionGroupsCheckType===1?matches.some(Boolean):matches.every(Boolean);
}
