# 1-2 共用 gimmick 复原

运行逻辑位于 `gtonline/gimmicks/`，关卡只提供原生组件数据。GTMap 仅增加生成 prefab、节点变换和播放速度这些通用接口。1-1 也使用同一套燃烧、开关和门组件；剧情开关改为读取共用接触状态，剧情强制关门会清除 StayOpen 锁存；通过独立碰撞盒补充数据加载原生高度，没有改写受保护的 1-1 剧情文件。

当前 1-2 有 8 个跳板、2 朵炸弹花、2 个独立生成的炸弹。可燃叶丛按 CombustibleBehaviour 纳入交互对象。花与炸弹分别绑定，拿取、投掷或爆炸不会移动花。

原生依据及逐文件哈希见 `tools/native/evidence/native-gimmicks.json` 与 `gimmicks/`：

- `TilemapLoader.<CreateTileLayer>d__57`：`82dd2c8..82dd4bc`，在花的位置额外生成 bomb1。
- `BombFieldObjectBehaviour`：生成等待 0.5 秒，再用 1 秒长到原尺寸；举起从 5 秒计时，待命时收到火焰、攻击或爆炸的 ProvokeEvent 则剩 1 秒。OnEvent 没有按 ProvokeType 分支；不得把爆炸连锁写成立即爆炸。
- 炸弹引信移动 wick 的 localPosition Y，从原生 prefab 读取初始高度（当前约 0.323），在前 2 秒归零；不是缩放引信网格。爆炸半径 1.5，伤害以目标最大 HP 的 10% 截断；岩石另走 RockDamaged 的类型分支。
- `JumpTileBehaviour.CalculateTargetPosition`：原生速度与重力计算，以跳板物件原点计算目标，按进入点偏移补偿横向速度，角色朝向随弹射方向更新；竖直时间倍率 1.75，跳板 on 播放速度 1.5，Off 协程等待 1.5 秒；再次触发会重播 on，每个 Off 截止时刻独立保留。
- `CombustibleBehaviour`：点燃后 0.5 秒开始传播。以火源当前三维位置，对目标 Bounds 的最近点做半径检测；举起与投掷时也使用真实物件高度。0.5 秒伤害间隔，燃烧达到 2.25 秒且越过间隔才派发 100 点伤害，按 HP 决定破坏。
- `BrazierCombustibleBehaviour`：再次接触火源会刷新寿命，保留第一次点燃后的传播时钟。普通可燃物重复接触不会重新开始计时。
- `FloorSwitch`：按碰撞盒接触压下、离开释放；举起和飞行中的物件不压开关。门条件尊重 expected boolean、组内及组间 AND/OR、StayOpen 与 MaintainOpenDuration。

炸弹、爆炸和大岩石破碎资源均由固定 APK 的原生 prefab 按需恢复。大岩石资源需要 RotationBySpeedModule；当前实现覆盖该资源使用的常量角速度，复杂动态速度曲线仍未认证。

验证命令：`node tools/native/verify-shared-gimmicks.mjs`。覆盖真实关卡对象数量、跳板方向/运动参数、独立炸弹绑定、引信/重生、火焰三维距离/伤害间隔、火盆刷新、开关释放及门条件。

尚未完成：跳板接触前对齐、滑翔与空中障碍处理；炸弹原生 RNG 序列、停表/风罐状态、原生投掷轨迹、队友爆炸伤害和引信存档；开关的全局重置和特制 NPC 碰撞盒；完整燃烧状态存档与原生帧调度。1-2 主线、教学和完整通关链仍未完成，不能称为零差异复刻。

## 两关核查与炸弹表现补正

本轮静态核查覆盖 1-1 的 162 条、1-2 的 169 条对象记录，共 17 类。读取对应 KONG 原图和 5 份原生 animator 资源，而不是把对象能触发作为完成证明。逐对象的组件、动画状态、声明效果和未决项见 `stage-gimmick-audit.json`，可通过 `python tools/native/audit-stage-gimmicks.py` 重新生成。该清单的 allKindsReviewed 表示种类覆盖，fullParityCertified 仍为 false。

炸弹最后 3 秒：令 u=elapsed-2，phase=u*((u+1)*7)，颜色为 (1,abs(sin(phase)),abs(sin(phase)),1)，只写入 bomb1 renderer 的 _Color。滴答声按 sin(phase*0.6) 的符号翻转触发。抖动每帧加入 radius=elapsed*0.025/5、duration=0.2 的脉冲，取尚存脉冲的最大衰减半径，再以半径/2 在 XY 圆上随机采样；视觉偏移不污染物理位置。重生和销毁清除材质覆盖及偏移；停止引信声直接停源，去掉通用音频服务默认的额外 0.5 秒淡出。

 renderer 只增加通用的实例材质属性与视觉偏移接口，没有包含炸弹闪烁公式。开关现读取实际 actor 位置，纳入可见 NPC/队员，OnlyForManualCharacter 仍只接受手动角色。1-1 同样使用这些共用服务。

仍待处理的其他族：刺块的精确击退与无敌时长、推块原生状态/冰面/重置、门的镜头预览/计时条/全部预留接触、栅栏的手动关闭和区域/告警订阅。金币/星片/宝箱/告示牌/出入口的部分时序及剧情控制器也没有认证等同。滴答声目前以视口可见性近似原生 camera grid；全局 SHEAR 关键字的具体 shader 变体仍未确认。

新增验证：`node tools/native/verify-gimmick-presentation.mjs`，使用真实炸弹 prefab，覆盖两实例材质隔离、重置/恢复、原生闪烁相位、最大脉冲抖动、全部 8 个跳板方向/角色朝向，以及 NPC 与手动角色的开关过滤。

## 跳板方向修正

原生 `JumpTileBehaviour.AttachTo`（0x6723880）在 Direction 为 None 时读取 transform.eulerAngles.y：0°→4（-Z），90°→8（-X），180°→1（+Z），270°/-90°→2（+X）。对应赋值指令位于 0x67239b8、0x67239d8、0x67239f8、0x6723a28，见 `tools/native/evidence/gimmicks/native-jump-direction-attach-6723880.txt`。此前误用正向 forward 基准，四个方向都反了；现按跳板自身 -Z 基准处理，地图旋转和共用渲染器保持原生数据。

`node tools/native/verify-jump-directions.mjs` 直接校验原生赋值指令，覆盖四个旋转及 1-2 全部 8 块跳板的目标、偏移补偿、角色朝向，并用 MapSelection 的实际矩阵核对渲染方向与弹射向量。先前的方向检查仅使用同一错误假设，不能作为箭头方向一致的证据。

## 原生跳板入口与空中拾取

继续追踪 SpringEvent 的 Target/Source 字段后，确认 CalculateTargetPosition 的参数是 Source 跳板、Target 角色：IFieldObject 槽 8 读取 Source.Bounds，槽 2 读取 Target.Position。目标基准必须是 Bounds.center；此前记录为 tile.Position 的判断错误，此处修正并替代旧说明。角色入口偏移影响起跳速度，但补偿后的目标保持一致。JumpTileCrashBehaviour 在 CurrentAction=Moving(2) 时取 WalkSpeed，否则取 DashSpeed；正的 HorizontalSpeed 覆盖该回退速度。1-2 八块跳板均有正的覆盖值，不能额外叠加入射动量。

NativeJumpTiles 更新物理坐标后执行共用 pickups，修复跳跃更新提前返回而跳过拾取的问题。verify-airborne-pickups 使用四块真实跳板和四枚 Y=6 的原始紫币：四条轨迹均能在空中拾取；另验证走/跑回退速度与显式速度覆盖。

显式 DoorOpenEvent 与条件门计时不同：原生 Open 进入状态 2，UpdateFrame 对状态 2 不递减维持时间。共用 force-open 现保持开启，直到显式 close；此前两秒后重新关闭会卡住 1-2 教学通路。修复同时适用于 1-1。
