import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {actionModules} from '../../gtfx/action-modules.js';
import {equipmentProfile,preferredWeaponSelection,sourceExclusiveWeapon} from '../../gtfx/equipment-selection.js';
import {sampleGraphPath} from '../../gtfx/graph-action.js';
const root=new URL('../../',import.meta.url),json=p=>JSON.parse(readFileSync(new URL(p,root))),catalog=json('gtfx/assets/weapon-types.json'),reports=[];
const ids=(process.argv[2]||'desertelfhunter,forestelf,secretagent,boatracinggirl,cyborgmonk').split(',');
for(const id of ids){const native=json('gtfx/assets/native-characters/'+id+'.json'),index=json('gtfx/assets/characters/'+id+'.json'),hero=native.profile.appearances[0],weapon=preferredWeaponSelection(native,native.profile,hero),profile=equipmentProfile(native,native.profile,hero,hero,weapon,catalog),modules=actionModules(id,index,{profile,appearance:hero,heroAppearance:hero,weapon,exclusiveWeapon:sourceExclusiveWeapon(native,profile,hero,hero,weapon),weaponEquipped:true,direction:'right',targetDistance:6},native,{[id]:native.plans}),get=k=>{const m=modules.find(m=>m.id===k);assert(m,k);return m;};let evidence;
 if(id==='desertelfhunter'){const m=get('basic-magazine'),body=m.tracks.filter(t=>t.effect.preset==='fx_m_desertelfhunter_proj');assert.equal(body.length,6);assert.equal(m.actor.end,4);evidence={sixBodies:body.length,actorEnd:m.actor.end,shots:body.map(t=>t.link.delay)};}
 if(id==='forestelf'){const m=get('cwp'),body=m.tracks.find(t=>t.effect.preset==='fx_cwp_forestelf_proj');assert(body);const a=sampleGraphPath(body.link.motionPath,.3),b=sampleGraphPath(body.link.motionPath,.4);assert(Math.abs(b[0]-a[0]-2.5)<1e-6);evidence={launch:a,afterPoint1:b,deltaX:b[0]-a[0]};}
 if(id==='secretagent'){const m=get('basic-combo'),fan=m.tracks.filter(t=>t.effect.preset==='fx_m_secret_agent_3rd_proj');assert.equal(fan.length,5);assert(fan[0].link.graphDirection[2]*fan.at(-1).link.graphDirection[2]<0);evidence={fanBodies:fan.length,directions:fan.map(t=>t.link.graphDirection)};}
 if(id==='boatracinggirl'){const m=get('support'),boat=m.tracks.find(t=>t.effect.preset==='fx_m_boatracing_girl_support_boat');assert(boat);const a=sampleGraphPath(boat.link.motionPath,.4),b=sampleGraphPath(boat.link.motionPath,.6);assert.equal(b[0]-a[0],12);evidence={boatStart:a,boatHit:b,distance:b[0]-a[0]};}
 if(id==='cyborgmonk'){const m=get('basic-magazine'),bodies=m.tracks.filter(t=>/fx_m_cyborgmonk.*proj/.test(t.effect.preset));assert.equal(m.sourceTrace.count,11);assert(m.tracks.some(t=>t.effect.preset==='fx_m_cyborgmonk_break'));evidence={normalCount:m.sourceTrace.count,tracks:bodies.length,actorEnd:m.actor.end};}
 reports.push({id,hero,weapon,evidence});}
writeFileSync('E:/GTFiles/fx-batch4-ranged-mechanisms.json',JSON.stringify({passed:true,reports},null,2)+'\n');console.log(JSON.stringify({passed:true,reports}));
