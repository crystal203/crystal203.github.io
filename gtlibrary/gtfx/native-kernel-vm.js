// Bounded arithmetic interpreter for extracted Unity particle kernels.
// No host syscalls, dynamic code generation, pointers to browser memory, or
// general ARM program loading. Unsupported instructions fail explicitly.
const f32=Math.fround;
const scratch=new ArrayBuffer(4), sf=new Float32Array(scratch), su=new Uint32Array(scratch);
const bits=x=>{sf[0]=x;return su[0];}, float=x=>{su[0]=x;return sf[0];};
function estimate(x,sqrt=false){
  if(!Number.isFinite(x)||x===0||x<0&&sqrt)return sqrt?1/Math.sqrt(x):1/x;
  const b=bits(x),exponent=(b>>>23)&255,frac=b&0x7fffff;
  if(!exponent)return sqrt?f32(1/Math.sqrt(x)):f32(1/x);
  let resultExponent,result;
  if(sqrt){
    const scaled=exponent&1?128+(frac>>>16):256+(frac>>>15);
    const midpoint=scaled<256?2*scaled+1:4*Math.floor(scaled/2)+2;
    result=Math.floor(Math.ceil(Math.sqrt(268435456/midpoint))/2);
    resultExponent=Math.floor((380-exponent)/2);
  }else{
    result=Math.floor((Math.floor(524288/(2*(256+(frac>>>15))+1))+1)/2);
    resultExponent=253-exponent;
  }
  return float((sqrt?0:b&0x80000000)|(resultExponent<<23)|((result&255)<<15));
}
function operand(s){
  if(s.startsWith('[')){
    const m=s.match(/^\[([^\]]+)\](!)?$/),parts=m[1].split(',').map(x=>x.trim());
    return {mem:true,base:operand(parts[0]),offset:parts[1]?operand(parts[1]):{imm:0},pre:!!m[2]};
  }
  if(s[0]==='#')return {imm:s.includes('ffffffff')?Number(BigInt(s.slice(1))&0xffffffffn):s.startsWith('#-0x')?-Number(s.slice(2)):Number(s.slice(1))};
  if(s==='sp')return {g:31};
  if(s==='xzr'||s==='wzr')return {imm:0};
  if(s==='lr')return {g:30};
  const g=s.match(/^([xw])(\d+)$/);if(g)return {g:+g[2],w:g[1]==='w'};
  const v=s.match(/^v(\d+)\.(\d+)?([bhsd])(?:\[(\d+)\])?$/);
  if(v)return {v:+v[1],count:v[2]?+v[2]:1,width:({b:1,h:2,s:4,d:8})[v[3]],lane:+(v[4]||0),element:v[4]!==undefined};
  const q=s.match(/^([qds])(\d+)$/);if(q)return {v:+q[2],count:q[1]==='q'?4:1,width:q[1]==='d'?8:4,lane:0,scalar:q[1]!=='q'};
  const shift=s.match(/^(lsl|msl) #(.+)$/);if(shift)return {shift:shift[1],amount:Number(shift[2])};
  return {condition:s};
}
export function compileKernel(kernel){
  return {address:kernel.address,code:kernel.code.map(([op,args])=>[op,...args.split(/,\s*(?![^\[]*\])/).filter(Boolean).map(operand)])};
}
export class NativeKernelVM {
  constructor(constants={}){
    this.memory=new ArrayBuffer(0x20000);this.view=new DataView(this.memory);this.bytes=new Uint8Array(this.memory);
    this.constants=Object.entries(constants).map(([address,data])=>({address:+address,data:Uint8Array.from(data)}));
    this.g=new Float64Array(32);this.v=Array.from({length:32},()=>new DataView(new ArrayBuffer(16)));
    this.flags=0;this.g[31]=0x1f000;
  }
  num(o){return o.imm??(o.w?this.g[o.g]>>>0:this.g[o.g]);}
  set(o,n){if(o.g!==undefined)this.g[o.g]=o.w?n>>>0:n;}
  lanes(o,fp=false){
    if(o.v===undefined)return [this.num(o)];
    const d=this.v[o.v],width=o.width,fn=fp?(width===8?'getFloat64':'getFloat32'):(width===8?'getBigUint64':width===1?'getUint8':width===2?'getUint16':'getUint32');
    return Array.from({length:o.count},(_,i)=>{const n=d[fn]((o.lane+i)*width,true);return typeof n==='bigint'?n:n;});
  }
  put(o,values,fp=false){
    const d=this.v[o.v];if(o.scalar)for(let i=0;i<16;i++)d.setUint8(i,0);
    const width=o.width,fn=fp?(width===8?'setFloat64':'setFloat32'):(width===8?'setBigUint64':width===1?'setUint8':width===2?'setUint16':'setUint32');
    for(let i=0;i<o.count;i++)d[fn]((o.lane+i)*width,width===8&&!fp?BigInt.asUintN(64,BigInt(values[i%values.length])):Number(values[i%values.length]),true);
  }
  words(o){if(o.v===undefined)return Array(4).fill(this.num(o));return Array.from({length:4},(_,i)=>this.v[o.v].getUint32(i*4,true));}
  putWords(o,values){for(let i=0;i<4;i++)this.v[o.v].setUint32(i*4,values[i],true);}
  read(address,length){
    if(address>=0&&address+length<=this.bytes.length)return this.bytes.slice(address,address+length);
    const page=this.constants.find(p=>address>=p.address&&address+length<=p.address+p.data.length);
    if(!page)throw Error('Native kernel read outside mapped data: '+address.toString(16));
    return page.data.slice(address-page.address,address-page.address+length);
  }
  write(address,data){if(address<0||address+data.length>this.bytes.length)throw Error('Native kernel write outside arena');this.bytes.set(data,address);}
  address(o){return this.num(o.base)+this.num(o.offset);}
  condition(c){const n=this.flags;return ({eq:n===0,ne:n!==0,gt:n>0,ge:n>=0,lt:n<0,le:n<=0,hi:n>0,hs:n>=0,lo:n<0,ls:n<=0,mi:n<0})[c];}
  run(kernel,hook,stopAt=0){
    let pc=0,steps=0;const code=kernel.code;
    const jump=o=>(this.num(o)-kernel.address)/4;
    while(pc>=0&&pc<code.length){
      if(kernel.address+pc*4===stopAt)return;
      if(++steps>2000000)throw Error('Native kernel instruction limit');
      const [op,d,a,b,c]=code[pc++];
      if(op==='ret')return;
      if(op==='b'){pc=jump(d);continue;}
      if(op.startsWith('b.')){if(this.condition(op.slice(2)))pc=jump(d);continue;}
      if(op==='cbz'||op==='cbnz'){if((this.num(d)===0)===(op==='cbz'))pc=jump(a);continue;}
      if(op==='bl'){if(!hook?.(this.num(d),this))throw Error('Unsupported native kernel call '+this.num(d).toString(16));continue;}
      if(op==='blr')throw Error('Native shape textures require a separate texture sampler');
      if(op==='cmp'||op==='fcmp'){this.flags=op==='cmp'?this.num(d)-this.num(a):this.lanes(d,true)[0]-this.lanes(a,true)[0];continue;}
      if(op==='adrp'){this.set(d,this.num(a));continue;}
      if(op==='csinc'){this.set(d,this.condition(c.condition)?this.num(a):this.num(b)+1);continue;}
      if(op==='fcsel'){this.put(d,this.lanes(this.condition(c.condition)?a:b,true),true);continue;}
      if(op==='fcvt'||op==='fcvtl'){this.put(d,this.lanes(a,true),true);continue;}
      if(op==='ext'){
        const length=d.width*d.count,joined=new Uint8Array(length*2);
        joined.set(new Uint8Array(this.v[a.v].buffer,0,length));joined.set(new Uint8Array(this.v[b.v].buffer,0,length),length);
        new Uint8Array(this.v[d.v].buffer).set(joined.slice(c.imm,c.imm+length));continue;
      }
      if(op==='zip1'||op==='zip2'){
        const x=this.lanes(a),y=this.lanes(b),start=op==='zip2'?a.count/2:0,values=[];
        for(let i=start;i<start+a.count/2;i++)values.push(x[i],y[i]);
        this.put(d,values);continue;
      }
      if(['ldp','stp','ldr','ldur','ldrb','str','strb'].includes(op)){
        const pair=op.endsWith('p'),mem=pair?b:a,post=pair?c:b;
        let addr=this.address(mem);if(mem.pre)this.set(mem.base,addr);
        const regs=pair?[d,a]:[d],load=op.startsWith('ld');
        for(const r of regs){
          const size=op.endsWith('b')?1:r.v!==undefined?r.width*r.count:r.w?4:8;
          if(load){
            const data=this.read(addr,size);
            if(r.v!==undefined){if(r.scalar)new Uint8Array(this.v[r.v].buffer).fill(0);new Uint8Array(this.v[r.v].buffer).set(data);}
            else {const dv=new DataView(data.buffer);this.set(r,size===1?dv.getUint8(0):size===4?dv.getUint32(0,true):Number(dv.getBigUint64(0,true)));}
          }else if(r.v!==undefined)this.write(addr,new Uint8Array(this.v[r.v].buffer,0,size));
          else {const data=new DataView(new ArrayBuffer(size)),n=this.num(r);if(size===1)data.setUint8(0,n);else if(size===4)data.setUint32(0,n,true);else data.setBigUint64(0,BigInt(n),true);this.write(addr,new Uint8Array(data.buffer));}
          addr+=size;
        }
        if(post)this.set(mem.base,this.num(mem.base)+this.num(post));continue;
      }
      if(op==='mov'||op==='fmov'||op==='dup'||op==='movi'||op==='mvni'||op==='movk'){
        if(d.g!==undefined){
          let n=a.v!==undefined?this.lanes(a)[0]:this.num(a);
          if(op==='movk'){const shift=b?.amount||0,mask=0xffff<<shift;n=(this.num(d)&~mask)|((Number(n)<<shift)&mask);}
          this.set(d,Number(n));continue;
        }
        if(op==='fmov'&&a.imm!==undefined){this.put(d,[a.imm],true);continue;}
        let values=this.lanes(a);
        if(b?.shift)values=values.map(n=>b.shift==='msl'?(Number(n)<<b.amount)|((1<<b.amount)-1):Number(n)<<b.amount);
        if(op==='mvni')values=values.map(n=>~Number(n));
        this.put(d,values);continue;
      }
      if(d.g!==undefined){
        const x=this.num(a),y=b?this.num(b):0;
        let n;if(op==='add'||op==='adds')n=x+y;else if(op==='sub'||op==='subs')n=x-y;
        else if(op==='and')n=x&y;else if(op==='lsl')n=x*2**y;else throw Error('Unsupported scalar kernel op '+op);
        this.set(d,n);if(op.endsWith('s'))this.flags=n;continue;
      }
      if(['and','orr','eor','bif','bit','bsl'].includes(op)){
        const old=this.words(d),x=a.imm!==undefined?old:this.words(a),y=a.imm!==undefined?Array(4).fill(a.imm<<(b?.amount||0)):this.words(b);
        this.putWords(d,x.map((n,i)=>op==='and'?n&y[i]:op==='orr'?n|y[i]:op==='eor'?n^y[i]:op==='bif'?(old[i]&y[i])|(n&~y[i]):op==='bit'?(old[i]&~y[i])|(n&y[i]):(n&old[i])|(y[i]&~old[i])));continue;
      }
      const fp=op[0]==='f'&&op!=='fcvtzs',x=this.lanes(a,fp),y=b?this.lanes(b,fp):[0];
      const values=Array.from({length:d.count},(_,i)=>{
        const l=Number(x[i%x.length]),r=Number(y[i%y.length]);
        switch(op){
          case 'add':return (l+r)>>>0;case 'sub':return (l-r)>>>0;
          case 'fmul':return l*r;case 'fadd':return l+r;case 'fsub':return l-r;case 'fdiv':return l/r;
          case 'fabs':return Math.abs(l);case 'fabd':return Math.abs(l-r);case 'fsqrt':return Math.sqrt(l);case 'fmax':return Math.max(l,r);case 'fmin':return Math.min(l,r);
          case 'frintm':return Math.floor(l);
          case 'fcmgt':return l>r?0xffffffff:0;case 'fcmge':return l>=r?0xffffffff:0;case 'fcmeq':return l===r?0xffffffff:0;
          case 'frecpe':return estimate(l);case 'frsqrte':return estimate(l,true);
          case 'frecps':return (l===0&&!Number.isFinite(r)||r===0&&!Number.isFinite(l))?2:2-l*r;
          case 'frsqrts':return (l===0&&!Number.isFinite(r)||r===0&&!Number.isFinite(l))?1.5:(3-l*r)*.5;
          case 'scvtf':return l|0;case 'ucvtf':return l>>>0;
          case 'fcvtzs':{const v=this.lanes(a,true)[i%x.length];return Math.max(-2147483648,Math.min(2147483647,Math.trunc(v*2**(b?.imm||0))))||0;}
          case 'shl':return l<<r;case 'sshr':return (l|0)>>r;
          case 'ushl':{const n=(r<<24)>>24;return Math.abs(n)>=32?0:n<0?l>>>-n:l<<n;}
          default:throw Error('Unsupported vector kernel op '+op);
        }
      });
      this.put(d,values,(fp&&!['fcmgt','fcmge','fcmeq'].includes(op))||['scvtf','ucvtf'].includes(op));
    }
    if(kernel.address+pc*4===stopAt)return;
    throw Error('Native kernel escaped its instruction range');
  }
}
