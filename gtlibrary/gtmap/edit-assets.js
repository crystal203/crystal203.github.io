// Clipboard capsules contain source metadata only, never live GPU objects.
// Namespace resource IDs so maps from different packs can coexist safely.
export function captureEditAssets(bundle,keys,prefix){
 const data={templates:{},meshes:{},materials:{},textures:{},environment:{clouds:{},effects:{},states:{}}};
 for(const key of new Set(keys)){
  const template=bundle.templates[key];
  data.templates[key]={...template,animations:template.animations||bundle.environment?.animators?.[bundle.setOrder[Number(key.split(':')[0])-1]]?.[template.name]};
  for(const part of template.parts){data.meshes[part.mesh]=bundle.meshes[part.mesh];for(const id of part.materials)if(bundle.materials[id])data.materials[id]=bundle.materials[id];}
  for(const type of ['clouds','effects','states'])if(bundle.environment?.[type]?.[key]){data.environment[type][key]=bundle.environment[type][key];Object.assign(data.materials,bundle.environment[type][key].assets?.materials);}
  const cloud=data.environment.clouds[key];if(cloud)data.materials[cloud.material]=bundle.materials[cloud.material];
 }
 // Only carry texture dependencies used by this capsule, including sprite atlases.
 const needed=new Set();
 function texturesIn(value){if(!value||typeof value!=='object')return;for(const [key,child] of Object.entries(value)){if(key==='texture'&&typeof child==='string')needed.add(child);else if(key!=='textures')texturesIn(child);}}
 texturesIn(data);for(const key of needed)if(bundle.textures[key])data.textures[key]=bundle.textures[key];
 for(const key of Object.keys(bundle.textures))if(key.startsWith('pickup-')||key.includes(':pickup-'))data.textures[key]=bundle.textures[key];
 const ids=new Set(Object.keys(data.templates));
 function collect(value){if(!value||typeof value!=='object')return;for(const [key,child] of Object.entries(value)){if(['meshes','materials','textures'].includes(key)&&child)Object.keys(child).forEach(id=>ids.add(id));collect(child);}}
 collect(data);
 const renamed=new Map([...ids].map(id=>[id,prefix+id]));
 function rewrite(value,table=false){if(typeof value==='string')return renamed.get(value)||value;if(Array.isArray(value))return value.map(child=>rewrite(child));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,child])=>[table?(renamed.get(key)||key):key,rewrite(child,child===data.templates||['meshes','materials','textures','clouds','effects','states'].includes(key))]));return value;}
 const result=rewrite(data);
 // Environment tables use the same template keys as the mesh table.
 return {data:result,keys:new Map([...new Set(keys)].map(key=>[key,renamed.get(key)])),textureKeys:Object.fromEntries(Object.keys(data.textures).map(key=>[key,renamed.get(key)]))};
}

export function pasteOffset(snapshots,target){
 const center=[0,0,0];for(const s of snapshots)for(let i=0;i<3;i++)center[i]+=s.position[i]/snapshots.length;
 return target.map((v,i)=>v-center[i]);
}
