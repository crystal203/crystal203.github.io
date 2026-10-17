# GTOnline 1-1：攻击、跟随与小地图修复

原生 ManualKnightBattleAction 的 enter 调用 set_locked_dir，exit 才 remove_locked_dir。普通移动输入在本段攻击期间不改变朝向，动作结束后恢复；第四段刀光继续逐帧跟随剑槽位。第一击多道刀光源于粒子 shader 的 UV 输入为 vec3，而适配器只处理 vec2，未切出 2×5 图集的单帧。现保留输入维度并变换 xy。KatanaSlash / Reverse 按原生方向位掩码 9 / 6 使用局部 Z 轴 180° 翻转。

原生 CharacterControllerPartyBattlePrepareState.MoveToPosition 以距离 5 为近距离 JumpToPosition 和远距离 TeleportToPosition 的分界。进入战斗时为队员选择房内可站立位置，并重置跟随操作；Free 使用当前队长位置，不以最旧 Snake 操作为目标。战斗中不积压 Snake 路径，结束后也不补走。当前战前跳跃复用共享 .45 秒、.7 高度曲线，原生战前跳跃的精确轨迹尚未认证。

FieldUIMiniMap.SetMinimapLayer 的地板和墙颜色分别为 0xc048d7ad / 0xc01d645b；墙像素只绘制在八邻域有地板的位置。墙地块直接从原始 tilemap mergedWalls 展开，沿用探索遮罩，不绘制收集物。宝藏数依据 TreasureBehaviour / FloatingItemBehaviour 统计拳套宝箱、剑、盾、时装；无相关行为的装饰宝箱不计数。保存数据仍按领取对象 ID 去重，因此旧存档能直接重算。

熊猫剧情保留原生关闭北门事件，去除剧情尾部和按钮钩子的额外开门行为。交互接近只由原生 AlignParty 配置触发，三哥布林方向修正为 right；没有独立镜头指令时，接近动作中的镜头跟随实际主角位置。

跑步碰撞采用已核对的回弹距离 .6、时间 .35、垂直偏移 .31，以及 NPC 偏移 .25、往返各 .12；导出并使用 FX_wallimpact / FX_Dash_Smoke 原始资源。NPC 变色插值、烟雾的全部原生触发条件尚未做同帧认证。

按用户要求仅做最简验证：攻击反向输入与解除、门内外队员集合且无路径积压、墙线/迷雾、宝藏恢复计数、碰撞回弹清理，以及一次页面冒烟检查。无需把这些检查解读为全关逐帧认证。
