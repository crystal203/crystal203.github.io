# 1-2 主线流程复原记录

Quest 27 的 Section 8 使用原始 ForestMainNew.json:section_8，通过现有严格 ScreenplayCompiler 编译；地图入口重置、左向站位、DropPhone/GetPhone/PhoneCall、好友 13、StageTitle、victory_get、ProgressSection 与最后 1.8f 等待由注册原生方法核对。进度从 7 进入 8，罗兰茵在结束后转入队伍。

公用 MapEventPlayer 增加 awaitCallback 屏障，实际道具说明和 SNS 确认必须完成后才恢复时间轴。它不包含关卡名或任务逻辑；独有逻辑在 forest-entrance/main-quest.js。原生手机图标从既有物品图集按原始裁切坐标提取。

SuperTutorial 保留 0/1/2/3/4 状态枚举，教学箱 9010020、Level 4、DontFinish，装备后触发 super_tutorial_goblins 演出/战斗。0x17 DisabledControls 禁止移动、冲刺、普通攻击和暗杀，保留 Super；教学完成后解除锁并打开两扇指定门。宝箱在教学结束后结算。非区域教学战在死亡重试后重新激活，避免永久卡关。

OnStageLoad 0x738d8cc..0x738d9f4 以宝箱 IsOpened 重建 Cleared/Began；中途保存的状态 4 不可跳过未结束的教学。显式开门进入 Door 的 Open 状态，不走条件门的两秒维持倒计时；共用修正同时覆盖 1-1。

已打开 ROOM_battle_1 / goblins_1、ROOM_final / final 的原始分组触发，以及 exit_easy_forest_1_3 的离场衔接。原生 SuperCyclone 的动作数据用于教学武器：skill_cyclone、1.5 秒、0.2 秒伤害间隔、1.3 半径；战斗数值系统仍沿用既有简化实现。

验证：verify-story-callbacks、verify-mainline-flow、verify-airborne-pickups；方向、共用 gimmick、两关对白和眺望王国回归亦需通过。浏览器临时 QA 不保存用户存档，入口演出按正常对白/道具确认推进；最终战可用已完成教学的存档夹具检查恢复和出口。

尚未认证零差异。原始 SNS 面板、圆形转场、教学装备推荐界面、旧武器更强时的恢复选择、AppearGoblins 条件协程的完整时序分支、技能 FX/完整法力规则和原生伤害/AI仍未完成。Quest 34 PetNew 是独立任务，本轮未启用猜测的陷阱/咬人时间轴。storyParityCertified 保持 false，目录仍标为复原中。

原生方法与哈希清单：tools/native/evidence/stage-1-2-mainline.json。可复用转换入口：tools/native/stages/forest-mainline.py；主线控制器通过阶段客户端组合，未把 Quest 27/34 或 SuperTutorial 的判断放入 GTMap 渲染引擎。
