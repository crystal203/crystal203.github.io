const decoderURL=new URL('./decoder.js',import.meta.url);decoderURL.search=new URL(import.meta.url).search;
const decoder=import(decoderURL.href);
self.onmessage=async({data})=>{try{const {decodeMap}=await decoder;self.postMessage({id:data.id,map:await decodeMap(data.buffer,data.name)});}catch(error){self.postMessage({id:data.id,error:error.message});}};
