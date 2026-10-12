/** Shared, metadata-only catalog. Importing this module never loads a sound. */
const root=new URL('./',import.meta.url);
let catalogPromise,handlesPromise;
async function json(file){const url=new URL(file,root),r=await (globalThis.GTResources?.fetch?.(url)??fetch(url));if(!r.ok)throw Error(`gtAudio ${file}: HTTP ${r.status}`);return r.json();}
export function loadCatalog(){return catalogPromise??=(json('data/catalog.json').then(data=>{
 if(data.schema!==1)throw Error('Unsupported gtAudio catalog');
 const byId=new Map(data.clips.map(c=>[c.id,c])),byName=new Map();
 for(const clip of data.clips){const list=byName.get(clip.name)||[];list.push(clip);byName.set(clip.name,list);}
 return {...data,byId,byName};
}).catch(e=>{catalogPromise=null;throw e;}));}
export function loadHandles(){return handlesPromise??=json('data/handles.json').catch(e=>{handlesPromise=null;throw e;});}
export function resolveClip(catalog,name){const clip=catalog.byId.get(name)||catalog.byId.get(catalog.defaults[name]);if(!clip)throw new RangeError('Unknown native AudioClip: '+name);return clip;}
export function clipURL(clip){const url=new URL(clip.file,root);return globalThis.GTResources?.url?.(url)||url.href;}
export async function findClip(name,{binding}={}){const catalog=await loadCatalog();return resolveClip(catalog,catalog.bindings?.[binding]?.[name]||name);}
export async function loadProvenance(){return json('data/provenance.json');}
export function searchClips(clips,{query='',kind='',group=''}={}){const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean);return clips.filter(c=>(!kind||c.kind===kind)&&(!group||c.group===group)&&terms.every(q=>(c.name+' '+c.id).toLowerCase().includes(q)));}
export function catalogEntities(catalog){return catalog.clips.map(c=>({id:'audio:'+c.id,name:c.name,aliases:[c.kind,c.group,c.language||''],audio:{clip:c.id}}));}
