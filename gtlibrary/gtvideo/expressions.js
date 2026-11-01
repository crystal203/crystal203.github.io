// Use the same normalized native/advanced expression names and routing as GTAsset.
export function expressionChoices(record,current){
 const entry=record?.character,key=globalThis.GTEmotion?.key||String,native=entry?.skeleton?.data.animations.filter(animation=>animation.name.startsWith('[emo]')).map(animation=>key(animation.name))||[],advanced=entry?.emotion?.face?entry.emotion.skeleton.data.animations.map(animation=>key(animation.name)).filter(name=>name!=='empty'):[];
 return [...new Set([...native,...advanced,...(current?[current]:[])])].sort();
}
