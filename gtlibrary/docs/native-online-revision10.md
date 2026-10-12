# GTOnline 1-1：第十轮原生核对

熊猫人剧情的 hold 来自 CharacterRopeTrapBehaviour 的单次 Spine 调用。捕获位移以前覆盖了 loop 并在结束时重置动作时钟，现保留原动作轨。所有剧情及分支移动在执行时读取起点，避免对白/await 期间前一动作继续执行后，后续动作跳回载入时的起点。

跟随改为 CharacterControllerPartyFollowState 的 Snake/Free 模式和 FollowLeaderOperation 路径队列。Constants.DistBetweenPartyMembers 经原生静态初始化常量池核对为 float32(.7)；Snake 使用剩余路径距离减成员序号乘间距，速度受 8 或 dash speed 上限约束；跳下保留为队列中的跳跃操作。距离过远不会瞬移，传送门和复活才重建队伍位置。Free 模式仍使用共享碰撞寻路，未认证 Unity 寻路同价节点顺序。

`state.party` 是成员、跟随和 HUD 的共同来源，保存/恢复包含罗兰茵，旧 section_5 存档迁移入队。头像从对应 character 图集中按原生 SpriteScale=1.6、56×56 遮罩裁切。预制体 memberPitch=70，血条 58×6，边框 68×68。宝箱/设置采用 main_ui 的 top_ic_tresurebox / top_ic_option。没有实现的 DPS、聊天等按钮省略。地图保存已探索地块；未探索地块透明，不绘制收集物。

第四段攻击使用原生 `[base]weapon1` 槽位的朝向变体。GetSpineEffectPosition 并非原骨骼三维位置：GetSpinePosition 将骨骼投影到 X/Z 特效平面。浏览器实现保留原生 FX_dash 层级、预设偏移和负 X 方向基准；在本帧 Spine 采样之后逐帧更新挂点，攻击结束销毁。三维骨骼点直接用于刀光会把向下刺击特效埋进地面。

已验证三个完整剧情分支及位移连续性、单次 hold 时钟、入队存档迁移、拐角跟随/碰撞/跳下队列、探索持久化与无收集物标记、四向剑骨骼和浏览器渲染。原生寻路排序、字体栅格化和小地图层裁切尚未做同帧认证；这些检查不构成全关逐帧无差异结论。
