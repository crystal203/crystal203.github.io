# 源覆盖证据与最简检查

`audit-source-coverage.py` 是只读源检查。用户验收状态、静态 candidate、helper unknown、确定错误彼此独立；不能因确定错误为零、schema有效或菜单存在宣称复原完成，也不因未知项自动修改已验收角色。

## 一次检查

```powershell
python tools/fx/test-source-coverage.py
python tools/fx/audit-source-coverage.py --root . --output docs/fx-source-coverage-audit.json --markdown docs/fx-source-coverage-audit.md --fail-on-certain --fail-on-stale-evidence
```

只扫描现有源、动作数据与消费者，不启动浏览器、不截图、不做像素、朝向或皮肤穷举。7项回归只验证分支证据保守性、源/运行时hash失效、option未知及C#归类。

## 自动绑定的边界

`tools/fx/source-coverage-output-schemas.json` 按 `behavior` 与真实 `pattern` / `nativeWeaponSkill` 选出精确consumer。每条登记真实动作字段、plan字段、输出effect key、功能映射、source guard，以及consumer/compiler依赖的期望SHA-256。报告再输出schema自身SHA-256、依赖检查与源hash。依赖或source hash改变时，schema失效，不能继续借用旧绑定；`--fail-on-stale-evidence`使检查失败。新增schema应先核真实代码，不能直接把当前hash抄进去消除失败。

| Consumer | 本轮登记的实际输出 | 仍不自动证明 |
|---|---|---|
| native-charge-actions | ChargeDurations/MaxChargeDuration释放变体；slashKeys、charge/lvN、可达myth后缀；dash与projectile index/offset | Cwp buff及所有option行为 |
| native-weapon-actions / falling-chain | cast/screen、每次proj/trail下降轨迹、hit后explosion与尾部；真实AttackTiming/HitDelay/AttackDelay/Limit | Ascent Radius、原生伤害/碰撞 |
| native-weapon-actions / charge-impact | ChargeStartProgress、ChargeStartScale、ChargeSpeed、ChargeBoundSize驱动的60Hz平地预览；cast/dash/smoke/explosion | RadiusScale伤害判定与完整地形物理 |
| native-orbit-cards | aimed twin-shot物理弹道；single-ground-cast的cast；staged orbit的proj1/2、trail1/2、cast/screen、jump与launch | CwpBuff/on-hit等option分支 |
| script-actions → melee-timeline | moves/breakMoves→graphPath，spine[].at/duration/height/aerialDuration/allowAdd→spinePath，skinPath，动画clips | set_aim_point IK、alpha或独立实体Spine操作 |
| native-soundwave-actions | C#注册合同的帧时钟、DashFrame跳跃尾段、无放回弹体抽取、首ShootFrame aura；独立normalTriggerOptions证据 | 所有option/真实队伍模拟；不得分配虚构Lua源 |

原有persistent-area、accelerated-field、sky-barrage三种schema也迁入同一hash校验文件；按各operation登记key，不再从同一JS文件提取其他operation的全部preset key。普通meleeTimeline的consumer字段与当前依赖hash另列`recipeConsumerEvidence`，该字段仅证明数据消费者的存在，不抹除具体未绑定API。

## 可达性只采用源guard

完整literal与调用仍保留在`sourceSnapshots`、`allSourceLiteralKeys`。只有源中明确存在`AttackType`参数读取、唯一枚举赋值、合法动作枚举值、唯一函数定义，且该函数的所有引用都能逐一对应直接enum guard调用，才可将不匹配的函数从该动作的可达集合排除。额外无guard调用、函数值引用、动态self索引或attack_type再次赋值均使该证明停用。共享update中的单个jump调用只在完整单调用guard匹配时排除。不是角色白名单，也不根据动作后缀猜分支。

被排除的调用连同赋值行、guard行、合法枚举值写入`sourceReachability`；未知条件、未证明状态机、仍可达却未使用的literal继续保留。`parse_option_*`或plan含Option字段仅表示有参数来源，不等于所有选项分支完成。

`nativeContractPlans`与Lua `plans`分开：native ARM64或native-soundwave不参与Lua source统计和Lua compiler probing。图存在仅记数，图语义完整性仍未认证。

## 本轮快照（2026-10-30）

44包、128条Lua plan、87个Lua源；另列29条native contract，其中3条ManualSoundWave。当前14条Lua helper具有有效的逐operation schema，schema失效为0。

| 指标 | 前 | 后 |
|---|---:|---:|
| 确定静态错误 | 0 | 0 |
| dispatch冲突 | 2 | 2 |
| candidate行 | 88 | 78 |
| helper unknown行 | 18 | 19 |
| 未绑定literal key实例 | 104 | 48 |
| helper内未绑定key实例 | 38 | 17 |
| helper内功能缺项实例 | 32 | 24 |

14条骑士跨AttackType误报整行闭合；4条旧option元数据误判为完成的行重新保留为candidate。helper真实输出减少21个key缺项和11个功能缺项，但新增3个之前被元数据掩盖的option未知，故helper行数没有被硬清零。骑士觉醒第四段仍保留set_aim_point未知，不能用已有垂直spinePath代替IK证据。未建schema的helper、真实未用literal、复杂option/routine与图分支仍需源机制核查；本轮未修改runtime、角色包、用户验收状态或legendaryhero数据。
