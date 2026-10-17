import {inside} from '../../progress.js';
// StageProgress.GetCustomData<bool>(1,false), not User.GetCustomData.
const shown='native-custom-data:1';
export class SealedKingdomController{
 constructor(game){this.game=game;}
 async prepare(){
  const g=this.game;
  // Registered creation callback 73828ac: preserve the original prefab's local
  // hierarchy, rotations, particles and materials; only set its world position.
  this.theatre=g.runtime.spawnWorldEffect('bg_sealedkingdom',[50.70000076293945,0,59.5],{clock:()=>g.clock});
  if(!this.theatre)throw Error('缺少原生眺望王国剧场资源');
 }
 nextScene(){const g=this.game;return !g.has(shown)&&inside(g.state.position,g.stage.regions.sealed_kingdom)?'sealed_kingdom':null;}
 beforeScene(key){
  if(key!=='sealed_kingdom')return;
  const g=this.game;
  // Native commits key 1 before PlayScene, including an interrupted performance.
  g.hudVisible=false;g.flag(shown);g.save();g.music='bgm_sealed_castle';
 }
 afterScene(key){if(key==='sealed_kingdom'){this.game.hudVisible=true;this.game.music=this.game.stage.music.field;}}
 dispose(){this.theatre?.dispose();this.theatre=null;}
}
