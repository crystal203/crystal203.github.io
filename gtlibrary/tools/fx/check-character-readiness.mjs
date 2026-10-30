// One UI-equivalent source-form construction, no browser, image or pixel work.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {actionModules} from '../../gtfx/action-modules.js';
import {equipmentProfile,preferredWeaponSelection,sourceExclusiveWeapon,shieldAllowedForWeapon} from '../../gtfx/equipment-selection.js';
import {equipmentStyle} from '../../gtfx/equipment-options.js';
import {nativeForWeapon,sourceHero} from '../../gtfx/weapon-hero-variants.js';
const args=process.argv.slice(2),arg=k=>{const i=args.indexOf(k);return i<0?null:args[i+1];},ids=(arg('--characters')||'').split(',').filter(Boolean);
if(!ids.length)throw Error('Usage: node tools/fx/check-character-readiness.mjs --characters id,id [--output file]');
const root=new URL('../../',import.meta.url),snapshots={},read=p=>{const raw=readFileSync(new URL(p,root));snapshots[p]=createHash('sha256').update(raw).digest('hex');return JSON.parse(raw);};
const catalog=read('gtfx/assets/weapon-types.json'),reports=[];
for(const id of ids){
 const failures=[],pending=[];let evidence;
 try{
  const native=read('gtfx/assets/native-characters/'+id+'.json'),index=read('gtfx/assets/characters/'+id+'.json'),profile=native.profile;
  const hero=arg('--hero')||profile.appearances[0]||profile.defaultSkin,appearance=hero,weapon=preferredWeaponSelection(native,profile,hero);
  const equipped=equipmentProfile(native,profile,appearance,hero,weapon,catalog),exclusiveWeapon=sourceExclusiveWeapon(native,equipped,appearance,hero,weapon),shield=shieldAllowedForWeapon(native,equipped,hero)?equipped.shield||'':'';
  const style=equipmentStyle(native,equipped,hero,true,shield),options={appearance,heroAppearance:hero,weapon,profile:equipped,exclusiveWeapon,weaponEquipped:true,shield,direction:'right',targetDistance:Number(arg('--target-distance')??6)};
  const modules=actionModules(id,index,options,native,{[id]:native.plans}),basics=modules.filter(m=>/^basic(?:-|$)/.test(m.id));
  if(!style)failures.push('No active native BattleStyle for the UI-equivalent equipment profile');
  if(style?.ManualBattleActions?.length&&!basics.length)failures.push('Active basic actions produced no attack module');
  if(!native.previewPolicy?.excludeWeaponSkill&&native.weapons?.[weapon]?.action&&!modules.some(m=>/^cwp(?:-|$)/.test(m.id)))failures.push('Selected source weapon skill produced no module');
  if(!native.previewPolicy?.excludeWeaponSkill){
   const action=native.actions?.[native.weapons?.[weapon]?.action],projectiles=(action?.ProjectileInfo||[]).map(p=>native.projectiles?.[p.Name]).filter(p=>p?.Speed>0&&p.PresetName),cwpModules=modules.filter(m=>/^cwp(?:-|$)/.test(m.id));
   if(projectiles.length&&cwpModules.length&&!cwpModules.some(m=>m.tracks.some(t=>projectiles.some(p=>p.PresetName===t.effect.preset||t.effect.nativeProjectileSprite?.projectile===p.Name))))failures.push('Source weapon skill declares moving projectiles, but actual module contains none of their bodies');
  }
  const effectiveNative=nativeForWeapon(native,hero,weapon,exclusiveWeapon),ids=new Set(effectiveNative.heroOptionIds?.[sourceHero(effectiveNative,hero)]||[]),installed=Object.values(native.options||{}).filter(o=>ids.has(o.Id)).map(o=>o.BattleActionName).filter(Boolean);
  for(const [prefix,category]of [['BasicSupport:','support'],['GraphSupport:','support'],['Role','role'],['GraphRole:','role']])if(installed.some(n=>n.startsWith(prefix))&&!modules.some(m=>m.id===category||m.id.startsWith(category+'-')))failures.push('Installed '+category+' action produced no module');
  for(const m of modules){
   if(m.actor.nativeAim&&(typeof m.actor.nativeAim.bone!=='string'||!m.actor.nativeAim.bone||!Number.isFinite(m.actor.nativeAim.originHeight)||!m.actor.nativeAim.windows?.every(w=>Number.isFinite(w.at)&&Number.isFinite(w.end)&&w.end>=w.at)))failures.push(m.id+': invalid source aim contract');
   if(/^basic(?:-|$)/.test(m.id)&&!m.tracks.length)failures.push(m.id+': no visible basic attack effects; source dependency or explicit source-silent contract must be resolved');
   if(!(Number.isFinite(m.actor.end)&&m.actor.end>0&&Number.isFinite(m.duration)&&m.duration>=m.actor.end))failures.push(m.id+': invalid actor/effect clocks');
   if(m.id!=='idle'&&!m.actor.clips?.length)pending.push(m.id+': no actor clips; check whether source intentionally leaves current pose');
   for(const t of m.tracks){const at=t.at||0,delay=t.link.delay||0,end=t.link.fxEnd??delay+t.effect.duration;if(![at,delay,end].every(Number.isFinite)||end<delay)failures.push(m.id+': invalid effect clock '+t.effect.preset);}
  }
  if(!index.materialValidation?.passed)failures.push('Action dependency material/renderer contract has no passing receipt');
  if(native.sourcePlanResolution?.legacyFallbackActions?.length)pending.push('Legacy source fallback actions: '+native.sourcePlanResolution.legacyFallbackActions.join(', '));
  evidence={hero,weapon,weaponType:equipped.weaponType,style:style?.Name,installedActions:installed,sourcePlanResolution:native.sourcePlanResolution,materialValidation:index.materialValidation,modules:modules.map(m=>({id:m.id,actorEnd:m.actor.end,duration:m.duration,clips:m.actor.clips?.length||0,tracks:m.tracks.length,magazine:m.magazine}))};
 }catch(e){failures.push(e.stack||e.message);}
 reports.push({character:id,status:failures.length?'blocked':'structurally-ready-not-visual-acceptance',failures,sourceReviewNotes:pending,evidence});
}
const result={format:'gtfx-character-readiness',scope:'One default source form with actual UI equipment resolution; no browser, image, pixel, facing or costume sweep; does not certify all source mechanisms',reports,inputSnapshots:snapshots};
if(arg('--output'))writeFileSync(arg('--output'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({reports:reports.map(r=>({character:r.character,status:r.status,failures:r.failures,sourceReviewNotes:r.sourceReviewNotes,modules:r.evidence?.modules.map(m=>m.id)})),browserOperations:0,renderedPixelsRead:0}));
if(reports.some(r=>r.failures.length))process.exitCode=1;
