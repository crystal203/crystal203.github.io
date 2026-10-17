import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../../vendor/three.module.js';
import {MapEventPlayer} from '../../gtmap/event-player.js';
import {MapSpeechBubble} from '../../gtmap/speech-bubbles.js';
// Exercise the actual loader with source dialogues from both existing stages.
for(const id of ['1-1','1-2']){
 const stage=JSON.parse(await readFile(new URL('../../gtonline/assets/stage-'+id+'.json',import.meta.url),'utf8'));
 const source=Object.values(stage.scenes).flatMap(s=>s.commands).find(c=>c.op==='dialogue');
 const command={...source,at:0,target:undefined,position:[0,0,0]};delete command.nativeTypewriter;
 const player=new MapEventPlayer({selection:{records:new Map()},characters:{entries:[],removePreviewActors(){},sample(){}},onGroups(){},camera:{position:new THREE.Vector3(),zoom:1},controls:{target:new THREE.Vector3()}});
 player.stop=()=>{};player.apply=()=>{player.dialogueCommand=player.commands.find(c=>c.op==='dialogue');return[];};player.snapCamera=()=>{};
 await player.load({version:1,waitForDialogue:true,commands:[command],duration:command.duration});player.playing=true;
 const line=player.commands[0],time=player.time;assert.equal(line.nativeTypewriter,true,id+' uses the shared native mechanism');
 assert.equal(player.dialogueHoldTime(line),Math.min(line.duration-.001,player.typingDuration(line)),id+' has no invented .25-second click delay');
 assert.equal(player.advanceDialogue(),true);assert.equal(line.showAll,true);assert.equal(player.time,time,'first click only reveals text');assert.equal(player.waitingDialogue,true);
 let target;player.seek=t=>{target=t;};assert.equal(player.advanceDialogue(),true);assert.equal(target,line.at+line.duration,'second click proceeds');
}
// A revealed line must update its actual DOM text, even while its clock is held.
globalThis.document={fonts:{status:'loaded'}};globalThis.getComputedStyle=()=>({borderLeftWidth:'0px'});
const full='在那边！',camera=new THREE.OrthographicCamera(-10,10,5,-5,.1,100);camera.position.z=10;
const line={text:full,at:0,position:[0,0,0],typeSpeed:.05,showAll:true};
const bubble=Object.create(MapSpeechBubble.prototype);
Object.assign(bubble,{host:{clientWidth:1280,clientHeight:720},player:{plan:{},dialogueCommand:line,time:.1,camera},fade:{style:{}},box:{style:{setProperty(){}},dataset:{},offsetWidth:200,offsetHeight:100},text:{},renderChoices(){}});
bubble.sample();assert.equal(bubble.text.textContent,full);
line.showAll=false;bubble.sample();assert.equal(bubble.text.textContent,'在那');
console.log('PASS shared native dialogue behavior for 1-1 and 1-2: first click reveals text without advancing the timeline; next click proceeds; no arbitrary click delay.');
