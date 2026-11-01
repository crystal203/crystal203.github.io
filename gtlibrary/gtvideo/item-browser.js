import {equipmentCatalog} from './equipment-ui.js';
let catalog;
export function itemCatalog(){return catalog??=equipmentCatalog().then(({metadata,names,bySprite})=>Object.keys(metadata.atlas.frames).map(sprite=>({id:sprite,sprite,atlas:'items',name:bySprite.get(sprite)?.name||names[sprite]||sprite,itemId:bySprite.get(sprite)?.id}))).catch(error=>{catalog=null;throw error;});}
// A normal map-edit capsule keeps items selectable, copyable and portable,
// while sharing the atlas and pickup renderer with native map items.
export function itemClipboard(row){
 const key='video-item:'+row.sprite,texture='pickup-items',tile={id:'new-item',name:row.name,assetKey:key,layer:'动画物品',x:0,y:0,z:0,rotation:0,ts:0,editAdded:true,properties:[],item:{kind:'item',sprite:row.sprite,atlas:'items',spec:{},rewards:row.itemId?[{ItemSpecId:row.itemId}]:[]},pickupTextureKeys:{[texture]:texture}};
 return {version:1,kind:'tiles',assets:{templates:{[key]:{name:row.sprite,parts:[]}},meshes:{},materials:{},textures:{[texture]:{url:'../../gtatlas/assets/items.png',filter:0,wrap:1}},environment:{clouds:{},effects:{},states:{}}},tiles:[tile],snapshots:[{id:tile.id,position:[0,0,0],visualOffset:null,rotation:0,scale:[1,1,1],quaternion:null,visible:true,deleted:false,extra:null}]};
}
