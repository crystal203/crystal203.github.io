import {GIFEncoder,quantize,applyPalette} from '../vendor/gifenc.esm.js';
import {nearestResize} from './gif-sizing.js';
let encoder,options;
self.onmessage=event=>{
  const m=event.data;
  try{
    if(m.type==='start'){options=m;encoder=GIFEncoder();self.postMessage({type:'ready'});}
    if(m.type==='frame'){
      const rgba=nearestResize(new Uint8Array(m.rgba),options.sourceWidth||options.width,options.sourceHeight||options.height,options.width,options.height),transparent=options.transparent;
      let palette=quantize(rgba,transparent?255:256,{format:'rgb565'});
      const indexed=applyPalette(rgba,palette,'rgb565');
      if(transparent){
        palette=[[0,0,0],...palette];
        for(let i=0;i<indexed.length;i++)indexed[i]=rgba[i*4+3]<options.threshold?0:indexed[i]+1;
      }
      encoder.writeFrame(indexed,options.width,options.height,{palette,delay:m.delay,repeat:0,transparent,transparentIndex:0,dispose:2});
      self.postMessage({type:'frame',index:m.index});
    }
    if(m.type==='finish'){encoder.finish();const bytes=encoder.bytes();self.postMessage({type:'done',bytes:bytes.buffer},[bytes.buffer]);encoder=null;}
  }catch(e){self.postMessage({type:'error',message:e.message});}
};
