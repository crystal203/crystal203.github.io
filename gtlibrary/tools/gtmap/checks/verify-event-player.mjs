import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import * as THREE from '../../../vendor/three.module.js';
import {MapEventPlayer} from '../../../gtmap/event-player.js';

function fixture(){
 const records=new Map(),camera=new THREE.OrthographicCamera(-10,10,10,-10,.1,1000);camera.position.set(0,50,50);
 const controls={target:new THREE.Vector3(),enableDamping:true,update(){}};
 const selection={records,matrix(){},update(){},refresh(){},values(){return []}};
 const characters={entries:[],time:0,async prepareActor(spec){if(records.has(spec.handle))return records.get(spec.handle);const r={tile:{id:spec.handle,name:spec.handle},position:new THREE.Vector3(100,0,0),visible:true,character:{settings:{animation:'idle',direction:'front',alpha:1}}};records.set(spec.handle,r);return r;},removePreviewActors(){},warm(){return Promise.resolve();},change(r,changes){Object.assign(r.character.settings,changes);},restore(r,settings){r.character.settings={...settings};},sample(){}};
 const player=new MapEventPlayer({selection,characters,states:{capture(){return null;},restore(){}},doors:{},camera,controls,scene:new THREE.Scene(),canvas:{focus(){}},onGroups(){}});player.mapName='test';
 return {player,records,camera,controls,characters};
}
const plan=commands=>({version:1,map:'test',commands});
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-6,`${actual} != ${expected}`);

{
 const {player,controls}=fixture();await player.load(plan([{op:'camera',at:0,duration:10,position:[10,0,0]},{op:'camera',at:5,duration:10,position:[20,0,0]}]));
 player.seek(7.5);close(controls.target.x,8.75);player.seek(5);close(controls.target.x,5);player.seek(7.5);close(controls.target.x,8.75);player.stop();close(controls.target.x,0);
}
{
 const {player,records}=fixture();await player.load({...plan([{op:'move',target:'actor',at:2,duration:4,from:[10,0,0],points:[[2,0,0],[4,0,0]],relative:true},{op:'teleport',target:'actor',at:4,position:[30,0,0]}]),actors:[{handle:'actor',position:[10,0,0]}]});
 player.seek(0);close(records.get('actor').position.x,10);player.seek(3);close(records.get('actor').position.x,11);player.seek(5);close(records.get('actor').position.x,30);player.seek(3);close(records.get('actor').position.x,11);player.stop();close(records.get('actor').position.x,100);
}
{
 const {player,characters}=fixture();let release;characters.prepareActor=()=>new Promise(resolve=>release=resolve);
 const loading=player.load({...plan([]),actors:[{handle:'actor'}]});player.stop();release({});await assert.rejects(loading,{name:'AbortError'});assert.equal(player.plan,null);assert.equal(player.playing,false);
}
{
 const {player}=fixture();await assert.rejects(player.load(plan([{op:'camera',position:[0,0,0],span:0}])),/视野高度/);
}
const root=new URL('../../../gtmap/assets/native-world-scenes/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('index.json',root),'utf8'));
let sampled=0;
for(const entry of Object.values(manifest.maps)){
 const rows=JSON.parse(gunzipSync(await readFile(new URL(entry.file,root))));assert.equal(rows.length,entry.count);
 for(const scene of rows){
  const {player,records,controls}=fixture();player.mapName=scene.map;
  // Geometry/state-machine binding is verified by the renderer; here exercise the portable actor/camera sampler.
  const commands=scene.commands.filter(c=>c.op!=='gimmick');
  try{await player.load({...scene,commands},{accepted:commands.filter(c=>c.op==='choice').map(c=>c.ordinal)});
   for(const t of [0,scene.duration/4,scene.duration/2,scene.duration]){player.seek(t);assert.ok(controls.target.toArray().every(Number.isFinite));for(const r of records.values())assert.ok(r.position.toArray().every(Number.isFinite));}
  }catch(e){throw new Error(`${scene.id} (${scene.title}): ${e.message}`,{cause:e});}
  sampled++;
 }
}
assert.equal(sampled,manifest.total);assert.equal(sampled,367);
const scenes=JSON.parse(gunzipSync(await readFile(new URL('fireworld_1.json.gz',root))));
const companions=scenes.filter(s=>s.title==='Main/Section3:companion_boy_zone_event');assert.equal(companions.length,8);
for(const scene of companions){
 const {player,controls,records}=fixture();player.mapName=scene.map;
 await player.load(scene,{accepted:scene.commands.filter(c=>c.op==='choice').map(c=>c.ordinal)});
 for(let t=0;t<scene.duration;t+=.25){player.seek(t);assert.ok(controls.target.x<-140&&controls.target.x>-180,`${scene.id} camera escaped at ${t}: ${controls.target.x}`);assert.ok(records.get('companion_boy').position.x<-140,`${scene.id} actor escaped at ${t}`);}
 const exit=scene.commands.find(c=>c.op==='move'&&c.target==='companion_boy');assert.ok(exit.points[0][0]<-160);
 const lift=scene.commands.filter(c=>c.op==='teleport'&&c.target==='companion_boy'&&c.position[1]>0&&c.position[1]<2);assert.ok(lift.length>10,'quintic lift must contain intermediate positions');
 player.stop();close(controls.target.x,0);
}
console.log(`PASS: interrupted camera interpolation, explicit/relative route starts, seek/restore, load cancellation, camera validation, ${sampled} native actor/camera timelines, all 8 companion branches sampled every 0.25 s`);
