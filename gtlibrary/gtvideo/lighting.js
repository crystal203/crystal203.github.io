export const lightingPresets={
 none:{label:'原始',brightness:1,color:'#ffffff',intensity:0},
 bright:{label:'明亮',brightness:1.35,color:'#fff4d6',intensity:.06},
 dim:{label:'昏暗',brightness:.6,color:'#ffffff',intensity:0},
 night:{label:'夜晚',brightness:.55,color:'#759bdd',intensity:.4},
 warm:{label:'暖光',brightness:1.1,color:'#ffbd72',intensity:.25},
 cool:{label:'冷光',brightness:.95,color:'#78c5ff',intensity:.25},
 custom:{label:'自定',brightness:1,color:'#ffffff',intensity:0}
};
export function sceneLighting(settings){const {label,...values}=lightingPresets[settings?.preset]||lightingPresets.none;return {...values,...settings};}
export class SceneLighting {
 draw(ctx,image,width,height,settings){
  const light=sceneLighting(settings);if(light.brightness===1&&(!light.intensity||light.color==='#ffffff')){ctx.drawImage(image,0,0,width,height);return;}
  this.canvas??=document.createElement('canvas');if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}const target=this.canvas.getContext('2d');target.clearRect(0,0,width,height);target.save();target.filter='brightness('+light.brightness+')';target.drawImage(image,0,0,width,height);target.filter='none';if(light.intensity){target.globalCompositeOperation='multiply';target.globalAlpha=light.intensity;target.fillStyle=light.color;target.fillRect(0,0,width,height);}target.restore();ctx.drawImage(this.canvas,0,0,width,height);
 }
 dispose(){if(this.canvas)this.canvas.width=this.canvas.height=1;this.canvas=null;}
}

export const lightingProperties=['lightBrightness','lightColor','lightIntensity'];
export const colorVector=color=>[1,3,5].map(index=>parseInt(color.slice(index,index+2),16)/255);
export const vectorColor=value=>'#'+value.map(channel=>Math.round(Math.max(0,Math.min(1,channel))*255).toString(16).padStart(2,'0')).join('');
export function lightingValues(settings){const light=sceneLighting(settings);return {lightBrightness:light.brightness,lightColor:colorVector(light.color),lightIntensity:light.intensity};}
export function lightingFromValues(values){return {preset:'custom',brightness:values.lightBrightness,color:vectorColor(values.lightColor),intensity:values.lightIntensity};}
