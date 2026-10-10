import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {decodeMap} from '../../gtmap/decoder.js';
const root=new URL('../../',import.meta.url),assets=new URL('gtmap/assets/',root),c=JSON.parse(await readFile(process.argv[2]||new URL('catalog.json',assets),'utf8'));
async function walk(p){const out=[];for(const f of await readdir(p,{withFileTypes:true}))if(f.isDirectory())out.push(...await walk(path.join(p,f.name)));else if(f.name.endsWith('.bytes'))out.push(path.join(p,f.name));return out;}
const sources=new Map((await walk('E:/GTFiles/files/Tilemaps')).map(p=>[path.basename(p,'.bytes'),p])),report={sourceCount:sources.size,catalogCount:c.maps.length,decoded:0,unavailable:[],versions:{},errors:[]};
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const m of c.maps){try{
 const raw=await readFile(new URL(m.file,assets));if(hash(raw)!==hash(await readFile(sources.get(m.id))))throw Error('Original ciphertext differs');
 if(m.status==='unavailable'){let failed=false;try{await decodeMap(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),m.id);}catch{failed=true;}if(!failed||hash(raw)!==m.cipherSha256)throw Error('Unavailable source status mismatch');report.unavailable.push(m.id);continue;}
 const doc=await decodeMap(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),m.id);if(doc.sha256!==m.sha256||doc.tileCount!==m.tiles||doc.eventCount!==m.events)throw Error('Decoded hash/count mismatch');report.decoded++;report.versions[doc.version]=(report.versions[doc.version]||0)+1;
 }catch(e){report.errors.push({id:m.id,error:e.message});}}
if(report.sourceCount!==2054||report.catalogCount!==2054||report.decoded!==2053||report.unavailable.length!==1||report.errors.length)throw Error(JSON.stringify(report));
await writeFile(new URL('tools/gtmap/evidence/final-source-validation.json',root),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
