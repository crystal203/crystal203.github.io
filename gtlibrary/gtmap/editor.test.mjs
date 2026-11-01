import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {MapSelection} from './selection.js';
import {captureEditAssets,pasteOffset} from './edit-assets.js';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

function selection(){const s=new MapSelection(new THREE.Scene());for(let i=0;i<2;i++)s.add({id:String(i),name:'brick',x:i*4,y:2,z:3,rotation:0});s.markClean();s.select('0');s.select('1',true);return s;}

test('deletion removes selection and is independent of hidden state; undo/redo retain membership',()=>{
 const s=selection();s.transaction(()=>s.apply({visible:false}));assert.equal(s.dirty,true);s.deleteSelected();assert.equal(s.values().length,0);assert.equal(s.records.get('0').deleted,true);
 s.undo();assert.equal(s.values().length,2);assert.equal(s.records.get('0').visible,false);assert.equal(s.records.get('0').deleted,false);
 s.undo();assert.equal(s.dirty,false);s.redo();s.redo();s.select('0');assert.equal(s.values().length,0);s.dispose();
});

test('pasting is a structural history entry; restoring a map can remove additions and be undone',()=>{
 const s=selection(),r=s.add({id:'edit:1',name:'brick',x:0,y:0,z:0,rotation:0,editAdded:true});r.deleted=true;
 s.transaction(()=>{r.deleted=false;r.position.set(8,2,-5);s.ids=new Set(['edit:1']);},[r]);assert.equal(s.dirty,true);
 s.undo();assert.equal(r.deleted,true);assert.deepEqual([...s.ids],['0','1']);assert.equal(s.dirty,false);
 s.redo();assert.equal(r.deleted,false);assert.deepEqual([...s.ids],['edit:1']);
 const records=[...s.records.values()];s.transaction(()=>{s.restore([...s.baseline.values()].map(JSON.parse),[]);r.deleted=true;s.update(r);},records);assert.equal(s.dirty,false);
 s.undo();assert.equal(r.deleted,false);assert.equal(s.dirty,true);s.dispose();
});

test('clipboard dependencies are isolated from a target pack and source objects remain unchanged',()=>{
 const bundle={setOrder:['source'],templates:{'1:brick':{name:'brick',parts:[{mesh:'mesh',materials:['mat']}]}},meshes:{mesh:{positions:[0,1,2]}},materials:{mat:{texenvs:{_MainTex:{texture:'tex'}}}},textures:{tex:{url:'textures/source.png'}},environment:{states:{'1:brick':{spec:{name:'brick'},assets:{templates:{brick:{name:'brick'}},materials:{mat:{texenvs:{_MainTex:{texture:'tex'}}}},textures:{tex:{url:'textures/source.png'}}}}}}};
 const before=JSON.stringify(bundle),capsule=captureEditAssets(bundle,['1:brick'],'copy:');
 assert.equal(capsule.keys.get('1:brick'),'copy:1:brick');assert.equal(capsule.data.templates['copy:1:brick'].parts[0].mesh,'copy:mesh');assert.equal(capsule.data.materials['copy:mat'].texenvs._MainTex.texture,'copy:tex');
 assert.equal(capsule.data.environment.states['copy:1:brick'].assets.templates.brick.name,'brick');assert.equal(JSON.stringify(bundle),before);
 const again=captureEditAssets({...capsule.data,setOrder:[]},['copy:1:brick'],'again:');assert.ok(again.data.templates['again:copy:1:brick']);
});

test('group center lands on the target while preserving height and relative world positions',()=>{
 const snapshots=[{position:[2,1,-3]},{position:[6,3,-7]}],delta=pasteOffset(snapshots,[20,5,-10]);
 const points=snapshots.map(s=>s.position.map((v,i)=>v+delta[i]));assert.deepEqual(points,[[18,4,-8],[22,6,-12]]);
 assert.deepEqual(pasteOffset([snapshots[0]],[9,4,-8]),[7,3,-5]);
});

test('workspace edits and character clipboard survive child-surface disposal',()=>{
 const parent={location:{origin:'https://example.test'},postMessage(){}},source=readFileSync(new URL('../core/bridge.js',import.meta.url),'utf8');
 const surface=()=>{const context={parent,location:{origin:'https://example.test'},document:{querySelectorAll:()=>[]},dispatchEvent(){},Event:class{}};runInNewContext(source,context);return context.GTBridge;};
 const map=surface();map.workspace.set('map-edits',{edited:['source-map']});map.dispose();
 const character=surface();character.clipboard.write({version:1,kind:'characters',characters:[{resource:'hana'}]});character.dispose();
 const restored=surface();assert.equal(restored.workspace.get('map-edits').edited[0],'source-map');assert.equal(restored.clipboard.read().characters[0].resource,'hana');
});
