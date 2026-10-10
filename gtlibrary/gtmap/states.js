import * as THREE from '../vendor/three.module.js';
import {curve} from '../core/animation-curve.js';
import {sampleAnimator} from '../core/custom-animator.js';
import {nativeMaterial} from './native-material.js';
import {MapEffects,nativeGeometry} from './effects.js';
import {renderOrder} from './render-order.js';

const reflection=new THREE.Matrix4().makeScale(1,1,-1),identity=new THREE.Matrix4().elements,hidden=new THREE.Matrix4().makeScale(0,0,0);
const labels={on:'激活 / 点燃',off:'关闭 / 熄灭',open:'打开',close:'关闭',start:'开始',end:'结束',idle:'待机',empty:'初始',red:'红色',blue:'蓝色',bomb:'炸弹组件',glow:'光效',FX_accel_tile:'速度箭头 · 循环'};
export const stateLabel=(name,controller='')=>/gate|door/i.test(controller)&&['start','end'].includes(name)?(name==='start'?'关闭 / 出现':'打开 / 消失'):labels[name]||name;
const isActive=node=>{for(let n=node;n;n=n.parent)if(!n.visible)return false;return true;};

/** Instances acquire their own animation clocks and materials only when needed. */
export class MapStates {
 constructor(camera,textures,selection,pickables,materialFactory){Object.assign(this,{camera,textures,selection,pickables,materialFactory});this.entries=[];this.brightness=1;this.visible=true;this.pickupsVisible=true;this.time=0;}
 register(spec,assets,tiles,group,layerIndex){
  for(const tile of tiles){const record=this.selection.records.get(tile.id),entry={spec,assets,record,group,layerIndex,controllers:(spec.controllers||[]).map(c=>({index:c.default,start:0,still:false})),custom:{},overrides:new Map(),active:false,effectStart:0};record.gimmick=entry;this.entries.push(entry);}
 }
 initialize(){for(const e of this.entries)if(e.spec.pickup||e.spec.controllers.some(c=>c.states[c.default]?.clip))this.activate(e);this.sample(0);}
 controls(record){const e=record?.gimmick;if(!e)return null;
  const groups=e.spec.controllers.map((c,i)=>({id:'controller:'+i,name:c.name,value:String(e.controllers[i].index),options:c.states.map((s,j)=>({value:String(j),label:stateLabel(s.name,c.name),animated:!!s.clip}))}));
  for(const [i,s] of e.spec.scripts.entries())if(s.type==='CustomAnimator'&&s.fields.States?.length>1)groups.push({id:'custom:'+i,name:e.spec.nodes.find(n=>n.id===s.node)?.name||'动画',value:e.custom[i]?.name||s.fields.StartState,options:s.fields.States.map(st=>({value:st.StateName,label:stateLabel(st.StateName),animated:true}))});
  for(const parent of new Set(e.spec.nodes.map(n=>n.parent))){const alternatives=e.spec.nodes.filter(n=>n.parent===parent&&['red','blue','on','off'].includes(n.name.toLowerCase()));if(alternatives.length>1)groups.push({id:'branch:'+parent,name:'形态',value:alternatives.find(n=>e.overrides.get(n.id)===true)?.id||'',options:[{value:'',label:'初始状态'},...alternatives.map(n=>({value:n.id,label:stateLabel(n.name.toLowerCase())}))]});}
  const nodes=e.spec.nodes.filter(n=>n.id!==e.spec.root&&(!n.active||/^(bomb|on|off|red|blue|glow|switch\d?|orb.*)$/i.test(n.name))).map(n=>({id:n.id,name:stateLabel(n.name),checked:e.overrides.get(n.id)??e.sim?.nodes.get(n.id)?.visible??n.active}));
  return groups.length||nodes.length?{groups,nodes}:null;
 }
 change(record,id,value,still=false){const e=record?.gimmick;if(!e)return;
  if(id.startsWith('controller:')){const i=Number(id.split(':')[1]),c=e.spec.controllers[i];if(!c?.states[Number(value)])return;e.controllers[i]={index:Number(value),start:this.time,still};
   // Selecting an animator under an initially disabled branch enables that branch.
   let node=e.spec.nodes.find(n=>n.id===c.node);while(node&&node.id!==e.spec.root){e.overrides.set(node.id,true);node=e.spec.nodes.find(n=>n.id===node.parent);}
  }else if(id.startsWith('custom:')){const i=Number(id.split(':')[1]);e.custom[i]={name:value,start:this.time,still};}
  else if(id.startsWith('branch:')){for(const node of e.spec.nodes.filter(n=>n.parent===id.slice(7)&&['red','blue','on','off'].includes(n.name.toLowerCase()))){if(value)e.overrides.set(node.id,node.id===value);else e.overrides.delete(node.id);}}
  else if(id.startsWith('node:'))e.overrides.set(id.slice(5),!!value);
  e.effectStart=this.time;this.activate(e);this.sample(this.time);this.selection.refresh();
 }
 activate(e){if(e.active)return;e.active=true;e.record.gimmickActive=true;
  for(const ref of e.record.refs){ref.suppressed=true;ref.mesh.setMatrixAt(ref.index,hidden);ref.mesh.instanceMatrix.needsUpdate=true;ref.mesh.boundingSphere=null;}
  e.effects=new MapEffects(this.camera,this.textures,this.selection);e.effects.stateful=true;e.effects.setBrightness(this.brightness);e.effects.setVisible(this.visible);
  // Build dormant emitters too; source node activation curves decide when they run.
  const spec={...e.spec,includeInactive:true,forceNodes:true,scripts:e.spec.scripts.map(s=>({...s,fields:{...s.fields}})),sampleNodes:sim=>this.nodes(e,sim,this.time)};
  e.effects.build(spec,e.assets,[e.record.tile],e.group,e.layerIndex);e.sim=e.effects.simulations[0];
  if(!e.sim){e.effects.build({...spec,forceNodes:true},e.assets,[e.record.tile],e.group,e.layerIndex);e.sim=e.effects.simulations[0];}
  e.parts=[];
  for(const part of e.spec.parts){const raw=e.assets.meshes[part.mesh];if(!raw)continue;
   for(const [si,indices] of raw.submeshes.entries()){const source=e.assets.materials[part.materials[Math.min(si,part.materials.length-1)]];if(!indices.length||!source?.nativeShader)continue;
    const geom=nativeGeometry({...raw,submeshes:[indices]},raw.colorFormat);geom.setAttribute('nativeNormal',geom.attributes.normal.clone());geom.applyMatrix4(reflection);const flipped=geom.index.array;for(let i=0;i<flipped.length;i+=3)[flipped[i+1],flipped[i+2]]=[flipped[i+2],flipped[i+1]];geom.computeBoundingBox();
    const mat=source.nativeShader.gles?nativeMaterial(source,this.textures,identity):this.materialFactory(part.materials[Math.min(si,part.materials.length-1)],!!raw.colors);if(!mat){geom.dispose();continue;}mat.uniforms.brightness.value=this.brightness;
    const mesh=new THREE.InstancedMesh(geom,mat,1);mesh.frustumCulled=false;mesh.renderOrder=renderOrder(mat.userData.queue,e.layerIndex,part.layer,part.sort,e.assets.sortingLayers);mesh.userData={tiles:[e.record.tile],sourceMesh:raw.name,sourceMaterial:source.name,sourceShader:source.nativeShader.name,kind:'tile'};e.group.add(mesh);this.pickables.push(mesh);
    this.selection.attach(e.record.tile.id,mesh,0);const ref=e.record.refs.at(-1);ref.stateful=true;e.parts.push({mesh,part,ref,source});
   }
  }
 }
 nodes(e,sim,time){
  for(const n of e.spec.nodes){const node=sim.nodes.get(n.id),b=node.userData.base;node.visible=n.active;node.userData.euler=new THREE.Euler().setFromQuaternion(b.rotation,'ZXY');node.position.copy(b.position);node.quaternion.copy(b.rotation);node.scale.copy(b.scale);}
  const byPath=new Map(e.spec.nodes.map(n=>[n.path,n.id]));e.materialValues=new Map();e.rendererEnabled=new Map();
  const write=(node,attribute,value)=>{
   if(attribute==='m_IsActive')node.visible=value>=.5;else if(attribute==='m_Enabled')e.rendererEnabled.set(node,value>=.5);
   else if(attribute.startsWith('m_LocalPosition.'))node.position[attribute.at(-1)]=value;
   else if(attribute.startsWith('m_LocalScale.'))node.scale[attribute.at(-1)]=value;
   else if(attribute.startsWith('m_LocalRotation.'))node.quaternion[attribute.at(-1)]=value;
   else if(attribute.startsWith('localEulerAnglesRaw.')){node.userData.euler??=new THREE.Euler(0,0,0,'ZXY');node.userData.euler[attribute.at(-1)]=value*Math.PI/180;node.quaternion.setFromEuler(node.userData.euler);}
   else if(attribute.startsWith('material.')){if(!e.materialValues.has(node))e.materialValues.set(node,[]);e.materialValues.get(node).push([attribute.slice(9),value]);}
  };
  for(const [i,controller] of e.spec.controllers.entries()){
   const clock=e.controllers[i];let state=controller.states[clock.index],t=Math.max(0,time-clock.start)*Math.abs(state.speed||1);
   // Follow only unconditional source exit transitions, never gameplay predicates.
   for(let guard=0;guard<16&&state?.clip;guard++){const d=Math.max(.001,state.clip.duration);if(clock.still){t=d;break;}const tr=state.transitions.find(x=>!x.data.m_ConditionConstantArray?.length&&x.data.m_HasExitTime);if(tr&&t>=d*(tr.data.m_ExitTime??1)&&controller.states[tr.data.m_DestinationState]){t-=d*(tr.data.m_ExitTime??1);state=controller.states[tr.data.m_DestinationState];}else{t=(state.loop||state.clip.loop)?t%d:Math.min(t,d);break;}}
   if(!state?.clip)continue;if(state.speed<0)t=Math.max(0,state.clip.duration-t);const prefix=e.spec.nodes.find(n=>n.id===controller.node)?.path||'';
   for(const c of state.clip.curves){const path=[prefix,c.path].filter(Boolean).join('/'),node=sim.nodes.get(byPath.get(path));if(!node)continue;
    const keys=c.curve.m_Curve||[];
    if(typeof keys[0]?.value==='object'){for(const k of Object.keys(keys[0].value)){const cv={...c.curve,m_Curve:keys.map(v=>({...v,value:v.value[k],inSlope:v.inSlope?.[k]??0,outSlope:v.outSlope?.[k]??0}))};write(node,c.attribute+'.'+k,curve(cv,t,0));}}
    else write(node,c.attribute,curve(c.curve,t,0));
   }
  }
  for(const [i,s] of e.spec.scripts.entries())if(s.type==='CustomAnimator'){const custom=e.custom[i],node=sim.nodes.get(s.node),f=custom?{...s.fields,StartState:custom.name}:s.fields;for(const c of sampleAnimator(f,custom?.still?Math.max(.001,...(f.States.find(st=>st.StateName===custom.name)?.Curves||[]).map(c=>c.Duration||0)):Math.max(0,time-(custom?.start||0)))){
   if(c.key<=2)node.position[['x','y','z'][c.key]]=c.value;else if(c.key<=5)node.scale[['x','y','z'][c.key-3]]=c.value;else if(c.key===15)node.position.fromArray(c.vector);else if(c.key===16)node.scale.fromArray(c.vector);else if(c.key===10)node.quaternion.setFromEuler(new THREE.Euler(...c.vector.map(v=>v*Math.PI/180),'ZXY'));
   else if(c.key===17){for(const [j,k] of ['r','g','b'].entries())write(node,'material.'+(f.CustomShaderColorKey||'_TintColor')+'.'+k,c.vector[j]);}else if(c.key===18||c.key===19){for(const [j,k] of (c.key===18?['z','w']:['x','y']).entries())write(node,'material._MainTex_ST.'+k,c.vector[j]);}
   else if(c.key>=6&&c.key<=9)write(node,'material.'+(f.CustomShaderColorKey||'_TintColor')+'.'+['r','g','b','a'][c.key-6],c.value);else if(c.key>=11&&c.key<=14)write(node,'material._MainTex_ST.'+['z','w','x','y'][c.key-11],c.value);
  }}
  for(const [i,custom] of Object.entries(e.custom))if(sim.effect.scripts[i])sim.effect.scripts[i].fields.StartState=custom.name;
  for(const s of e.spec.scripts)if(s.type==='RotateThis'){const f=s.fields,rotation=f.rotationSpeed||f.RotateSpeed||f.rotation||{};sim.nodes.get(s.node).quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...['x','y','z'].map(k=>(rotation[k]||0)*time*Math.PI/180),'ZXY')));}
  for(const [id,v] of e.overrides)sim.nodes.get(id).visible=v;
  sim.nodeRoot.updateMatrixWorld(true);
 }
 sample(time){this.time=time;for(const e of this.entries){if(!e.active)continue;e.effects.sample(Math.max(0,time-e.effectStart));
  for(const p of e.parts){const node=e.sim.nodes.get(p.part.node),local=reflection.clone().multiply(node.matrixWorld).multiply(reflection);p.ref.local.copy(local);p.mesh.visible=!e.spec.pickup||this.pickupsVisible;p.ref.enabled=(e.rendererEnabled.get(node)??p.part.enabled)&&isActive(node);p.mesh.setMatrixAt(0,p.ref.enabled?e.record.matrix.clone().multiply(local):hidden);p.mesh.instanceMatrix.needsUpdate=true;
   for(const [name,u] of Object.entries(p.mesh.material.uniforms)){const color=p.source.colors[name]||p.source.nativeShader.defaults[name],slot=p.source.texenvs[name.replace(/_ST$/,'')];if(color&&u.value?.set)u.value.set(...['r','g','b','a'].map(k=>color[k]??0));else if(name.endsWith('_ST')&&slot)u.value.set(slot.scale.x,slot.scale.y,slot.offset.x,slot.offset.y);}
   for(const script of e.spec.scripts.filter(s=>s.node===p.part.node&&s.type.startsWith('FxUvanim'))){const name=script.type.includes('Tex2')?'_MainTex2_ST':'_MainTex_ST',u=p.mesh.material.uniforms[name]?.value;if(u){u.z+=(script.fields.scrollSpeed_X||0)*time;u.w+=(script.fields.scrollSpeed_Y||0)*time;}}
   for(const [attribute,value] of e.materialValues.get(node)||[]){const dot=attribute.lastIndexOf('.');if(dot<0){const scalar=p.mesh.material.uniforms[attribute];if(scalar)scalar.value=value;continue;}const u=p.mesh.material.uniforms[attribute.slice(0,dot)]?.value,k=attribute.slice(dot+1);if(u&&typeof u==='object')u[({r:'x',g:'y',b:'z',a:'w'})[k]||k]=value;}
  }
 }}
 diagnostics(){return {available:this.entries.length,active:this.entries.filter(e=>e.active).length,instances:this.entries.filter(e=>e.active).map(e=>({id:e.record.tile.id,name:e.record.tile.name,states:e.spec.controllers.map((c,i)=>c.states[e.controllers[i].index]?.name),parts:e.parts.map(p=>({name:e.assets.meshes[p.part.mesh]?.name,visible:p.ref.enabled,uv:p.mesh.material.uniforms._MainTex_ST?.value.toArray()}))}))};}
 get batches(){return this.entries.flatMap(e=>e.effects?.batches||[]);}
 reset(records){for(const r of records){const e=r.gimmick;if(!e)continue;e.controllers=e.spec.controllers.map(c=>({index:c.default,start:this.time,still:false}));e.custom={};e.overrides.clear();}this.sample(this.time);}
 setBrightness(value){this.brightness=value;for(const e of this.entries)if(e.active){e.effects.setBrightness(value);for(const p of e.parts)p.mesh.material.uniforms.brightness.value=value;}}
 setPickupsVisible(value){this.pickupsVisible=value;for(const e of this.entries)if(e.spec.pickup){e.effects?.setVisible(value&&this.visible);for(const p of e.parts||[])p.mesh.visible=value;}}
 setVisible(value){this.visible=value;for(const e of this.entries)e.effects?.setVisible(value&&(!e.spec.pickup||this.pickupsVisible));}
 clear(){for(const e of this.entries)if(e.active){e.effects.clear();for(const p of e.parts){p.mesh.removeFromParent();p.mesh.dispose();p.mesh.geometry.dispose();if(p.mesh.material.userData.nativeProgram)p.mesh.material.dispose();}}this.entries=[];}
}
