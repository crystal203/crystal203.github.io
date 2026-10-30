import * as THREE from '../vendor/three.module.js';
import {SpineThreeRenderer} from '../gtasset/three-renderer.js';
import {clipTime} from './character-link.js';
import {resolveFacing} from './targeting.js';
import {sampleMirageAlpha,mirageValueAt} from './graph-native-extensions.js';

/** Independent native skeletons; no owner pose or owner world translation is reused. */
export class GraphMirageRenderer {
 constructor(player){this.player=player;this.instances=[];}
 clear(){for(const m of this.instances){m.renderer.clear();m.group.removeFromParent();}this.instances=[];this.source=null;}
 create(){
  const p=this.player,group=new THREE.Group(),skeleton=GTSpineCore.createInstance(spine,p.skeleton.data),record={refs:[],visible:true,matrix:new THREE.Matrix4()};
  p.runtime.scene.add(group);
  const selection={records:new Map([['graph-mirage',record]]),attach:(_id,mesh)=>record.refs.push({mesh,local:new THREE.Matrix4()})};
  const renderer=new SpineThreeRenderer(spine,group,{id:'graph-mirage',character:{resource:p.appearance}},selection,[]);
  const equipment=new GTEquipment.Equipment(skeleton);const m={skeleton,group,record,renderer,equipment};this.instances.push(m);return m;
 }
 sample(link,time){
  const p=this.player,mirages=link?.mirages||[];
  if(this.source!==p.skeleton){this.clear();this.source=p.skeleton;}
  while(this.instances.length<mirages.length)this.create();
  this.instances.forEach((m,index)=>{
   const source=mirages[index];m.group.visible=false;if(!source)return;
   const alpha=sampleMirageAlpha(source,time),visible=mirageValueAt(source.visibility,time)?.value;
   if(!visible||alpha<=0)return;
   const direction=mirageValueAt(source.directionPath,time)?.position||[p.direction==='left'?-1:1,0,0];
   const facing=resolveFacing('auto',direction),view=['left','right'].includes(facing)?'side':facing;
   if(view!==p.view)throw Error('Native mirage requires a separately loaded '+view+' skeleton');
   const skin=p.skeleton.skin?.name||p.skin;if(m.skin!==skin){m.skeleton.setSkinByName(skin);m.skin=skin;}
   for(const [key,binding] of Object.entries(p.equipment.bindings))m.equipment.equip(m.skeleton.slots[Number(key)],binding.attachment);
   const skeleton=m.skeleton;skeleton.setToSetupPose();
   skeleton.color.set(source.color.r??1,source.color.g??1,source.color.b??1,alpha);
   const apply=(name,t,loop)=>{const anim=skeleton.data.findAnimation(name+'_'+view)||skeleton.data.findAnimation(name);if(anim)anim.apply(skeleton,0,t,loop,[],1,spine.MixBlend.replace,spine.MixDirection.mixIn);return anim;};
   if(!apply(p.idleAnimation||p.weaponType+'_idle',time,true))apply('idle',time,true);
   apply('[sub]idle',time,true);
   for(const track of ['Base','Upper','Emotion']){const c=source.clips.filter(c=>c.track===track&&time>=c.start&&time<(c.end??Infinity)).at(-1);if(c){const anim=skeleton.data.findAnimation(c.name+'_'+view)||skeleton.data.findAnimation(c.name);if(!anim)throw Error('Native mirage animation missing: '+c.name);apply(c.name,clipTime(c,time,anim.duration),c.loop);}}
   skeleton.updateWorldTransform();
   const position=mirageValueAt(source.graphPath,time)?.position||[0,0,0];m.group.position.set(position[0],position[1],-position[2]);m.group.visible=true;
   const scale=.022,flip=facing==='left'?-1:1,matrix=new THREE.Matrix4().makeScale(scale*flip,scale/p.runtime.camera.nativeViewportScale(),scale);
   const order=link.sorting?.filter(s=>s.at<=time).at(-1)?.order??0;m.renderer.draw(skeleton,matrix,order);m.renderer.place(m.record,matrix,true,order);
  });
 }
}
