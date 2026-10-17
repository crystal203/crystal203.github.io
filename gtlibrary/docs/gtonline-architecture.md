# GTOnline 架构与多关卡扩展边界

GTOnline 现在按“通用游戏服务 + 关卡模块 + 原生 manifest”组织。1-1 可玩；1-2 仍是明确标注的地图预览，完整原生剧情尚未完成。接入更多关卡不能把其专用剧情继续堆进公共引擎。

## 调用链

```text
apps/online/app.js
  ├─ gtonline/assets/catalog.json → stages/registry.js
  │   ├─ stage-1-1.json + stages/inn.js → InnGame
  │   └─ stage-1-2.json + stages/forest-entrance.js → ForestEntranceGame（preview）
  └─ OnlineGame 通用服务
      ├─ gtmap/core.js / collision.js / event-player.js
      ├─ progress.js / loadout.js / native-party.js
      ├─ NativeStageUI / NativeFieldUI / StageMiniMap
      └─ StageAudio → gtaudio
```

| 模块 | 责任 |
| --- | --- |
| `apps/online/app.js` | 选关、启动携带配置、继续/暂停/退出、输入和 HUD；拥有 runtime/game/audio/UI 生命周期 |
| `stages/registry.js` | 白名单模块注册、延迟 import、manifest 校验和宝物统计；不判断任务条件 |
| `gtonline/game.js` | actor/world 绑定、通用移动、物件交互、战斗服务、演出调度、保存和资源释放 |
| `stages/inn.js` | 1-1 罗兰茵、三人组、巨龙、追逐、陷阱、绳索及其演出挂钩 |
| `stages/inn-progress.js` | 1-1 触发条件与旧剧情版本迁移 |
| `stages/forest-entrance.js` | 1-2 控制器适配的入口；目前仅预览，拒绝未实现的教学宝箱和关卡通关 |
| `stages/forest-entrance/butterfly-guide.js` | 蝴蝶原生瞬态触发锁、初始化和实际起点的路线时长；由关卡入口组合，不依赖公共引擎中的关卡判断 |
| `progress.js` | 按关卡隔离的 schema/坐标/世界状态验证与通用恢复；不推断专属剧情角色加入 |
| `loadout.js` | 可带入道具白名单、去重和能力查询；不伪造收集或剧情进度 |
| `assets/stage-*.json` | 原生地图、演员、物件、条件数据、时间轴、公式、来源哈希与未决项 |
| `gtmap/*` | 共享渲染、碰撞、Spine、动作与可逆时间轴；不直接提交任务 flag |
| `gtaudio/*` | 共用目录、解码缓存、SoundHandle 和播放/释放；不反向依赖关卡 |

## 关卡扩展契约

关卡类继承 OnlineGame，覆盖有限的生命周期和规则入口：`migrateProgress`、`prepareStage`、`enterStage`、`updateStage/updateStory`、`nextScene`、`beforeScene/afterScene/afterBackgroundScene`、`beforeBattle/afterBattle/battleSpec/battleTriggers`、`canInteract/canExit`、`handleStageAction`、`quest/questMarkers/stageSnapshot`、`disposeStage`。默认实现不含关卡 ID 或角色专用分支；未知 gameAction 抛错。新增挂钩必须说明其复用价值，避免为单条剧情无限扩大公共接口。

时间轴 plan 从 manifest 复制，交给 MapEventPlayer；动态 anchor 与路径可在关卡模块适配。普通剧情锁输入，`blocking:false` 演出与玩家并发。场景开始 flag 的历史策略由 `onSceneStarted` 显式覆盖：1-1 保持旧行为；1-2 不把未播放完的后台演出提前视为完成。

通用服务只接收原生行为类型、对象数据或关卡挂钩的结果。不用公共引擎里的 `stage.id` 判断来实现新关卡，不让共享渲染或音频层认识罗兰茵、白兽或教学剧情。原生 C# 控制器的瞬态字段、持久任务状态、条件 AND/OR 和回调顺序应在对应关卡模块恢复，不能仅把所有事件 JSON 连续播放。

## 存档、携带与生命周期

存档键为 `gtonline.<stage.id>.v<saveSchema>`。旧 1-1 键仍是 `gtonline.1-1.v1`；恢复同时验证 schema、map、可选 stageId 和数值字段，然后由关卡模块迁移专属剧情版本。无 storyVersion 的旧 1-1 存档仍需迁移，不能由通用 fresh 状态提前填入当前剧情版本而跳过。

开局携带的 `loadout` 单独保存，鼹鼠拳套 30017 通过能力查询赋予 `gloves`。它不等于已经打开原生宝箱，也不增加 collected 或故事 flag。继续冒险使用存档配置，新冒险使用选关页配置；各关卡互不继承。

`applyWorld` 将可保存进度投影到可见性、碰撞和机关状态；音效/动画副作用只在状态转换时触发。存档不序列化 WebGL 对象、AudioNode、promise 或临时人物引用。runtime/application 销毁所创建的资源；关卡模块清理自己创建的服务。离开 iframe 通过 GTBridge.dispose，异步加载取消或忽略旧结果。

## 原生证据与验收

地图和网页资源经 GTResources/GTDelivery 按需读取。原生解析器、反汇编、编译器和证据账本只参与离线构建。先恢复控制器状态/条件/回调图，再编译场景与分支；未知行为必须列入 pending 或令构建失败，禁止静默忽略。

1-2 的生成命令、实际调查范围和未完成列表见 [1-2 接入记录](native-online-stage-1-2.md)。复用 [剧情复刻流程](native-story-workflow.md) 和 [资料工作台](native-workbench.md)，新增关卡先生成来源明确的 manifest 和账本，再实现缺失规则，最后做关键分支、重进与逐帧对照。

当前寻路 tie-break、随机序列、部分 UI 字体度量和完整音频 DSP 等仍未认证原版等价。测试和账本不能替代原生运行验收；1-1 与 1-2 均不得凭静态检查宣称“0 差别”。
