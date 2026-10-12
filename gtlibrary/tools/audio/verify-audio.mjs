/** One focused integration check; no browser, combat replay or full-file rehash. */
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=new URL('../../',import.meta.url),json=async name=>JSON.parse(await readFile(new URL(name,root),'utf8'));
globalThis.fetch=async url=>{try{return new Response(await readFile(new URL(url)));}catch{return new Response('',{status:404});}};
const {loadCatalog,resolveClip,findClip,searchClips,AudioBank,AudioMixer}=await import('../../gtaudio/core.js');
const {nativeDoorSounds}=await import('../../gtmap/native-door.js');
const {OnlineGame}=await import('../../gtonline/game.js');
const catalog=await loadCatalog(),stage=await json('gtonline/assets/stage-1-1.json');
assert.equal(catalog.clips.length,catalog.summary.clips);assert.equal(new Set(catalog.clips.map(c=>c.id)).size,catalog.clips.length);
const unique=new Map(catalog.clips.map(c=>[c.file,c]));assert.equal(unique.size,catalog.summary.uniqueFiles);
for(const [file,clip] of unique){assert.match(file,/^assets\/[a-f0-9]{2}\/[a-f0-9]{64}\.(ogg|wav|flac|mp3|m4a|aac)$/);assert.ok(existsSync(new URL('gtaudio/'+file,root)),clip.name);}
for(const [name,id] of Object.entries(catalog.defaults)){assert.equal(resolveClip(catalog,name).id,id);}
for(const spec of Object.values(stage.nativeMechanics.soundHandles)){if(spec.Name)resolveClip(catalog,spec.Name);}
function checkScene(plan){for(const c of plan.commands||[])if(c.op==='sound')resolveClip(catalog,stage.nativeMechanics.soundHandles[c.name]?.Name||c.name);for(const h of plan.gameActions||[]){if(h.name==='Music'&&h.value)resolveClip(catalog,h.value);if(h.name==='SoundLoop'&&h.action==='start')resolveClip(catalog,stage.nativeMechanics.soundHandles[h.sound]?.Name||h.sound);}for(const branch of plan.branches||[])checkScene(branch);}
for(const plan of Object.values(stage.scenes))checkScene(plan);
for(const [name,id] of Object.entries(catalog.bindings[stage.id]))assert.equal((await findClip(name,{binding:stage.id})).id,id);
for(const name of ['02_gimmick_door_down_01','02_gimmick_door_up_01','bgm_forest_bright','01_dash_01','01_holdup_01','01_small_jump_01'])resolveClip(catalog,name);
assert.throws(()=>resolveClip(catalog,'__missing_native_sound__'),/Unknown native AudioClip/);
assert.ok(searchClips(catalog.clips,{query:'gimmick door',kind:'sfx'}).length>=2);
for(const ext of ['ogg','wav','flac']){const c=catalog.clips.find(c=>c.file.endsWith('.'+ext));assert.ok(c);const raw=await readFile(new URL('gtaudio/'+c.file,root));assert.equal(createHash('sha256').update(raw).digest('hex'),c.sha256);assert.equal(raw.length,c.bytes);}
const sound=[],door={id:'door',kind:'door',spec:{FieldObjectBehaviour:{}},record:{}},transitions=[];let open=false;
const game=Object.assign(Object.create(OnlineGame.prototype),{objects:[door],state:{collected:[],opened:[],lit:[]},burning:new Map(),runtime:{setWorldVisible(){},setWorldGimmick(r,s){transitions.push(s);}},isOpen:()=>open,restoreEquipment(){},onSound:n=>sound.push(n)});
game.applyWorld();assert.equal(sound.length,0);assert.equal(transitions[0].still,true);open=true;game.applyWorld();game.applyWorld();open=false;game.applyWorld();assert.deepEqual(sound,['02_gimmick_door_down_01','02_gimmick_door_up_01']);
assert.deepEqual(nativeDoorSounds({DoorOpenSfxHandleName:'custom'},true),['custom']);
const sources=[],gains=[];
class Context{
 constructor(){this.state='running';this.destination={};this.currentTime=0;}
 createGain(){const g={gain:{value:1,cancelScheduledValues(){},setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}};gains.push(g);return g;}
 createBufferSource(){const s={playbackRate:{value:1},connect(){},disconnect(){},start(){s.started=true;},stop(){s.onended?.();}};sources.push(s);return s;}
 async decodeAudioData(){return {length:8,numberOfChannels:2};}async resume(){}async suspend(){}async close(){this.state='closed';}
}
globalThis.AudioContext=Context;
const errors=[],mixer=new AudioMixer({test:{Name:'01_dash_01',Volume:.25,Pitch:.8}},{onError:e=>errors.push(e)});
await mixer.effect('test');assert.equal(sources.at(-1).playbackRate.value,.8);assert.equal(gains.at(-1).gain.value,.25);
const pending=mixer.effect({name:'test',id:'pending',action:'start'});await mixer.effect({id:'pending',action:'stop'});await pending;assert.equal(mixer.loops.size,0);
mixer.dispose();assert.equal(mixer.context.state,'closed');assert.equal(mixer.bank.entries.size,0);assert.deepEqual(errors,[]);
const bank=new AudioBank(new Context(),{maxBytes:32});const first=bank.buffer('01_dash_01');assert.equal(first,bank.buffer('01_dash_01'));await first;assert.equal(bank.bytes,0);assert.equal(bank.entries.size,0);await assert.rejects(bank.buffer('__missing_native_sound__'));assert.equal(bank.entries.size,0);bank.dispose();
assert.ok(!(await readFile(new URL('gtonline/audio.js',root),'utf8')).includes('assets/audio/'));
console.log(JSON.stringify({clips:catalog.clips.length,uniqueFiles:unique.size,counts:catalog.summary.counts,checks:['catalog/defaults/files','all stage sound references','OGG/WAV/FLAC source hashes','door transitions and still startup','native volume/pitch','pending loop cancellation','bounded cache and failed-load retry','shared GTOnline adapter']},null,2));
