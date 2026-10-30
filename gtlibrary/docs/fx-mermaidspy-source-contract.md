# 代号 J 开花：源动作合同补全

2026-10-30。输入：`MythMermaidSpyBattleAction.lua` SHA-256 `af38f4ef08142db725111d02c04cdca77a10bf37606a3efd7cfbe4c27ca5e5e0`。

旧 generic fallback 仅播放 cast 和 t=0 的 explosion，遗漏原始动作。新 `source-sky-barrage` recipe 的数值由 Lua 表达式提取，运行时按操作合同选择，不使用角色名分派。

- Declare 时仅一次 `UnityEngine.Random.value * 360`；按 HitTiming 索引逐次加 120°，以角色脚底为中心、半径 3.7 建立三个位置。改变目标距离不改变该环。
- Spine 初始上移 8、alpha 从 0 在 .5 秒内渐显；.2–1 秒按 EaseInCubic 下降。角色脚底位置保持不动。
- .5–1 秒 Spine 线性转至 -360°；1 秒复位，并在角色脚底产生 jump FX。landing 动画从 .8 秒开始。
- 每个 HitTiming-.15 播放 shoot，并从对应环上点加 `(0,7,2)` 的位置向该点发射 ProjectileInfo[1]。每个 HitTiming 播放 cast，并在对应环上点产生 explosion。原始 HitTiming 为 `.15/.30/.45`。
- 同时刻的动画保留 Lua for-loop 顺序；后一个索引的 shoot 可以覆盖前一个索引的 cast。
- 特效保持池的 InitialScale / Type / Direction 与源 disposal；contrail 的 TriggeredTimeLimit 尾期独立于投射体寿命。StageShadowSetter 由现有原生脚本采样器执行。

显式 targetPos 并不自动把本投射体截在 Lua 的 HitTiming：同版本 ARM64 的 ShootDirectionAtPosition `0x6c99004` 调用 SingleShoot `0x6c9955c`，GeneralShoot `0x6a595d0` 将该向量存入 Projectile +0x48。UnityObjectPoolProjectile 使用基类 GetMoveVector `0x6a450d0`；targetToFollow=nil 时按原方向、spec Speed/Accel 移动，UpdateMoveAndCollision `0x6a47550` 使用 LifeTime 边界。因此保留本 spec Speed=45 / Lifetime=.2；不猜测在 .15 秒夹停、也不将三次脚本爆炸当成三次投射体碰撞。ELF SHA-256：`d33d4ff70c197d8d758dae6a6292192c7aea04160fcd97a4e11b72a8741ee7db`。战斗对象/地形碰撞仍属于实际场景模拟边界。

`node tools/fx/check-mermaid-sky-barrage.mjs` 只检查一个固定 myth/right/seed12345 场景：t=.6 Spine 高度 7，t=.75 角度 -180°，三环点半径/间隔、一次随机状态推进、三发/三爆时刻、1 秒落地，以及 contrail 尾期。当前输出 10 条轨道、actorEnd=1.5、tailEnd=2.25。普通增量导入 `--defer-cleanup` 完成材料、CustomSprite、StageShadow、形态及觉醒树完整性检查；没有 refresh-all 或资源全库清理。数值通过不等于新的用户视觉验收。

同源静态复查：普通/角色/连锁/专武均走原始图。普通整匣现有 10 发/4 秒固定检查通过；Cwp 图未列出未知节点。Manual 的 BuffExpireListen（3106500/3106501）和 Role 触发阶段的 IsAlmostZero（摇杆向量长度）仍是独立回调/分支支持候选，不能凭菜单存在判为完整。Support 的 GetEmptyHitSound 只连接伤害静音输入，未发现对应 FX 缺口。本次不更写这些已在用图机制。
