// One fixed myth/right/seed12345 scene; no skin/facing or pixel sweep.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {skyBarrageActionModules} from '../../gtfx/native-sky-barrage.js';
import {sampleGraphPath} from '../../gtfx/graph-action.js';
import {UnityRand} from '../../gtfx/native-random.js';
const read=p=>JSON.parse(readFileSync(new URL('../../gtfx/assets/'+p,import.meta.url),'utf8'));
const index=read('characters/mermaidspy.json'),pack=read('native-characters/mermaidspy.json');
const options={appearance:'mermaid_spy_myth',heroAppearance:'mermaid_spy_myth',direction:'right',seed:12345,profile:pack.profile};
const modules=skyBarrageActionModules(index,options,pack,pack.plans),m=modules[0],trace=m.nativeSkyBarrageTrace;
assert.equal(modules.length,1);assert.equal(m.actor.end,1.5);
assert.equal(sampleGraphPath(m.actor.spinePath,0)[1],8);
assert.equal(sampleGraphPath(m.actor.spinePath,.2)[1],8);
assert.equal(sampleGraphPath(m.actor.spinePath,.6)[1],7);
assert.equal(sampleGraphPath(m.actor.spinePath,1)[1],0);
assert(m.actor.spineRotationPath.some(p=>p.time===.75&&p.angle===-180));
assert.equal(m.actor.spineRotationPath.filter(p=>p.time===1).at(-1).angle,0);
assert.deepEqual(m.actor.alpha,[{at:0,from:0,value:1,duration:.5}]);
assert.deepEqual(trace.impacts.map(p=>p.at),[.15,.3,.45]);
assert.equal(trace.shots.length,3);for(const [i,s]of trace.shots.entries()){
 assert(Math.abs(s.at-[0,.15,.3][i])<1e-10);
 assert(Math.abs(s.death-s.at-.2)<1e-10);
 assert(Math.abs(Math.hypot(s.target[0],s.target[2])-3.7)<1e-10);
 assert.deepEqual(s.start.map((v,k)=>v-s.target[k]),[0,7,2]);
 const next=trace.points[(i+1)%3];assert(Math.abs((s.target[0]*next[0]+s.target[2]*next[2])/(3.7**2)+.5)<1e-10);
}
const rng=new UnityRand(12345);rng.nextFloat();assert.deepEqual(m.random.stateAfter,rng.getState());
const impacts=m.tracks.filter(t=>t.effect.preset==='fx_myth_mermaid_spy_explosion');assert.deepEqual(impacts.map(t=>t.link.delay),[.15,.3,.45]);
assert(m.tracks.some(t=>t.effect.preset==='fx_myth_mermaid_spy_jump'&&t.link.delay===1&&t.link.graphPosition.every(v=>v===0)));
const trails=m.tracks.filter(t=>t.effect.preset==='fx_myth_mermaid_spy_contrail');assert.equal(trails.length,3);assert(trails.every(t=>t.link.fxEnd>t.link.triggeredDisposeAt));
assert.equal(m.actor.clips.filter(c=>c.name==='bow_attack').length,3);
assert.equal(m.actor.clips.find(c=>c.name==='weapon/bow_landing').start,.8);
console.log(JSON.stringify({scene:'mermaidspy myth/right/seed12345',draw:trace.draw,points:trace.points,shots:trace.shots.map(s=>({at:s.at,death:s.death})),heightAtPoint6:7,rotationAtPoint75:-180,tracks:m.tracks.length,actorEnd:m.actor.end,tailEnd:m.duration}));
