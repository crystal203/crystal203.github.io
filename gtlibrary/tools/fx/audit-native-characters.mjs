// Static coverage only. This script does not construct or render particles.
import {readFileSync,writeFileSync} from 'node:fs';
import {auditEffect} from '../../gtfx/native-fidelity.js';
if(process.argv.length>2&&(process.argv.length!==4||process.argv[2]!=='--output'))throw Error('Usage: node tools/fx/audit-native-characters.mjs [--output path.json]');
const characters={};
for(const name of ['hana','milkywaygirl','peimei','idolcaptain']){
  const index=JSON.parse(readFileSync(new URL(`../../gtfx/assets/characters/${name}.json`,import.meta.url)));
  const pack=JSON.parse(readFileSync(new URL(`../../gtfx/assets/native-characters/${name}.json`,import.meta.url)));
  const available=new Set(index.effects.filter(e=>!e.unavailable).flatMap(e=>[e.preset,e.assetName])),references=new Map();
  function walk(value,path){
    if(typeof value==='string'&&value.startsWith('fx_')&&!value.includes('{')){
      if(!references.has(value))references.set(value,[]);references.get(value).push(path);
    }else if(value&&typeof value==='object')for(const [key,v] of Object.entries(value))walk(v,path+'.'+key);
  }
  for(const key of ['plans','actions','projectiles','options'])walk(pack[key],key);
  characters[name]={effects:index.effects.length,styles:Object.keys(pack.styles).length,actions:Object.keys(pack.actions).length,
    systems:index.effects.reduce((n,e)=>n+e.systems.length,0),source:index.nativeSource,
    referenceClosure:{literalReferences:references.size,missing:[...references].filter(([preset])=>!available.has(preset)).map(([preset,paths])=>({preset,paths})),note:'Literal resource references only; does not prove all action branches.'},
    effectsAudit:index.effects.map(e=>({preset:e.preset,...auditEffect(e)}))};
}
const output=JSON.stringify({format:'gtfx-native-coverage',version:1,status:'partial-native-parity',characters},null,2)+'\n';
if(process.argv[2]==='--output')writeFileSync(process.argv[3],output,'utf8');else process.stdout.write(output);
