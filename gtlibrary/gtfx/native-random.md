# 原生粒子随机实现与复现边界

截至 2026-10-29，本轮已修复 Idol 开花技能的心形错位，四个角色的 105 个特效条目已从原始资源重新导入。**整个游戏的随机情形与技能机制尚未全部证明一致**。`native-fidelity.js` 和资源信息窗口会保留这个区别，不能把“已导入”“已就绪”理解为完整原生一致性。

## 心形错位的根因

`fx_idolcaptainmyth_myth_festival` 的 `bg_heart_line`、`add_heart_line` 使用作者保存的固定种子 `2940251365`，`autoRandomSeed=false`，一次发射两个粒子。纹理是半边心形，原始下端带有渐隐拖尾。

旧解释器没有复现 Unity 的分流与消耗顺序：粒子初始属性、形状、翻转不能从一条普通随机序列依次取值。仅把同一个数字填到预览种子里，不能补救算法或调用顺序的差异。运行时现在直接按原始种子构造；不依赖预烘焙的 `NativeEmission` 坐标，也没有针对心形添加位置补丁。

已从游戏 ARM64 指令得到的首批数据：

| 项目 | 第一个粒子 | 第二个粒子 |
| --- | ---: | ---: |
| 粒子 seed | 1687437330 | 1831122030 |
| Shape 局部 X（应用 shape scale 后） | 1.0554324388504028 | -0.445120632648468 |
| X 翻转 | 1 | 0 |
| 节点变换后的 X | 1.5108648538589478 | -1.490241289138794 |

设计者使用贴图、发射形状、缩放、曲线和固定种子等编辑器参数控制结果。这里能证明的是资源保存了固定种子，以及原生实现如何解释它；不能从资源反推出设计者是否曾经挑过种子。心形上方接点对齐也不意味着应把原图下方的渐隐尾端强行补成封闭轮廓。

## 已恢复的随机约定

`UnityRand` 是四个 uint32 的 xorshift 状态。种子展开为 `x=seed`，随后三次 `x=1812433253*x+1`，均取 uint32。浮点值使用低 23 位，乘以 float32 的 `1/0x7fffff`。

`UnityRand4` 有四个并行通道，系统种子依次加 `367*lane`。Initial 和 Shape 各自持有独立状态。一次发射不足四个粒子时仍消耗整个四通道批次。Initial 中常量曲线也会消耗对应随机值；3D size/rotation 改变所需通道数。粒子翻转、速度、颜色、大小等其他模块由粒子 seed 加各自偏移派生。

自动种子来自 ParticleSystemManager 的另一个全局状态。`ResetSeeds` 还会重置子发射器。Lua 的 `random_util.get_random_value` 则委托 `UnityEngine.Random.value`，不能把它和粒子自动种子或 Shape 流合并。

已有固定种子就直接使用资源中的固定种子；自动种子只能保证预览可重复，不能凭资源文件恢复游戏在某一局、某一帧的实际全局状态。还需要实际分配顺序和先前发生过的随机调用。

## 实现范围

- `native-random.js`：随机状态、Rand4、Initial 批次、粒子派生流。
- `native-shape-kernels.js`、`native-kernel-vm.js`：从 APK 提取的 20 个受限算术内核，共 6856 条指令；不执行任意原生程序、系统调用或动态代码。
- `native-shapes.js`、`native-mesh.js`：当前四角色需要的基础形状、随机/循环/往返/均匀模式以及 Mesh 顶点/边采样。Milkyway 的直线往返模式已补齐。
- `native-emission.js`：发射率、概率、整数 burst、循环边界、批次内出生时刻、帧随机状态。
- `native-motion.js`、`native-noise.js`：逐帧运动、轨道核、阻力、随机受力、噪声核。
- `native-subemit.js`：父粒子触发的子粒子发射、距离发射、概率与继承字段。
- `native-projectile.js`：按游戏 `HomingProjectile.GetMoveVector` 的顺序朝当前目标方向转弯、移动并增加速度；替换旧的“转回固定正前方”近似。
- `native_prefab_converter.py`：保留模块、脚本、shader、Gamma 色彩空间、物理重力和贴图采样设置；记录源资源 SHA-256。
- `import-character-native.py`：每个角色独立输出 profile、plans、styles、actions、projectiles、options、heroClasses 和原始 prefab 引用。

这仍不是完整 Lua/IL2CPP 游戏运行时。动作 plans 是对已恢复动作逻辑的解释，命中、碰撞和场景对象不由完整战斗引擎驱动。

## 证据来源

| 来源 | 版本/校验 | 用途 |
| --- | --- | --- |
| 用户本地 APK | Unity 2022.3.62f2 | ARM64 粒子形状、Initial、噪声/轨道、阻力、逐帧 Force 和游戏 IL2CPP 逻辑 |
| APK SHA-256 | `11ad39a67bb2a7bad18f59a22303fb7347017f6830d80ec63db6efe4f3e91d1b` | 固定原生证据版本 |
| libunity SHA-256 | `5c11324b7cea92f84d872f2f985482d06f0cc9d6deed42b9bfb0e111efb06810` | 固定 ARM64 内核来源 |
| 本地 Windows Unity development player | 2022.3.33f1c1 | 公开符号辅助辨认函数；发射等参考对照；阻力和两帧 Force 另有 APK 对照 |
| 原始 Lua / StaticData | 对应本地解包版本 | 动作时序、发射角、选项和资源关系 |

Windows 参考的补丁版本与 APK 不同，不能拿其单项通过结果宣称 APK 全部相同。夹具的 `provenance` 明确区分两类证据。部分数学库调用采用宿主 `log2/exp2/acos/sin/cos`，尚未证明与 Android Bionic 每一位相同。

本次反汇编和原生指令执行材料保存在 `E:/GTFiles/native-particle-rng`。仓库保留运行时指令数据和小型数值夹具，不复制整个 Unity 引擎二进制。

## 重建与最小检查

在仓库根目录执行：

```powershell
python tools/fx/import-character-native.py --index gtfx/assets/characters/hana.json gtfx/assets/characters/milkywaygirl.json gtfx/assets/characters/peimei.json gtfx/assets/characters/idolcaptain.json --refresh-all
node tools/fx/check-native-random.mjs
node tools/fx/check-native-imports.mjs
```

导入读取 `tools/fx/import-config.json`。`pythonExecutable` 与 `pythonLibs` 必须属于同一 Python ABI，导入脚本会自动切换到配置中的解释器。本机已用独立 Python 3.12.14 / UnityPy 1.25.4 完成四角色重建。旧 Python 3.10.11 环境曾发生内存访问异常；禁用可选 Boost 扩展不足以彻底消除，确切底层原因未确定。新机器需设置自己的资源路径和 Python 依赖目录，不能直接套用本机绝对路径。

`check-native-random.mjs` 仅执行有限数值夹具和追踪弹回放回归，不打开浏览器、不枚举皮肤或朝向。额外的新形状只使用一个五粒子案例，与原生指令结果对照。`check-native-imports.mjs` 仅构造四个代表性固定案例，检查独立包、静态精灵、Mesh 发射、拖尾、有限矩阵和回放一致性；不枚举外观或朝向。完整形状覆盖与直接资源引用审计是静态读取，不播放特效：

```powershell
node tools/fx/audit-native-characters.mjs --output native-coverage.json
```

## 怎样判断某一技能的随机实现是否不同

1. 在该技能的“资源信息”中导出复现数据，固定资源版本、外观、目标距离、时间和种子。导出内容明确标记 `origin: preview`，不是游戏实测记录。动作记录包含外观、皮肤、朝向、武器和目标距离；粒子的 `sample.matrix` 位于特效组局部坐标系，需结合 `coordinates.groupWorldMatrix` 才是预览世界变换。
2. 与同版本游戏采集的数据先对齐每个系统实际 seed、自动种子四字状态、发射批次、帧步长、发射器及目标轨迹。只有视频或单个数字 seed 不足以定位所有随机差异。
3. 比较第一个发生差异的层次：系统 seed 不同先检查分配顺序；batch 数量或 Rand4 状态不同检查发射/消耗顺序；状态相同但出生位置不同检查 Shape/变换；出生相同而后续不同检查运动、帧时钟或渲染。
4. 两份采用相同 `gtfx-replay-trace` 格式的记录可用下列工具列出最先出现的字段差异。退出码 0 只表示记录字段相同，不证明未采集的行为相同。

```powershell
node tools/fx/compare-replay.mjs reference.json actual.json
```

数值回放入口：`createParticleSimulation(effect, dependencies)` 可以接收 `effect.systemSeeds`（按 sourceId）、`seedResetOrder`（展平的 sourceId 重置事件顺序，包含子发射器；允许重复）、`particleAutoSeedState`（四 uint32）、`frameSteps`（秒）、`simulationDuration`、`emitterPosition(t)` 和 `emitterVelocity(t)`。动作播放器的 options 支持按实例索引传入 `systemSeeds`、`seedResetOrder`、`frameSteps`。追踪弹另有 `projectileFrameSteps`、`projectileStep` 和 `targetPositionAt(t)`；函数轨迹不会被 JSON 自动序列化，需另行保留输入。

## 尚未完成的范围

- 自动种子的游戏全局初始状态、对象池重启和跨系统实际调用顺序未采集；默认顺序仍是预览约定。
- 子粒子全局作业顺序、少数继承/生命周期边界尚未逐值核实。
- 拉伸公告板的完整顶点作业、拖尾采样/接缝、噪声完整作业及坐标变换尚未逐值对齐。
- StageShadowSetter 的场景阴影未执行，游戏目标生死、碰撞体与实际命中时刻没有完整场景模型。
- ViewportScaleReverter 的缩放恢复、SortingLayer 的运行时排序和投射物对象池生命周期没有完整解释；HookShot / EffectDirectionSetter 只验证了已有动作联动路径。
- 四角色动作的所有分支和触发条件尚未证明完整；依然存在近似的命中时间和动作解释。
- 默认 1/60 秒是可重复预览步长，不能代替游戏实际帧历史。没有显式 simulationDuration 的旧地图循环实例仍复用周期粒子。
- 所有矩阵、曲线边界和跨平台 libm 的最后一位浮点结果没有全部证明相等。

因此本轮结果不能标为“全部成功”。后续应从具体差异记录继续，不需要重新猜种子或重新遍历所有外观。

## 本轮保存状态

本轮修改保存在本地工作区，未提交、推送或部署。线上 CDN 仍指向原提交；后续部署需将运行时代码与新资源一起发布。详细阶段结果见 [repair-report.md](repair-report.md)，逐文件 SHA-256 与数值记录见 [repair-checkpoint.json](repair-checkpoint.json)。用户要求的截止时间为北京时间 2026-10-29 05:50:18，无论目标是否全部完成均关机。


## Mesh 粒子枢轴与 Flip（Adela 螺旋分散修复）

本机 Unity 2022.3.33f1c1 development `UnityPlayer.dll` 中的直接依据：

- `DrawMeshParticles<0>` RVA `0x1dff510`：`0x1dff560..0x1dff675` 计算边界 max-min，先乘 0.5 再乘 2，与 renderer pivot 相乘，Z 分量取负。传入矩阵计算的局部偏移为 `bounds.size * (pivot.x, pivot.y, -pivot.z)`。
- `CalculateMeshParticleTransform<0>` RVA `0x1df9970`：从 `particleSeed + 0xee4f2bc1` 初始化单个 Rand，连续三次取样与 Flip X/Y/Z 比较，反射对应的几何尺度。`0x1dfa5c7..0x1dfa609` 将枢轴通过已经包含反射和缩放的矩阵加入平移。不能复用 billboard 的两个独立随机流，也不能用 UV 翻转替代几何反射。
- 原始 `FX_ring4` 的 `m_LocalAABB.m_Extent` 为 `(0.2128663063, 0.2546433508, 0.0458493121)`，与导入顶点计算的边界吻合。其 pivot Z=0.4 对应约 -0.03667945 个网格单位；此前误用 +0.4，经过 Start Size 后导致环片围绕偏离发射器的中心旋转。

修复位于通用 mesh 粒子路径，无角色判断；普通 billboard 保留现有处理。`check-graph-import.mjs` 在原有单个 Adela 专武案例中检查环片偏移、几何反射和 UV，并用一个不同尺寸的盒子验证三轴 pivot。仅数值检查，不截图、不遍历外观或方向。本条记录不表示其他尚未完成范围已解决。
