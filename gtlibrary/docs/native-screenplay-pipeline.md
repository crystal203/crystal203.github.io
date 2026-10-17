# 原生剧情的批量转换流程

原生脚本先转换为保留结构的 IR，再由共享操作编译器生成演出计划；每关只声明资源、文本依赖及原生独有回调。1-2 的 `sealed_kingdom` 已通过这条流程构建，通用引擎不识别关卡编号。

## 当前可用的工具

| 层 | 文件 | 职责 |
| --- | --- | --- |
| 源头定位 | `tools/native/native-controller-image.py` | 用已认证 ELF 的注册表解析方法、字段和 usage；不借用旧符号猜地址 |
| 协程恢复 | `tools/native/inspect-native-iterators.py` | 从工厂方法的 TypeInfo 引用自动找到正确的 MoveNext，批量导出有限代码范围 |
| 脚本前端 | `tools/native/screenplay-ir.py` | 保留顺序、并行、actor scope、参数、JSON Pointer、来源哈希和回调引用 |
| 共享后端 | `tools/native/screenplay-compiler.py` | 统一转换已恢复的操作及其受支持参数；未知操作或参数直接报错 |
| 关卡适配 | `tools/native/stages/*.py` | 声明事件资源、对白前缀、场景入口和 native callbacks/custom actions |
| 地图基础 | `tools/native/build-stage-foundation.py` | 构建地图、角色和对象；事件依赖由参数传入，不内置 1-2 资源名 |
| 运行控制 | `gtonline/stages/*` | 持有原生触发条件、任务状态、一次性标记和恢复逻辑 |

## 构建方式

在仓库根目录运行。源文件目录与输出目录可以替换，工具不需要联网或安装额外的 Python 依赖。

```powershell
python tools/native/screenplay-ir.py index --source E:/GTFiles/files/events --output E:/GTFiles/screenplay-batch
python tools/native/screenplay-ir.py convert --source E:/GTFiles/files/events/StageEventSealedKingdom.json --output E:/GTFiles/sealed-ir.json
python tools/native/screenplay-ir.py lower --ir E:/GTFiles/sealed-ir.json --stage gtonline/assets/stage-1-2.json --section sealed_kingdom --adapter forest-entrance --output E:/GTFiles/sealed-plan.json
```

`index` 一次生成兼容性目录与压缩 IR 集合。目录按文件和段落列出缺失的操作转换器、未知参数及回调依赖。支持原生文件中的尾逗号；拒绝重复 JSON 键，避免覆盖掉前面的操作。每份 IR 都检查能否重建原始解析结构。

`lower` 检查 IR 的来源哈希是否由目标关卡声明，只调用本地显式指定的适配器。原生脚本字符串不会作为 Python 或 JavaScript 执行。`build-forest-entrance.py` 使用同一后端，避免另维护一份手工王国剧情。

## 如何增加后续关卡

1. 增加一个关卡适配文件，声明 `EVENTS`、`STRING_PREFIXES`、`SCREENPLAYS`，并实现 `bindings(stage)`。
2. 根据兼容性目录优先补共享转换器。相同移动、表情、音效等操作只实现一次；关卡回调留在适配器里。
3. 从 C# 控制器恢复场景触发、分支、任务标志和保存时机，放入该关卡的运行模块。JSON 场景本身不能证明何时触发。
4. 使用必要的构建与回归检查；不为每段相同结构重复完整浏览器流程。

批量编译的输入应是“关卡声明 + 原生脚本 + 控制器契约”，而不是把全部事件文件不加判断地激活。未知节点保留在 IR，未绑定回调明确列入待办。

## 当前批次与边界

本地 114 份原生事件 JSON 已转换为 1,797 个段落，包含 53,645 次操作。报告记录 37,860 次已知操作名；这只是操作名识别计数，不能当作可播放剧情覆盖率。另有两处旧脚本的标量 `do` 节点保留为待解析结构。

下一批共享工作优先处理 `move`（3,904 次）、`position`（2,776 次）、`play_sfx`（2,442 次），再处理动态 `await`、角色组和任务条件。完整压缩 IR 留在本地工作区；仓库保存兼容性目录和必要的证据，不重复复制原生资源库。

顺序/并行的依据是 `ScreenplaySequence` / `ScreenplayDo` 的注册方法及协程。`ScreenplayDo` 构造 `Foundations.WaitAll`（TypeInfo usage `0x20019a8f`），顺序协程逐个 yield 子操作。原先扁平编译器把普通 actor 对象按顺序处理的规则已修正；显式 `$actor sequence` 保留串行。

当前后端仍是既有时间轴，动态条件、并发对白生命周期、角色组和任务协程需要继续接入。IR 保留这些结构，为后续调度器提供输入；生成 IR 不等于原生控制器已全部实现，也不代表通过完整剧情一致性认证。
