// Native actions can change facing during one timeline. Prepare the actual
// direction skeletons once, then select a synchronous context at sample time.
import {SpineThreeRenderer} from '../gtasset/three-renderer.js';
import {mainWeaponSlots} from './equipment-options.js';
import {sampleGraphPath} from './graph-action.js';
import {resolveFacing} from './targeting.js';
const keys=['skeleton','equipment','renderer','slot','weaponSlots','shieldSlot','view','skins'];
const snapshot=p=>Object.fromEntries(keys.map(k=>[k,p[k]]));
const viewOf=d=>['left','right'].includes(d)?'side':d;
const hide=ctx=>{for(const mesh of ctx.renderer?.meshes||[]){mesh.visible=false;if(mesh.userData.ref)mesh.userData.ref.enabled=false;}};
const asset=path=>new URL('../'+path,import.meta.url);
async function read(url,type='text'){
 const r=await GTResources.fetch(url);if(!r.ok)throw Error('人物资源读取失败：'+url);return r[type]();
}
function equip(player,ctx){
 const items=player.itemsData;
 const attachment=name=>{
  if(!name)return null;const frame=items.data.frames[name];if(!frame)throw Error('武器图集缺少 '+name);
  return GTEquipment.createAttachment(spine,name,frame,items.texture,items.image.naturalWidth,items.image.naturalHeight);
 };
 if(ctx.boundWeapon!==player.weapon){const a=attachment(player.weapon);for(const slot of ctx.weaponSlots)ctx.equipment.equip(slot,a);ctx.boundWeapon=player.weapon;}
 if(ctx.boundShield!==player.shield){if(ctx.shieldSlot&&!ctx.weaponSlots.includes(ctx.shieldSlot))ctx.equipment.equip(ctx.shieldSlot,attachment(player.shield));ctx.boundShield=player.shield;}
}
export function clearDirectionViews(player){
 const state=player.directionViews;if(!state)return;
 for(const ctx of state.contexts.values())if(ctx!==state.primary){hide(ctx);ctx.renderer.clear();}
 Object.assign(player,state.primary);player.direction=state.initialDirection;player.directionViews=null;
}
export async function prepareDirectionViews(player,module){
 clearDirectionViews(player);
 const path=module?.actor?.directionPath;if(!path?.length)return;
 const token=player.token,primary=snapshot(player),initialDirection=player.direction;
 primary.boundWeapon=player.weapon;primary.boundShield=player.shield;
 const contexts=new Map([[primary.view,primary]]),state={contexts,primary,initialDirection};player.directionViews=state;
 const profile=player.profile;if(!profile)throw Error('Native directional action requires its character profile');
 const needed=[...new Set(path.map(p=>viewOf(resolveFacing('auto',p.position))))];
 const revision=profile.appearanceSources?.[player.appearance]?.bundleSha256||'',suffix=revision?'?v='+revision:'',appearance=player.appearance,skin=player.skin;
 try{
  await Promise.all(needed.filter(view=>!contexts.has(view)).map(async view=>{
   const key=appearance+':'+view+':'+revision;
   if(!player.cache.has(key)){
    const pending=(async()=>{
     const prefix='gtasset/assets/character/'+appearance;
     const [atlasText,bytes]=await Promise.all([read(asset(prefix+'.atlas'+suffix)),read(asset(prefix+'_'+view+'.bytes'+suffix),'arrayBuffer')]);
     const images=await Promise.all(GTSpineCore.pages(atlasText).map(page=>GTResources.image(asset('gtasset/assets/character/'+page+suffix))));
     const decoded=GTSpineCore.parse({spine,atlasText,bytes,images,createTexture:image=>SpineThreeRenderer.texture(spine,image)});
     if(player.disposed){decoded.dispose();throw Error('人物播放器已关闭');}return decoded;
    })();player.cache.set(key,pending);pending.catch(()=>{if(player.cache.get(key)===pending)player.cache.delete(key);});
   }
   const decoded=await player.cache.get(key);if(player.disposed||player.token!==token||player.directionViews!==state)return;
   const skeleton=GTSpineCore.createInstance(spine,decoded.data),skins=decoded.data.skins.map(s=>s.name);
   if(!skins.includes(skin))throw Error('Native '+view+' skeleton lacks skin: '+skin);
   skeleton.setSkinByName(skin);skeleton.setSlotsToSetupPose();
   const equipment=new GTEquipment.Equipment(skeleton),weaponSlots=mainWeaponSlots(profile.weaponType,profile.weaponSlots).map(number=>skeleton.slots.find(s=>s.data.name==='[base]weapon'+number+'_'+view));
   if(weaponSlots.some(s=>!s))throw Error('缺少 '+appearance+' '+view+' 原生武器挂点');
   const renderer=new SpineThreeRenderer(spine,player.group,{id:'fx-character',character:{resource:appearance}},player.selection,player.pickables);
   const ctx={skeleton,equipment,weaponSlots,slot:weaponSlots[0],shieldSlot:skeleton.slots.find(s=>s.data.name==='[base]weapon2_'+view),renderer,view,skins};
   equip(player,ctx);contexts.set(view,ctx);
  }));
 }catch(error){if(player.directionViews===state)clearDirectionViews(player);throw error;}
 if(player.token!==token||player.disposed||player.directionViews!==state){if(player.directionViews===state)clearDirectionViews(player);return;}
 selectDirectionView(player,module.actor,0);
}
export function selectDirectionView(player,link,time){
 if(!link?.directionPath?.length)return;
 const direction=resolveFacing('auto',sampleGraphPath(link.directionPath,time)),view=viewOf(direction),state=player.directionViews;
 if(!state)throw Error('Native action direction views were not prepared');
 const ctx=state.contexts.get(view);if(!ctx)throw Error('Native action direction skeleton missing: '+view);
 if(ctx.renderer!==player.renderer){hide(snapshot(player));Object.assign(player,ctx);}
 player.direction=direction;equip(player,ctx);
 return ctx;
}
