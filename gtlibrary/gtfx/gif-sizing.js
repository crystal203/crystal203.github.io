export function outputSize(plan,scale=1){
  if(!Number.isFinite(scale)||scale<.25||scale>8)throw new Error('倍率范围为 0.25–8');
  const width=Math.max(1,Math.round(plan.width*scale)),height=Math.max(1,Math.round(plan.height*scale));
  if(width>65535||height>65535||width*height>16777216)throw new Error('导出尺寸过大，请降低倍率');
  return {width,height,sourceWidth:plan.width,sourceHeight:plan.height};
}
export function nearestResize(rgba,sourceWidth,sourceHeight,width,height){
  if(rgba.length!==sourceWidth*sourceHeight*4)throw new Error('帧尺寸不匹配');
  if(sourceWidth===width&&sourceHeight===height)return rgba;
  const result=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++){
    const sy=Math.min(sourceHeight-1,Math.floor(y*sourceHeight/height));
    for(let x=0;x<width;x++){
      const sx=Math.min(sourceWidth-1,Math.floor(x*sourceWidth/width)),source=(sy*sourceWidth+sx)*4,target=(y*width+x)*4;
      result[target]=rgba[source];result[target+1]=rgba[source+1];result[target+2]=rgba[source+2];result[target+3]=rgba[source+3];
    }
  }
  return result;
}
