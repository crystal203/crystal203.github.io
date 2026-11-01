# GTFX 原生音效关联考察

仅调查现有数据和播放器，不增加音轨，不自动播放音效。

- `gtfx/assets/native-characters/hana.json` 的 `actions.*.SfxInfo` 保留了原生动作到音效名的映射。普攻第一段有 `dash → 02_hana_dash_01`、`slash → 02_hana_slash_01`；第三段有 `hook → 02_hana_chain_01`、`explosion → 02_explosion_kick_01`；`CwpHana` 的 `hit3` 对应 `02_hana_cwp_03`。
- 部分动作的 SfxInfo 含 `Name / Delay / SfxName`；例如 `EventPrincessTwohand:Hana` 的 slash 有 0.1 秒延迟。另一些只有语义键，需要结合同一动作的 ShootTiming、AttackTiming、HitTiming、Lua/原生回调或 Spine 的 sfx 事件确定时刻。
- `gtfx/costume-overrides.js` 已支持按 SfxInfo 的 SfxName 字段合并外观覆盖。音效应读取最终外观和动作配置，不能只按角色名固定查表。
- `gtfx/character-player.js`、`action-player.js` 的当前播放流程只处理骨骼、视觉特效与锚点；`action-modules.js` 没有输出统一的可播放 audio 事件序列。代码中出现的 Spine sfx 事件还被用于视觉触发时刻，不能全部当成 AudioClip 名。
- `gtaudio/data/catalog.json` 包含上述音效的原生、导出或离线资源版本。`02_hana_chain_02` 和 `02_hana_cwp_03` 均存在于音频库；当前哈娜动作包直接引用的是 chain_01，而不是 chain_02。同名资源可能有多个版本，后续若接入应使用现有 GTAudio 默认映射选择具体 AudioClip。

结论：存在原生音效关联，但尚无可直接整条复用的完整 GTFX 音轨。若将来接入，应编译动作级音频事件，再投放到独立音轨或运行时混音，不应为每个音效名新建一条轨道。

## 全部角色的覆盖与难度

本次只读扫描当前仓库数据，并读取运行时注册目录，未添加音效事件或改动 GTFX 播放器。

| 项目 | 数量 |
| --- | ---: |
| 注册角色组 / 成员资源 | 171 / 227 |
| 能找到至少一个原生角色包的角色组 | 171 |
| 至少一个成员原生包直接含 SfxInfo 的角色组 | 139 |
| 扫描的原生角色 JSON 文件 | 172 |
| 这些文件中的动作记录 | 1003 |
| 保留 SfxInfo 的动作记录 | 631 |
| 其中带 UseScript 或 ScriptName 的动作记录 | 483 |
| SfxInfo 直接包含 Delay 的动作记录 | 11 |
| 非空音效名称 / GTAudio 可匹配名称 | 976 / 976 |

统计仅覆盖动作记录的 SfxInfo，不代表皮肤覆盖、投射物、召唤物及所有原生回调已完整提取。空字符串引用已从音效名称统计排除。没有直接 SfxInfo 的 32 个角色组还需追查 Spine 事件、通用武器动作和其他原生声音来源。

工程判断：通用声音事件格式、资源选择、混音和导出属中等难度；全部角色严格还原属于高难度，工作量主要在事件时序和特殊动作校核。现有声音资源匹配充分，可利用已有 GTFX 的动作阶段和 `prepareBoneTracks` 的 Spine 事件换算，但不能把视觉特效出现时刻一律视为声音时刻。

全量准确还原还需处理：连贯普攻与动作变速、Spine sfx 回调、外观与专武覆盖、命中后触发、循环与中断、投射物和召唤物独立生命周期，以及音效去重。应对未验证动作保留显式覆盖状态，逐动作对照原生来源，不能仅凭命名规则宣称全部还原。

建议分两步：先建立统一 audio 事件编译与当前角色音轨集合/混音的接口，再按原生回调家族补齐各角色。此建议属于后续实施方案，本次未实现自动还原。
