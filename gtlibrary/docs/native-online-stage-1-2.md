# GTOnline 1-2 接入记录（未完成）

当前不能按“原生剧情 0 差别”验收。1-2 仅开放明确标注的地图与蝴蝶路线预览，不记录通关；教学、白兽任务、战斗激活和完整剧情链尚未实现。原有 1-1 继续可用。

## 已接入

- `alt_forest_1_2_2` 原生地图、出生点、marker/region、角色占位数据和碰撞 prefab；38 紫币、3 星片、3 个原生宝物。装饰性宝箱不计数。
- 原生 `ButterflyGuide.json` 的两段路线，原生控制器初始化的睡眠坐标、朝向及阴影切换。触发/存档行为仍待原生运行对照，不能视为完成整个蝴蝶控制器。
- 蝴蝶的两段瞬态触发锁已拆到 `stages/forest-entrance/butterfly-guide.js`。原生第二段没有“第一段完成”的前置条件；路线按角色实际起点和原生速度 2 计算时长。并发 ScreenPlay、区域接触、type 9 引导 marker 和全局支线开启条件仍待补齐。
- 关卡注册表和延迟加载的独立关卡模块；1-1 专用罗兰茵、三人组、巨龙、陷阱、绳索演出与迁移逻辑移到 `gtonline/stages/inn.js`、`inn-progress.js`。
- 开局可选择鼹鼠拳套（原生 ItemId 30017）。携带能力与关卡内取得记录分开，不虚构宝箱收集或剧情 flag；继续冒险使用该存档原有携带配置。
- 存档键按关卡 ID 与 schema 隔离，保留 `gtonline.1-1.v1` 和旧 1-1 存档迁移。

## 原生证据与待办

资料版本为本机 3.51.0 APK，哈希与事件源哈希见 `tools/native/evidence/stage-1-2-ledger.json`。实际函数位置依据认证 overlay 的字符串引用与调用链识别；本机旧符号表不能直接作为类归属依据。

| 控制器 | 实际调查范围 | 尚未完成的行为 |
| --- | --- | --- |
| SuperTutorial | `0x738d4c8..0x73918f0` | 教学装备选择、UI、敌人生成、伤害与完成回调 |
| SealedKingdom | `0x738204c..0x7383134` | 眺望剧场 prefab/camera 变换、deviation 和 KidBoyDamaged 回调 |
| Butterfly | `0x729d800..0x729ec00` | 区域进入条件、瞬态 flag、SfxInfo 字段和原生重进对照 |
| Quest 27 / PetNew | `0x7176800..0x718e000` | 捕兽夹释放、对白选择、攻击次数、移动等待、门和任务持久化；须区分共享的 1-4 分支 |
| BurningSkull / VampireIdol | 未完成 | SNS 跟随、燃烧和环境事件 |

两项已排除的错误推断：蝴蝶例程里的 `0.7f` 写入 `SfxInfo+0x58`，不是协程等待；第二段结束只移除引导 marker，不能据此擅自解锁隐藏支线地图。相机/剧场存在不同坐标空间，不用猜测偏移替代 prefab 变换。

本次调查增加 [控制器源头记录](native-online-stage-1-2-controllers.md)、类型/字段快照 `tools/native/evidence/stage-1-2-metadata.json` 和条件/回调契约 `stage-1-2-controller-contracts.json`。教学状态名字、三个已解析的事件类型及宝箱 `DontFinish` 条件已核对；尚未解析的注册项保持空值，不能凭旧符号表或相邻索引命名。

预览复用的 1-1 通用移动、战斗、UI 与声音能力仍有原架构文档记录的等价性限制。没有原生运行分支与逐帧对照结果，静态源数据和测试通过不能证明“0 差别”。

## 可重复生成与检查

在仓库根目录执行（默认原始资料目录为 `E:/GTFiles`）：

```powershell
python tools/native/build-forest-entrance.py --source E:/GTFiles
node tools/native/verify-online-revision10.mjs
node tools/native/verify-online-revision11.mjs
node tools/native/verify-multi-stage.mjs
python tools/native/verify-controller-metadata.py
node tools/native/verify-forest-controllers.mjs
node tools/prepare-deploy.mjs
```

生成器先通过严格 KONG 解析器、原始表和 prefab 提取 foundation，再编译已支持的蝴蝶操作；未知操作直接失败。构建器不编辑关卡注册表，也不生成其他关卡的源码。静态回归覆盖旧存档迁移、跟随、攻击方向、小地图、宝物统计、携带能力、跨关卡隔离与资源释放。浏览器已验证 1-2 实际载入、38/3/3 HUD 和带入拳套；这些检查均不代表完整剧情验收。

后续顺序：先恢复各控制器状态/条件/回调图，再逐分支实现独立的 `ForestEntranceGame` 逻辑；只在确认为共用原生行为时扩充公共服务，最后做原生运行对照和存档恢复验证，满足条件后才撤掉 preview 标记与通关保护。
