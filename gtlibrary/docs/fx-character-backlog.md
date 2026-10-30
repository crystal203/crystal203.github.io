# 正式可获得角色：特效剩余账本

生成：2026-10-30T14:15:56.489915+00:00。原始 Hero：653 条 Playable / 181 OriginId；正式筛选后 645 条 / 173 OriginId。
按现有分组关系合并骑士[1,2]与佩儿/梅儿[52,53]后，正式角色 **171**。没有按显示名猜合并。

固定批次起点：**44 个 native 文件 / 43 角色组**；其中39开花组本轮用户确认通过，4既有非开花组（hana、milkywaygirl、peimei、necromancer）仅记录已有联动，完整分支/视觉验收另计。
待新制作 **128**：已有FX组但起点无native **100**；无独立FX组 **28**（Story6、Normal22），全部保留。另8临时剧情对象单列排除。
本次读到 125 个 native 文件，比固定起点新增 81；新增文件不自动表示制作完成、源分支完整或用户验收。

重跑：`python tools/fx/inventory-playable-characters.py`。保留既有JSON中的baseline、workflow和batches。状态修改需 `--set-production id=状态 --evidence "实际证据"`；批次选角用 `--batch-members id1,id2,...`。

## 首批

- nonmyth-001：目标10个，已选 pirate, sniper, eighttail, festivalgirl, steamknight, maid, succubus, futureknight, rudolph, whitedaygirgas；待选0。
- Reuse source mechanism families; every target still needs its own source rows, dependency closure and actual action checks.
- nonmyth-002：目标10个，已选 tanker, viking, gourry, stark, captainrabbit, whitebeast, alpacagirl, bluedragon, lifeguardyuze, frieren；待选0。
- Reuse existing timeline/weapon/continuous operations; independent source mechanisms delegated in short context.
- nonmyth-003：目标15个，已选 fern, mechaandroid, villainandroid, summerloraine, eleanor, mermaid, slimeshuna, soulpowergirl, goatgirl, pixygirl, sheepgirl, chinachef, dragondaughter, vampirelord, popp；待选0。
- Batch source reuse and imports; shared renderer/preset safeguards enabled.
- nonmyth-004：目标20个，已选 desertelfhunter, forestelf, secretagent, boatracinggirl, cyborgmonk, vampirecaptain, surfersohee, priestess, dai, golemrider, partymadpanda, whitedruid, heroai, jadeshaman, ninjaleader, seawitch, streamergirl, demonoperator, watcher, demonengineer；待选0。
- Reuse timeline/projectile/skeleton APIs, prewire shared hooks, batch source imports and automatic source checks.
- nonmyth-005：目标25个，已选 demonceo, demongovernor, demoninspector, demonpowergirl, demonslayer, guardianangel, halfvampire, parvati, lina, maam, plaguedoctor, shuran, slimemilim, slimerimuru, xellos, origin-189, origin-209, origin-184, origin-194, origin-199, origin-204, origin-219, origin-224, origin-249, origin-310；待选0。
- Root owns only shared integration; 15 source Lua actors in two parallel groups and 10 standard source-template actors automated together.
- nonmyth-005-normal-extra：目标12个，已选 origin-174, origin-179, origin-214, origin-229, origin-234, origin-239, origin-244, origin-254, origin-259, origin-269, origin-274, origin-381；待选0。
- Bulk reuse of basic weapon and native weak-action templates.

| 首批ID | 制作状态 | 源动作 | compiler命中 | GraphName | 精确native类型 |
|---|---|---|---|---|---|
| alpacagirl | ready-for-user-review | 6 | 6 | 0 | 1 |
| bluedragon | ready-for-user-review | 3 | 3 | 0 | 1 |
| boatracinggirl | ready-for-user-review | 7 | 7 | 0 | 1 |
| captainrabbit | ready-for-user-review | 6 | 6 | 0 | 1 |
| chinachef | ready-for-user-review | 4 | 4 | 0 | 1 |
| cyborgmonk | ready-for-user-review | 4 | 4 | 0 | 1 |
| dai | ready-for-user-review | 6 | 6 | 0 | 1 |
| demonceo | ready-for-user-review | 7 | 7 | 0 | 1 |
| demonengineer | ready-for-user-review | 4 | 4 | 0 | 1 |
| demongovernor | ready-for-user-review | 7 | 7 | 0 | 1 |
| demoninspector | ready-for-user-review | 7 | 7 | 0 | 1 |
| demonoperator | ready-for-user-review | 4 | 4 | 0 | 1 |
| demonpowergirl | ready-for-user-review | 7 | 7 | 0 | 1 |
| demonslayer | ready-for-user-review | 7 | 6 | 0 | 1 |
| desertelfhunter | ready-for-user-review | 4 | 4 | 0 | 1 |
| dragondaughter | ready-for-user-review | 3 | 3 | 0 | 1 |
| eighttail | ready-for-user-review | 3 | 3 | 0 | 1 |
| eleanor | ready-for-user-review | 3 | 3 | 0 | 1 |
| fern | ready-for-user-review | 3 | 3 | 0 | 1 |
| festivalgirl | ready-for-user-review | 6 | 6 | 0 | 1 |
| forestelf | ready-for-user-review | 6 | 6 | 0 | 1 |
| frieren | ready-for-user-review | 6 | 6 | 0 | 1 |
| futureknight | ready-for-user-review | 13 | 13 | 0 | 9 |
| goatgirl | ready-for-user-review | 4 | 4 | 0 | 1 |
| golemrider | ready-for-user-review | 5 | 4 | 0 | 1 |
| gourry | ready-for-user-review | 6 | 6 | 0 | 1 |
| guardianangel | ready-for-user-review | 7 | 7 | 0 | 1 |
| halfvampire | ready-for-user-review | 7 | 7 | 0 | 1 |
| heroai | ready-for-user-review | 6 | 6 | 0 | 1 |
| jadeshaman | ready-for-user-review | 6 | 6 | 0 | 1 |
| lifeguardyuze | ready-for-user-review | 3 | 3 | 0 | 1 |
| lina | ready-for-user-review | 7 | 7 | 0 | 1 |
| maam | ready-for-user-review | 7 | 7 | 0 | 1 |
| maid | ready-for-user-review | 6 | 5 | 0 | 6 |
| mechaandroid | ready-for-user-review | 3 | 3 | 0 | 1 |
| mermaid | ready-for-user-review | 4 | 4 | 0 | 1 |
| ninjaleader | ready-for-user-review | 6 | 6 | 0 | 1 |
| origin-174 | in-progress | 1 | 1 | 0 | 1 |
| origin-179 | in-progress | 2 | 2 | 0 | 2 |
| origin-184 | ready-for-user-review | 2 | 2 | 0 | 2 |
| origin-189 | ready-for-user-review | 2 | 2 | 0 | 2 |
| origin-194 | ready-for-user-review | 1 | 1 | 0 | 1 |
| origin-199 | ready-for-user-review | 1 | 1 | 0 | 1 |
| origin-204 | ready-for-user-review | 2 | 2 | 0 | 2 |
| origin-209 | ready-for-user-review | 2 | 2 | 0 | 2 |
| origin-214 | in-progress | 2 | 2 | 0 | 2 |
| origin-219 | ready-for-user-review | 1 | 1 | 0 | 1 |
| origin-224 | ready-for-user-review | 2 | 2 | 0 | 2 |
| origin-229 | in-progress | 2 | 0 | 0 | 2 |
| origin-234 | in-progress | 2 | 0 | 0 | 2 |
| origin-239 | in-progress | 1 | 0 | 0 | 1 |
| origin-244 | in-progress | 2 | 0 | 0 | 2 |
| origin-249 | ready-for-user-review | 2 | 2 | 0 | 2 |
| origin-254 | in-progress | 2 | 2 | 0 | 2 |
| origin-259 | in-progress | 1 | 0 | 0 | 1 |
| origin-269 | in-progress | 1 | 0 | 0 | 1 |
| origin-274 | in-progress | 2 | 2 | 0 | 2 |
| origin-310 | ready-for-user-review | 1 | 1 | 0 | 1 |
| origin-381 | in-progress | 2 | 0 | 0 | 2 |
| partymadpanda | ready-for-user-review | 4 | 4 | 0 | 1 |
| parvati | ready-for-user-review | 7 | 7 | 0 | 1 |
| pirate | ready-for-user-review | 4 | 3 | 0 | 4 |
| pixygirl | ready-for-user-review | 4 | 4 | 0 | 1 |
| plaguedoctor | ready-for-user-review | 6 | 6 | 0 | 1 |
| popp | ready-for-user-review | 4 | 4 | 0 | 1 |
| priestess | ready-for-user-review | 6 | 5 | 0 | 1 |
| rudolph | ready-for-user-review | 10 | 10 | 0 | 4 |
| seawitch | ready-for-user-review | 4 | 4 | 0 | 1 |
| secretagent | ready-for-user-review | 6 | 6 | 0 | 1 |
| sheepgirl | ready-for-user-review | 4 | 4 | 0 | 1 |
| shuran | ready-for-user-review | 7 | 7 | 0 | 1 |
| slimemilim | ready-for-user-review | 7 | 7 | 0 | 1 |
| slimerimuru | ready-for-user-review | 7 | 7 | 0 | 1 |
| slimeshuna | ready-for-user-review | 4 | 4 | 0 | 1 |
| sniper | ready-for-user-review | 5 | 5 | 0 | 4 |
| soulpowergirl | ready-for-user-review | 4 | 4 | 0 | 1 |
| stark | ready-for-user-review | 5 | 5 | 0 | 1 |
| steamknight | ready-for-user-review | 5 | 5 | 0 | 4 |
| streamergirl | ready-for-user-review | 4 | 4 | 0 | 1 |
| succubus | ready-for-user-review | 5 | 4 | 0 | 5 |
| summerloraine | ready-for-user-review | 3 | 3 | 0 | 1 |
| surfersohee | ready-for-user-review | 5 | 5 | 0 | 1 |
| tanker | ready-for-user-review | 11 | 10 | 0 | 9 |
| vampirecaptain | ready-for-user-review | 4 | 4 | 0 | 1 |
| vampirelord | ready-for-user-review | 3 | 3 | 0 | 1 |
| viking | ready-for-user-review | 5 | 4 | 0 | 2 |
| villainandroid | ready-for-user-review | 3 | 3 | 0 | 1 |
| watcher | ready-for-user-review | 4 | 4 | 0 | 1 |
| whitebeast | ready-for-user-review | 5 | 5 | 0 | 1 |
| whitedaygirgas | ready-for-user-review | 5 | 2 | 3 | 1 |
| whitedruid | ready-for-user-review | 6 | 3 | 0 | 1 |
| xellos | ready-for-user-review | 7 | 7 | 0 | 1 |

候选探针读取真实动作行、Lua文件/哈希、GraphName、原生metadata精确类型及当前compiler。compiler命中、source-array或原生同类型只用于选批，不是完成证明；弹药/耐力字段、Lua行和native成员均保留为candidate，不能据MagazineSize制造整弹匣。

本次 862 个去重动作探针，compiler命中505，probe异常0。JSON保留逐动作结果、未命中、异常与身份来源；没有打开浏览器。

## 起点未制作清单

| ID / 名称 | 原始OriginId / 最低Rank / 类别 | FX组·索引 | 原版/觉醒/开花条数 | 当前native | 制作状态 |
|---|---|---|---|---|---|
| admiral / 海军舰长玛丽娜 | 304 / 2 / Unique | 有/4 | 3/0/0 | 无 | pending |
| akayuki / 武士赤雪 | 101 / 1 / Story | 有/1 | 4/0/0 | 无 | pending |
| alpacagirl / 丰收神兽梅丽尔 | 398 / 2 / Unique | 有/2 | 3/0/0 | alpacagirl | ready-for-user-review |
| battleballgirl / 棒球少女莉耶 | 331 / 1 / Story | 有/1 | 4/0/0 | 无 | pending |
| bluedragon / 沧海龙族沄 | 587 / 2 / Unique | 有/1 | 3/0/0 | bluedragon | ready-for-user-review |
| boatracinggirl / 海滩竞速瑞秋 | 599 / 2 / Unique | 有/1 | 3/0/0 | boatracinggirl | ready-for-user-review |
| captainrabbit / 圣诞元素精灵卡洛儿 | 440 / 2 / Unique | 有/1 | 3/0/0 | captainrabbit | ready-for-user-review |
| chinachef / 醉刀仙琳 | 386 / 2 / Unique | 有/1 | 3/0/0 | chinachef | ready-for-user-review |
| cyborgmonk / 机械行者千虑 | 530 / 2 / Unique | 有/1 | 3/0/0 | cyborgmonk | ready-for-user-review |
| dai / 勇者达伊 | 500 / 2 / Unique | 有/1 | 3/0/0 | dai | ready-for-user-review |
| dancingarcher / 舞姬弓箭手蒂尼亚 | 341 / 2 / Unique | 有/2 | 3/0/0 | 无 | pending |
| demon_sister / 双胞胎搏击选手拉比 | 24 / 1 / Story | 有/1 | 4/0/0 | 无 | pending |
| demonbrother / 双胞胎治愈能手帕比 | 27 / 1 / Story | 有/1 | 4/0/0 | 无 | pending |
| demonceo / 魔王莉莉丝 | 404 / 2 / Unique | 有/2 | 3/0/0 | demonceo | ready-for-user-review |
| demonengineer / 被封印的贤者维涅特 | 551 / 2 / Unique | 有/2 | 3/0/0 | demonengineer | ready-for-user-review |
| demongovernor / 东部之王莫莉安 | 548 / 2 / Unique | 有/1 | 3/0/0 | demongovernor | ready-for-user-review |
| demoninspector / 魔界侦探奥迪尔 | 557 / 2 / Unique | 有/1 | 3/0/0 | demoninspector | ready-for-user-review |
| demonoperator / 契约者克罗塞尔 | 485 / 2 / Unique | 有/1 | 3/0/0 | demonoperator | ready-for-user-review |
| demonpowergirl / 破坏者拜蒙 | 497 / 2 / Unique | 有/2 | 3/0/0 | demonpowergirl | ready-for-user-review |
| demonslayer / 屠戮者安德拉斯 | 488 / 2 / Unique | 有/2 | 3/0/0 | demonslayer | ready-for-user-review |
| desertelfhunter / 猎人罗塞塔 | 509 / 2 / Unique | 有/1 | 3/0/0 | desertelfhunter | ready-for-user-review |
| desertslave / 沙漠雇佣兵马修 | 54 / 1 / Story | 有/1 | 4/0/0 | 无 | pending |
| dollgirl / 龙爪派岚芳 | 102 / 1 / Story | 有/2 | 4/0/0 | 无 | pending |
| dragonboy / 炎龙吉尔瓦斯 | 156 / 1 / Story | 有/1 | 4/0/0 | 无 | pending |
| dragondaughter / 地龙公主爱梅莉丝 | 533 / 2 / Unique | 有/1 | 3/0/0 | dragondaughter | ready-for-user-review |
| eighttail / 八尾狐奈莉 | 347 / 2 / Unique | 有/2 | 3/0/0 | eighttail | ready-for-user-review |
| eleanor / 繁荣女神埃莉诺 | 416 / 2 / Unique | 有/1 | 3/0/0 | eleanor | ready-for-user-review |
| exorcistgirl / 驱魔剑客莎娅 | 602 / 2 / Unique | 有/1 | 3/0/0 | 无 | pending |
| fern / 一级魔法使菲伦 | 626 / 2 / Unique | 有/1 | 3/0/0 | fern | ready-for-user-review |
| festivalgirl / 驱魔师美娅 | 359 / 2 / Unique | 有/2 | 3/0/0 | festivalgirl | ready-for-user-review |
| firebishop / 炎龙化身比什巴赫 | 344 / 2 / Unique | 有/2 | 3/0/0 | 无 | pending |
| flowergirl / 鲜花店少女芭莉 | 318 / 2 / Unique | 有/3 | 3/0/0 | 无 | pending |
| forestelf / 森林卫士艾丝黛尔 | 581 / 2 / Unique | 有/1 | 3/0/0 | forestelf | ready-for-user-review |
| frieren / 活了千年以上的魔法使芙莉莲 | 623 / 2 / Unique | 有/1 | 3/0/0 | frieren | ready-for-user-review |
| futureknight / 未来骑士 | 389 / 2 / Unique | 有/4 | 3/0/0 | futureknight | ready-for-user-review |
| futureprincess / 未来公主 | 362 / 2 / Unique | 有/3 | 3/0/0 | 无 | pending |
| garam / 九尾狐佳岚 | 365 / 2 / Unique | 有/3 | 3/0/0 | 无 | pending |
| ghostbuster / 科学家索菲 | 41 / 1 / Story | 有/1 | 4/0/0 | 无 | pending |
| goatgirl / 魔角猎人托佳 | 584 / 2 / Unique | 有/1 | 3/0/0 | goatgirl | ready-for-user-review |
| golemrider / 魔像骑士阿勒夫 | 356 / 2 / Unique | 有/1 | 3/0/0 | golemrider | ready-for-user-review |
| gourry / 天才剑士高里 | 452 / 2 / Unique | 有/1 | 3/0/0 | gourry | ready-for-user-review |
| guardianangel / 天界之剑安吉 | 563 / 2 / Unique | 有/1 | 3/0/0 | guardianangel | ready-for-user-review |
| halfvampire / 半吸血鬼普莉希拉 | 458 / 2 / Unique | 有/2 | 3/0/0 | halfvampire | ready-for-user-review |
| heroai / H.E.R.O.S凯伊 | 518 / 2 / Unique | 有/1 | 3/0/0 | heroai | ready-for-user-review |
| innuit / 因纽特少女可可 | 37 / 1 / Story | 有/1 | 4/1/0 | 无 | pending |
| jadeshaman / 翡翠驱魔师塔莎 | 617 / 2 / Unique | 有/1 | 3/0/0 | jadeshaman | ready-for-user-review |
| kunoichi / 忍者堇 | 494 / 2 / Unique | 有/1 | 3/0/0 | 无 | pending |
| lancergirl / 淑女骑士拉碧丝 | 124 / 2 / Unique | 有/2 | 3/0/0 | 无 | pending |
| librarian / 档案室文字记录员兰儿 | 335 / 2 / Unique | 有/3 | 3/0/0 | 无 | pending |
| lifeguardyuze / 救生员柚子 | 413 / 2 / Unique | 有/1 | 3/0/0 | lifeguardyuze | ready-for-user-review |
| lina / 盗贼杀手莉娜 | 449 / 2 / Unique | 有/1 | 3/0/0 | lina | ready-for-user-review |
| maam / 武斗家玛姆 | 503 / 2 / Unique | 有/1 | 3/0/0 | maam | ready-for-user-review |
| maid / 双面女仆艾米 | 135 / 1 / Story | 有/1 | 4/0/0 | maid | ready-for-user-review |
| mechaandroid / 机器人MK.99 | 401 / 2 / Unique | 有/1 | 3/0/0 | mechaandroid | ready-for-user-review |
| mermaid / 海洋杂货商汐雅 | 536 / 2 / Unique | 有/1 | 3/0/0 | mermaid | ready-for-user-review |
| mschrome / No.9克罗姆小姐 | 479 / 2 / Unique | 有/1 | 3/0/0 | 无 | pending |
| ninjaleader / 雪华众上忍枣 | 614 / 2 / Unique | 有/1 | 3/0/0 | ninjaleader | ready-for-user-review |
| origin-130 / 吹牛魔法师道尔夫 | 130 / 1 / Story | 无/0 | 4/0/0 | 无 | pending |
| origin-161 / 异界旅人凯瑟琳 | 161 / 1 / Story | 无/0 | 4/0/0 | 无 | pending |
| origin-174 / 资深守护者琳达 | 174 / 0 / Normal | 有/1 | 5/0/0 | origin-174 | in-progress |
| origin-179 / 守护者团员波比 | 179 / 0 / Normal | 无/0 | 5/0/0 | 无 | in-progress |
| origin-184 / 拜拉尔剑士海尔佛 | 184 / 0 / Normal | 有/1 | 5/0/0 | origin-184 | ready-for-user-review |
| origin-189 / 商人玛利亚 | 189 / 0 / Normal | 有/1 | 5/0/0 | origin-189 | ready-for-user-review |
| origin-19 / 旅馆老板娘罗兰茵 | 19 / 1 / Story | 无/0 | 4/0/0 | 无 | pending |
| origin-194 / 商人丽莎 | 194 / 0 / Normal | 有/1 | 5/0/0 | origin-194 | ready-for-user-review |
| origin-199 / 精灵弓箭手利娅 | 199 / 0 / Normal | 有/1 | 5/0/0 | origin-199 | ready-for-user-review |
| origin-204 / 泰坦忍者杰伊 | 204 / 0 / Normal | 有/1 | 5/0/0 | origin-204 | ready-for-user-review |
| origin-209 / 受限极意功暴龙 | 209 / 0 / Normal | 有/1 | 5/0/0 | origin-209 | ready-for-user-review |
| origin-214 / 超级泰坦人2布莱德 | 214 / 0 / Normal | 无/0 | 5/0/0 | 无 | in-progress |
| origin-219 / 不良学生美娜 | 219 / 0 / Normal | 有/1 | 5/0/0 | origin-219 | ready-for-user-review |
| origin-224 / 龙爪派东泰 | 224 / 0 / Normal | 有/1 | 5/0/0 | origin-224 | ready-for-user-review |
| origin-229 / 魅魔研究员佩吉 | 229 / 0 / Normal | 无/0 | 5/0/0 | 无 | in-progress |
| origin-234 / 遗物收集者艾尔丽 | 234 / 0 / Normal | 无/0 | 5/0/0 | 无 | in-progress |
| origin-239 / 守护灵奥拉莉 | 239 / 0 / Normal | 无/0 | 5/0/0 | 无 | in-progress |
| origin-244 / 小白虎康儿 | 244 / 0 / Normal | 无/0 | 5/0/0 | 无 | in-progress |
| origin-249 / 小商贩阿加莎 | 249 / 0 / Normal | 有/1 | 5/0/0 | origin-249 | ready-for-user-review |
| origin-254 / 博士达芬奇 | 254 / 0 / Normal | 无/0 | 5/0/0 | 无 | in-progress |
| origin-259 / 学生会会长凯特 | 259 / 0 / Normal | 无/0 | 5/0/0 | 无 | in-progress |
| origin-269 / 小镇导游乔伊 | 269 / 0 / Normal | 无/0 | 5/0/0 | 无 | in-progress |
| origin-274 / 新手苦行僧利奥 | 274 / 0 / Normal | 无/0 | 5/0/0 | 无 | in-progress |
| origin-28 / 森林妖精青叶 | 28 / 1 / Story | 无/0 | 4/0/0 | 无 | pending |
| origin-310 / 抵抗军大兵聂恩 | 310 / 0 / Normal | 有/1 | 5/0/0 | origin-310 | ready-for-user-review |
| origin-38 / 工程师玛丽安 | 38 / 1 / Story | 无/0 | 4/0/0 | 无 | pending |
| origin-381 / 马蒂二世 | 381 / 0 / Normal | 无/0 | 5/0/0 | 无 | in-progress |
| origin-5 / knight_captain_2 | 5 / 1 / Story | 无/0 | 4/0/0 | 无 | pending |
| partymadpanda / 派对不速之客疯狂熊猫团 | 476 / 2 / Unique | 有/1 | 3/0/0 | partymadpanda | ready-for-user-review |
| parvati / 模范员工帕尔瓦蒂 | 446 / 2 / Unique | 有/1 | 3/0/0 | parvati | ready-for-user-review |
| pet / 白兽 | 13 / 1 / Story | 有/1 | 4/0/0 | 无 | pending |
| pirate / 海贼瑞秋 | 32 / 1 / Story | 有/1 | 4/0/0 | pirate | ready-for-user-review |
| pixygirl / 孩子王珂洛涅 | 590 / 2 / Unique | 有/1 | 3/0/0 | pixygirl | ready-for-user-review |
| plaguedoctor / 鸟嘴医生 | 566 / 2 / Unique | 有/1 | 3/0/0 | plaguedoctor | ready-for-user-review |
| plitvice / 战争女神普利特维采 | 110 / 2 / Unique | 有/3 | 3/0/0 | 无 | pending |
| popp / 魔法师波普 | 506 / 2 / Unique | 有/1 | 3/0/0 | popp | ready-for-user-review |
| priestess / 勇士教教主维罗妮卡 | 392 / 2 / Unique | 有/2 | 3/0/0 | priestess | ready-for-user-review |
| redhood / 红斗篷埃尔韦拉 | 12 / 1 / Story | 有/1 | 4/1/0 | 无 | pending |
| robottanker / 机甲战士欧格玛 | 353 / 2 / Unique | 有/4 | 3/0/0 | 无 | pending |
| rudolph / 圣诞老人小帮手鲁 | 371 / 2 / Unique | 有/2 | 3/0/0 | rudolph | ready-for-user-review |
| seawitch / 海巫娅拉 | 464 / 2 / Unique | 有/1 | 3/0/0 | seawitch | ready-for-user-review |
| secretagent / 鱼鹰安娜 | 605 / 2 / Unique | 有/1 | 3/0/0 | secretagent | ready-for-user-review |
| sheepgirl / 兽人剑士蕾伊 | 467 / 2 / Unique | 有/1 | 3/0/0 | sheepgirl | ready-for-user-review |
| shuran / 炼丹师云苓 | 554 / 2 / Unique | 有/1 | 3/0/0 | shuran | ready-for-user-review |
| slimemilim / 破坏的暴君米莉姆·纳瓦 | 578 / 2 / Unique | 有/1 | 3/0/0 | slimemilim | ready-for-user-review |
| slimerimuru / 八星魔王利姆鲁·特恩佩斯特 | 572 / 2 / Unique | 有/1 | 3/0/0 | slimerimuru | ready-for-user-review |
| slimeshuna / 巫女姬朱菜 | 575 / 2 / Unique | 有/1 | 3/0/0 | slimeshuna | ready-for-user-review |
| sniper / 狙击手赫卡忒 | 36 / 1 / Story | 有/1 | 4/0/0 | sniper | ready-for-user-review |
| soulpowergirl / 灵魂术士桃花 | 611 / 2 / Unique | 有/1 | 3/0/0 | soulpowergirl | ready-for-user-review |
| stark / 战士休塔尔克 | 629 / 2 / Unique | 有/1 | 3/0/0 | stark | ready-for-user-review |
| steamknight / 龙骑士夏皮拉 | 125 / 1 / Story | 有/1 | 4/0/0 | steamknight | ready-for-user-review |
| steamprincess / 皇女阿依莎 | 119 / 1 / Story | 有/1 | 4/0/0 | 无 | pending |
| streamergirl / 主播露莉 | 608 / 2 / Unique | 有/1 | 3/0/0 | streamergirl | ready-for-user-review |
| succubus / 魅魔冒险家柚子 | 105 / 1 / Story | 有/1 | 4/0/0 | succubus | ready-for-user-review |
| summeramy / 海滩女仆艾米 | 539 / 2 / Unique | 有/1 | 3/0/0 | 无 | pending |
| summerloraine / 夏日旅馆老板娘罗兰茵 | 473 / 2 / Unique | 有/2 | 3/0/0 | summerloraine | ready-for-user-review |
| summershapira / 沙滩龙骑士夏皮拉 | 545 / 2 / Unique | 有/1 | 3/0/0 | 无 | pending |
| surfersohee / 海滩科学家索菲 | 410 / 2 / Unique | 有/1 | 3/0/0 | surfersohee | ready-for-user-review |
| tanker / 勇士挑战者克雷格 | 92 / 1 / Story | 有/1 | 4/1/0 | tanker | ready-for-user-review |
| valentineameris / 巧克力收藏家爱梅莉丝 | 635 / 2 / Unique | 有/1 | 3/0/0 | 无 | pending |
| vampirecaptain / 近卫军队长瓦伦西亚 | 482 / 2 / Unique | 有/1 | 3/0/0 | vampirecaptain | ready-for-user-review |
| vampirelord / 恶魔郡伯爵克劳德 | 461 / 2 / Unique | 有/1 | 3/0/0 | vampirelord | ready-for-user-review |
| vampirenoble / 吸血鬼少女卡瑞娜 | 17 / 1 / Story | 有/1 | 4/1/0 | 无 | pending |
| viking / 寻龙少女奈娃 | 374 / 1 / Story | 有/1 | 4/0/0 | viking | ready-for-user-review |
| villainandroid / 自主型机器人MK.2 | 428 / 2 / Unique | 有/1 | 3/0/0 | villainandroid | ready-for-user-review |
| watcher / 监察员瑜娜 | 569 / 2 / Unique | 有/1 | 3/0/0 | watcher | ready-for-user-review |
| whitebeast / 白雪 | 512 / 2 / Unique | 有/1 | 3/0/0 | whitebeast | ready-for-user-review |
| whitedaygirgas / 甜心捣蛋鬼吉尔瓦斯 | 638 / 2 / Unique | 有/1 | 3/0/0 | whitedaygirgas | ready-for-user-review |
| whitedruid / 德鲁伊康娜 | 434 / 2 / Unique | 有/2 | 3/0/0 | whitedruid | ready-for-user-review |
| witchcoco / 冰雪魔女瑞皮娜 | 328 / 2 / Unique | 有/3 | 3/0/0 | 无 | pending |
| xellos / 兽神官杰洛士 | 455 / 2 / Unique | 有/1 | 3/0/0 | xellos | ready-for-user-review |

## 起点已有包（存在性与验收分开）

| 角色组 | native文件 | 开花 | 验收 | 源分支覆盖 |
|---|---|---|---|---|
| adelanoble / 女男爵黛西 | adelanoble | 有 | user-accepted | not-recertified-by-inventory |
| alicia / 尸之勇者阿莉西亚 | alicia | 有 | user-accepted | not-recertified-by-inventory |
| bakeneko / 猫咪武士米可 | bakeneko | 有 | user-accepted | not-recertified-by-inventory |
| battleballpitcher / 火焰左投手兰迪 | battleballpitcher | 有 | user-accepted | not-recertified-by-inventory |
| bridge_driver / V | bridge_driver | 有 | user-accepted | not-recertified-by-inventory |
| bridge_messenger / 反击的使者塞拉 | bridge_messenger | 有 | user-accepted | not-recertified-by-inventory |
| carpgirl / 福运金鲤金鳞儿 | carpgirl | 有 | user-accepted | not-recertified-by-inventory |
| dokkaebi / 小妖怪银河 | dokkaebi | 有 | user-accepted | not-recertified-by-inventory |
| eternalflame / 纯净之火伊露妮 | eternalflame | 有 | user-accepted | not-recertified-by-inventory |
| eugene / 电影演员尤金 | eugene | 有 | user-accepted | not-recertified-by-inventory |
| fallenqueen / 第1军团军长 | fallenqueen | 有 | user-accepted | not-recertified-by-inventory |
| fireharpy / 赤焰鹰身女妖辛缇拉 | fireharpy | 有 | user-accepted | not-recertified-by-inventory |
| firstbishop / 最初的化身凯勒 | firstbishop | 有 | user-accepted | not-recertified-by-inventory |
| foxshikigami / 阴阳师若藻 | foxshikigami | 有 | user-accepted | not-recertified-by-inventory |
| gnomedoctor / 地精医生诺艾尔 | gnomedoctor | 有 | user-accepted | not-recertified-by-inventory |
| hana / 冥界使者哈娜 | hana | 无 | not-recorded | not-recertified-by-inventory |
| idolcaptain / 偶像骑士团长伊娃 | idolcaptain | 有 | user-accepted | not-recertified-by-inventory |
| invaderknight / 黑暗魔法师贝丝 | invaderknight | 有 | user-accepted | not-recertified-by-inventory |
| kamael / 丰收之神卡麦尔 | kamael | 有 | user-accepted | not-recertified-by-inventory |
| klen / 魔兽之王克伦 | klen | 有 | user-accepted | not-recertified-by-inventory |
| knight / 骑士 | knight,knightmale | 有 | user-accepted | not-recertified-by-inventory |
| ladythief / 怪盗罗茜 | ladythief | 有 | user-accepted | not-recertified-by-inventory |
| legendaryhero / 传奇勇士埃里娜 | legendaryhero | 有 | user-accepted | not-recertified-by-inventory |
| madscientist / 疯狂科学家吉蒙里 | madscientist | 有 | user-accepted | not-recertified-by-inventory |
| magicalgirl / 神秘紫罗兰遥 | magicalgirl | 有 | user-accepted | not-recertified-by-inventory |
| mercenary / 海洋佣兵奥尔卡 | mercenary | 有 | user-accepted | not-recertified-by-inventory |
| mermaidspy / 代号J | mermaidspy | 有 | user-accepted | not-recertified-by-inventory |
| milkywaygirl / 群星书记长蕾娜 | milkywaygirl | 无 | not-recorded | not-recertified-by-inventory |
| necromancer / 死灵法师诺克希娅 | necromancer | 无 | not-recorded | not-recertified-by-inventory |
| nelluru / 温和的乳母涅露露 | nelluru | 有 | user-accepted | not-recertified-by-inventory |
| pandagirl / 懒懒美食家小满 | pandagirl | 有 | user-accepted | not-recertified-by-inventory |
| peimei / 仙山拳名家佩儿＆梅儿 | peimei | 无 | not-recorded | not-recertified-by-inventory |
| saintess / 被束缚的孩子克拉拉 | saintess | 有 | user-accepted | not-recertified-by-inventory |
| secondbishop / 均衡的化身拉克里玛 | secondbishop | 有 | user-accepted | not-recertified-by-inventory |
| squirrelgirl / 自由松鼠克莉希尔 | squirrelgirl | 有 | user-accepted | not-recertified-by-inventory |
| storeangel / 大天使加百列 | storeangel | 有 | user-accepted | not-recertified-by-inventory |
| succubusnoble / 贵族魅魔比安卡 | succubusnoble | 有 | user-accepted | not-recertified-by-inventory |
| summerandroid / 小宝机器人AA72 | summerandroid | 有 | user-accepted | not-recertified-by-inventory |
| summerrie / 海滩王牌击球手莉耶 | summerrie | 有 | user-accepted | not-recertified-by-inventory |
| sunyeo / 萌新仙女妲彬 | sunyeo | 有 | user-accepted | not-recertified-by-inventory |
| twinsandroid / 双胞胎机器人妮芙缇 | twinsandroid | 有 | user-accepted | not-recertified-by-inventory |
| villainredhood / 红斗篷团伙领导人阿拉贝尔 | villainredhood | 有 | user-accepted | not-recertified-by-inventory |
| wrestler / 主赛选手凯莉 | wrestler | 有 | user-accepted | not-recertified-by-inventory |

## 8个临时剧情对象（排除）

- 280：knight_zaco_1；SummonCategory=None/无BattleClass。
- 281：knight_zaco_2；SummonCategory=None/无BattleClass。
- 282：knight_zaco_3；SummonCategory=None/无BattleClass。
- 283：knight_zaco_4；SummonCategory=None/无BattleClass。
- 284：knight_zaco_5；SummonCategory=None/无BattleClass。
- 287：slime_knight；SummonCategory=None/无BattleClass。
- 288：succubus_researcher_escort；SummonCategory=None/无BattleClass。
- 295：super_gnome；SummonCategory=None/无BattleClass。

## 无独立FX组的create-hero路径

A missing exact --index plus --create-hero Hero.Name creates the catalog entry in memory, derives resource from exact source Hero.Name, imports all same-OriginId forms and dependency closure, writes a real index/native package, merges latest catalog and rebuilds character-groups.

The 28 ungrouped characters still require a real source import and actual action coverage. Inventory creates no empty indexes or groups; generic/shared source classes may require new native mechanism support.

身份、全部形态、每个group member对应索引、heroClasses回查native归属、输入SHA256和当前文件SHA256均在同名JSON。Hero.Rank保留源零起始值，表中原版条数含各星级源行，不代表独立角色数。
