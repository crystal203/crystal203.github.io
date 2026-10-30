// Raw native screen shaders expect straight scene RGB. The WebGL preview stores
// premultiplied RGB in its transparent framebuffer, so decode that input before
// running the unchanged native fragment and encode its output once afterward.
const escapeRegExp=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

export function nativeScreenFragment(material){
 const grab=material.grabUniform||'_GrabTexture';
 if(!/^_[A-Za-z][A-Za-z0-9_]*$/.test(grab))throw Error('Invalid native grab texture uniform');
 if(!material.fragmentSource||!/^\s*void\s+main\s*\(/m.test(material.fragmentSource))throw Error('Missing native screen fragment main');
 // PP_CABWDB writes alpha=1 because its game camera renders an opaque scene.
 // A transparent preview must retain the input coverage instead of creating a
 // rectangle of new coverage. This adapts canvas composition, not source RGB.
 const framebufferCoverage=material.screenOutputAlpha==='framebuffer'||material.shader==='Effect/Screen/PP_CABWDB';
 const sampling=new RegExp('texture2D\\(\\s*'+escapeRegExp(grab)+'\\s*,','g');
 const source=material.fragmentSource.replace(sampling,'gtNativeGrabStraight(').replace(/\bvoid\s+main\s*\(\s*\)/,'void gtNativeScreenMain()');
 const samplingHelper=`
vec4 gtNativeGrabStraight(vec2 sampleUv){
 vec4 sampleColor=texture2D(${grab},sampleUv);
 sampleColor.rgb=sampleColor.a>0.0?sampleColor.rgb/sampleColor.a:vec3(0.0);
 return sampleColor;
}
`;
 // Define the helper after the native uniform declarations, immediately before
 // the renamed entry point. Native returns continue to exit only that function.
 const fragment=source.replace('void gtNativeScreenMain()',samplingHelper+'void gtNativeScreenMain()');
 const encodeRgb=!material.premultiplied||framebufferCoverage;
 return `uniform vec4 nativeCustom1;uniform vec4 nativeCustom2;varying vec4 vColor;varying vec2 nativeRawUv;varying vec4 nativeScreenPos;
#define vs_TEXCOORD${material.screenPositionSlot===1?2:1} nativeCustom1
#define vs_TEXCOORD${material.screenPositionSlot||2} nativeScreenPos
#define vs_TEXCOORD3 vec4(nativeRawUv,0.0,0.0)
#define vs_TEXCOORD4 nativeCustom2
#define vs_COLOR0 vColor
${fragment}
void main(){
 gtNativeScreenMain();
 ${framebufferCoverage?`gl_FragColor.a=texture2D(${grab},nativeScreenPos.xy/nativeScreenPos.w).a;`:''}
 gl_FragColor.a=clamp(gl_FragColor.a,0.0,1.0);
 ${encodeRgb?'gl_FragColor.rgb*=gl_FragColor.a;':''}
}
`;
}
