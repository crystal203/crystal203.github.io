import * as THREE from '../vendor/three.module.js';
// Unity BlendMode values. Source factors are evaluated in the shader once;
// the framebuffer receives premultiplied RGB and independent coverage alpha.
export function materialBlend(material){
 const pair=material.nativeBlend;
 if(!pair)return {additive:material.blend==='add',opaque:material.blend==='opaque',source:material.premultiplied?1:5,destination:material.blend==='add'?THREE.OneFactor:THREE.OneMinusSrcAlphaFactor};
 const [source,destination]=pair,opaque=source===1&&destination===0;
 if(!opaque&&(![1,2,3,5].includes(source)||![1,6,10].includes(destination)))throw Error('不支持的原生材质混合：'+material.name+' '+pair);
 return {additive:destination===1,opaque,source,hardwareSource:source===2?THREE.DstColorFactor:THREE.OneFactor,destination:destination===1?THREE.OneFactor:destination===6?THREE.OneMinusSrcColorFactor:THREE.OneMinusSrcAlphaFactor};
}

// APK GLES mask fragments multiply both RGBA channels by 2, or by 4 for
// the two-texture variants (including Blend and Shear). Saved defaults do not
// identify the shader operation and cannot override it.
export function materialColorGain(mat,atlas=false){
 if(/^Effect\/Mask_(?:Additive|Alphablend)_/.test(mat.shader||''))return mat.shader.includes('2Tex')?4:2;
 return mat.colorGain??(atlas?1:2);
}
