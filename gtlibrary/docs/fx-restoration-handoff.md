# gtfx 特效复原交接流程

更新：2026-10-30。工作目录：`D:/github/gtlibrary`。本文为后续导入与维护入口；历史调查记录不能替代当前源码与原生数据。

## 工作边界

- 使用通用资源收集器、导入器、动作解释器。不能通过角色名称分支、手调位置、替换贴图或挑选好看的随机种子掩盖缺失的原生行为。
- 只做最简必要检查：新导入的动作和实际受通用修改影响的特效。不遍历皮肤、朝向，不做识图、截图或像素验收。
- 保留已有未提交修改。导入不等于提交、发布或关机；没有当前授权时不执行这些操作。
- 界面保持简洁：保留必要名称、控制和错误提示，不添加大段介绍、说明文案。

## 先确认身份与输入

1. 从 `gtfx/assets/catalog.json` 确定资源索引 ID；不要根据显示名猜 ID。角色索引在 `gtfx/assets/characters/<id>.json`。
2. 检查 `tools/fx/import-config.json` 的 Python、依赖目录、原始 AssetBundle、prefabRoot、scriptRoot 和 costumeOverrideSource 都存在。原始数据在 `gtfx/assets/native-source/`；不要混用不同版本的动作表和资源。
3. 新角色如果尚无素材索引，先沿现有资源收集流程建立真实索引。不要伪造空索引、套用别人的动作或只改 profile 宣称完成。
4. 归属依据 Hero.OriginId 和时装 TargetCharacterIds。`build_character_groups.py` 生成 `character-groups.json`，`character-catalog.js` 合并显示；保留原始素材索引及旧链接解析。不要把真正独立的角色按相似名字合并。

## 导入

在仓库根目录运行，例如只更新哈娜：

```powershell
& E:/GTFiles/GTOfflineServer/core/runtime/python/python.exe tools/fx/import-character-native.py --index gtfx/assets/characters/hana.json
```

`--index` 可跟多个明确选定的索引，批量执行一次。脚本使用配置的 Python 与依赖，并自动更新角色分组。普通导入会自动重建动作依赖中缺少原生材质来源或混合信息的旧素材；不要仅因预设已存在就跳过。`--repair-legacy` 为兼容旧命令保留，不再是修复门禁的前提。普通导入不加 `--refresh-all`；只有原始特效确实需要重转时才针对预设使用 `--refresh-preset <原生预设名>`。`--metadata-only` 仅适用于全部所需素材已存在的动作元数据更新，不用于补齐新时装素材。

导入必须沿英雄、战斗样式、动作、选项、投射物、递归投射物、对象池和材质纹理建立依赖闭包。预设可以带 beachball_、wedding_、dead_cell_ 等前缀，不能只搜索 fx_。

### 特殊时装

- `native_costumes.py` 从原始 `CostumeOverrideData.lua` 读取替换记录和来源哈希，按原始物品 ID 与角色归属匹配。导出角色包中的 `costumes`，不要手写角色映射来替代原始规则。
- `costume-overrides.js` 在使用时合成动作、样式、选项和投射物替换；不能修改共享原版记录。Info 字段按原生命名项合并，保留没有替换的项。
- 外观与技能形态独立：同一时装可使用原版或开花动作，专武同步跟随技能形态。外观不能误当作新的英雄 ID。
- 原版、开花、特殊/超级时装头像使用现有 portrait 图集，在标准角色同一条目中并列。
- 外观菜单用金色和 `✦` 标注实际含预设、投射物或 SummonableId 替换的外观，依据 `hasCostumeEffects`。仅有音效、待机动作或稀有度标记不算专属技能特效。联动外观和单素材外观筛选保持一致；未知或未导入的规则不能猜测标记。
- 原始形态为蓝色、开花为粉紫色、进阶为青绿色，普通时装保持默认色，专属特效时装仍为金色＋✦。依据原生英雄记录生成的 `appearanceKinds` 分类，不能用是否有头像或中文名关键词判断；技能形态菜单同步着色。
- 武器类别菜单由 `build_weapon_types.py` 按原生 `items.json` 的 WeaponType、SpriteName 与现有装备图集生成，导入器自动更新。禁止只维护早期角色的类别白名单；贝丝的 twohandsword 等类型也必须覆盖。只列出有图集素材的武器，并按 Sprite ID 去重。
- 武器菜单显示 `中文名 / 原始 ID`，专武另加“专属”前缀。中文名只能读取 **`gtatlas/assets/items.zh.json`**，与 gtlibrary 其他装备入口共用；不能翻译、改写或从角色名推导。名称缺失则保留原始 ID。目前 basic_wand、signboard_staff 未收录中文名。

### 共享素材与发布边界

- 通过 `native_asset_store.py` 复用已有图集和共享纹理。原生公共图集保留整张、原始矩形与旋转信息，不为每个角色重新切数百张图片。
- 内容、尺寸及采样设置决定能否复用；名称相同不能证明图片相同。公共素材文件名保留源纹理名及内容哈希，不冠以导入角色名称。
- 保留 Sprite 的 pivot、pixels-per-unit、UV、alpha、材质采样及遮罩绑定；共享图片不能覆盖不同材质的采样设置。
- 原始 prefab 和辅助取证在 `tools/fx/source-cache/`，不放网页发布目录。网页读取转换后的 JSON、网格、图集、纹理，不现场解析 prefab。
- 仅清理确认无任何运行时引用的导入器管理图片；使用现有清理器并保留 removed-textures 恢复副本。不要依据单个角色的引用集合删除公共图片。

### 原生角色外观版本

- 外观名称正确仍可能加载旧骨骼、旧图集。发现此类问题时，沿同版本角色 AssetBundle 的 SkeletonDataAsset → skeletonJSON / atlasAssets → 材质纹理引用收集整套资源，不按截图猜皮肤、不替换单张贴图。
- 通用入口：`import-character-native.py --index gtfx/assets/characters/<id>.json --metadata-only --refresh-appearance <原始外观资源名> --defer-cleanup`。只选需要更新的外观；收集其原生骨骼方向文件不等于遍历方向测试。
- `native_character_spine.py` 将来源包哈希和输出文件哈希保存到 `tools/fx/source-cache/appearances/`；profile.appearanceSources 保留证明，播放器以版本标识读取骨骼与图集，避免旧缓存。
- 本次 legendary_hero_myth 的旧文件与当前源包不一致，已按当前包整体更新；没有做识图验收。

### 武器、副手盾牌和召唤实体

- 武器类型来自原生装备表。单手剑使用 weapon1；爪和拳套使用双挂点；篮子使用 weapon2。副手盾牌仅对 CompatibleWeapons 包含 shield 且有空闲 weapon2 挂点的角色开放。
- `equipment-options.js` 按 Class、Weapon1、Weapon2 选择原生 BattleStyle；有剑有盾、仅剑、仅盾、空手的动作集合不同。不能仅给所有角色叠一张盾牌图片。
- 原始 SummonableId → summonable.json → SpineAssetName / Class → 召唤物战斗样式与动作，必须进入依赖闭包。使用原始实体骨骼及共享图集，不将召唤物替换成静态特效贴图。
- `summon-actions.js` 管理召唤存在、出生和独立动作。召唤物位置由 summonPosition 的地面 X/Z 坐标控制；本体、出生特效、攻击起点同步，主角色和目标保持独立。UI 支持点选、数值输入和重置，回放记录也保存此坐标。本体与召唤物各自支持自动四向和手动朝向；自动四向按各自出生位置与同一主目标的夹角选择，连续弹体瞄准仍使用完整方向向量。
- legendary_hero 的盾牌命中后转移、3/5 次上限和武器骨骼跟随来自 Lua；necromancer 的末发、10 发弹夹、增强连锁及召唤物动作来自原始选项/脚本。这里只预览显式动作，不等同完整战场 AI、寻路与障碍碰撞仿真。

### 透明度与遮罩：必须阻断错误导入

- 黑底、遮罩缺失和透明度错误不属于可忽略的细节。`native_material_contract.py` 在写入动作包之前校验；缺少原生 shader、混合因子、必要纹理/遮罩、屏幕片段程序，或出现未支持 shader / 混合模式，必须报错。`--metadata-only` 也不能绕过校验。
- 混合必须读取可见颜色 pass 和材质参数。GrabPass、ShadowCaster 不能当颜色 pass；不能凭材质名含 add 或图片背景黑色来猜，也不能把所有黑色像素抠掉。
- Unity 的 SrcColor / One（3,1）属于源 RGB 平方后叠加，不是普通 Alpha 混合。`material-blend.js` 将 1/3/5 源因子与 0/1/10 目标因子按支持范围处理；叠加光的画布覆盖度独立计算，黑色零光不能覆盖背景。
- 遮罩与第二纹理的 UV 独立保留。原生 Mask 单纹理族 RGBA 倍率为 2，双纹理族为 4，包括 Blend、Shear。透明颜色与预乘只做一次；屏幕抓取着色器使用其原生片段与画布覆盖度适配。
- 原生 `_Mask` 的空引用有时明确使用 shader 声明的白色默认纹理；必须保留 `defaultTexture: white` 的证据，不能与引用丢失混为一谈。只读取当前 shader 声明的输入，忽略材质里旧 shader 残留的纹理参数。
- 最小静态检查：`python tools/fx/check-material-contracts.py --index <本次涉及的索引>`；报错材质回归：`node tools/fx/check-material-contracts.mjs`。它们检查来源、引用和实际材质参数，不是视觉或像素验收。

## 解释器和渲染排查顺序

1. 先检查依赖是否齐全、实际动作与投射物分支是否正确、局部时间是否对齐，再检查材质和渲染。
2. 若单素材正确、联动错误，以同一预设、同一局部时刻、同一种随机分支对比两条路径：出生时间、父子矩阵、锚点、相机、纹理与材质绑定、子网格、绘制顺序。必须找到差异后再修改，不能凭观感反复改通用渲染。
3. 随机算法及取数顺序由原生实现确定；固定种子用于复现，不能以某个看起来正常的种子代替算法。手动选择随机模型仍需保留原随机调用的消耗。
4. 保留动作原生位移范围、目标搜索和副目标限制。不要把所有技能都移动到主目标，不要因增加副目标重复施放整个技能。
5. 弹夹与连续攻击按原生弹药/耐力、段落、间隔和触发条件衔接；前一发的弹体和尾迹可以跨到下一发。预览不是完整战斗服务器，不宣称覆盖全部碰撞、网络或队伍规则。
6. 世界空间粒子必须在各自出生时刻采样发射器（含父节点）的 CustomAnimator / RotateThis 变换。不能取 prefab 序列化的最终姿势，否则运动弹体会直接堆在终点。诺克西亚专武的手爪由 prefab 内部曲线前进，Lua 中的 proj_pos 主要用于碰撞范围，不能再额外给整个 prefab 叠一次位移。相关最小数值检查为 `tools/fx/check-moving-emitter.mjs`；影响范围记录为 `tools/fx/source-cache/moving-emitter-scope.json`。
7. 屏幕特效依据 ScreenEffectObject 与 transformType 使用对应投影。不要把世界方向压缩直接套用到屏幕空间。
8. 无源法线的静态网格默认通道与 CPU 网格粒子烘焙输出不同：前者可使用原生默认 (0,0,-1)，后者本地 Unity 数值探针输出零法线。保留源法线；不能统一生成三角法线或将一种路径规则套到另一种。探针记录在 `tools/fx/source-cache/dokkaebi-native-mesh-probe`。

## 最简验收与交付

- 检查新增预设、投射物及其纹理/网格引用都可解析，输出中没有非有限数值，动作有合理终点或明确连续循环边界。
- 对本次新增机制选择一个固定场景做数值/DOM 检查。通用修改先确定实际消费者，仅抽查受影响部分；不运行全角色、全皮肤、全朝向大遍历。
- 名称和外观标记变更只需核对原始表、规则和一个页面选择变化，不需要图像验收或重复导入资源。
- 文档中的历史 check 脚本不是必跑清单；先看覆盖范围，选择与改动对应的最小检查。报告做了哪些检查、仍有什么局限，不把未验证的视觉效果写成已彻底复原。
- 结束时交代修改、数据来源、最小检查结果和剩余问题，并同步本文中的规则。

## 当前交接状态

本轮开始前早期已具备联动导入包：adelanoble、carpgirl、dokkaebi、fallenqueen、gnomedoctor、hana、idolcaptain、invaderknight、milkywaygirl、peimei、villainredhood。

已同步的专属特效时装：hana_beachball、fallen_queen_wedding、invader_knight_dead_cell。invader_knight_mecha、villain_redhood_death_angel、villain_redhood_mecha 当前原生替换仅涉及跑步音效，不标为专属特效外观。

**小妖怪联动模型的外观异常尚未解决，用户已明确要求暂时跳过。** 四种原生模型分支（盒子、汽车、鸭子、石块）已加入选择；这不意味着模型视觉问题已通过验收。后续若恢复排查，应从单素材与联动的具体差异开始，不重走猜测性通用渲染修改。


## 本轮清点、反馈与同类错误审计（2026-10-30）

- 原始表有40个可玩开花形态；完整身份与包存在性见 [清点JSON](development-archive.md#archive-40950fe3ea73)。用户将 legendaryhero 交给另一 agent，其角色数据不由本体修改。
- 历史快照（已被[当前进度](development-archive.md#archive-89b28ca1cb97)替代）：本体起初缺失的31个形态当时有19个明确缺项：1个缺包、4个构建错误、14个缺动作类别。另12个只通过已识别动作类别构建，不代表视觉验收。具体名称与缺项见 [剩余工作](development-archive.md#archive-58faf57e28f7)。不得将这些包统称“已复原”。
- 本轮已处理用户反馈中的遥黑底、V专武错误／白盘／火车尺寸、凯勒后处理白块／矩形底、拉克里玛共享方向与子效果出生时序、塞拉黑底，以及松鼠的移动／下落／方向分支和整弹匣。凯莉冲刺前端一次原生网格数值对照未见反向差异，保留原生方向；这些记录均不替代用户视觉验收。
- [全部教训与防复发规则](fx-restoration-lessons.md) 是本轮新增维护入口；涵盖“可构建不等于复原”、材质／预乘合成、Sprite尺寸、模拟空间、纯值节点、独立routine、连续弹匣与ScreenFX。
- 共用修正必须清点实际消费者。当前专题报告：[材质](development-archive.md#archive-68f37e76a17d)、[动作图](development-archive.md#archive-523ff94d073d)、[屏幕投影](development-archive.md#archive-bf20bfa2c9fe)。这些报告区分确定错误、待核查风险、未覆盖的源机制，并包含输入快照；不能把所有风险当作已证实视觉bug。
- 普通增量导入现在也会检查动作依赖的原生材质合同：旧导出缺来源或有合同缺项时，定向重转相应消费者；`native_material_contract.py` 会拦截不完整绑定。不能再用材质名称启发式覆盖原生状态。`--metadata-only` 仍不能用于补素材。
- `--repair-legacy` 保留作显式旧资源修复入口；`--defer-cleanup` 可用于分批导入，结束后只允许按全运行时引用集合执行原有共享清理。多个agent不得并行执行全库cleanup。
- 早先ScreenFX固定场景仅验证内部一致，**不能作为整体不变形的结论**。双胞胎截图后已发现并修复超宽预览区域被当成游戏视口造成的横向拉伸（见下节）。原先记录：ScreenFX固定场景未见播放视角45度压缩回归：单素材／联动节点和185个可见网格矩阵一致，斜视／俯视／播放的屏幕X/Y比例均为1。仍有彩虹雪酪与骑士雷云混合子节点候选，及6个type0脚本的viewport深度／父位置规则缺口；不宣称全部原生屏幕路径完全一致。
- 单素材与联动路径彼此一致，只证明两路径没有差异；两者仍可能共同遗漏原生机制。必要时以同版本源值或一个固定原生数值探针对照，不用全皮肤、全方向截图替代证据。

本次补齐 legendaryhero 与 necromancer 的通用装备/召唤机制。其他批量导入状态以 `gtfx/assets/native-characters/` 为准，不能仅因文件存在就宣称所有视觉已验收。透明度修复后的静态依赖审计记录在 `tools/fx/source-cache/material-acceptance-report.json`；只覆盖实际动作依赖，不声称历史未使用素材均已重建。


## 持续任务与最新修正

用户目标是持续正确复原全部开花角色，逐人交付检查；新机制使用短上下文代理。Pandagirl、TwinsAndroid、FoxShikigami、EternalFlame、Saintess本轮已给用户检查，AA72的后坐原语已实现、尚待共享骨骼角度hook，不能因菜单齐全就提前算验收。

双胞胎ScreenFX实际网格检查补充：source 2:1框中下圆环高宽比0.903953，旧超宽2000x528为0.477287，斜视/俯视均一样。`gtfx/screen-viewport.js`将源声明画框等比放入预览，修后两宽高比及视角下均0.903953。此前相机轴/矩阵一致检查遗漏了共同的宽高比拉伸；教训已补入对应章节。此为预览视口适配，不篡改原始ScreenEffectObject公式或素材形状。

原生查找器 `tools/native/native-controller-image.py --method Oak.Type.Method` 现在可按完整方法名导出由实际注册边界限定的代码（单体<=16KiB），减少手查地址；较大方法仍需显式范围。动作管理器的ComboAction/ExtraAction依赖也已泛化递归收集。


### Native manager 续接（2026-10-30）

- bakeneko 已接原生 manager 的四段顺序、条件 ExtraAction、Role 4 秒 ownership aura／首合法命中消费、普通与强化连锁／专武分支。强化入口保留 nativeCondition，不将 Extra 拼作第五段。源 Lua 与原 buff／option 表进入 plan 来源记录。唯一固定数值场景为 myth/right/target=6，检查脚本 `E:/GTFiles/check-bakeneko-managed.mjs`；67 个动作依赖特效／544 材质合同通过，无截图或像素验收。命中依据预览目标几何，不能称为完整战场 buff／碰撞仿真。
- eugene 已接四段 manager、真实 sfx Spine callback、Crash 延迟 dash、Spin 的源 pool timer，以及 C# Support 的接近／旋转／后跳／返回和专武的投影圆周运动、动态方向骨架／肘骨射口、随机 groundhit、弹壳弹跳／RGBA 淡出／落地 smoke。源 pool Type、Offset、InitialScale 明确 opt-in，保留 Slash 旋转、负缩放及真实零 Direction 语义。固定 myth/right/target=6 的骨架／DOM 检查在 `E:/GTFiles/check-eugene-manager.mjs`；30 特效／166 材质合同通过，无截图／像素。专武源 ExecuteMove 将相邻投影差的长度沿原方向前进；固定 60Hz 数值终点为 8.67411255，不能按投影位置直接倒退。专武真正需要的 front/back/side 骨架与当前原生 bundle 字节 SHA 一致，记录在 `E:/GTFiles/eugene-source-skeleton-provenance.json`。独立源操作在 `native_csharp_melee.py`、`native-melee-operations.js`，方向资源按动作实际需求懒加载，见 `character-direction-views.js`。当前范围是平地固定 60Hz 的显式动作预览，不等同地形障碍或完整战场规则，也未作视觉验收。


## 用户验收与覆盖范围纠正

当前状态以 `docs/fx-restoration-progress.json` / `docs/fx-myth-remaining.md` 为准。用户确认11角色通过，罗茜刚完成待验收。尤金仍有原生管理器远程支路遗漏（OptionId310338的ShootDist/Columns/ReloadDuration），从完整状态撤回并交新短上下文代理补齐。当前已知待补完7个，另19个已有角色需源分支审计，小妖怪模型保留用户暂跳过的旧问题，legendaryhero外部所有。

不要把“只剩几个人在制作”推导成“其余所有机制已证明完备”。旧包、早期已构建角色、已验收角色与已识别分支证据必须区分。新增可见组件漏导/真实觉醒形态/原始觉醒树等合同已进入普通增量导入，不再只对用户指出的单例修补。


## 本轮最新状态覆盖旧快照（2026-10-30）

用户已确认此前交付角色通过。骑士男女在界面合并，保留剑/弓专武与真实原始形态。尤金远程距离分支和八发装填已补；奥尔卡原生无弹药消费，仅三段ICombo，不因MagazineSize6伪造六发。

制作仅剩加百列：3.54/3.51混版Sprite依赖已解决，实际动作入口检查又发现ManualStoreAngel Lua持续状态机普攻未实现，继续制作；禁止把成功导入当作机制完成。详见最新进度JSON与剩余工作文档。历史“7个剩余”“11个验收”等数字均已过时。


## 加百列交付覆盖上段制作中状态

加百列持续Lua普攻、十发/末发、独立专武、连锁与开花已全部接入，普通导入及固定源检查通过；真实专武播放入口在角色动作结束后仍正确播放尾程，无页面/WebGL报错。待用户验收。最终本体constructionRemaining为空，37形态此前用户通过、加百列1形态新交付，另1旧外观问题用户暂缓、legendaryhero1形态外部所有。源/方向确定合同错误0不等于所有动态候选分支都已证明。

9现有角色另37个StageShadow绑定已按通用guard修复，新增全库材质审计调用effect_render_issues避免只查shader。最终状态统一见进度JSON；不要再沿用任何旧制作中数字。


## 最新用户反馈与操作边界

用户禁止操作或重启Chrome，并明确已验收角色无明确理由不许再动。当前只处理其明确反馈：加百列开花闪屏黑块、fallenqueen非开花仅待机。加百列已修预览棋盘进入GrabPass的问题（保留源shader/图片，棋盘用已有CSS，GPU透明）；仅源码/CPU验证，待用户视觉复验。fallenqueen已按真实WeaponSpec和当前英雄支持类型修镜像图标同名引发的custom/staff误判，原版8动作/开花9动作，0特效重转0材质改动。

新一轮source motion/aim等增强草稿未应用到角色包，共享hook和运行时试接已撤下。不要把草稿或审计candidate写成已交付；不要擅自扩大已验收角色变更。


## 当前制作阶段：非开花角色首批十角（覆盖以上历史制作中快照）

用户已确认开花制作阶段完成，转入其余角色。当前准确身份清点、基线与逐人状态见 [角色待办台账](fx-character-backlog.md) / 同名 JSON：171 个正式角色组，起点 43 组已有包，其余 128 个需要新制作（100 个已有 FX 组，28 个需要通用 create-hero 路径）。包存在性与用户验收分开记录，不能用当前新增包反算基线。

用户要求十个一批、子代理并行、每个完成立即通知，最简源数值/骨骼/材质检查，不操作其 Chrome 或其他浏览器，也不因新批次扩改已验收角色。首批固定为 pirate/sniper/eighttail/festivalgirl/steamknight/maid/succubus/futureknight/rudolph/whitedaygirgas。逐人状态以台账为准；`ready-for-user-review` 不是用户已验收。

共享导入器已增加显式 source-first 逐动作编译、精确 Origin/form 身份、重复 style 合同、heroes2 双专武有效源快照、动作声明 pool 驱动精灵模板依赖。配套检查器使用真实 UI 装备解析，并阻断无可见普攻轨道。最新教训写入 [教训](fx-restoration-lessons.md) 末节，夏皮拉分轴 RotateThis 漏读已按用户具体反馈修复。


第二批已开始，固定十角 tanker/viking/gourry/stark/captainrabbit/whitebeast/alpacagirl/bluedragon/lifeguardyuze/frieren。首批十角均已交付待用户验收；第二批完成情况仍以backlog逐人状态为准。按源机制复用已有时间线与素材转换，新增helper按批隔离、共享hook统一接线；不以compiler命中或文件存在代替完成。


第二批十角现均已交付待用户验收。期间具体反馈已闭环：克雷格连锁取错同名assetName别名，已统一为精确preset优先；卡洛儿第二段关闭的粒子Renderer被误绘，已修converter/runtime并定向更新素材；同类源检查又修高里4处、白雪2处。奈娃按用户范围移除专武效果与入口。最终十角初始入口检查见E:/GTFiles/fx-batch2-final-readiness.json；Renderer源检查见E:/GTFiles/batch2-renderer-enabled-audit.json，7处disabled均正确、mismatch/errors均0；梅丽尔连锁无演员clip是源隐藏owner、独立实体播放的正常合同。


第三批15角已交付待用户验收：fern/mechaandroid/villainandroid/summerloraine/eleanor/mermaid/slimeshuna/soulpowergirl/goatgirl/pixygirl/sheepgirl/chinachef/dragondaughter/vampirelord/popp。MK99漏发射已定向修复、实际弹体位移检查通过；孩子王角色技当前文件真实CPU链通过，请用户刷新页面复验。新增通用嵌骨播放preflight也发现并修正夏罗省略片段速度引起的NaN，全部11条轨道通过。本批最终入口见E:/GTFiles/fx-batch3-final-readiness.json，源Renderer审计见E:/GTFiles/batch3-renderer-enabled-audit.json，嵌骨实际播放检查见E:/GTFiles/fx-batch3-skeleton-effect-actions.json。未操作浏览器、未作像素验收。


## 2026-10-31 用户点名续接

本轮用户明确要求修瓦伦西亚方向、索菲错误、玛丽安连锁/专武，完成蒂尼亚/拉比/帕比/青叶/凯瑟琳、knight_captain伊娃和旧佩梅。埃尔韦拉用户通过；229/234/239/244/259/269/381行为不再处理，马蒂二世名称和佩吉多余头像仅按明确反馈修正。禁止浏览器、最简检查。

罗兰茵(origin-19)、道尔夫(origin-130)原本未完成catalog登记，现已恢复特效栏目，新增source-story-final显式动作编译与运行时：投掷/连续/末发、治疗/落菇/移动Emma，普通与专武概率强化火球/三连落火/独立陨石。初始UI装备入口 E:/GTFiles/fx-final-story-readiness.json 两角通过；角色治疗原生不设新演员clip。此收据不等于视觉验收，地形反弹只在预览具备地形碰撞时触发，不伪造墙壁反射。

帕比、青叶、拉比、佩梅已逐角交付；其余点名项由独立子代理继续，最终状态以台账与后续交付为准，不将正在制作项提前标完成。


## 2026-10-31 本轮完成记录（覆盖上一节待完成）

用户点名角色蒂尼亚、拉比、帕比、青叶、凯瑟琳、玛丽安、knight_captain伊娃、佩梅已交付待视觉验收；罗兰茵/道尔夫已完整登记特效栏目，马蒂二世名称/佩吉NPC多余头像已修，埃尔韦拉明确记录用户通过。171正式组现均有栏目；128新制作台账为121已制作、7用户明确跳过，视觉验收另行记录，不能把7跳过或包存在算视觉通过。

用户随后逐图反馈7项已对应修正：罗兰茵全轴等比圆环、道尔夫cast/impact锚点、瓦伦西亚普攻Stretch方向、阿依莎天基炮目标锚点、索菲链束端点、索菲TileAnimation整图、佩梅强化蓝波Stretch。规则与必要源数值见教训末节；未操作浏览器、未做全库或全皮肤测试。

固定证据：E:/GTFiles/fx-maiden-uniform-scale.json、fx-final-anchor-fix.json、fx-valencia-basic-stretch.json、fx-sophie-tileanimation-fixed.json、fx-peimei-blue-strip-fixed.json；角色入口见fx-survivor-readiness.json、fx-knightcaptain-ready.json、fx-three-readiness.json、fx-healers-readiness.json及本批其他逐角收据。CPU一致与source-first不替代用户视觉复验。


## 用户验收与目标固定修复（2026-10-31）

用户明确确认“我都验收过了，没问题”，台账已将本轮制作/修复记为通过；7个明确跳过来源保持excluded-by-user。随后新增的目标跳侧bug已修复：两个播放入口冻结默认目标场景坐标，动画临时朝向只改变演员，不能重新计算目标所在侧。最小证据E:/GTFiles/fx-playback-target-snapshot.json；不重导已验收角色。
