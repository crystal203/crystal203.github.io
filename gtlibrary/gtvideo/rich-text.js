const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:'\u00a0'};
const decode=text=>text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(all,value)=>{if(value[0]!=='#')return entities[value.toLowerCase()]||all;const code=parseInt(value.slice(value[1].toLowerCase()==='x'?2:1),value[1].toLowerCase()==='x'?16:10);return code>=0&&code<=0x10ffff?String.fromCodePoint(code):all;});
const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter(undefined,{granularity:'grapheme'}):null;
export const textGlyphs=text=>segmenter?[...segmenter.segment(text)].map(part=>part.segment):Array.from(text);
const color=value=>/^(?:#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8}|[a-z]+)$/i.test(value)?value:null;
export function parseRichText(value,{bold=false}={}){
 const source=String(value??'').replace(/\$name\b/g,'骑士'),base={bold,italic:false,underline:false,strike:false,color:'#312525',size:1},stack=[{tag:'',style:base}],runs=[];
 const append=text=>{if(!text)return;const style=stack.at(-1).style,last=runs.at(-1),decoded=decode(text);if(last?.style===style)last.text+=decoded;else runs.push({text:decoded,style});};let at=0;const tags=/<([^<>]*)>/g;let match;
 while((match=tags.exec(source))){append(source.slice(at,match.index));at=tags.lastIndex;const token=match[1].trim();if(/^br\s*\/?$/i.test(token)){append('\n');continue;}const closing=token.match(/^\/(b|i|u|s|strike|color|size)$/i);if(closing){const name=closing[1].toLowerCase().replace('strike','s');for(let i=stack.length-1;i>0;i--)if(stack[i].tag===name){stack.length=i;break;}continue;}
  const open=token.match(/^(b|i|u|s|strike|color|size)(?:\s*=\s*["']?([^"']+?)["']?)?$/i),hex=token.match(/^(#[\da-f]{3,8})$/i);if(!open&&!hex)continue;const tag=hex?'color':open[1].toLowerCase().replace('strike','s'),argument=hex?hex[1]:open[2]?.trim(),style={...stack.at(-1).style};
  if(['b','i','u','s'].includes(tag))style[({b:'bold',i:'italic',u:'underline',s:'strike'})[tag]]=true;
  if(tag==='color'){const value=color(argument||'');if(!value)continue;style.color=value;}
  if(tag==='size'){const amount=parseFloat(argument);if(!Number.isFinite(amount)||amount<=0)continue;style.size=Math.max(.4,Math.min(4,argument.endsWith('%')?style.size*amount/100:amount/18));}
  stack.push({tag,style});
 }
 append(source.slice(at));return runs;
}
export const plainRichText=value=>parseRichText(value).map(run=>run.text).join('');
export const richFont=(style,font)=>`${style.italic?'italic ':''}${style.bold?'bold ':''}${font*style.size}px GTDialogue, sans-serif`;
export function layoutRichText(ctx,runs,{font=18,width=300}={}){
 const lines=[];let line={runs:[],width:0,height:font*1.4,font};
 const finish=()=>{lines.push(line);line={runs:[],width:0,height:font*1.4,font};};
 for(const run of runs)for(const glyph of textGlyphs(run.text)){
  if(glyph==='\r')continue;if(glyph==='\n'){finish();continue;}ctx.font=richFont(run.style,font);let last=line.runs.at(-1),same=last?.style===run.style,extent=ctx.measureText((same?last.text:'')+glyph).width,advance=extent-(same?last.width:0);
  if(line.width&&line.width+advance>width){finish();last=null;same=false;extent=ctx.measureText(glyph).width;advance=extent;}
  if(same){last.text+=glyph;last.width=extent;last.count++;}else line.runs.push({text:glyph,style:run.style,x:line.width,width:extent,count:1});line.width+=advance;line.font=Math.max(line.font,font*run.style.size);line.height=Math.max(line.height,font*run.style.size*1.4);
 }
 finish();return {lines,width:Math.max(0,...lines.map(line=>line.width)),height:lines.reduce((sum,line)=>sum+line.height,0),count:lines.reduce((sum,line)=>sum+line.runs.reduce((sum,run)=>sum+run.count,0),0)};
}
export function drawRichText(ctx,layout,x,y,{font=18,remaining=Infinity}={}){
 ctx.textBaseline='alphabetic';for(const line of layout.lines){const baseline=y+line.font;for(const run of line.runs){const count=Math.max(0,Math.min(remaining,run.count));remaining-=run.count;if(!count)continue;const text=count===run.count?run.text:textGlyphs(run.text).slice(0,count).join('');ctx.font=richFont(run.style,font);ctx.fillStyle=run.style.color;ctx.fillText(text,x+run.x,baseline);if(run.style.underline||run.style.strike){const width=ctx.measureText(text).width,size=font*run.style.size;ctx.strokeStyle=run.style.color;ctx.lineWidth=Math.max(1,size/16);ctx.beginPath();if(run.style.underline){ctx.moveTo(x+run.x,baseline+size*.12);ctx.lineTo(x+run.x+width,baseline+size*.12);}if(run.style.strike){ctx.moveTo(x+run.x,baseline-size*.32);ctx.lineTo(x+run.x+width,baseline-size*.32);}ctx.stroke();}}y+=line.height;}return remaining;
}
