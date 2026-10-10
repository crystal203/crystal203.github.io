/* Parse the default selectable skeleton of every original and Japanese resource offline. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),context=vm.createContext({TextDecoder,URL,console,document:{currentScript:{src:'http://localhost/gtlibrary/core/resources.js'}}});
vm.runInContext(fs.readFileSync(path.join(root,'vendor/spine-webgl.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(root,'core/resources.js'),'utf8'),context);
const {spine,GTResources}=context,index=JSON.parse(fs.readFileSync(path.join(root,'resources/search-index.json'),'utf8'));
const file=name=>path.join(root,decodeURIComponent(new URL(GTResources.url(name,'http://localhost/gtlibrary/')).pathname).replace(/^\/gtlibrary\//,''));
const supplement=JSON.parse(fs.readFileSync(path.join(root,'resources/spine-expansion/catalog.json'),'utf8'));
const extra=new Map(Object.entries(supplement.groups).flatMap(([folder,rows])=>rows.map(row=>[folder+':'+row.name,row])));
const results=[],errors=[];let resources=0;
for(const e of index.entities.filter(e=>e.kind==='spine')){
 const base='resources/spine/'+e.spine.folder+'/'+e.spine.name;
 const row=extra.get(e.spine.folder+':'+e.spine.name);
 const suffixes=row?row.variants.slice(0,1).map(v=>(v?'_'+v:'')+'.bytes'):(e.spine.folder==='character'?['.bytes','_front.bytes','_back.bytes','_side.bytes']:['.bytes']);
 const paths=suffixes.map(suffix=>file(base+suffix)).filter(p=>fs.existsSync(p)).slice(0,1);
 if(!paths.length){errors.push({id:e.id,error:'Missing skeleton bytes'});continue;}let good=true;
 for(const bytePath of paths)try{
  const atlasText=fs.readFileSync(file(base+'.atlas'),'utf8'),bytes=fs.readFileSync(bytePath);const atlas=new spine.TextureAtlas(atlasText,()=>({setFilters(){},setWraps(){},getImage(){return {width:2048,height:2048};},dispose(){}}));const data=new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(new Uint8Array(bytes));const instance=new spine.Skeleton(data);instance.setToSetupPose();instance.updateWorldTransform();results.push({id:e.id,file:path.basename(bytePath),bones:data.bones.length,animations:data.animations.length});atlas.dispose();
 }catch(error){good=false;errors.push({id:e.id,file:path.basename(bytePath),error:error.message});}
 if(good)resources++;
}
const report={resources,totalResources:index.entities.filter(e=>e.kind==='spine').length,skeletons:results.length,errors};fs.writeFileSync(path.join(root,'tools/spine-source-validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,errors:errors.slice(0,10)}));if(errors.length)process.exitCode=1;
