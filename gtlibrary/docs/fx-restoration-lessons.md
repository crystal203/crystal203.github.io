# 特效联动复原：错误教训与检查规则

更新：2026-10-30。适用范围是原生资源导入、通用动作解释器和透明画布预览。原始输入与工作边界仍以 [交接文档](fx-restoration-handoff.md) 为准。

## 完成状态必须分开记录

- 素材索引存在、原生包生成、动作构建成功、渲染机制完整、用户视觉验收是不同状态。不能只凭 JSON 生成、轨道数量或有限时长，宣称角色已经复原。
- 本轮初次交付将“包生成／动作能构建”当作完成依据，遗漏了旧素材的渲染合同和部分角色的普攻、角色技能、连锁。以后交付必须列出实际可用类别、源数据缺项和待验收项。
- 清点源头是原始可玩 Hero 的 OriginId 与 `_myth` 形态，不从显示名猜 ID。男、女骑士的 Hero / OriginId / Costume / Skeleton 来源保持各自真实记录；按用户要求，界面将两者合并为一个“骑士”组，男女与原版／觉醒／开花均作为外观选择。界面分组不改写原始 ID；带星级索引仍先按 OriginId 找全同源形态。
- [开花清点](fx-myth-inventory.json) 只证明包与形态的存在；[剩余工作](fx-myth-remaining.json) 另记动作缺项。包存在不消除其中的 bug。

## 素材复用不能掩盖旧导出缺项

- 图片可复用不代表效果记录可复用。已有预设可能来自旧 YAML 导出，缺 shader、nativeBlend、SpriteRenderer、simulationSpace、CustomData 或完整材质绑定；普通导入只补“缺预设”会保留这些错误。
- 检查动作、图、选项、投射物、时装和召唤实体的实际依赖闭包。明确落后的消费者应从同版本原始 bundle 重转，不能靠重命名素材、把黑色按亮度删掉、调淡白色或手调位置掩盖。
- `--repair-legacy` 只重转实际声明依赖中的旧预设；它与 `--refresh-all` 不等价。`--defer-cleanup` 仅暂缓可回收图片清理，不能绕过资源完整性。
- APK 中的 `unity_builtin_extra` 与 `unity default resources` 都可能被源 PPtr 引用。缺网格时先加载同一 APK 的真实内置资源，不拿别的角色或版本替代。
- 缺 provenance 是风险线索，不自动等于视觉错误；报告须区分“待核查风险”和已比对源值的确定错误。

## 材质、抓屏与透明画布

- 混合模式从 shader 的真实状态取，不根据材质名有没有 add 猜测。遥与塞拉的黑底曾源于把原生加法混合记成普通透明混合。
- 无 MainTex 的屏幕扭曲或后处理材质不能直接套白纹理普通 shader。应保留原生 GLES、Grab 采样名称、CustomData、纹理绑定及真正使用的 vertex varying。
- 普通片段已预乘 RGB，不代表 raw 原生屏幕片段也已预乘。CA_BW_Distort 的原生输出与播放器的 Blend One 合成必须一致，否则 alpha=0 仍可写入白色 RGB，产生矩形覆盖。
- 原生屏幕 shader 面向不透明游戏画面；PP 固定输出 alpha=1 不能在透明预览中凭空制造一块不透明背景。保留输入画面 coverage，并明确区分透明画布适配与原生 RGB 运算。不能按 RGB 亮度抠 alpha。
- 抓屏保存的是预乘颜色时，原生运算前恢复 straight RGB，输出后只预乘一次。零覆盖不能漏颜色，部分覆盖不能重复乘 alpha。
- 2Tex 倍率、遮罩与各自 UV/ST 由具体 shader 决定。`Effect/Mask_Additive_Blend_2Tex` 的原生 RGBA 倍率是 4，虽含 Additive 字样，其真实混合仍可能是 SrcAlpha / OneMinusSrcAlpha。
- 排序不能只看 renderQueue 数字。先核源 Sorting Layer 和 Order in Layer，再核队列；不因为 CA 的队列数较大，就强行移到 PP 后面。命名与未命名 GrabPass 的缓存语义也不能混为一谈。

## 几何、方向和模拟空间

- Simple SpriteRenderer 使用原生像素尺寸／PPU、pivot、flip 和 tint；不能统一当 1×1。V 的火车、妲彬的投射物暴露过这一问题。切片／平铺模式不能冒充 Simple 支持。
- `local` 必须与源 `moveWithTransform`／simulationSpace 一致。源 Local 被旧索引记成 world 后，播放器的出生位置补偿会使正在移动的车、雕像停在原地。
- EffectDirectionSetter 必须按源节点引用只激活对应方向的分支，不能让四向模型同时显示，也不能仅在覆盖报告里声称支持。
- 方向疑似反转时先对齐预设、局部时刻、分支、锚点和矩阵，再改。凯莉前端环形网格的一次原生 Unity 对照未发现反向差异，不能为符合观感而额外翻转整个预设。
- 静态网格默认法线与 CPU 网格粒子缺失法线仍按交接文档分开处理，不重新生成一套三角法线掩盖源路径差异。

## 动作图、尾部协程与整弹匣

- 值节点应是纯读取／返回新值。DirectionRotateEuler 曾原地旋转共享方向数组，使后续蓄力点偏移；输入向量变换前须复制。
- 节点端口按原始图读取。GetCharacterIsNull 的源端口可以是 Value；只读 Target 会恒判空。不能用固定目标兜底掩盖端口漏读。
- 连贯动作保留嵌套轨道 `time + t.at`、片段时序和路径局部时间，不能把所有子效果的出生时间压到每段开头。
- FinishAction 结束角色动作，不代表所有独立效果 routine 都在同一时刻结束。停止当前结束 routine，继续执行仍活跃的尾部 routine，直到原始 EndRoutine／队列边界；也不能让已经结束的主 routine 无限循环。
- 缓动由原始 EaseType 决定，不能一律线性。移动对象的完整路径必须覆盖 actor 结束后的合法尾段。
- 有原生弹药或耐力机制却没有整弹匣连贯动作，是功能 bug。检查普通、末发、连续整匣、动画衔接及跨发尾迹；不能只提供单发和末发按钮就记为完成。
- 耐力消费可以在图变量／节点中，不一定在 BattleAction.StaminaPerAction 平字段中。整匣按实际消费 trace 推进，保留原生容量、间隔、末发判断，不从角色名写特例。

## ScreenFX 防压缩检查

- 构建 simulation 前就选对 screenCamera；不能先按世界斜投影烘焙，再在播放时搬进 screenScene。
- 依据 ScreenEffectObject 与 transformType 处理定位、尺寸和投影，不把世界方向的 45°压缩应用到屏幕空间。正视、俯视等播放控制不应改变屏幕像素纵横比例。
- 对混合屏幕／世界子节点要先查实际消费者与源结构，不能见到一个 ScreenEffectObject 就未经核对重写全部根节点投影。
- 同一预设、相同局部时刻比较单素材与联动的投影矩阵及尺寸。检查一个固定真实场景和代表性变换类型即可，不需要全皮肤、全朝向截图。

## 交付与审计

- 用户提出的问题按顺序交付；子代理可以并行调查和修改互不冲突的数据，共用解释器修改统一合并。新的补充截图继续归入原问题，不能提前记为已解决。
- 通用修正先清点所有实际消费者，再选择最小代表数值／DOM检查。源依赖和字段完整性可静态清点全部现有包，不等于全角色图像验收。
- 检查报告必须保留输入快照／哈希、适用范围、确定错误、风险候选与覆盖缺口。修复后重跑对应静态清点，不能继续引用已过期的数量。
- 不清理其他 agent 的未提交修改，不提交／发布；`legendaryhero` 由用户安排的另一 agent 负责，其角色数据不在本体修改范围。

## 召唤物与开花参数的原生归属

- `SummonableId` 是实体依赖。跟随选项、开花选项和服装覆盖收集原生表、战斗样式、动作与独立骨骼，不能把召唤物当成主人旁边的一张静态贴图。妮芙缇原版／开花炮台分别为 500801／500803。
- 召唤物使用自己的位置、目标、动画时钟与攻击循环；主人结束动作不应停止原生允许的自主攻击。循环周期来自实际动作时长与同版本 AI 的 `IdleTime`／`WaitingAttackTime`，并遵守原生主人连接范围和目标范围。不能让召唤物共用主人骨骼或无条件向远处攻击。
- 动作选项 ID 不是“把该选项所有预设覆盖进动作”的指令。先核 Lua 的参数解析调用：`parse_action_and_myth_param` 读取动作自身 `MythPresetInfo`，显式 `parse_option_param` 才合并选项预设。妮芙缇的 20350632 同时关联普攻开花与炮台升级；混合两者曾将主人末发激光替换为炮台激光。
- `set_upper_anim` 与 `set_anim` 是不同动画轨道，连续整匣必须保留源轨道和每发原生重启／解除策略。妮芙缇的源 Discrete 耐力 200／16 形成 13 发、末发 `sniper_shoot`，不能按武器显示的弹匣数量推断。
- 新增原生静态表时保留完整表及来源／哈希，并与已有英雄、战斗样式、选项等规范化 JSON 核对版本；不能手写几条字段冒充原始数据。`battleais-source.json` 记录了此次 810 条 AI 表的同版本证据。


## ScreenFX 二次反馈：内部一致也能共同拉伸

- 双胞胎专武截图实证：此前只比较单素材/联动矩阵和相机X/Y单位长度，未测实际图形在不同画布宽高比下的形状，因此“未见压缩回归”结论范围过宽。
- 原生 ScreenEffectObject.SetEffectSize 根据游戏视口 aspect 调整横向；直接把桌面超宽预览区域当游戏视口，会把整个屏幕特效横向拉伸。原生画框2:1时下圆环高宽比0.903953，2000x528预览时变成0.477287；切45度/俯视不改变该数值，排除了此次45度投影原因。
- 预览区现在用脚本声明的 baseAspect 建立等比游戏画框，宽屏余量是留白；不改源节点、不手改圆环、不凭观感统一乘sqrt(2)。源本来略椭圆的形状仍保留。
- 防复发检查应测实际可见网格投影后的宽高比，并区分素材作者比例、逻辑游戏视口、桌面画布及相机角度。仅相机轴比例=1、两条浏览器路径一致或切换视角不变，均不足以证明原生形状正确。


## 统一初始构图与原生语义继续核对

- ScreenFX按源baseSize/baseAspect渲染时，主角初始相机也必须用同一游戏视口尺寸：世界viewSize=2*baseSize/fit。只对角色设17%高度、屏幕FX单独固定视口，会造成两套大小基准。带屏幕FX的初始构图现统一游戏单位像素比例，并兼顾主目标；宽屏/窄屏contain因子一致，“适配”恢复这一规则。
- 初始角色构图不需要先把整段特效采样17遍再覆盖缩放。加载联动直接建立角色构图；按需全素材适配仍可单独执行。
- TriggeredTimeLimit的TriggeredDispose只重置原生池timer，不等于ParticleSystem.Stop；不得在该时刻强写emissionEnd。保留trigger+源TimeLimit期间的发射/动画。只有源明确停止发射才使用emissionEnd。
- C#字段偏移不能凭相似类型猜：Character +0xd8是Bounds.center，不是脚底Position；脚底应取get_Position。旋转还须区分RotateCalculator（绕原生pivot）与DeviateLocalAngle（不使用该pivot补偿）。
- 方向联动和允许释放方向是两个合同：目标向量、四向Direction枚举、侧向锁定、预设参考Direction及RotationType不能混为一谈。用户新增Twins support旋转、Kamael Cwp四向限制与背后精灵要求，逐项核源处理。
- 图元素判断应读取实际Target对象的原生ElementalType。不能遗漏主角英雄元素字段导致分支恒false，也不能把主角元素无条件分配给敌方目标。


## Native manager 与 C# 动作本轮补充（2026-10-30）

- ComboAction / ExtraAction 是原生动作引用，子动作后缀可能不含英雄名。导入器必须按实际动作注册表递归闭包；菜单和连贯动作均保留源 ComboAction 顺序，不能播放空 manager 当作普攻。
- ManualBranchComboBattleActionManager 在自身首个匹配 BuffName 存在且 GetScore >= TriggerStack（默认 0）时，用整组 ExtraAction 替换 ComboAction；组切换重置子动作下标。Extra 不是默认第五段。增强技能的触发快照不因首击消费 buff 而中途换回普通素材。
- C# 手动近战 FX 可由真实 Spine EventTimeline 触发；Scale 会改变事件的局部出生时间。依据当前加载的原始动画解析事件，不能写猜测的固定时刻。
- Character 字段 +0xd8 是 Bounds 整体：中心在 +d8/dc/e0，半尺寸在 +e4/e8/ec；不能误当成脚底 Position。区分源码直接读 Bounds.center 与调用 get_Position。
- DisposeViaType(false) 要看源 pool 的 DisposingType。TriggeredTimeLimit 仅启动 pool 的 TimeLimit 计时，不停止粒子发射；不得在触发时硬截或设 emissionEnd。导出 poolTimeLimit，按触发时刻加原始计时保留尾段。None 直接释放，TimeLimit 依出生时刻的原计时。
- 延迟移动的精确源边界须进入轨迹采样；只保留固定 60Hz 点会在边界前插值出提前移动。
- Spine RotateTo 采用当前角到目标角的线性变化，原生旋转 pivot 为 (0, .38499999046, 0)。DeviateLocalAngle 在 pivot offset 之后才叠加，因此 Recoil 不得统一套用该 pivot 补偿。

- Lua `instantiate_effect` 的 rot 省略／nil 默认是 Vector3.zero，不能被编译器默认 directed=true 替换成角色方向。原生 UnityObjectPoolExtensions.Instantiate 0x75a7bb0 的 near-zero 分支保留单位旋转，再应用池本身 Rotation；EffectPreset.Direction 是参考轴，并不授权无参数调用自动跟随角色。TwinsAndroid support 三次调用均属此类，演员 lockedDir 与 FX 定向应分开。对应全包静态检查工具 `tools/fx/audit-direction-contracts.py` 输出输入哈希、确定错误、动态表达式候选及不适用项，不能凭一个角色观感全库强制旋转。
- 嵌入 Spine 的实体 BoneFollower 必须按其独立时钟采样。当前锚点与 world-space 粒子出生锚点都应使用同一原生骨骼定位函数；查询历史出生时刻要用独立 query skeleton 并恢复源 CustomAnimator 节点变换，不能把当前 body 骨骼位置用于所有粒子。矿实体的 Jump 高度时长与 jump 动画 duration 不是同一个量；源 NextAnimation 切换以动画 duration 为准。

- 原生 pool 的 Type / Direction / Offset / InitialScale 属于动作变换合同。新源码 recipe 显式 opt-in 后，按 Type 选择 Slash／KatanaSlash 等旋转，偏移用源 yaw，保留负轴与 Y 缩放；不能只补材质却仍忽略这些源变换。源码无 direction 的 direct Instantiate／UpdateObject 需保持 identity，骨骼锚点的方向仍可只用于位置偏移。
- 位移 API 的参数身份也必须核：Eugene 专武取相邻投影差的**长度**后沿原始方向 ExecuteMove；直接设为投影坐标会凭空引入倒退，实际累计距离也不同。固定采样率只是预览参数，不能称为任意帧率／地形的完整物理仿真。


## 早期覆盖表与 Native 选项复核

- 非空的整角 `native-action-plans.json` override 会绕过 `plans_for` 与新增 source compiler。旧包具备菜单不能证明其 heroOptionIds、武器、觉醒或 buff 激活条件完整。只移除已明确过期的角色 override；不据此全库强制 source 优先或丢弃尚未支持的旧 augment。
- `EnhanceActionName` 可以只是普通攻击第三段的治疗判别名。伊娃的三个 ManualSoundWave 原本已在 BattleStyle 中；特殊选项按此名增倍治疗，不安装第四段。需核选项 Lua 的调用，而非看到字段就宣称缺隐藏动作。
- Native 选项读取顺序影响合同：阿拉贝尔先从专武选项读强化弹体，再用 EnhancedCwpMythOptionId 覆盖 DpsMultiplier（.75→.9）。开花选项不含新 ProjectileName，不应虚构另一枚弹体。SpeedIncreaseRate 元数据字段也不授权改写已核 .25s 的发射状态时钟。
- Native ManualSoundWave 的 DashFrame 会启动 .3 高的 Spine 跳跃，合法尾段可越过动作终点；第三段发射按剩余索引随机抽取并 RemoveAt，无放回。动作 aura 在首个 ShootFrame 出生，专武 buff 则走普通动作事件与自身6/8秒冷却，不能混为同一时刻。

- nil 方向的通用修正也必须避开后续变换：仅同 literal key 的全部调用都省略／nil、返回对象未被保存、且事件没有显式 Euler／Direction／骨骼／图变换时，才可规范化为 `directed:false`。位置的 `height`／anchor 不授权旋转，也不应阻止独立的 nil 合同判断。InvaderKnight 开花角色技源码 251 行 cast 省略 rot，247 行只锁演员方向；253 行 proj 明确传方向并在 293／303 行更新对象，不能连带清掉投射物方向。固定检查为 `tools/fx/check-source-event-directions.py`，不需要截图或朝向穷举。


## 源闭包、动作覆盖与增量修复继续收敛（2026-10-30）

- CAB名称相同不代表外部PPtr对象闭包相同。加百列3.54弓依赖3.54基包battle，旧3.51基包使用相同CAB但对象234/257不同、缺16精确Sprite。必须核版本/源hash/实际PathID解析；不能用旧包同名贴图替代，也不能空对象顶替。诊断工具现在支持缺失引用与候选bundle精确命中对照。
- 普通导入成功、材质合同通过、动作菜单存在不能证明角色完成。加百列资源恢复后实际入口没有普攻，Cwp静态轨道也遗漏角色结束后的独立状态机。动作名不是C#类型证据；先核UseScript和完整Lua，registered类型查无后不能继续假设C#。
- 队伍治疗的source API只实例化真实存活队员与召唤物。预览只有owner时，只展示该owner的脚底跟随效果，不把敌方目标或凭空造出的队员作为party。Lua on_start空时，旧sourceArrays中存在AnimationKeys也不能授权播放该动画。
- 源世界轴偏移不能降成forward offset。加百列开花dir.x<0选择left并worldX -2，否则right并worldX +3；nil旋转保留源姿态，不能随斜向目标将整幅效果旋转。
- MagazineSize只是字段，必须找到实际消费合同。奥尔卡LuaManualCombo实现ICombo/IJoypad，不实现IStamina，start/update/can_trigger均不耗ammo；原生控制器按索引mod3循环。该角色保持3+1+1三段连贯，不因Magazine6伪造六发。自动弹夹审计须同时检查实际消费者与菜单连贯出口。
- 伊娃ManualSoundWave用Unity随机索引+RemoveAt无放回抽取，不能固定弹色顺序；跳跃DashFrame结束可以晚于action结束；EnhanceActionName仅第三段治疗判定，不必然安装隐藏动作。旧整角override缺武器/觉醒/option元数据时必须重新编译当前原始源。
- 全库材质审计必须同时调用effect_render_issues和material_issues。只检查材质shader会漏CustomSprite/StageShadow真实可见组件绑定；普通增量导入guard能定向重转缺失预设，不需要refresh-all或手改生成结果。
- 源编译器应先确认必需字段再接受语法片段；共享shoot API不代表同一种动作。AA72的未选complex探针缺HitTiming曾KeyError，现按真实数组合同拒绝该matcher，选中的独立弹体机制保留。
- 用户视觉验收、正在制作、确定源错误、审计candidate/unknown是不同维度。用户确认通过应更新账本；candidate不可自动当bug，也不可删去后宣称所有分支都已证明。每轮报告记录当前输入hash与覆盖范围。


## 静态合同审计也要覆盖脚本绑定（2026-10-30）

- 材质 audit 不能只检查 shader / blend。必须复用 `native_material_contract.effect_render_issues`；否则原生 Shader 齐全仍可能漏掉 StageShadowSetter 的 Transform→GameObject 绑定。本次全库静态复核找出 9 角色 37 个声明消费者缺绑定，普通增量导入经现有 guard 定向重转后为 0。
- 同一报告分开记确定合同缺口、可选源引用、provenance 风险与外部所有者；缺 poolTimeLimit 仅为源调用待核候选，不能自动补 emissionEnd 或宣称视觉错误。当前最终哈希与修复前后证据见 `fx-final-material-contract-audit.json`。


## 用户验收后变更边界与加百列闪屏反馈

- 用户新增明确约束：禁止操作或重启其Chrome；当前核验不启动任何浏览器。已验收角色没有明确缺陷依据不得再改。审计candidate不足以作为修改理由；未交付的motion/aim增强已撤下共享hook与运行时扩展，独立草稿不算已修复。
- 加百列开花黑块并非源贴图未抠。源CA_BW_Distort第二层custom1.z=2，输出2×GrabRGB−BW，Grab alpha×vertex alpha。此前把透明度棋盘画成GPU不透明背景，暗棋盘经过源公式变纯黑且alpha非零；仅保护透明framebuffer的alpha无法修好一个本来alpha=1的棋盘。
- 透明度棋盘是预览界面指示，不应进入原生GrabPass。FX页已有CSS棋盘；checker模式现保持GPU透明，纯色模式仍作为真实场景背景参与原生闪屏。源shader、贴图、原始特效参数不改。纯CPU源合同检查覆盖R/L两素材，不打开浏览器、不读取像素；视觉结果仍由用户验收。
- fallenqueen原版只待机的明确根因：SpriteName=cwp_fallenqueen同时用于真实staff道具9060624和镜像custom道具9094214。不能按catalog Object.keys首命中定武器身份；优先真实WeaponSpec.weaponType，旧包仅在当前角色真实primaryTypes内匹配。真实UI参数调用恢复原版8动作，开花9动作；此次无需修改aim/Role/recoil候选。


## 非开花首批十角新增教训（2026-10-30）

- `RotateThis` 有 vector 与 rotationSpeedX/Y/Z 两种序列化合同。夏皮拉紫色轮刃静止的具体原因是漏读分轴字段；必须核原生 Update 的 dt/TimeScale 与 local 后乘。实际源 1800°/s 的 .01/.02/.1 秒应为 18/36/180°，不能以材质通过代替组件运动检查。
- 同名 BattleStyle 不保证同一个角色装备合同。保留 Class/Weapon1/Weapon2 区别；`custom` 是原生精确武器类型，不能充当通配符，更不能因无 Manual 数组就选一个 NPC 样式。
- 英雄身份先由原始 OriginId/明确 family group 决定。已有精确身份时，禁止反向合并包内宽泛 appearances：一个错误前缀收集会污染下一次分组并吞并其他已验收角色。形态资源按精确原名和数字/ascent/myth 后缀匹配，不按裸前缀扩张。
- `heroes2` 的真实 Id override 是第二专武的 Class/Options/觉醒替换来源。Options 替换而非并集；UI 选装、动作选择及 readiness 都必须解析同一个 effective snapshot，不能把原专已安装 Role 错报给二专。不得猜 Class 加 2，也不得创造一个新外观选项。
- 非空整角旧计划会压住新 compiler。新角色用显式 `--source-first` 按动作优先编译，只保留不匹配的 legacy/augment，并记录两者清单；默认导入仍保留旧策略，不自动重写已验收包。
- 两遍 shader 必须检查全部原生颜色 pass。`Effect/TwoSidedDissolve_2pass_cvs` 的 front/back culling 与两路顶点 RGB 不可合并成一遍；alpha 来自 MainTex.r 和 threshold，不能额外乘原生没用的 vertex alpha。
- 弹夹消费可来自固定弹数、持续耐力、ICombo 或完全不消费；不能直接用装备 MagazineSize。Rachel 固定 40 发、Nari 耐力消费、未来骑士按秒消费、Hekate 无弹药消费，均需核各自动作实际消费者与 reload/独立弹体尾程。
- pool DisposingType=None 的真实 Projectile.Dispose 可同时直接终止飞剑与 trail，不能为了平滑猜出残留尾迹。演员恢复武器与独立飞剑结束也可能相差 .033 秒；各自按源时钟，连贯动作必须给相对结束时间加所属段落的 at。
- 一个动作有多个同名 Spine sfx 时，必须按源 index 绑定。柚子击地取第二个；事件须按实际动画 duration/ActionDuration 换算。默认骨骼回调、飞剑运动曲线与隐藏装备窗口需共享相同时间原点。
- 轨迹含等待或瞬移时，插值路径应保留同时间的边界点；否则会在等待阶段提前移动、在应瞬移前缓慢返回。独立 Spine 召唤模型也需检查真实 consolidated skeleton 的动画名，不能为了 side 过滤丢掉整个骨架。
- 固定构造器弹体与动态武器弹体都属于依赖闭包；源 recipe 的 requiredPoolPresets 驱动 CustomSprite 模板导入。新旧武器两套动作都要检查实际 UI 入口，默认选中的二专通过不代表原专已经完整。

- **鲁交付后的首次入口报错**：页面初始传入的是骨架资源名 `rudolph`，Hero 表只有 `rudolph_3/4/5`。之前所谓 UI-equivalent 检查直接用了 defaultSkin，绕过真实初始入口。武器覆盖与新适配器现在使用明确 profile.defaultSkin 解析资源名的源 Hero，并保留请求 alias 的同一有效选项；不猜 Id/不吞掉缺失二专合同。readiness 默认改为 profile.appearances[0]，保留 --hero 指定源场景。此次定向检查本批实际入口九角与鲁两专，通过，证据 E:/GTFiles/fx-batch1-initial-entry-readiness.json；不能再把五星表名检查称为页面初次加载检查。


## 非开花第二批：按源机制复用与缩短交付（2026-10-30）

- 已支持的时间线、投射物、Jump/短冲、跟随与材质流程直接复用；各代理只持有本组角色与独立compiler/helper，共享hook由本体一次接入。源检查限实际初始入口及新增机制固定数值，不做全外观/朝向/像素遍历。完成一个角色立即通知用户，不等整批。
- 多段动作跨renderer适配器时，不能让某一个适配器仅拼出它认识的普攻部分就抢占整个basic-combo。应按实际BattleStyle顺序合并全部段落，并带上段落各自的瞄准窗口/位移/独立尾程。
- 持续动作的动画与特效可以有不同的加速倍率。救生员柚子源spin特效为动画加速差值的两倍；用显式effectClockPath累计原生特效时间，其他动作仍使用原局部时钟。IStamina接口和剩余检查不等于已证明按秒/按段消费，不制造一个猜测的耗尽弹夹。
- 原生字段缺失与近似拼写不能混为同一字段。蓝龙Lua取ExpandDuration，表只有ExpendDuration；在已确认get_float默认0的路径按实际0处理并记录，不能擅自纠正源程序的拼写。
- 同一ProjectileSpec的HitPreset和ExpirePreset可能相同，但on_hit命中会直接返回true，此时不再叠加一次到期特效。新的显式sourceProjectilePools合同保留命中/自毁区别与TriggeredTimeLimit拖尾，不扩改已验收角色。
- 源骨骼锚点加角度偏移与整幅特效旋转是两个合同。nil旋转的staff cast仅更新发射骨骼位置；新增boneAngleDegreesByFacing只用于骨骼偏移方向，不能连带旋转画面。


## 克雷格连锁黑框：精确 pool 与 AssetName 别名冲突

- 精确 PresetName 必须优先于 AssetName 别名。`fx_krag_buff_lightbeam` 与 `fx_bb_krag_buff_lightbeam` 共用 AssetName，但有不同 pool 参数；旧 Map 按插入顺序将后者覆盖到前者的键上，实际 UI 初始 `tanker_2` 因而取到未重转的旧 alpha 材质。静态 guard 修好声明消费者，不等于运行时真的选择该消费者。
- 源 `FX_Lightaura_beam / Effect/Mask_Additive_Tint` GLES 输出 `2 × vertex × tint × mask × main`，Blend 为 SrcAlpha/One；旧别名缺 shader/nativeBlend 且记为普通 alpha，导致蓝柱背后的黑纹理覆盖背景。修复仅统一精确 preset 优先的 lookup，不抠源图、不刷新已验收角色。固定实际入口检查 `tools/fx/check-tanker-support-material.mjs` 已通过；证据见 `fx-tanker-support-black.json`，视觉仍待用户验收。


## 第二批用户反馈闭环：禁用 Renderer 与精确预设（2026-10-30）

- 卡洛儿第二段白块来自源 `ParticleSystemRenderer.m_Enabled=false` 被遗漏，非贴图/alpha/shader公式错误。禁用Renderer的父粒子仍模拟并驱动SubModule，但必须emitterOnly。converter现在保留renderer.enabled，core隐藏判定也读取该字段；guard阻断显式disabled却非emitterOnly。一个固定Node场景修前.2秒恰3白块，修后0，子发射数量与轨迹不变。
- 同类源结构审计只针对本批动作/选项/投射物依赖，查到高里4处、白雪2处；已定点重转，加上卡洛儿1处共7处，最终mismatch=0/errors=0。可复用命令：`python tools/fx/check-native-renderer-enabled.py --characters id1 id2 --output report.json`，有确定差异/错误以非零退出。无需图像、朝向或外观穷举。
- 审计不能把计划event.key、SfxInfo.Name或AnimationInfo.Name当作ObjectPoolSpec preset。梅丽尔事件逻辑名laser对应真实fx_m_alpacagirl_support_laser；旁存旧generic laser不是它的消费者，已排除误报，不对未用素材做猜测重转。
- 白雪新增`Unlit/Shadow`仅支持已核实no-shear变体：同版oak源GLES为MainTex(rawUV)*Color，忽略顶点颜色，不用MainTex_ST，Blend[5,10]/ZTestLEqual/ZWrite0/CullBack。不得读残留_TintColor/_SrcBlend替代当前shader输入，启用SHEAR的未知变体仍阻断。
- 用户要求奈娃不制作专武：`tools/fx/preview-policies.json`记录此预览范围，导入器/菜单/动作过滤共同应用；保留普攻、强化与连锁，不篡改原始表来解释用户范围。


## 第三批15角与新机制最小播放检查（2026-10-30）

- 按远程/近战/辅助分组，每代理4角、本体3角；批次共享接口提前一次接好，复用时间线、弹体、持续动作和材质转换，素材不变只重编metadata。各角色独立完成即可交付，不等整组。
- MK.99专武的source matcher误找self.proj_spec[1]，实际发射用self.shoot_helper[1]，因此错误落入只有cast/screen的旧generic。已精确修match并在真实初始入口核弹体.36→.56秒向前4.8单位。readiness新增阻断：专武原始行声明移动弹体，实际模块却没有任何对应弹体body。菜单存在不再能掩盖这一缺口。
- 多份SpineData分骨架预设必须通过真实effectDefinition→FxActionPlayer→createEffectSkeletons的选择与采样验证。只在某份bytes查到idle不代表真实角色技能能播放。孩子王双蝶当前攻击back、防护side各选1份，实际idle_back/idle_side和完整CPU采样通过；用户已加载页面可能持有旧模块，待其刷新视觉复验，不能把缓存推断写成已确定原因。
- 新增可复用 `tools/fx/check-skeleton-effect-actions.mjs --characters id1,id2 --output report.json`。只跑本批初始form/right的embedded骨架轨道，实际load/prepare/sample，不造WebGL、不读像素。本批11条轨道（夏罗9、孩子王2）均通过；其余13角无此类轨道。
- 此最小播放检查找出夏罗召唤片段省略speed导致clipTime产生NaN；源动画默认速度1，现clipTime以speed??1、start??0处理，显式speed=0仍保留暂停。修后真实子骨架采样与网格无NaN警告。不能只检动画名存在而漏掉实际时间计算。
- 新compiler接受source片段之前必须检查必需字段，未选动作探针也不能KeyError。ManualCyborgMonk与本批离散攻击部分语法相同但无所需HitTiming数组，现明确拒绝此分支，不把候选当已支持动作。
- 本批统一源Renderer结构审计0差异/0错误；不对已验收角色做刷新、全外观或全朝向遍历。范围与未作视觉验收必须保留。

## 第四批连贯动作与机械行者白扇片反馈（2026-10-30）

- 连贯动作不能只把独立段落移到不同时间：新段必须以上段真实graphPath末点作为actorPosition重建，投射物与跟随特效也使用该起点。船长少女与森林精灵现保留连续位移；实际FxActionPlayer采样船长少女.25/.85/1.4秒前三段分别有9/16/3活粒子，森林精灵.5/.51秒均为[-1,0,0]，不再回到原点。不能以菜单或track数量代替实际段落播放。
- 机械行者专武白扇片对应手网格的Color32通道，源值255/alpha51须归一化为1/.2。源第29三角在同一FX_Circle_01纹理、ST=(2,1)和源GLSL（2×COLOR×Tint×MainTex）下，错误字节输入会产生RGB=(376,294.70,149.29)、alpha65.77并饱和为白；正确金色半透贡献RGB=(.3803,.2981,.1510)。原始field prefab根、两个mask shader及纹理、Smoke环第5帧与UV均已定向核对；不删网格、不改图掩盖。真实加载geometry rgba首顶点[1,1,1,.200000003]及mask/main非white fallback已加guard，视觉反馈仍需复验，不能把缓存原因当作已确定事实。

## 娅拉触手水波遮挡：原生 SortingLayer 合同（2026-10-30）

- 原始 `characters/part3/sea_witch` 触手三骨架 MeshRenderer 为 Default(layer ID 0)/order 0；`effects/manual/seawitch` 的 `fx_sea_witch_role_atk_decal_loop` 中 bg_loop、water_ripple_ring_seq 分别为 Under Effects(ID 1471389567)/order 1、2。两者都 Transparent queue / ZWrite 0。只取 sortingOrder 导致水波 1/2 错压骨架 0；不能任意抬骨架 renderOrder 或改透明材质。
- APK `assets/bin/Data/globalgamemanagers` 的 TagManager.m_SortingLayers 是层级顺序来源，SHA256 `234471609aa9e24371af68d94d7968d8cb09657c89c068a83ecf95d9adedcf60`。converter 自动保存带 hash 的 nativeSortingLayers；core 显式读取该合同，以 layer ordinal + 原生有符号16位 order 排序，Renderer 有符号 ID 与 TagManager uint ID 按位归一。未携带合同的既有包维持旧行为。本次仅给用户反馈的 seawitch 包应用来源元数据。
- 固定初始 sea_witch_5/right 的真实 FxRuntime.load→effectDefinition→FxActionPlayer CPU 采样：bg_loop 的 order 从错误的 1 恢复为 Under Effects 对应 -65535，触手骨架为 Default/0，水波先画；未改 ZWrite、贴图、混合或骨骼层级。原始证据与运行时报告为 E:/GTFiles/fx-seawitch-layer-source.json、fx-seawitch-layer-runtime.json；视觉仍待用户复验。

## 第四批特殊形态与图腾入口反馈（2026-10-30）

- UI 的原始 appearance（如 watcher）不是 Hero 表键。Class Summon 的首次选择和多召唤物展开都必须先 sourceHero(native, rawHero)；只用 watcher_5 做骨架检查会漏掉真实页面入口。Watcher 初始 canonical、默认源 Offset=1.5、用户显式选 [0,0,0] 三者已定点 guard；app 用 summonPicked 区分默认值和实际用户选点，手工输入零同样保留。
- 显式 summonDuration 控制实体 body、被动和自主 cycle 的结束，UnsummonPreset 在该时刻出生；结束特效尾程只能延模块时钟，不能反向延实体。Watcher 源 7 秒停止 body，7 秒播 unsummon，尾程到 7.5 秒。Panda 同时有两个 active Class Summon，不能 find 第一个而漏掉熊的真实 rifle 弹体；SpineAssetName 的 # 后缀是 skin，GameObject 选择须剥离而 body 播放须保留。
- Panda 链条 MatCap/Partly Visible 的 RGB 是 Main*Color*MatCap*3，alpha 仅在原始 objectPosition 与 Origin 距离平方不超过 _SqrRange 时保留，不能全 RGBA 乘3。Spine/SkeletonGhost Character 的 alpha 为 Main.a 平方，RGB 另有 max(Main.rgb, TextureFade) 与 FadeColor 混合；新增 shader 必须提取 GLES 对应合同，不能别名绕过 guard。
- 独立 FX 的 native node 树与 Three scene group 分开：给 source world-space node 赋位应减实际锚点并经 node.parent.worldToLocal，不能再次套 group 的 Z 翻转。Panda 实际 FxActionPlayer 全轨道数值 guard 核 Cwp .75 秒 mace=[2.583286,1.5,-.549094]、链条范围=1.153109；机甲普攻从真实 b.w1_axis 飞到 [4,.375,0]。仅 embedded-skeleton 过滤后的检查不会加载 mace/chain，不能代替这个新增机制检查。
- HeroAi/WhiteDruid/JadeShaman/NinjaLeader/Panda 的独立 compiler 先限定准确 Lua newclass 与必需字段；仅 shoot_offset+action.attacking 这样的局部模式会误吞海巫与恶魔工程师。用户反馈菜单缺失时沿实际 GTResources alias→HTTP native pack→imported.plans override→mergeCharacterIndexes 复现，不把本地文件通过直接推断成用户页面已加载新模块。
