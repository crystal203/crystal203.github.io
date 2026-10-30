// One initial source form/right direction per character. CPU preparation, no canvas or pixels.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {runInThisContext} from 'node:vm';
import * as THREE from '../../vendor/three.module.js';
import {FxRuntime} from '../../gtfx/core.js';
import {FxActionPlayer} from '../../gtfx/action-player.js';
import {FxCharacterPlayer} from '../../gtfx/character-player.js';
import {SpineThreeRenderer} from '../../gtasset/three-renderer.js';
import {actionModules} from '../../gtfx/action-modules.js';
import {equipmentProfile,preferredWeaponSelection,sourceExclusiveWeapon} from '../../gtfx/equipment-selection.js';

const args=process.argv.slice(2),arg=k=>{const i=args.indexOf(k);return i<0?null:args[i+1];};
const defaults='fern,mechaandroid,villainandroid,summerloraine,eleanor,mermaid,slimeshuna,soulpowergirl,goatgirl,pixygirl,sheepgirl,chinachef,dragondaughter,vampirelord,popp';
const ids=(arg('--characters')||defaults).split(',').filter(Boolean),root=new URL('../../',import.meta.url),raw=p=>readFileSync(new URL(p,root)),json=p=>JSON.parse(raw(p));
for(const p of ['vendor/spine-webgl.js','gtasset/core.js','gtasset/equipment.js'])runInThisContext(raw(p).toString());
const catalog=json('gtfx/assets/weapon-types.json'),items=json('gtatlas/assets/items.json'),png=raw('gtatlas/assets/'+items.meta.image),image={width:png.readUInt32BE(16),height:png.readUInt32BE(20)};
image.naturalWidth=image.width;image.naturalHeight=image.height;
const itemsData={data:items,image,texture:SpineThreeRenderer.texture(spine,image)},reports=[];
for(const character of ids){
 const report={character,modules:[],failures:[]};reports.push(report);
 let resources;
 try{
  const native=json('gtfx/assets/native-characters/'+character+'.json'),index=json('gtfx/assets/characters/'+character+'.json'),appearance=native.profile.appearances[0],hero=native.profile.forms?.[0]?.hero||native.profile.defaultSkin||appearance;
  const weapon=preferredWeaponSelection(native,native.profile,hero),profile=equipmentProfile(native,native.profile,appearance,hero,weapon,catalog),options={appearance,heroAppearance:hero,weapon,profile,weaponEquipped:true,exclusiveWeapon:sourceExclusiveWeapon(native,profile,appearance,hero,weapon),direction:'right',targetDistance:6,seed:12345};
  Object.assign(report,{appearance,hero,weapon});
  const modules=actionModules(character,index,options,native,{[character]:native.plans}).map(m=>({...m,tracks:m.tracks.filter(t=>t.effect.skeletons?.length)})).filter(m=>m.tracks.length);
  if(!modules.length)continue;
  const dimensions=new Map(Object.values(index.textures).map(t=>[t.url,{width:t.width,height:t.height}]));
  resources={textures:{},geometries:{},clear(){},setView(){},resize(){},camera:new THREE.OrthographicCamera(),cameraConfig:{}};
  await FxRuntime.prototype.load.call(resources,index,x=>x,{effect:modules.flatMap(m=>m.tracks.map(t=>t.effect)),loadImage:async url=>{const image=dimensions.get(url);assert(image,'Missing texture dimensions: '+url);return image;}});
  const runtime={...resources,scene:new THREE.Scene(),screenScene:new THREE.Scene(),screenCamera:new THREE.OrthographicCamera(),seed:12345};runtime.camera.nativeViewportScale=()=>Math.SQRT1_2;
  runtime.characterPlayer={active:true,direction:'right',runtime,options,weapon,nativeWeapon:'',itemsData,effectDefinition:FxCharacterPlayer.prototype.effectDefinition,bindNodes:FxCharacterPlayer.prototype.bindNodes};
  for(const module of modules){
   const player=new FxActionPlayer(runtime),row={id:module.id,tracks:[],samples:[],runtimeErrors:[]},consoleError=console.error;report.modules.push(row);
   console.error=(message)=>{const text=String(message);if(!row.runtimeErrors.includes(text))row.runtimeErrors.push(text);};
   try{
    // Record parses chosen by the actual runtime; do not duplicate its source/view filtering.
    const parse=GTSpineCore.parse,selections=[];
    GTSpineCore.parse=options=>{const decoded=parse(options),source=module.tracks.flatMap(t=>t.effect.skeletons).find(s=>Buffer.from(s.bytes,'base64').equals(Buffer.from(options.bytes))),selection={source:source?.name,animations:[]},find=decoded.data.findAnimation.bind(decoded.data);selections.push(selection);decoded.data.findAnimation=name=>{const result=find(name);if(result&&!selection.animations.includes(result.name))selection.animations.push(result.name);return result;};return decoded;};
    try{player.load(module,options);}finally{GTSpineCore.parse=parse;}
    const times=new Set([0]),eps=1e-5;
    for(const track of module.tracks){
     const start=(track.at||0)+(track.link.delay||0),end=(track.at||0)+(track.link.fxEnd??(track.link.delay||0)+track.effect.duration),duration=end-start;
     times.add(start);times.add(start+Math.min(eps,duration/2));times.add((start+end)/2);times.add(Math.max(start,end-eps));
     for(const event of [...track.link.skeletonClips||[],...track.link.skeletonAttachments||[],...track.link.skeletonAlpha||[]])for(const local of [event.start??event.at,event.end])if(Number.isFinite(local)&&local>=0&&local<duration){times.add(start+local);times.add(Math.min(end-eps,start+local+eps));if(local>0)times.add(start+local-eps);}
    }
    row.samples=[...times].filter(t=>t>=0).sort((a,b)=>a-b);
    for(const time of row.samples)player.sample(time);
    assert.equal(selections.length,player.entries.reduce((n,e)=>n+e.sim.skeletonEffects.length,0));
    let offset=0;
    for(const entry of player.entries){const count=entry.sim.skeletonEffects.length;assert(count,'Runtime selected no skeleton: '+entry.track.effect.preset);row.tracks.push({preset:entry.track.effect.preset,view:entry.track.link.skeletonView,skin:entry.track.link.skeletonSkin,selected:selections.slice(offset,offset+count),meshCounts:entry.sim.skeletonEffects.map(s=>s.meshes.length)});offset+=count;}
    assert.equal(row.runtimeErrors.length,0,row.runtimeErrors.join('; '));
   }catch(error){report.failures.push({module:module.id,message:error.message});}
   finally{console.error=consoleError;player.clear();}
  }
 }catch(error){report.failures.push({message:error.message});}
 finally{for(const texture of Object.values(resources?.textures||{}))texture.dispose();for(const geometry of Object.values(resources?.geometries||{}))geometry.dispose();}
}
itemsData.texture.dispose();
const result={passed:reports.every(r=>!r.failures.length),scope:'Initial source form/right/seed12345; embedded-skeleton tracks only; actual FxRuntime.load -> effectDefinition -> FxActionPlayer -> createEffectSkeletons -> CPU sample. Texture dimensions only; no GPU or visual acceptance.',reports,browserOperations:0,pixelsRead:0};
if(arg('--output'))writeFileSync(arg('--output'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;

