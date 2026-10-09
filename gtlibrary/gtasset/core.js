(function(global){
      function parseAtlasPages(text) {
        var lines = text.split(/\r?\n/);
        var pages = [];
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          var trimmed = line.trim();
          if (!trimmed || /^\s/.test(line) || !/\.png$/i.test(trimmed)) continue;
          for (var j = i + 1; j < Math.min(i + 4, lines.length); j++) {
            var next = lines[j].trim();
            if (!next) continue;
            if (next.indexOf("size:") === 0) pages.push(trimmed);
            break;
          }
        }
        return pages;
      }

  function parse({spine,atlasText,bytes,images,createTexture}){
    const textures=images.map(createTexture);let page=0;
    try{
      const atlas=new spine.TextureAtlas(atlasText,()=>textures[page++ % textures.length]);
      const data=new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(new Uint8Array(bytes));
      return {atlas,data,dispose:()=>textures.forEach(t=>t.dispose())};
    }catch(error){textures.forEach(t=>t.dispose());throw error;}
  }
  function createInstance(spine,data){const skeleton=new spine.Skeleton(data);skeleton.setToSetupPose();skeleton.updateWorldTransform();return skeleton;}
  global.GTSpineCore={pages:parseAtlasPages,parse,createInstance};
})(globalThis);
