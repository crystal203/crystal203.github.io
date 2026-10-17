# 1-2 原生控制器调查续记

本次继续沿认证 ARM64 overlay、元数据和原生资源恢复条件与回调。完整 1-2 剧情尚未实现，不能验收“0 差别”。来源版本与哈希见 `tools/native/evidence/stage-1-2-ledger.json`。

## 分析命令问题

旧的临时元数据脚本出现异常退出，输出会话未及时结束；不能将持续等待理解为正常进展。新的 `tools/native/inspect-controller-metadata.py` 对名字查找设 512 字节上限，校验表边界/记录跨度，限制输出的类型和成员数量，关闭 mmap/file，并原子写入结果。缺失终止符不会扫描或切出文件剩余部分。

该版本元数据的 magic/version 也受保护，不能把两个原始字声明为正常版本号。类型布局仅用于当前已调查的签名。XOR 编码的 `f` 为 `0x00`；忽略这一点会把 `fadeInTime` 等字段误读为空名称。工具对此有回归检查。受保护的无效方法记录和未解析 TypeInfo 注册项均显式标记，不能猜测其类名。

本机生成所选类型和 usage 快照约需 1 秒；这不是全 APK 分析的耗时保证。可在仓库根目录重现：

```powershell
python tools/native/inspect-controller-metadata.py --profile E:/GTFiles/native-workbench/11ad39a67bb2a7ba/profile.json --type StageEventControllerSuperTutorial --type TutorialState --type Oak.SfxInfo --contains Butterfly --usage 0x2000ba41 --usage 0x2001897b --usage 0x20011ebd --usage 0x2000e60d --usage 0x200186b1 --usage 0x2001a4b9 --output tools/native/evidence/stage-1-2-metadata.json
python tools/native/verify-controller-metadata.py
node tools/native/verify-forest-controllers.mjs
```

## 已核对的剧情条件

教学类实际名称为 `Oak.StageEventControllerSuperTutorial`，`currentState` 位于 `+0x50`，`isTutorial` 位于 `+0x54`。元数据恢复了 Began、SlimesEliminated、Equipped、WaitingForSuper、Cleared 五个名字；实际状态写入地址记录在控制器契约中。`SlimesEliminated` 的存在不代表该版本一定经过这个状态，不能凭枚举补一场战斗。

`OnStageLoad` 先将 `super_tutorial_goblins` 的四个角色移到 `[999,0,999]`，随后判断宝箱原生 `IsOpened`：已完成则设 Cleared 并发送两扇门的事件；未完成则写宝箱 `DontFinish=true` 并设 Began。注册表独立确认 `DontFinish` backing field 位于 `+0xa8`。地图宝箱包含 4 级物品 9010020。领取道具、推荐换装、宝箱 Finish 和教学完成必须分别恢复，不能把网页 collected 记录直接代替原生 `IsOpened`。

元数据与 TypeInfo 注册确认 `BattleGroupEliminatedEvent`、`ItemGetEvent`、`EquipmentChangedEvent`、`TreasureOpenedEvent` 和 `TouchControlModeChangeEvent`。教学分别检查怪物组 `super_tutorial_goblins`、`crusader_sword_normal` 的物品 ID/装备 spec 名称和当前状态。换装事件设 Equipped 并启动 AppearGoblins；结束流程包含两段选择、保存/恢复原武器和动态武器名称旁白。`Oak.EquipStageLogic.Execute` 的实际入口为 `0x74b0418`，参数为 Character、EquipmentSlot、Weapon；不能用猜测的 UI 流程代替它。

蝴蝶 `+0x28` 和 `+0x29` 是两段路线各自的瞬态布尔锁，在启动协程之前置位，第二段不检查第一段。网页已修正此条件，并从蝴蝶实际位置计算路线时长；关卡独立模块持有这些瞬态字段。重进时重建控制器，旧的蝴蝶 scene flags 不作为恢复依据。原生还检查进入事件、队长身份与 `substage_1_6` 开启状态，`butterfly_3` 添加 type 9 引导 marker，第二段结束移除 marker；这些尚未完整接入。

SealedKingdom 使用 `StageEventSealedKingdom.json`，原生剧场为 `theatres/sealed_castle:bg_sealedkingdom`，创建回调将其位置设为 `[50.70000076293945,0,59.5]`；原始相机点为 `[50.7,0,60]` 和 `[51,0,53]`。MethodRef `0xc0069323` 解析为 **StageProgress.GetCustomData**，关卡进度 bool key 1 在播放场景前写入；此前记为 User custom-data 的说明已纠正。已导出原生 prefab，并编译十句原生对白、镜头、跳跃和 KidBoyDamaged 回调，接入独立 SealedKingdomController。

DamageSquish 的参数顺序为 broad、narrow、**int frequency**、duration、firstAnchor、secondAnchor；调用里的整数 1 不能解释为 bool。PulseColor 使用 `Oak.Constants.DamageColor=[1,0.3499999940395355,0.3499999940395355,1]`。偏移、挤压与颜色脉冲公式来自实际方法体，证据与剩余限制见 `tools/native/evidence/native-spine-motion.json`。公共时间轴只新增这些通用动作通道，关卡回调和持久化保留在关卡模块。

## 证据边界

`stage-1-2-controller-contracts.json` 记录条件、实际写入地址、回调与未决项。新增 `native-controller-image.py` 读取当前 ELF 的 Scripts.dll codegen module `0x9a3b730` 与 MetadataRegistration `0x98fb820`，校验模块、计数、方法 RID 和控制器锚点，再解析 token、字段偏移和 usage。方法表有 195390 项，类型注册有 83682 项；地址仅适用于 ledger 固定哈希的 ELF。受保护表记录按 metadata token 类型检查后解码，不能套用旧符号标签。

蝴蝶 `0.7f` 对应 `SfxInfo.fadeInTime`：注册字段偏移 104 减去值类型装箱头 16，得到调用现场的 `+0x58`。FadingSfx 的 Progress 为 clamp(TimePassed/Duration)，目标音量为 StartVolume 到 EndVolume 的线性插值（`0x88ac054..0x88ac088`）。通用音频层已传递淡入参数；Web Audio 使用连续线性 ramp，原生逐帧更新，两者采样粒度仍有区别。

当前共享时间轴仍串行，不能代表原生并发 ScreenPlay；区域 inside 轮询也不能代表原生碰撞进入事件。新增静态检查覆盖独立触发、实际起点、时长、重进及原有 1-1 回归，不能替代原生运行对照。

王国剧情目前仍未达到逐帧等同：偏移状态切换帧停留、Unity 随机数状态、对白生命周期及字体度量需原生运行对照。教学、白兽、燃烧骷髅和吸血鬼偶像控制器仍未完整接入；预览继续禁止记录通关。

用户补充要求：普适机制的修复应同步作用于已有关卡。`SpeechBubbleNew.OnTouchEvent`（`0x758b30c..0x758b4cc`）证明：state 1 时点击调用 ShowImmediately 并变为 state 2，state 2 时点击才变为 state 4。公共播放器现已对 **1-1 与 1-2** 的原生对白采用该行为，删除此前额外的 0.25 秒点击门槛。回归读取两关真实对白并经过实际 loader 验证；没有改写 1-1 剧情数据。原生逐帧打字会丢弃超出的 delta，当前连续采样仍有差异，不能因此宣布完整对白等同。见 `native-speech-bubble.json`。

注册解析与回归命令：

```powershell
python tools/native/native-controller-image.py --profile E:/GTFiles/native-workbench/11ad39a67bb2a7ba/profile.json --class Oak.StageEventControllerSuperTutorial --class Oak.SfxInfo --class Oak.TreasureBehaviour --output registration.json
python tools/native/verify-native-registration.py
python tools/native/verify-screenplay-compiler.py
node tools/native/verify-sealed-kingdom.mjs
node tools/native/verify-audio-envelope.mjs
```
