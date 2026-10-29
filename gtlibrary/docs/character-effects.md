# gtfx 人物与攻击模组联动

本地运行 `start-local.cmd`，在 gtfx 选择角色。支持人物的条目默认进入「攻击模组联动」：一个模组按原生动作时序组合多个特效、Spine 动画、专武和施放位置。「单个特效素材」保留原来的逐件查看、分层与导出功能，此模式不附加人物。

外观使用 `resources/registry.js` 的原始中文名称和 Spine 源内码；皮肤菜单显示骨骼实际包含的原始皮肤内码。联动模式的默认视图按 Spine 人物的投影高度取景，使人物约占画面高度的 17%；「适配」按钮仍可查看整个特效范围。人物、粒子和链节共用 gtmap 原生视口投影、时间采样和导出帧。目标环可隐藏。

## 角色身份

`fx_peimei_*` 的 FX 目录 ID 是 `peimei`，资源文件是 `gtfx/assets/characters/peimei.json`。它是佩儿／梅儿共享特效入口，外观选择 `china_hero_boy_5` 或 `china_hero_girl_5`。共享注册表的 `peimei` 别名、16 条搜索记录和预览头像都指向这对英雄。消逝之都女市民继续使用自己的 `china_female` 身份和 `china` 别名，不再关联 peimei 特效。当前佩儿／梅儿的基础拳击已建立联动；其他效果可在独立素材模式查看。

## 模组实例

`gtfx/action-modules.js` 依据原始预设建立攻击模组，`gtfx/action-player.js` 同时实例化多个效果。每个实例保留自己的生成时间、方向、锚点、存活时长和独立的可复现粒子随机种子；弹体本身沿弹道飞行，非局部尾迹粒子留在出生位置。`gtfx/character-player.js` 播放模组对应的原生 Spine 动画和专武。带 `ScreenEffectObject` 的 `screen_fx` 使用独立屏幕叠加通道，按原生 `transformType` 处理；Hana 与银河的类型为 1，只缩放效果节点，不使用 `viewPortPosition` 移动整组；类型 0 才按视口坐标定位。单独浏览和模组联动均可显示，并随输出画幅调整。

银河 `milkywaygirl` 包含普攻第一至第四段和连续播放、连锁、四种并列的角色技能蓄力等级、武器附加效果、专武技能。蓄力等级由动作参数决定，与外观或皮肤无关。角色技能起手即移除原先持续显示的黄色星形蓄力符号，以 `symbol_end` 收尾；0.35 秒后在人物中心触发对应等级的爆炸。第一／二段按原生 `ShootTiming=0.14` 发出三发弹体，各自有投射物、尾迹和结束特效；第三段在 0.15、0.25、0.35、0.45 秒发射四发。专武按原生三轮落星、每轮三次命中的时间实例化落星弹体、尾迹、爆炸和屏幕特效；每轮三颗落点相隔 120°，围绕目标半径 0.8，起始角固定以便复现。原生爆炸实例不传角色朝向，因此石块与白色光圈沿预制体自身方向生成；落星弹体则沿发射点到落点的方向旋转。多弹体位置和导出都在同一模组中计算。跟踪与目标分布使用可复现的演示方向，实际战斗的寻敌和伤害判定不在预览中执行。

Hana 同样提供普攻分段与连续播放、连锁和三种可分别选择的专武差分。原生每轮第一次命中都会实例化屏幕特效，所以三种差分都包含它。钩锁链条复制原始链节；gtasset 的武器镜像与原生视口补偿共用于联动。佩儿／梅儿提供蓝拳、红拳和连贯普攻模组。

原始时间与位置依据 `E:/GTFiles/static_data_dec/battleactions.json`、`projectiles.json` 以及 `E:/GTFiles/decrypted/Battle/BattleAction/` 下的对应 Lua 脚本。Hana 联动的具体参数保留在 `gtfx/character-link.js`。这些原始目录仅用于校验，网站运行不依赖它们。

## 材质审计和验证

`python tools/fx/audit-material-blends.py --source D:/GTAsset/FullExtract/ExportedProject/Assets` 对照原始 `.mat` 的 `_BlendA/_BlendB` 与所有 FX 清单。本轮在 26 个能唯一确认混合模式的材质中修正 9 个错配，涉及 14 份清单、74 处引用；之前还修正过 Hana 第二段的加法发光层。没有可靠源参数的材质保持未判定。

`node tools/checks/fx-character.cjs`（需要 Playwright 和 Edge）验证银河弹体的实际位移、并列差分、Hana 钩锁、peimei 双骨骼、屏幕特效的模组与独立素材模式、导出帧与原始尺寸。`node tools/checks/fx-multi-character.cjs` 是同一检查的直接入口。


## 固定种子发射布局

idolcaptain 开花技能的两层心形轮廓各由两片粒子拼成，源预制体关闭自动随机种子，使用固定种子 `2940251365`（有符号序列化值为 `-1354715931`）。Unity 的粒子模块使用自身的随机流；把这个数交给浏览器的预览随机算法，不能还原原来的出生位置。原生两片轮廓的局部 X 坐标为 `1.0554324388504028`、`-0.445120632648468`，横向翻转分别为 `1`、`0`。经过原有父节点变换，世界 X 为约 `1.511`、`-1.490`，与中心小心形对齐。

`tools/fx/bake-fixed-emission.py` 调用本机 Unity，从原始预制体生成 `gtfx/assets/native-emission/<character>.json`。筛选依据是粒子参数，未按角色或节点名称添加坐标补丁。目前仅支持固定非零种子、静止、无延时、不循环、单次爆发、确定初始属性的 billboard；其他系统继续使用原来的预览采样。导出器通过 `GetParticles` 读取局部位置，通过 `BakeMesh` 对比未翻转 UV 读取原生 Flip 结果，不依赖贴图或人工视觉估算。

重新生成示例（`--work-dir` 必须是尚不存在的临时目录）：

```powershell
python tools/fx/bake-fixed-emission.py --index gtfx/assets/characters/idolcaptain.json --prefab-root gtfx/assets/native-prefabs/idolcaptain --unity D:/Unity/2022.3.33f1c1/Editor/Unity.exe --work-dir E:/GTFiles/idolcaptain-emission-rebake --output gtfx/assets/native-emission
```

`import-character-native.py` 在重新导入或刷新预制体后自动附加这些记录。发射参数、种子或翻转设置变化时，签名校验会要求重新生成，避免使用过期布局。播放器使用记录中的局部出生位置和翻转，随后照常应用节点层级、朝向、缩放与投影；独立素材、攻击模组和帧导出共用该路径。数据保留 Unity 版本、源预制体 SHA-256 及每个粒子的原生随机种子，便于追溯。
