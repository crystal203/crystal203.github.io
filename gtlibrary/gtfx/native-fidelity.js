import {nativeShapeSupported} from './native-shapes.js';

// This is a feature/evidence audit, not a visual test or a claim that an
// entire action is bit-identical to a running game.
export function auditEffect(effect){
  const issues=[],add=(code,detail,system)=>issues.push({code,detail,...(system?{system:system.sourceId,name:system.name}:{})});
  for(const s of effect.systems||[]){
    const m=s.modules;
    if(!nativeShapeSupported(m.ShapeModule))add('shape-fallback','发射形状仍走近似路径',s);
    if(s.renderer.mode===1)add('stretched-billboard','拉伸公告板的完整原生顶点构造尚未对齐',s);
    if(m.TrailModule)add('trail-geometry','拖尾已构造；顶点采样和接缝尚未逐值对齐',s);
    if(m.NoiseModule)add('noise-integration','噪声核已对齐；完整噪声作业及坐标变换尚未逐值核实',s);
    if(m.SubModule?.subEmitters?.some(x=>String(x.emitter)!=='0'))add('subemitter-order','子粒子已跟随父粒子发射；全局作业顺序与继承细节尚未完整验证',s);
    if(m.ForceModule?.randomizePerFrame)add('force-frame-history','每帧随机受力需要原始帧步长和粒子存活顺序',s);
    if(m.UVModule?.timeMode)add('uv-clock','贴图动画的非生命周期时钟尚未对齐',s);
    for(const name of ['CollisionModule','TriggerModule','ExternalForcesModule','LightsModule'])if(m[name])add('unsupported-module',name+' 尚未解释',s);
    if(m.CustomDataModule&&!["particleDissolve","particleDissolveTwoPass","screenDistortion"].includes(s.material?.surface))add('custom-stream','自定义顶点流尚未映射到材质',s);
  }
  const scriptGaps={
    ViewportScaleReverter:'ViewportScaleReverter 的视口缩放恢复尚未独立解释',
    SortingLayer:'SortingLayer 的运行时层级设置尚未完整映射',
    UnityObjectPoolProjectileWrapper:'投射物对象池组件的完整生命周期尚未解释',
    HookShot:'HookShot 已通过动作联动构造；组件的所有调用分支尚未核实',
    EffectDirectionSetter:'方向节点已通过动作联动选择；组件的所有调用分支尚未核实'
  };
  const handledScripts=new Set(['CustomAnimator','CustomSprite','RotateThis','ScreenEffectObject','FxUvanim','FxUvanim_frac_Main','FxUvanim_add','FxUvanim_tex2']);
  for(const type of new Set((effect.scripts||[]).filter(s=>s.fields?.m_Enabled!==0).map(s=>s.type))){
    if(type==='StageShadowSetter')add('stage-shadow','场景阴影逻辑未在独立特效预览中执行');
    else if(scriptGaps[type])add('script-lifecycle',scriptGaps[type]);
    else if(!handledScripts.has(type))add('unsupported-script',type+' 尚未解释');
  }
  return {status:'partial-native-parity',particleSystems:effect.systems?.length||0,
    autoSeededSystems:(effect.systems||[]).filter(s=>s.autoRandomSeed!==false).length,
    issues,requirements:['相同资源版本','粒子自动种子的实际状态或逐系统种子','相同发射批次与帧步长','相同发射器、目标轨迹和场景条件'],
    remaining:['自动种子的全局分配顺序尚未从游戏运行时捕获','完整粒子作业及浮点边界尚未全部逐值对齐','技能命中、碰撞和部分动作机制仍有近似']};
}

export function formatFidelity(effects){
  const audits=effects.map(auditEffect),counts=new Map();
  for(const a of audits)for(const issue of a.issues)counts.set(issue.detail,(counts.get(issue.detail)||0)+1);
  const rows=[`原生随机内核已接入；整段技能尚未证明与游戏完全一致。`,
    `自动种子系统：${audits.reduce((n,a)=>n+a.autoSeededSystems,0)}。预览种子不等于游戏当前随机状态。`];
  if(counts.size)rows.push(...[...counts].map(([detail,count])=>`· ${detail}（${count}）`));
  rows.push('复现还需原始帧步长、发射器和目标轨迹。可导出随机状态与发射批次定位差异。');
  return rows.join('\n');
}
