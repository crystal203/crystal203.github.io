# GTOnline 架构与多关卡扩展边界

当前 GTOnline 是建立在 gtmap 渲染核心上的 1-1 可玩适配，尚不是任意关卡配置即可自动运行的通用引擎。1-1 的世界规则、交互和剧情已有大量源数据绑定，仍有明确的单关硬编码。扩展更多关卡应沿现有边界提取共性，避免把各关脚本继续堆进 `game.js`。

## 当前调用链

```text
index.html / library.js
  ├─ apps/audio → gtaudio catalog / HTMLAudioElement
  └─ apps/online/app.js → stage-1-1.json → OnlineGame
                          ├─ gtmap/core.js → 地图/机关/人物/特效
                          ├─ MapCollision → 场景碰撞与走位
                          ├─ MapEventPlayer → 可逆时间轴、对白/选择/移动等待
                          ├─ NativeStageUI / NativeFieldUI → 原生 UI 呈现
                          ├─ native-motion / item-motion → 物理、倒吊与物品公式
                          ├─ progress → flag、采集、存档迁移、触发条件
                          └─ StageAudio → gtaudio AudioMixer / AudioBank
```

| 模块 | 责任及所有者 |
| --- | --- |
| `apps/online/app.js` | 启动/继续/暂停/退出、键盘触屏输入、页面和地图 HUD，持有 runtime/game/audio/UI 生命周期 |
| `gtonline/game.js` | 可玩规则、actor/world 绑定、战斗、互动、场景启动及 gameActions，拥有进度状态和游戏时钟 |
| `gtonline/progress.js` | fresh/restore、收集/flag、nextScene/doorOpen；目前 SAVE_KEY 和若干条件限定 1-1 |
| `gtonline/assets/stage-1-1.json` | 出生点、演员、marker/region、物件/碰撞、场景/分支、原生公式及来源哈希 |
| `gtmap/core.js` | 通用 Three.js 渲染和资源加载，暴露 setWorld*/setActor*/playWorldGimmick/collectWorldItem 等接口 |
| `gtmap/event-player.js` | 通用演出采样、baseline/还原、动作等待、选择/对白暂停、媒体时间轴；不直接提交任务 flag |
| `gtmap/characters.js / character-motion.js` | Spine 轨道、原生动作和位移/震动/举起计算 |
| `gtmap/collision.js` | 静态/动态碰撞、路径搜索及高程移动 |
| `gtonline/native-ui.js / native-field-ui.js` | 原生 prefab/图集/曲线驱动的选择、旁白、通知、引导和物品说明 |
| `gtonline/native-motion.js / item-motion.js` | 1-1 使用的 RopeSway/RopeLift/PhysicsDistance、Drop/Consume 等原生公式 |
| `gtaudio/core.js` | 共享内码/handle 解析、解码缓存、BGM/音效/循环音及释放 |

## 数据流和状态约束

地图数据和网页资源通过 GTResources/GTDelivery 读取；重型资源只在选定关卡或演员时加载。WebGL 材质/纹理、临时演员和音频由创建它们的 runtime/application 销毁，离开 iframe 走 GTBridge.dispose。音频库不反向依赖 gtonline；源码证据和生成器只在离线构建时使用。

OnlineGame 的 `applyWorld` 将可保存进度投影到当前可见性、碰撞和机关状态。副作用必须用“原状态→新状态”触发，不能每次投影重复播放音效/动画。初始化和 still 恢复不应重演交互；本次门音效即在此边界修复。

`scene()` 从关卡 manifest 复制 plan，再解析动态 anchor/route，预热资源，交给 MapEventPlayer。普通剧情锁输入；blocking=false 的追逐与玩家并发。时间轴通过 gameActions 请求游戏级行为，游戏保存世界结果。选择分支 preserve baseline，动作完成等待使用 motion ID；UI 读状态而不额外生成第二套选择逻辑。

存档保留世界结果，不序列化 WebGL 对象、AudioNode、异步 promise 或人物临时引用。恢复必须按关卡版本迁移，并重建世界；不允许仅看通用 version=1 就将不同关卡的 flag 混用。

## 新增关卡前需提取的边界

1. **关卡注册表/入口**：目前 app 直接读取 stage-1-1.json，HUD 总数 26/3/4、标题和返回逻辑含 1-1 假设。新增 stage registry，用 manifest 提供统计/章节/地图/资源版本，路由接收 stage ID。
2. **保存命名空间**：SAVE_KEY 目前固定 gtonline.1-1.v1。按 stage ID + schema 生成键，迁移必须区分剧情 revision；保留已有 1-1 存档兼容。
3. **原生事件适配器**：把 maiden、trio、goblin、gloves 等 handle 专用逻辑移到该关适配模块；通用引擎提供事件、条件和动作注册，不在公共核心按关卡名分支。
4. **条件和世界行为**：收集、火盆、开门、开关、宝箱、npc collider、后台演员准备等按原生行为类型驱动。条件要保留原生 AND/OR、进入半径和保存策略，不能只换触发框位置。
5. **演出编译器**：复用 `tools/gtmap/native-scene-recorder.lua` 与 build-world-native-scenes 的受限 trace；对 native override 使用显式编译适配和证据账本。所有未知调用列入 coverage，禁止静默省略。
6. **UI 与声音契约**：UI 文本/图标/曲线来自原生资源；音频统一使用 gtAudio 内码和 SoundHandleSpec，关卡只描述时点/状态。完整 Unity Mixer DSP 仍是独立待补能力。

这些是后续扩展的具体工作项，本次没有用“通用重构”的名义替换尚未厘清的剧情规则。现有 `tools/native/evidence/stage-1-1-ledger.json` 记录当前 15 个场景及分支、动作和未决项，后续可按同一格式加入其他关卡。

## 最小接入顺序

先定位新关卡原生 stage/map/event/脚本和实际入口，生成版本化 manifest 与 coverage；再确认其所需行为是否已有通用实现。仅为缺失原生行为扩展核心，随后编译所有场景/分支，集中走关键触发链路。最后更新缓存版本、登记证据和提交。详见 [剧情复刻流程](native-story-workflow.md) 与 [资料工作台](native-workbench.md)。

当前寻路 tie-break、随机序列、部分 UI 字体度量和完整音频 DSP 等尚未认证为原版等价。架构文档和静态账本只提高检索/实现效率，不代表已验收 1-1 的“0 差别”。
