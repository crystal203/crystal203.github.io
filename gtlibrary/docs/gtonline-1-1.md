# GTOnline · 1-1 旅馆

GTOnline 是资源库顶部的独立工作区。目前可选择 1-1 旅馆，在浏览器中游玩；进度保存在当前浏览器，不依赖服务器账户。代码直接位于 D:/github/gtlibrary。

## 操作

- WASD / 方向键：移动。
- 空格：靠近可交互物时交互，面向允许跳下的边缘时跳下，其余位置按住奔跑；剧情中继续对白。
- J / Z、点击游戏画面或攻击按钮：攻击。按住攻击键或按钮连续攻击。
- 楼梯直接走，楼梯上速度降低到 2.1 格/秒；普通行走 3.5、奔跑 5 格/秒。两处高台楼梯均读取原生坡面。
- M：地图；Esc：暂停。暂停菜单可跳过当前剧情、保存并返回选关。
- E 和 Shift 保留为交互、奔跑的快捷别名。

## 资源与结构

原始关卡表 static_data_dec/stages.json 中 easy_forest_1_1 的 Default Tilemap 为 **alt_forest_1_1_2_2**，不是旧版 newnew_forest_1_1。

- tools/gtmap/build-online-stage.py 从 GTFiles 中的严格 KONG、道具表、人物表、中文文本和 ForestMainNew 事件 JSON 生成 gtonline/assets/stage-1-1.json。保留源地图、事件 JSON 的 SHA256。
- 原图包含 26 枚紫币、3 颗星片、原生人物挂点、火盆条件门、第一战与区域战斗门、拳套宝箱、岩石、洞穴和楼梯传送目标。
- gtmap/load-map.js 直接调用 MapRuntime、assetsForMap 和原生解码器。GTOnline 没有第二套贴图、人物或剧情渲染器。
- gtonline/game.js 管理移动、战斗、收集、交互、进度与触发；gtonline/progress.js 管理可序列化状态和事件顺序。
- gtmap/collision.js 读取原始 floors、mergedWalls、nonUnitSizedWalls，使用脚底圆形碰撞与连续接触、沿墙滑动；战斗门、机关门和可破坏物优先读取所属 tileset 的原生 BoxCollider，随图块朝向旋转；1-1 的火盆、岩石、草丛、箱子、宝箱和门均已取得原始 BoxCollider；缺失下载包时从原 APK 提取，不再按岩石名称猜半径。保留楼梯 floor type 2 和低台 wall type 3。带围栏的 wall type 11 不允许跳下。
- 剧情共用 MapEventPlayer。waitForDialogue 使对白等待点击；finish() 保留场景终态，stop() 仍用于编辑器还原。七段 1-1 事件也可在 GTMap 的“选择片段”中预览。
- 音乐、收集、攻击和封门音效从原始 AudioClip 提取。tools/gtmap/build-online-audio.py 使用已有 UnityPy 和 ffmpeg 生成七个 Ogg 文件，audio/source.json 保留来源与校验值。

## 已修复的开头问题

1. 拖行 move 完成时曾默认切回 idle：开场明确持续 prostrate，直到原剧情苏醒节点，0.1 秒步进检查姿态；真实 Spine 检查 prostrate_side。
2. 攻击名曾不对应真实资源：使用 attack / sword_attack，匹配四个朝向；每次攻击重启动作，支持持续按键。
3. 第一事件区域位于入口门外：首次区域改为小公主与三只哥布林的非阻断追逐，玩家可以继续移动、攻击；剧情时间轴不再接管 leader，也不在结束时重置其位置。追逐和战斗封门分离，脚底完全进入门内之后才启动战斗。其他战斗区域也留出角色半径余量。死亡回到房外时释放活动战斗门，重新入室才能封门。
4. 原生地砖、树桩 BoxCollider 均以整数为中心；修复了之前把格子左下角当作中心造成的半格偏移，墙、地面、楼梯和小地图统一对齐。树桩的原始 BoxCollider 为中心 (0, .5, 0)、尺寸 (1, 1, 1)，可在 tilesets/event_inn 中核验。
5. 原先逐轴整步拒绝造成接触间距变化、斜走卡顿：现在连续求接触位置，并沿接触法线滑动，减少轴向偏差。
6. 高台曾使用通用跳跃近似：已改为原生楼梯坡面自动登台，只有原图允许的低台边缘可以空格跳下，禁止任意上跳和越过围栏。

原 APK 的 base/stage 中 StageCamera 父 Transform 四元数 x=.38268346、w=.92387950，对应绕 X 轴 45°；Camera 为正交相机，orthographic size=4。StageCameraController 默认横纵比 >=1.5 时为4，否则为5；因此 Online 竖直跨度分别8/10，开场 Lua 的 ResizeTo(3,0) 对应跨度6。共用 GTMap 移除了视口第二次乘 sqrt(1/2) 的纵向压缩，保持相机投影宽高比和窗口宽高比一致。

## 验证

- node tools/gtmap/checks/verify-online.mjs：真实地形与传送连通性、两组楼梯、允许/禁止跳下边缘、七段剧情、对白等待与提交、非阻断追逐中的移动/攻击/交接、树桩碰撞对齐、战斗入口及死亡开门、收集去重、拳套、火盆条件、通关和保存。
- node tools/gtmap/checks/verify-event-player.mjs：原有 367 个世界22片段，以及 companion_boy_zone_event 的全部八条分支回归。
- tools/gtmap/checks/online.html：在浏览器加载真实地图与 Spine，检查拖行姿态、四朝向攻击、进房后封门、楼梯和跳下标记。测试使用独立内存存档，不改玩家进度。

## 还原范围与后续

这是可玩的首个关卡实现，**尚不是完整原游戏移植**。源文件中部分控制器只有 C# 方法签名，主线触发条件根据区域、事件 JSON 和机关条件重建；首次追逐按实机反馈补回，追逐路径与时序为重建值，尚未取得 Section2 原生控制器完整代码，不能将现有触发顺序称为精准复刻；战斗数值、敌人 AI、攻击节奏为可玩实现。开场 Lua 按源码转为共用时间轴，原始并发石块效果、部分动作和精确音效时机仍需逐段比对。斜角地形片段的碰撞边缘还需要继续精化。目前出口会结算本关，下一关和独立支线未开放。


## 1-1 机关修正与原生依据

- BoxCollider：固定火盆 x/z 为 .6×.6、可搬火盆 .8×.8、小岩石 1×1、大岩石 2×2（中心 -.5,-.5）；来源原 APK tilesets/gimmick。开启的宝箱保留原模型和实体碰撞。举持和飞行中的物体不再挡住操作者。
- 动画：共用 MapRuntime 按 Animator 原始状态名（on/off/open）切换，实时播放，不用翻译标签匹配，也不再停在末帧或每次刷新重启动画。新增原始临时特效实例与清理功能，复用 MapStates / MapEffects / 原始材质。
- 举持：仅 Oak.Holdable 开放举持，使用 knight_male_4 的 hold（1/6 秒）、hold_loop 和 throw（.5 秒），举持、拳套期间隐藏剑盾，结束恢复。草丛和木箱使用 PotCrashBehaviour 碰撞破碎、PotDamagedBehaviour 受击破碎；静态大岩石没有对应交互组件，不以名称推测可破坏。
- 拳套：仅 SmallRockInteractable 且已经获得 ItemId 30017 才能交互。使用 effects/stage/base 的 FX_glove 原始模型与 .5 秒 Animator，按其钻头收回关键帧 .28333333 秒破碎当前选中小岩石；剑攻击不再触发岩石破碎。这一关键帧是视觉同步依据，尚未确认原控制器命中回调时间。
- 燃烧：读取 CombustibleBehaviour 和 BrazierCombustibleBehaviour，通过近距离接触传火，燃烧物随举持/投掷移动，调用原始 FX_field_fire。木箱明确 BurnLifeTime=2 秒；其他缺省 BurnLifeTime 尚未从原控制器取到，因此当前保留燃烧而不编造销毁时长。保存已移动物体和明确的燃烧剩余时间。隐藏奖励读取 HiddenStarPiece / HiddenPurpleCoin。
- 破碎：原始 break_leaf、break_house_box、FX_Env_SmallRock_lv1_destroy；objectpoolspec 的回收时长分别 1、1、.8 秒。粒子资源的 RotationBySpeedModule 仍未在共用粒子引擎实现，碎片旋转不能声称完全一致。
- 交互：按目标实际碰撞边缘距离筛选，并要求同层、朝向目标；.38 的额外边缘距离和方向容差是目前操作校准值，尚未取得原生交互控制器常量。举持位置、抛物轨迹、传火范围仍需核验原控制器，不能称为原始参数。
- 跳台镜头：下落时跟随插值的地面位置，不等落地才更新，也不把抛物线高度叠加到镜头。

本轮只执行针对性机关逻辑检查与语法检查；浏览器视觉检查未执行（自动审批服务额度限制）。UI 仍未达到原生全套 HUD 的还原程度。


## 当前优先修正：推块、荆棘、比例

- 编译器按 `Oak.UnitPushable` / `Oak.SpikeCrashBehaviour` 判定组件。原图中的2个推块、10个荆棘全部进入 Online，不再只渲染其模型。两种原始 BoxCollider 分别为2×2（中心偏移 .5,-.5）和1×1。
- 推块：贴近、面向后空格推动一格，人物使用 push 动作随块前进；整个原生方形碰撞体沿路径检查墙、地面和其他对象，禁止穿墙、穿箱、推下缺失地面；移动位置保存。`FieldObjectUnitPushedState.Enter` 在非冰面分支确实设步数1。**当前 .5秒推移动画为临时值，尚未取得 Constants.UnitPushSpeed；不声称推速和触发按键已经完全等同原生。**
- 荆棘：接触阻挡面也会扣血，不要求先穿进碰撞体；读取 `constants.json:GimmickSpikeDamage=.05`，即100最大生命值扣5。当前伤害保护窗口仍共用原先.65秒参数；原生击退力、保护时长待确认。
- 第一追逐使用原图 goblin_event_1（中心1,-9，5×2）；第一战斗使用 goblin_event_2（中心1,-14.3，10×2），匹配 Section2.OnEvent 对区域名、队长和已触发状态的检查。移除把同一区域错误绑定到熊猫片段的逻辑。罗兰茵不再由进入 maiden_1/maiden_2 自动触发，而是靠近、面向后交互；后续精确状态前置条件仍需继续核对。熊猫事件现有坐标偏移尚未完成原生核验。
- 告示牌改为共享 MapEventPlayer 的 Talk 气泡，读取原来的 Message 中文键。旧事件 JSON 有15个中文键已不在当前 strings-zhCN 表中，生成器会记录 missing Chinese text，不再显示代码名作为台词；对应新控制器对白键仍待匹配。这是文本来源版本不一致，不能称为台词已补齐。
- HUD 更换为 battle / characters / items / MainUiS3 原图集的方向键、攻击、奔跑和情境动作图标、骑士头像、收集图标；图像 contain 显示，动作按钮保持圆形，小地图等比绘制。计数新增宝箱。布局仍是浏览器适配，尚未等同整套原生 HUD。
- 本轮仅跑针对性推块/荆棘/相机检查和语法检查，未跑全地图/全部片段回归。烧毁延迟、传火半径和开场石块命中特效资源绑定尚未完成，保留待核验项。
