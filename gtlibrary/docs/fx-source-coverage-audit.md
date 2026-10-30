# Source recipe coverage audit

Static inventory only: build/menu presence does not prove mechanism completeness. Source branches are listed without claiming they all execute on one path.

Counts: `{"packs": 44, "sourcePlans": 128, "nativeContractPlans": 29, "uniqueLuaSources": 87, "certainErrors": 0, "dispatchConflicts": 2, "candidates": 78, "helperBindingUnknown": 19, "compilerProbeErrors": 0, "outputSchemaInvalid": 0, "reviewedLuaOutputPlans": 14}`

| Hero | State | Lua plans | Conflicts | Review rows | Graphs |
|---|---|---:|---:|---:|---:|
| 女男爵黛西 (`adelanoble`) | user-accepted | 1 | 0 | 0 | 7 |
| 尸之勇者阿莉西亚 (`alicia`) | user-accepted | 0 | 0 | 0 | 8 |
| 猫咪武士米可 (`bakeneko`) | user-accepted | 8 | 0 | 8 | 1 |
| 火焰左投手兰迪 (`battleballpitcher`) | user-accepted | 0 | 0 | 0 | 7 |
| V (`bridge_driver`) | user-accepted | 0 | 0 | 0 | 6 |
| 反击的使者塞拉 (`bridge_messenger`) | user-accepted | 0 | 0 | 0 | 7 |
| 福运金鲤金鳞儿 (`carpgirl`) | user-accepted | 0 | 0 | 0 | 10 |
| 小妖怪银河 (`dokkaebi`) | user-deferred-known-issue | 5 | 0 | 5 | 0 |
| 纯净之火伊露妮 (`eternalflame`) | user-accepted | 0 | 0 | 0 | 9 |
| 电影演员尤金 (`eugene`) | user-accepted | 1 | 0 | 0 | 0 |
| 第1军团军长 (`fallenqueen`) | user-accepted | 7 | 0 | 7 | 1 |
| 赤焰鹰身女妖辛缇拉 (`fireharpy`) | user-accepted | 6 | 1 | 6 | 1 |
| 最初的化身凯勒 (`firstbishop`) | user-accepted | 0 | 0 | 0 | 10 |
| 阴阳师若藻 (`foxshikigami`) | user-accepted | 0 | 0 | 0 | 8 |
| 地精医生诺艾尔 (`gnomedoctor`) | user-accepted | 1 | 0 | 1 | 5 |
| 偶像骑士团长伊娃 (`idolcaptain`) | user-accepted | 1 | 0 | 0 | 0 |
| 黑暗魔法师贝丝 (`invaderknight`) | user-accepted | 7 | 0 | 6 | 0 |
| 丰收之神卡麦尔 (`kamael`) | user-accepted | 4 | 0 | 3 | 0 |
| 魔兽之王克伦 (`klen`) | user-accepted | 0 | 0 | 0 | 5 |
| 女骑士 (`knight`) | user-accepted | 13 | 0 | 6 | 1 |
| 男骑士 (`knightmale`) | user-accepted | 13 | 0 | 6 | 1 |
| 怪盗罗茜 (`ladythief`) | user-accepted | 7 | 0 | 6 | 1 |
| 传奇勇士埃里娜 (`legendaryhero`) | externally-owned | 7 | 0 | 7 | 1 |
| 疯狂科学家吉蒙里 (`madscientist`) | user-accepted | 0 | 0 | 0 | 2 |
| 神秘紫罗兰遥 (`magicalgirl`) | user-accepted | 0 | 0 | 0 | 9 |
| 海洋佣兵奥尔卡 (`mercenary`) | user-accepted | 6 | 0 | 6 | 1 |
| 代号J (`mermaidspy`) | user-accepted | 1 | 0 | 0 | 4 |
| 温和的乳母涅露露 (`nelluru`) | user-accepted | 0 | 0 | 0 | 9 |
| 懒懒美食家小满 (`pandagirl`) | user-accepted | 4 | 0 | 3 | 0 |
| 被束缚的孩子克拉拉 (`saintess`) | user-accepted | 5 | 0 | 4 | 0 |
| 均衡的化身拉克里玛 (`secondbishop`) | user-accepted | 0 | 0 | 0 | 10 |
| 自由松鼠克莉希尔 (`squirrelgirl`) | user-accepted | 0 | 0 | 0 | 7 |
| 大天使加百列 (`storeangel`) | ready-for-user-review | 4 | 0 | 1 | 0 |
| 贵族魅魔比安卡 (`succubusnoble`) | user-accepted | 2 | 0 | 2 | 2 |
| 小宝机器人AA72 (`summerandroid`) | user-accepted | 5 | 0 | 4 | 0 |
| 海滩王牌击球手莉耶 (`summerrie`) | user-accepted | 1 | 0 | 1 | 8 |
| 萌新仙女妲彬 (`sunyeo`) | user-accepted | 4 | 0 | 4 | 1 |
| 双胞胎机器人妮芙缇 (`twinsandroid`) | user-accepted | 5 | 1 | 5 | 1 |
| 红斗篷团伙领导人阿拉贝尔 (`villainredhood`) | user-accepted | 2 | 0 | 1 | 0 |
| 主赛选手凯莉 (`wrestler`) | user-accepted | 1 | 0 | 0 | 7 |

## Certain compiler losses


## Source coverage review details

## Reviewed output and reachability evidence

Helper output schemas pin operation selectors, required fields, source guards and consumer/compiler SHA-256. A changed dependency invalidates that schema. All source literals remain in sourceSnapshots and allSourceLiteralKeys, including unreachable-per-action and still-unbound keys. Native ARM64 plans have a separate nativeContractPlans inventory. Option parsing never implies all option branches are implemented.

## Follow-up contract guard

Use independent candidate probing as a CI static check. Resolve overlapping matches with explicit reviewed precedence. Reject shallow effect-only matching when source contains unbound actor move/jump operations. For dynamic key/helper/routine output, add an explicit source-feature binding manifest rather than treating source literals as required simultaneous effects.

No pixel/screenshot/facing sweep performed. No package/hero data modified.
