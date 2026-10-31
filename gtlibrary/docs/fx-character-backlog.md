# 正式可获得角色：特效剩余账本

生成：2026-10-31T08:19:51.092852+00:00。原始 Hero：653 条 Playable / 181 OriginId；正式筛选后 645 条 / 173 OriginId。
按现有分组关系合并骑士[1,2]与佩儿/梅儿[52,53]后，正式角色 **171**。没有按显示名猜合并。

固定批次起点：**44 个 native 文件 / 43 角色组**；其中39开花组本轮用户确认通过，4既有非开花组（hana、milkywaygirl、peimei、necromancer）仅记录已有联动，完整分支/视觉验收另计。
待新制作 **128**：已有FX组但起点无native **100**；无独立FX组 **28**（Story6、Normal22），全部保留。另8临时剧情对象单列排除。
本次读到 172 个 native 文件，比固定起点新增 128；新增文件不自动表示制作完成、源分支完整或用户验收。

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
- nonmyth-006：目标36个，已选 exorcistgirl, summeramy, summershapira, valentineameris, kunoichi, futureprincess, innuit, vampirenoble, redhood, lancergirl, garam, firebishop, flowergirl, plitvice, robottanker, librarian, mschrome, witchcoco, desertslave, dollgirl, steamprincess, admiral, akayuki, dancingarcher, pet, ghostbuster, dragonboy, battleballgirl, demon_sister, demonbrother, origin-130, origin-161, origin-19, origin-28, origin-38, origin-5；待选0。
- Three parallel mechanism groups; existing native managers and Lua contracts reused.

| 首批ID | 制作状态 | 源动作 | compiler命中 | GraphName | 精确native类型 |
|---|---|---|---|---|---|
| admiral | delivered | 8 | 7 | 0 | 7 |
| akayuki | delivered | 5 | 5 | 0 | 5 |
| alpacagirl | delivered | 6 | 6 | 0 | 1 |
| battleballgirl | delivered | 6 | 6 | 0 | 2 |
| bluedragon | delivered | 3 | 3 | 0 | 1 |
| boatracinggirl | delivered | 7 | 7 | 0 | 1 |
| captainrabbit | delivered | 6 | 6 | 0 | 1 |
| chinachef | delivered | 4 | 4 | 0 | 1 |
| cyborgmonk | delivered | 4 | 4 | 0 | 1 |
| dai | delivered | 6 | 6 | 0 | 1 |
| dancingarcher | delivered | 4 | 4 | 0 | 4 |
| demon_sister | delivered | 6 | 5 | 0 | 5 |
| demonbrother | delivered | 4 | 4 | 0 | 3 |
| demonceo | delivered | 7 | 7 | 0 | 1 |
| demonengineer | delivered | 4 | 4 | 0 | 1 |
| demongovernor | delivered | 7 | 7 | 0 | 1 |
| demoninspector | delivered | 7 | 7 | 0 | 1 |
| demonoperator | delivered | 4 | 4 | 0 | 1 |
| demonpowergirl | delivered | 7 | 7 | 0 | 1 |
| demonslayer | delivered | 7 | 6 | 0 | 1 |
| desertelfhunter | delivered | 4 | 4 | 0 | 1 |
| desertslave | delivered | 3 | 3 | 0 | 3 |
| dollgirl | delivered | 6 | 6 | 0 | 6 |
| dragonboy | delivered | 2 | 2 | 0 | 1 |
| dragondaughter | delivered | 3 | 3 | 0 | 1 |
| eighttail | delivered | 3 | 3 | 0 | 1 |
| eleanor | delivered | 3 | 3 | 0 | 1 |
| exorcistgirl | delivered | 8 | 7 | 0 | 1 |
| fern | delivered | 3 | 3 | 0 | 1 |
| festivalgirl | delivered | 6 | 6 | 0 | 1 |
| firebishop | delivered | 6 | 6 | 0 | 1 |
| flowergirl | delivered | 5 | 4 | 0 | 2 |
| forestelf | delivered | 6 | 6 | 0 | 1 |
| frieren | delivered | 6 | 6 | 0 | 1 |
| futureknight | delivered | 13 | 13 | 0 | 9 |
| futureprincess | delivered | 9 | 9 | 0 | 1 |
| garam | delivered | 5 | 5 | 0 | 1 |
| ghostbuster | delivered | 4 | 4 | 0 | 4 |
| goatgirl | delivered | 4 | 4 | 0 | 1 |
| golemrider | delivered | 5 | 4 | 0 | 1 |
| gourry | delivered | 6 | 6 | 0 | 1 |
| guardianangel | delivered | 7 | 7 | 0 | 1 |
| halfvampire | delivered | 7 | 7 | 0 | 1 |
| heroai | delivered | 6 | 6 | 0 | 1 |
| innuit | delivered | 6 | 4 | 0 | 2 |
| jadeshaman | delivered | 6 | 6 | 0 | 1 |
| kunoichi | delivered | 7 | 7 | 0 | 1 |
| lancergirl | delivered | 7 | 7 | 0 | 1 |
| librarian | delivered | 8 | 6 | 0 | 4 |
| lifeguardyuze | delivered | 3 | 3 | 0 | 1 |
| lina | delivered | 7 | 7 | 0 | 1 |
| maam | delivered | 7 | 7 | 0 | 1 |
| maid | delivered | 6 | 5 | 0 | 6 |
| mechaandroid | delivered | 3 | 3 | 0 | 1 |
| mermaid | delivered | 4 | 4 | 0 | 1 |
| mschrome | delivered | 5 | 5 | 0 | 1 |
| ninjaleader | delivered | 6 | 6 | 0 | 1 |
| origin-130 | delivered | 3 | 3 | 0 | 3 |
| origin-161 | delivered | 3 | 3 | 0 | 3 |
| origin-174 | delivered | 1 | 1 | 0 | 1 |
| origin-179 | delivered | 2 | 2 | 0 | 2 |
| origin-184 | delivered | 2 | 2 | 0 | 2 |
| origin-189 | delivered | 2 | 2 | 0 | 2 |
| origin-19 | delivered | 5 | 4 | 0 | 3 |
| origin-194 | delivered | 1 | 1 | 0 | 1 |
| origin-199 | delivered | 1 | 1 | 0 | 1 |
| origin-204 | delivered | 2 | 2 | 0 | 2 |
| origin-209 | delivered | 2 | 2 | 0 | 2 |
| origin-214 | delivered | 2 | 2 | 0 | 2 |
| origin-219 | delivered | 1 | 1 | 0 | 1 |
| origin-224 | delivered | 2 | 2 | 0 | 2 |
| origin-229 | excluded-by-user | 2 | 2 | 0 | 2 |
| origin-234 | excluded-by-user | 2 | 2 | 0 | 2 |
| origin-239 | excluded-by-user | 1 | 1 | 0 | 1 |
| origin-244 | excluded-by-user | 2 | 2 | 0 | 2 |
| origin-249 | delivered | 2 | 2 | 0 | 2 |
| origin-254 | delivered | 2 | 2 | 0 | 2 |
| origin-259 | excluded-by-user | 1 | 1 | 0 | 1 |
| origin-269 | excluded-by-user | 1 | 1 | 0 | 1 |
| origin-274 | delivered | 2 | 2 | 0 | 2 |
| origin-28 | delivered | 4 | 4 | 0 | 3 |
| origin-310 | delivered | 1 | 1 | 0 | 1 |
| origin-38 | delivered | 3 | 3 | 0 | 3 |
| origin-381 | excluded-by-user | 2 | 2 | 0 | 2 |
| origin-5 | delivered | 3 | 3 | 0 | 3 |
| partymadpanda | delivered | 4 | 4 | 0 | 1 |
| parvati | delivered | 7 | 7 | 0 | 1 |
| pet | delivered | 6 | 5 | 0 | 5 |
| pirate | delivered | 4 | 3 | 0 | 4 |
| pixygirl | delivered | 4 | 4 | 0 | 1 |
| plaguedoctor | delivered | 6 | 6 | 0 | 1 |
| plitvice | delivered | 6 | 6 | 0 | 2 |
| popp | delivered | 4 | 4 | 0 | 1 |
| priestess | delivered | 6 | 5 | 0 | 1 |
| redhood | delivered | 5 | 5 | 0 | 3 |
| robottanker | delivered | 10 | 10 | 0 | 2 |
| rudolph | delivered | 10 | 10 | 0 | 4 |
| seawitch | delivered | 4 | 4 | 0 | 1 |
| secretagent | delivered | 6 | 6 | 0 | 1 |
| sheepgirl | delivered | 4 | 4 | 0 | 1 |
| shuran | delivered | 7 | 7 | 0 | 1 |
| slimemilim | delivered | 7 | 7 | 0 | 1 |
| slimerimuru | delivered | 7 | 7 | 0 | 1 |
| slimeshuna | delivered | 4 | 4 | 0 | 1 |
| sniper | delivered | 5 | 5 | 0 | 4 |
| soulpowergirl | delivered | 4 | 4 | 0 | 1 |
| stark | delivered | 5 | 5 | 0 | 1 |
| steamknight | delivered | 5 | 5 | 0 | 4 |
| steamprincess | delivered | 6 | 4 | 0 | 6 |
| streamergirl | delivered | 4 | 4 | 0 | 1 |
| succubus | delivered | 5 | 4 | 0 | 5 |
| summeramy | delivered | 7 | 7 | 0 | 1 |
| summerloraine | delivered | 3 | 3 | 0 | 1 |
| summershapira | delivered | 7 | 7 | 0 | 1 |
| surfersohee | delivered | 5 | 5 | 0 | 1 |
| tanker | delivered | 11 | 10 | 0 | 9 |
| valentineameris | delivered | 8 | 7 | 0 | 1 |
| vampirecaptain | delivered | 4 | 4 | 0 | 1 |
| vampirelord | delivered | 3 | 3 | 0 | 1 |
| vampirenoble | delivered | 7 | 5 | 0 | 3 |
| viking | delivered | 5 | 4 | 0 | 2 |
| villainandroid | delivered | 3 | 3 | 0 | 1 |
| watcher | delivered | 4 | 4 | 0 | 1 |
| whitebeast | delivered | 5 | 5 | 0 | 1 |
| whitedaygirgas | delivered | 5 | 2 | 3 | 1 |
| whitedruid | delivered | 6 | 3 | 0 | 1 |
| witchcoco | delivered | 5 | 5 | 0 | 5 |
| xellos | delivered | 7 | 7 | 0 | 1 |

候选探针读取真实动作行、Lua文件/哈希、GraphName、原生metadata精确类型及当前compiler。compiler命中、source-array或原生同类型只用于选批，不是完成证明；弹药/耐力字段、Lua行和native成员均保留为candidate，不能据MagazineSize制造整弹匣。

本次 862 个去重动作探针，compiler命中676，probe异常0。JSON保留逐动作结果、未命中、异常与身份来源；没有打开浏览器。

## 起点未制作清单

| ID / 名称 | 原始OriginId / 最低Rank / 类别 | FX组·索引 | 原版/觉醒/开花条数 | 当前native | 制作状态 |
|---|---|---|---|---|---|
| admiral / 海军舰长玛丽娜 | 304 / 2 / Unique | 有/4 | 3/0/0 | admiral | delivered |
| akayuki / 武士赤雪 | 101 / 1 / Story | 有/1 | 4/0/0 | akayuki | delivered |
| alpacagirl / 丰收神兽梅丽尔 | 398 / 2 / Unique | 有/2 | 3/0/0 | alpacagirl | delivered |
| battleballgirl / 棒球少女莉耶 | 331 / 1 / Story | 有/1 | 4/0/0 | battleballgirl | delivered |
| bluedragon / 沧海龙族沄 | 587 / 2 / Unique | 有/1 | 3/0/0 | bluedragon | delivered |
| boatracinggirl / 海滩竞速瑞秋 | 599 / 2 / Unique | 有/1 | 3/0/0 | boatracinggirl | delivered |
| captainrabbit / 圣诞元素精灵卡洛儿 | 440 / 2 / Unique | 有/1 | 3/0/0 | captainrabbit | delivered |
| chinachef / 醉刀仙琳 | 386 / 2 / Unique | 有/1 | 3/0/0 | chinachef | delivered |
| cyborgmonk / 机械行者千虑 | 530 / 2 / Unique | 有/1 | 3/0/0 | cyborgmonk | delivered |
| dai / 勇者达伊 | 500 / 2 / Unique | 有/1 | 3/0/0 | dai | delivered |
| dancingarcher / 舞姬弓箭手蒂尼亚 | 341 / 2 / Unique | 有/2 | 3/0/0 | dancingarcher | delivered |
| demon_sister / 双胞胎搏击选手拉比 | 24 / 1 / Story | 有/1 | 4/0/0 | demon_sister | delivered |
| demonbrother / 双胞胎治愈能手帕比 | 27 / 1 / Story | 有/1 | 4/0/0 | demonbrother | delivered |
| demonceo / 魔王莉莉丝 | 404 / 2 / Unique | 有/2 | 3/0/0 | demonceo | delivered |
| demonengineer / 被封印的贤者维涅特 | 551 / 2 / Unique | 有/2 | 3/0/0 | demonengineer | delivered |
| demongovernor / 东部之王莫莉安 | 548 / 2 / Unique | 有/1 | 3/0/0 | demongovernor | delivered |
| demoninspector / 魔界侦探奥迪尔 | 557 / 2 / Unique | 有/1 | 3/0/0 | demoninspector | delivered |
| demonoperator / 契约者克罗塞尔 | 485 / 2 / Unique | 有/1 | 3/0/0 | demonoperator | delivered |
| demonpowergirl / 破坏者拜蒙 | 497 / 2 / Unique | 有/2 | 3/0/0 | demonpowergirl | delivered |
| demonslayer / 屠戮者安德拉斯 | 488 / 2 / Unique | 有/2 | 3/0/0 | demonslayer | delivered |
| desertelfhunter / 猎人罗塞塔 | 509 / 2 / Unique | 有/1 | 3/0/0 | desertelfhunter | delivered |
| desertslave / 沙漠雇佣兵马修 | 54 / 1 / Story | 有/1 | 4/0/0 | desertslave | delivered |
| dollgirl / 龙爪派岚芳 | 102 / 1 / Story | 有/2 | 4/0/0 | dollgirl | delivered |
| dragonboy / 炎龙吉尔瓦斯 | 156 / 1 / Story | 有/1 | 4/0/0 | dragonboy | delivered |
| dragondaughter / 地龙公主爱梅莉丝 | 533 / 2 / Unique | 有/1 | 3/0/0 | dragondaughter | delivered |
| eighttail / 八尾狐奈莉 | 347 / 2 / Unique | 有/2 | 3/0/0 | eighttail | delivered |
| eleanor / 繁荣女神埃莉诺 | 416 / 2 / Unique | 有/1 | 3/0/0 | eleanor | delivered |
| exorcistgirl / 驱魔剑客莎娅 | 602 / 2 / Unique | 有/1 | 3/0/0 | exorcistgirl | delivered |
| fern / 一级魔法使菲伦 | 626 / 2 / Unique | 有/1 | 3/0/0 | fern | delivered |
| festivalgirl / 驱魔师美娅 | 359 / 2 / Unique | 有/2 | 3/0/0 | festivalgirl | delivered |
| firebishop / 炎龙化身比什巴赫 | 344 / 2 / Unique | 有/2 | 3/0/0 | firebishop | delivered |
| flowergirl / 鲜花店少女芭莉 | 318 / 2 / Unique | 有/3 | 3/0/0 | flowergirl | delivered |
| forestelf / 森林卫士艾丝黛尔 | 581 / 2 / Unique | 有/1 | 3/0/0 | forestelf | delivered |
| frieren / 活了千年以上的魔法使芙莉莲 | 623 / 2 / Unique | 有/1 | 3/0/0 | frieren | delivered |
| futureknight / 未来骑士 | 389 / 2 / Unique | 有/4 | 3/0/0 | futureknight | delivered |
| futureprincess / 未来公主 | 362 / 2 / Unique | 有/3 | 3/0/0 | futureprincess | delivered |
| garam / 九尾狐佳岚 | 365 / 2 / Unique | 有/3 | 3/0/0 | garam | delivered |
| ghostbuster / 科学家索菲 | 41 / 1 / Story | 有/1 | 4/0/0 | ghostbuster | delivered |
| goatgirl / 魔角猎人托佳 | 584 / 2 / Unique | 有/1 | 3/0/0 | goatgirl | delivered |
| golemrider / 魔像骑士阿勒夫 | 356 / 2 / Unique | 有/1 | 3/0/0 | golemrider | delivered |
| gourry / 天才剑士高里 | 452 / 2 / Unique | 有/1 | 3/0/0 | gourry | delivered |
| guardianangel / 天界之剑安吉 | 563 / 2 / Unique | 有/1 | 3/0/0 | guardianangel | delivered |
| halfvampire / 半吸血鬼普莉希拉 | 458 / 2 / Unique | 有/2 | 3/0/0 | halfvampire | delivered |
| heroai / H.E.R.O.S凯伊 | 518 / 2 / Unique | 有/1 | 3/0/0 | heroai | delivered |
| innuit / 因纽特少女可可 | 37 / 1 / Story | 有/1 | 4/1/0 | innuit | delivered |
| jadeshaman / 翡翠驱魔师塔莎 | 617 / 2 / Unique | 有/1 | 3/0/0 | jadeshaman | delivered |
| kunoichi / 忍者堇 | 494 / 2 / Unique | 有/1 | 3/0/0 | kunoichi | delivered |
| lancergirl / 淑女骑士拉碧丝 | 124 / 2 / Unique | 有/2 | 3/0/0 | lancergirl | delivered |
| librarian / 档案室文字记录员兰儿 | 335 / 2 / Unique | 有/3 | 3/0/0 | librarian | delivered |
| lifeguardyuze / 救生员柚子 | 413 / 2 / Unique | 有/1 | 3/0/0 | lifeguardyuze | delivered |
| lina / 盗贼杀手莉娜 | 449 / 2 / Unique | 有/1 | 3/0/0 | lina | delivered |
| maam / 武斗家玛姆 | 503 / 2 / Unique | 有/1 | 3/0/0 | maam | delivered |
| maid / 双面女仆艾米 | 135 / 1 / Story | 有/1 | 4/0/0 | maid | delivered |
| mechaandroid / 机器人MK.99 | 401 / 2 / Unique | 有/1 | 3/0/0 | mechaandroid | delivered |
| mermaid / 海洋杂货商汐雅 | 536 / 2 / Unique | 有/1 | 3/0/0 | mermaid | delivered |
| mschrome / No.9克罗姆小姐 | 479 / 2 / Unique | 有/1 | 3/0/0 | mschrome | delivered |
| ninjaleader / 雪华众上忍枣 | 614 / 2 / Unique | 有/1 | 3/0/0 | ninjaleader | delivered |
| origin-130 / 吹牛魔法师道尔夫 | 130 / 1 / Story | 有/1 | 4/0/0 | origin-130 | delivered |
| origin-161 / 异界旅人凯瑟琳 | 161 / 1 / Story | 有/1 | 4/0/0 | origin-161 | delivered |
| origin-174 / 资深守护者琳达 | 174 / 0 / Normal | 有/1 | 5/0/0 | origin-174 | delivered |
| origin-179 / 守护者团员波比 | 179 / 0 / Normal | 有/1 | 5/0/0 | origin-179 | delivered |
| origin-184 / 拜拉尔剑士海尔佛 | 184 / 0 / Normal | 有/1 | 5/0/0 | origin-184 | delivered |
| origin-189 / 商人玛利亚 | 189 / 0 / Normal | 有/1 | 5/0/0 | origin-189 | delivered |
| origin-19 / 旅馆老板娘罗兰茵 | 19 / 1 / Story | 有/1 | 4/0/0 | origin-19 | delivered |
| origin-194 / 商人丽莎 | 194 / 0 / Normal | 有/1 | 5/0/0 | origin-194 | delivered |
| origin-199 / 精灵弓箭手利娅 | 199 / 0 / Normal | 有/1 | 5/0/0 | origin-199 | delivered |
| origin-204 / 泰坦忍者杰伊 | 204 / 0 / Normal | 有/1 | 5/0/0 | origin-204 | delivered |
| origin-209 / 受限极意功暴龙 | 209 / 0 / Normal | 有/1 | 5/0/0 | origin-209 | delivered |
| origin-214 / 超级泰坦人2布莱德 | 214 / 0 / Normal | 有/1 | 5/0/0 | origin-214 | delivered |
| origin-219 / 不良学生美娜 | 219 / 0 / Normal | 有/1 | 5/0/0 | origin-219 | delivered |
| origin-224 / 龙爪派东泰 | 224 / 0 / Normal | 有/1 | 5/0/0 | origin-224 | delivered |
| origin-229 / 魅魔研究员佩吉 | 229 / 0 / Normal | 有/1 | 5/0/0 | succubusresearcher | excluded-by-user |
| origin-234 / 遗物收集者艾尔丽 | 234 / 0 / Normal | 有/1 | 5/0/0 | dungeonailie | excluded-by-user |
| origin-239 / 守护灵奥拉莉 | 239 / 0 / Normal | 有/1 | 5/0/0 | ghostguardfemale | excluded-by-user |
| origin-244 / 小白虎康儿 | 244 / 0 / Normal | 有/1 | 5/0/0 | whitetigerbaby | excluded-by-user |
| origin-249 / 小商贩阿加莎 | 249 / 0 / Normal | 有/1 | 5/0/0 | origin-249 | delivered |
| origin-254 / 博士达芬奇 | 254 / 0 / Normal | 有/1 | 5/0/0 | origin-254 | delivered |
| origin-259 / 学生会会长凯特 | 259 / 0 / Normal | 有/1 | 5/0/0 | msstudentpresident | excluded-by-user |
| origin-269 / 小镇导游乔伊 | 269 / 0 / Normal | 有/1 | 5/0/0 | dungeonsuccubusa | excluded-by-user |
| origin-274 / 新手苦行僧利奥 | 274 / 0 / Normal | 有/1 | 5/0/0 | origin-274 | delivered |
| origin-28 / 森林妖精青叶 | 28 / 1 / Story | 有/1 | 4/0/0 | origin-28 | delivered |
| origin-310 / 抵抗军大兵聂恩 | 310 / 0 / Normal | 有/1 | 5/0/0 | origin-310 | delivered |
| origin-38 / 工程师玛丽安 | 38 / 1 / Story | 有/1 | 4/0/0 | origin-38 | delivered |
| origin-381 / 马蒂二世 | 381 / 0 / Normal | 有/1 | 5/0/0 | martyjuniorrobot | excluded-by-user |
| origin-5 / 骑士团长伊娃 | 5 / 1 / Story | 有/1 | 4/0/0 | origin-5 | delivered |
| partymadpanda / 派对不速之客疯狂熊猫团 | 476 / 2 / Unique | 有/1 | 3/0/0 | partymadpanda | delivered |
| parvati / 模范员工帕尔瓦蒂 | 446 / 2 / Unique | 有/1 | 3/0/0 | parvati | delivered |
| pet / 白兽 | 13 / 1 / Story | 有/1 | 4/0/0 | pet | delivered |
| pirate / 海贼瑞秋 | 32 / 1 / Story | 有/1 | 4/0/0 | pirate | delivered |
| pixygirl / 孩子王珂洛涅 | 590 / 2 / Unique | 有/1 | 3/0/0 | pixygirl | delivered |
| plaguedoctor / 鸟嘴医生 | 566 / 2 / Unique | 有/1 | 3/0/0 | plaguedoctor | delivered |
| plitvice / 战争女神普利特维采 | 110 / 2 / Unique | 有/3 | 3/0/0 | plitvice | delivered |
| popp / 魔法师波普 | 506 / 2 / Unique | 有/1 | 3/0/0 | popp | delivered |
| priestess / 勇士教教主维罗妮卡 | 392 / 2 / Unique | 有/2 | 3/0/0 | priestess | delivered |
| redhood / 红斗篷埃尔韦拉 | 12 / 1 / Story | 有/1 | 4/1/0 | redhood | delivered |
| robottanker / 机甲战士欧格玛 | 353 / 2 / Unique | 有/4 | 3/0/0 | robottanker | delivered |
| rudolph / 圣诞老人小帮手鲁 | 371 / 2 / Unique | 有/2 | 3/0/0 | rudolph | delivered |
| seawitch / 海巫娅拉 | 464 / 2 / Unique | 有/1 | 3/0/0 | seawitch | delivered |
| secretagent / 鱼鹰安娜 | 605 / 2 / Unique | 有/1 | 3/0/0 | secretagent | delivered |
| sheepgirl / 兽人剑士蕾伊 | 467 / 2 / Unique | 有/1 | 3/0/0 | sheepgirl | delivered |
| shuran / 炼丹师云苓 | 554 / 2 / Unique | 有/1 | 3/0/0 | shuran | delivered |
| slimemilim / 破坏的暴君米莉姆·纳瓦 | 578 / 2 / Unique | 有/1 | 3/0/0 | slimemilim | delivered |
| slimerimuru / 八星魔王利姆鲁·特恩佩斯特 | 572 / 2 / Unique | 有/1 | 3/0/0 | slimerimuru | delivered |
| slimeshuna / 巫女姬朱菜 | 575 / 2 / Unique | 有/1 | 3/0/0 | slimeshuna | delivered |
| sniper / 狙击手赫卡忒 | 36 / 1 / Story | 有/1 | 4/0/0 | sniper | delivered |
| soulpowergirl / 灵魂术士桃花 | 611 / 2 / Unique | 有/1 | 3/0/0 | soulpowergirl | delivered |
| stark / 战士休塔尔克 | 629 / 2 / Unique | 有/1 | 3/0/0 | stark | delivered |
| steamknight / 龙骑士夏皮拉 | 125 / 1 / Story | 有/1 | 4/0/0 | steamknight | delivered |
| steamprincess / 皇女阿依莎 | 119 / 1 / Story | 有/1 | 4/0/0 | steamprincess | delivered |
| streamergirl / 主播露莉 | 608 / 2 / Unique | 有/1 | 3/0/0 | streamergirl | delivered |
| succubus / 魅魔冒险家柚子 | 105 / 1 / Story | 有/1 | 4/0/0 | succubus | delivered |
| summeramy / 海滩女仆艾米 | 539 / 2 / Unique | 有/1 | 3/0/0 | summeramy | delivered |
| summerloraine / 夏日旅馆老板娘罗兰茵 | 473 / 2 / Unique | 有/2 | 3/0/0 | summerloraine | delivered |
| summershapira / 沙滩龙骑士夏皮拉 | 545 / 2 / Unique | 有/1 | 3/0/0 | summershapira | delivered |
| surfersohee / 海滩科学家索菲 | 410 / 2 / Unique | 有/1 | 3/0/0 | surfersohee | delivered |
| tanker / 勇士挑战者克雷格 | 92 / 1 / Story | 有/1 | 4/1/0 | tanker | delivered |
| valentineameris / 巧克力收藏家爱梅莉丝 | 635 / 2 / Unique | 有/1 | 3/0/0 | valentineameris | delivered |
| vampirecaptain / 近卫军队长瓦伦西亚 | 482 / 2 / Unique | 有/1 | 3/0/0 | vampirecaptain | delivered |
| vampirelord / 恶魔郡伯爵克劳德 | 461 / 2 / Unique | 有/1 | 3/0/0 | vampirelord | delivered |
| vampirenoble / 吸血鬼少女卡瑞娜 | 17 / 1 / Story | 有/1 | 4/1/0 | vampirenoble | delivered |
| viking / 寻龙少女奈娃 | 374 / 1 / Story | 有/1 | 4/0/0 | viking | delivered |
| villainandroid / 自主型机器人MK.2 | 428 / 2 / Unique | 有/1 | 3/0/0 | villainandroid | delivered |
| watcher / 监察员瑜娜 | 569 / 2 / Unique | 有/1 | 3/0/0 | watcher | delivered |
| whitebeast / 白雪 | 512 / 2 / Unique | 有/1 | 3/0/0 | whitebeast | delivered |
| whitedaygirgas / 甜心捣蛋鬼吉尔瓦斯 | 638 / 2 / Unique | 有/1 | 3/0/0 | whitedaygirgas | delivered |
| whitedruid / 德鲁伊康娜 | 434 / 2 / Unique | 有/2 | 3/0/0 | whitedruid | delivered |
| witchcoco / 冰雪魔女瑞皮娜 | 328 / 2 / Unique | 有/3 | 3/0/0 | witchcoco | delivered |
| xellos / 兽神官杰洛士 | 455 / 2 / Unique | 有/1 | 3/0/0 | xellos | delivered |

## 起点已有包（存在性与验收分开）

| 角色组 | native文件 | 开花 | 验收 | 源分支覆盖 |
|---|---|---|---|---|
| adelanoble / 女男爵黛西 | adelanoble | 有 | accepted-by-user | not-recertified-by-inventory |
| alicia / 尸之勇者阿莉西亚 | alicia | 有 | accepted-by-user | not-recertified-by-inventory |
| bakeneko / 猫咪武士米可 | bakeneko | 有 | accepted-by-user | not-recertified-by-inventory |
| battleballpitcher / 火焰左投手兰迪 | battleballpitcher | 有 | accepted-by-user | not-recertified-by-inventory |
| bridge_driver / V | bridge_driver | 有 | accepted-by-user | not-recertified-by-inventory |
| bridge_messenger / 反击的使者塞拉 | bridge_messenger | 有 | accepted-by-user | not-recertified-by-inventory |
| carpgirl / 福运金鲤金鳞儿 | carpgirl | 有 | accepted-by-user | not-recertified-by-inventory |
| dokkaebi / 小妖怪银河 | dokkaebi | 有 | accepted-by-user | not-recertified-by-inventory |
| eternalflame / 纯净之火伊露妮 | eternalflame | 有 | accepted-by-user | not-recertified-by-inventory |
| eugene / 电影演员尤金 | eugene | 有 | accepted-by-user | not-recertified-by-inventory |
| fallenqueen / 第1军团军长 | fallenqueen | 有 | accepted-by-user | not-recertified-by-inventory |
| fireharpy / 赤焰鹰身女妖辛缇拉 | fireharpy | 有 | accepted-by-user | not-recertified-by-inventory |
| firstbishop / 最初的化身凯勒 | firstbishop | 有 | accepted-by-user | not-recertified-by-inventory |
| foxshikigami / 阴阳师若藻 | foxshikigami | 有 | accepted-by-user | not-recertified-by-inventory |
| gnomedoctor / 地精医生诺艾尔 | gnomedoctor | 有 | accepted-by-user | not-recertified-by-inventory |
| hana / 冥界使者哈娜 | hana | 无 | accepted-by-user | not-recertified-by-inventory |
| idolcaptain / 偶像骑士团长伊娃 | idolcaptain | 有 | accepted-by-user | not-recertified-by-inventory |
| invaderknight / 黑暗魔法师贝丝 | invaderknight | 有 | accepted-by-user | not-recertified-by-inventory |
| kamael / 丰收之神卡麦尔 | kamael | 有 | accepted-by-user | not-recertified-by-inventory |
| klen / 魔兽之王克伦 | klen | 有 | accepted-by-user | not-recertified-by-inventory |
| knight / 骑士 | knight,knightmale | 有 | accepted-by-user | not-recertified-by-inventory |
| ladythief / 怪盗罗茜 | ladythief | 有 | accepted-by-user | not-recertified-by-inventory |
| legendaryhero / 传奇勇士埃里娜 | legendaryhero | 有 | accepted-by-user | not-recertified-by-inventory |
| madscientist / 疯狂科学家吉蒙里 | madscientist | 有 | accepted-by-user | not-recertified-by-inventory |
| magicalgirl / 神秘紫罗兰遥 | magicalgirl | 有 | accepted-by-user | not-recertified-by-inventory |
| mercenary / 海洋佣兵奥尔卡 | mercenary | 有 | accepted-by-user | not-recertified-by-inventory |
| mermaidspy / 代号J | mermaidspy | 有 | accepted-by-user | not-recertified-by-inventory |
| milkywaygirl / 群星书记长蕾娜 | milkywaygirl | 无 | accepted-by-user | not-recertified-by-inventory |
| necromancer / 死灵法师诺克希娅 | necromancer | 无 | accepted-by-user | not-recertified-by-inventory |
| nelluru / 温和的乳母涅露露 | nelluru | 有 | accepted-by-user | not-recertified-by-inventory |
| pandagirl / 懒懒美食家小满 | pandagirl | 有 | accepted-by-user | not-recertified-by-inventory |
| peimei / 仙山拳名家佩儿＆梅儿 | peimei | 无 | accepted-by-user | not-recertified-by-inventory |
| saintess / 被束缚的孩子克拉拉 | saintess | 有 | accepted-by-user | not-recertified-by-inventory |
| secondbishop / 均衡的化身拉克里玛 | secondbishop | 有 | accepted-by-user | not-recertified-by-inventory |
| squirrelgirl / 自由松鼠克莉希尔 | squirrelgirl | 有 | accepted-by-user | not-recertified-by-inventory |
| storeangel / 大天使加百列 | storeangel | 有 | accepted-by-user | not-recertified-by-inventory |
| succubusnoble / 贵族魅魔比安卡 | succubusnoble | 有 | accepted-by-user | not-recertified-by-inventory |
| summerandroid / 小宝机器人AA72 | summerandroid | 有 | accepted-by-user | not-recertified-by-inventory |
| summerrie / 海滩王牌击球手莉耶 | summerrie | 有 | accepted-by-user | not-recertified-by-inventory |
| sunyeo / 萌新仙女妲彬 | sunyeo | 有 | accepted-by-user | not-recertified-by-inventory |
| twinsandroid / 双胞胎机器人妮芙缇 | twinsandroid | 有 | accepted-by-user | not-recertified-by-inventory |
| villainredhood / 红斗篷团伙领导人阿拉贝尔 | villainredhood | 有 | accepted-by-user | not-recertified-by-inventory |
| wrestler / 主赛选手凯莉 | wrestler | 有 | accepted-by-user | not-recertified-by-inventory |

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
