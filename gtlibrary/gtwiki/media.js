/* Compact previews built on the same atlas and Spine cores as the asset viewers. */
const root=GTResources.root, path=p=>new URL(p,root).href;
const sheets=new Map();
let layoutPromise;
function layouts(){return layoutPromise||(layoutPromise=response('gtwiki/data/illustration-layouts.json').then(r=>r.json()).catch(e=>{layoutPromise=null;throw e;}));}
async function response(p,signal){const r=await GTResources.fetch(path(p),{signal});if(!r.ok)throw Error('资源读取失败：'+r.status);return r;}
async function sheet(name){
  const base=name==='awakenings'?'gtwiki/ui/':'resources/atlas/';
  if(!sheets.has(name))sheets.set(name,Promise.all([
    response(base+name+'.json').then(r=>r.json()),
    GTResources.image(path(base+name+'.png'))
  ]).then(([data,image])=>({image,regions:new Map(GTAtlasCore.parse(data,image).map(r=>[r.name,r]))})).catch(e=>{sheets.delete(name);throw e;}));
  return sheets.get(name);
}
export async function drawSprite(canvas,sprite){
  if(!sprite){canvas.hidden=true;return;}
  const {image,regions}=await sheet(sprite.sheet),region=regions.get(sprite.name);
  if(!region)throw Error('未收录图集帧');
  if(!canvas.isConnected)return;
  canvas.width=region.w;canvas.height=region.h;
  GTAtlasCore.draw(canvas.getContext('2d'),image,region,region.w,region.h);
  canvas.dataset.loaded='true';
}
const thumbs=new Map();
export async function portrait(canvas,sprite){
  if(!sprite)return;
  const name=sprite.sheet;
  if(!thumbs.has(name))thumbs.set(name,Promise.all([
    response('resources/previews/'+name+'.json').then(r=>r.json()),
    GTResources.image(path('resources/previews/'+name+'.webp'))
  ]).then(([data,image])=>({image,regions:new Map(GTAtlasCore.parse(data,image).map(r=>[r.name,r]))})).catch(e=>{thumbs.delete(name);throw e;}));
  const {image,regions}=await thumbs.get(name),region=regions.get(sprite.name);
  if(!region||!canvas.isConnected)return;
  canvas.width=region.w;canvas.height=region.h;
  GTAtlasCore.draw(canvas.getContext('2d'),image,region,region.w,region.h);
}

export class SpinePreview{
  constructor(host,{pixel=false}={}){
    this.host=host;this.pixel=pixel;this.token=0;this.dead=false;this.paused=false;this.zoom=1;this.pan={x:0,y:0};
    this.canvas=document.createElement('canvas');this.canvas.setAttribute('aria-label',pixel?'角色像素动画':'角色立绘');
    this.canvas.className=pixel?'pixel-canvas':'illust-canvas';
    this.status=document.createElement('span');this.status.className='media-status';this.status.setAttribute('role','status');
    this.background=document.createElement('img');this.background.className='illust-background';this.background.alt='';this.background.hidden=true;
    host.replaceChildren(this.background,this.canvas,this.status);
    if(!pixel){
      host.tabIndex=0;host.setAttribute('aria-label','角色立绘，可拖动或使用方向键平移');
      host.addEventListener('pointerdown',e=>{if(e.button!==0)return;this.drag={id:e.pointerId,x:e.clientX,y:e.clientY};host.setPointerCapture(e.pointerId);host.classList.add('dragging');});
      host.addEventListener('pointermove',e=>{if(this.drag?.id!==e.pointerId)return;this.pan.x+=e.clientX-this.drag.x;this.pan.y+=e.clientY-this.drag.y;this.drag.x=e.clientX;this.drag.y=e.clientY;this.fit();});
      const end=()=>{this.drag=null;host.classList.remove('dragging');};host.addEventListener('pointerup',end);host.addEventListener('pointercancel',end);host.addEventListener('lostpointercapture',end);
      host.addEventListener('keydown',e=>{const moves={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]};if(moves[e.key]){e.preventDefault();this.pan.x+=moves[e.key][0];this.pan.y+=moves[e.key][1];this.fit();}else if(e.key==='Home'){e.preventDefault();this.reset();}});
      host.addEventListener('wheel',e=>{e.preventDefault();this.zoom=Math.max(.5,Math.min(2,this.zoom*Math.exp(-e.deltaY*.001)));this.fit();host.dispatchEvent(new CustomEvent('preview-zoom',{detail:this.zoom}));},{passive:false});
    }
    this.gl=this.canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:!pixel});
    if(this.gl)this.renderer=new spine.webgl.SceneRenderer(this.canvas,this.gl);
    this.resize=new ResizeObserver(()=>this.fit());this.resize.observe(host);
    this.visible=true;this.visibility=new IntersectionObserver(entries=>{this.visible=entries[0].isIntersecting;});this.visibility.observe(host);
    this.last=performance.now();this.tick=this.tick.bind(this);this.raf=requestAnimationFrame(this.tick);
  }
  async load(descriptor,skin,direction='front'){
    const token=++this.token;this.abort?.abort();this.abort=new AbortController();
    this.clear();this.zoom=1;this.pan={x:0,y:0};this.status.hidden=false;this.status.textContent='正在加载…';
    if(!descriptor){this.status.textContent='该素材暂未收录';return;}
    if(!this.gl){this.status.textContent='当前浏览器无法播放 WebGL 动画，可查看图集预览';return;}
    const signal=this.abort.signal;
    try{
      const bytePath=descriptor.variants[direction]||descriptor.variants.default||Object.values(descriptor.variants)[0];
      const [atlasText,bytes,images]=await Promise.all([
        response(descriptor.atlas,signal).then(r=>r.text()),response(bytePath,signal).then(r=>r.arrayBuffer()),
        Promise.all(descriptor.pages.map(p=>GTResources.image(path(p.path),{signal})))
      ]);
      if(this.dead||token!==this.token)return;
      const decoded=GTSpineCore.parse({spine,atlasText,bytes,images,createTexture:image=>new spine.webgl.GLTexture(this.gl,image)});
      this.decoded=decoded;
      if(!this.pixel){
        this.layout=(await layouts())[ 'illust:'+descriptor.name ]||{};
        if(this.dead||token!==this.token)return;
        if(this.layout.background){
          try{const bg=await GTResources.image(path(this.layout.background),{signal});if(this.dead||token!==this.token)return;bg.className='illust-background';bg.alt='';this.background.replaceWith(bg);this.background=bg;this.background.hidden=false;}
          catch(e){if(e.name==='AbortError')throw e;}
        }
      }
      if(this.pixel)for(const page of decoded.atlas.pages)page.texture.setFilters(spine.TextureFilter.Nearest,spine.TextureFilter.Nearest);
      const skeleton=this.skeleton=GTSpineCore.createInstance(spine,decoded.data);
      const exactSkin=skin||descriptor.name;
      const chosen=decoded.data.skins.find(s=>s.name===exactSkin)||decoded.data.skins.find(s=>s.name!=='default')||decoded.data.skins[0];
      if(chosen){skeleton.setSkinByName(chosen.name);skeleton.setSlotsToSetupPose();}
      this.state=new spine.AnimationState(new spine.AnimationStateData(decoded.data));
      const animations=decoded.data.animations;
      const preferred=this.pixel?['idle_'+direction,'idle','sword_idle_'+direction,'twohand_idle_'+direction,'unarmed_idle_'+direction,'sword_idle','twohand_idle','unarmed_idle']:['idle','animation'];
      const animation=preferred.map(name=>animations.find(a=>a.name===name)).find(Boolean)||animations.find(a=>/idle/i.test(a.name)&&!a.name.includes('[emo]'))||animations.find(a=>!a.name.includes('[emo]')&&!a.name.includes('[sub]'));
      if(animation)this.state.setAnimation(0,animation.name,true);
      if(this.pixel)for(const [track,prefix] of [[1,'[emo]idle'],[2,'[sub]idle']]){const a=animations.find(a=>a.name===prefix+'_'+direction)||animations.find(a=>a.name===prefix);if(a)this.state.setAnimation(track,a.name,true);}
      this.state.apply(skeleton);skeleton.updateWorldTransform();
      const offset=new spine.Vector2(),size=new spine.Vector2();skeleton.getBounds(offset,size,[]);
      this.bounds={x:offset.x,y:offset.y,w:Math.max(1,size.x),h:Math.max(1,size.y)};
      if(!this.pixel)this.bounds=figureBounds(skeleton,this.bounds);
      this.status.hidden=true;this.canvas.dataset.loaded='true';this.canvas.dataset.skin=chosen?.name||'';this.canvas.dataset.asset=descriptor.name;this.canvas.dataset.animation=animation?.name||'';this.fit();
    }catch(e){if(token===this.token&&!this.dead&&e.name!=='AbortError'){this.clear();this.status.hidden=false;this.status.textContent='素材加载失败，点击“重试”重新加载';console.warn('GTWiki media',descriptor.name,e);this.host.dispatchEvent(new CustomEvent('preview-error',{detail:e}));}}
  }
  fit(){
    if(this.dead||!this.renderer)return;
    const dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.round(this.host.clientWidth*dpr)),h=Math.max(1,Math.round(this.host.clientHeight*dpr));
    this.canvas.width=w;this.canvas.height=h;this.gl.viewport(0,0,w,h);
    const camera=this.renderer.camera;camera.viewportWidth=w;camera.viewportHeight=h;camera.position.x=w/2;camera.position.y=h/2;camera.update();
    if(this.skeleton&&this.bounds){
      const b=this.bounds;
      if(this.pixel){const scale=3*dpr;this.skeleton.scaleX=this.skeleton.scaleY=scale;this.skeleton.x=w/2;this.skeleton.y=h*.2;}
      else{
        // Fit the figure once, excluding distant effects. Both layers use the
        // same affine transform around the centre of the portrait viewport.
        const unit=Math.min(w*.92/b.w,h*.9/b.h)*this.zoom;
        this.skeleton.scaleX=this.skeleton.scaleY=unit;
        this.skeleton.x=w/2-(b.x+b.w/2)*unit+this.pan.x*dpr;
        this.skeleton.y=h/2-(b.y+b.h/2)*unit-this.pan.y*dpr;
        this.background.style.transform=`translate(${this.pan.x}px,${this.pan.y}px) scale(${this.zoom})`;
      }
      this.canvas.dataset.unitScale=String(this.skeleton.scaleX/dpr);
      this.canvas.dataset.pan=JSON.stringify(this.pan);
    }
  }
  reset(){this.zoom=1;this.pan={x:0,y:0};this.fit();this.host.dispatchEvent(new CustomEvent('preview-zoom',{detail:1}));}
  tick(now){
    if(this.dead)return;
    this.raf=requestAnimationFrame(this.tick);
    const delta=Math.min(.05,(now-this.last)/1000);this.last=now;
    if(document.hidden||!this.visible||!this.skeleton)return;
    if(!this.paused)this.state.update(delta);
    this.state.apply(this.skeleton);this.skeleton.updateWorldTransform();
    this.gl.clearColor(0,0,0,0);this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.renderer.begin();this.renderer.drawSkeleton(this.skeleton,true);this.renderer.end();
  }
  clear(){this.skeleton=null;this.state=null;this.bounds=null;this.layout=null;this.background.hidden=true;this.background.removeAttribute('src');this.decoded?.dispose();this.decoded=null;delete this.canvas.dataset.loaded;if(this.gl)this.gl.clear(this.gl.COLOR_BUFFER_BIT);}
  dispose(){if(this.dead)return;this.dead=true;this.token++;this.abort?.abort();cancelAnimationFrame(this.raf);this.resize.disconnect();this.visibility.disconnect();this.clear();this.renderer?.dispose();this.gl?.getExtension('WEBGL_lose_context')?.loseContext();}
}

function figureBounds(skeleton,fallback){
  const candidates=[];
  for(const slot of skeleton.slots){
    const a=slot.attachment;if(!a||slot.color.a<.25||slot.data.blendMode!==spine.BlendMode.Normal)continue;
    let names=a.name+' '+slot.data.name;for(let b=slot.bone;b;b=b.parent)names+=' '+b.data.name;
    if(/(?:^|[\s_/])(fx|effect|particle|glow|spark|smoke|flare|light|shine|magic|aura)(?:[\s_\d/]|$)/i.test(names))continue;
    const vertices=[];
    if(a instanceof spine.RegionAttachment){a.computeWorldVertices(slot.bone,vertices,0,2);}
    else if(a instanceof spine.MeshAttachment){a.computeWorldVertices(slot,0,a.worldVerticesLength,vertices,0,2);}
    else continue;
    const xs=vertices.filter((_,i)=>i%2===0),ys=vertices.filter((_,i)=>i%2===1);
    candidates.push({x:Math.min(...xs),y:Math.min(...ys),right:Math.max(...xs),top:Math.max(...ys),body:/head|face|hair|body|torso|pelvis|leg|foot|skirt|coat|cloak|arm|hand|neck|helm|muffler/i.test(a.name)});
  }
  const body=candidates.filter(c=>c.body),chosen=body.length>=3?body:candidates;
  if(!chosen.length)return fallback;
  const x=Math.min(...chosen.map(c=>c.x)),y=Math.min(...chosen.map(c=>c.y)),right=Math.max(...chosen.map(c=>c.right)),top=Math.max(...chosen.map(c=>c.top));
  return {x,y,w:Math.max(1,right-x),h:Math.max(1,top-y)};
}
