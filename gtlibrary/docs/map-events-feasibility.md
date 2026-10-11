# 地图事件还原考察

考察之后已接入有限、可还原的事件预览器，使用方式与范围见 [地图走位与事件预览](map-events-preview.md)。现有资料足以制作相当完整的剧情演出预览，并能逐步支持特定关卡的机关流程；不能据此承诺在网页中完整复刻游戏战斗、寻路和所有任务逻辑。

## 已有的可用依据

本地 `E:/GTFiles/decrypted` 有游戏 Lua 解出文本。世界 22 使用 `Quest/Main/FireWorld` 下的新目录结构，不能只搜索旧式 `eventcontrollers/FireworldMain.lua`。

| 行为 | 本地依据 | 可以重建的内容 |
|---|---|---|
| 路线移动 | `base/wp_util.lua:205`；`Quest/Main/FireWorld/Main/Section1.lua:464–473` | 明确的路径点、速度、时长、步行/跑步、结束朝向；第一段有基于当前位置的四个路径点，代码速度是 3，应以代码而非韩文注释中的 4 为准 |
| 直接插值移动 | `base/move_util.lua:3–77` | duration 或 distance/speed、插值类型、自动朝向、移动动作、结束位置；无需完整寻路也能播放这类确定路线 |
| 表情与动作 | `base/scene_util.lua:356,768,791,894`；`Main/Section1.lua:450–490` | 前后左右、动作循环/次数、表情轨道、透明度渐变及对白同步，现有 gtasset 已提供基础动画能力 |
| 普通门 | `base/operations.lua:1155–1164` | DoorOpenEvent、DoorCloseEvent、门名及 immediate 参数，可转接现有门组件状态控制 |
| 战斗封锁门 | `utils/InstantBattleController.lua:182–200` | BattleGateCloseEvent / OpenEvent，按名称分发；开门时机仍取决于战斗波次是否结束 |
| 区域与交互触发 | `Quest/Main/FireWorld/LavaRace/Section1.lua:90,129–177`；`Main/Section23.lua:231–250` | 指定角色完全进入指定区域、与指定物体交互、当前状态校验与一次性触发 |
| 剧情人物摆放和生成 | `Quest/Main/FireWorld/CharacterPlacer/Main/Section1.lua:1–148` | pivot + offset、朝向、初始透明度、force_active，以及动态 NPC 的 spec；地图挂点不是全部出场人物的完整名单 |

`base/operations.lua` 末尾还列出 animation / emotion / wait / position / move / fade / talk / talk_branch / weapon / sequence / effect / spline_move 等操作，适合作为浏览器演出指令的对照表。地图事件层已有挂点、标记、区域和组件载荷，静态表与中文文本可补充角色、物品、任务和对白名称。

## 可以做到的范围

1. **确定性剧情演出**：角色生成与出入场、路线、转身、动作、表情、镜头、对白、等待、淡入淡出、已接入机关动画。可以提供暂停、倍速、重播和选分支。路线明确时可以较贴近原演出；精确时序仍需核对协程的阻塞、并行和动画完成回调。
2. **指定关卡的互动流程**：增加可控的预览角色、区域检测、交互、开关状态、任务变量和事件总线后，可支持“进入区域→对话→打开门”“点燃火炬→改变开关状态”等逐项确认过的链路。仍须逐关核实碰撞形状、条件和原生组件的隐式行为。
3. **完整游戏模拟**：当前不能直接做到。战斗 AI、伤害与异常状态、碰撞推挤、原生寻路、网络同步、持久任务存档及小游戏控制器大量依赖 `CS.Oak.*` / Unity；它们不因 Lua 文件存在就自动可运行。`wp_util` 最终调用的是原生 `CharacterControllerScreenplayState.MoveWaypoints`，其贴地/飞行模式也需要另外实现。

尤其不能把“循环播放 run 动作”称为已还原人物移动，也不能把所有门自动打开当作还原了触发条件。原始文本中部分解出表达式存在语法缺损，例如 `move_util.lua` 的局部变量与 Sfx 调用；全库 Lua 直接执行不是可靠方案。

## 考察时提出的实现路线

先选一个短事件，把入口、挂点和依赖列清，离线生成有限的演出指令（actor / move / animation / dialogue / wait / gate 等）。网页执行这些静态 JSON 指令，保留明确的并行、等待与状态快照。对未知原生调用显示具体未支持项并停止该链路，不静默跳过；再逐步补事件总线、区域、交互与任务条件。

当前实现沿此路线，仍保持纯静态 GitHub Pages；离线转换可用 Python，浏览器播放用现有 JavaScript / Spine / Three.js，无需 Node 服务。若后续加入时间轴拖动，应采用事件日志和周期性快照重放，单纯倒放动画时间不能撤销生成、门状态和任务变量。

本次人物清查统计只覆盖地图占位记录。世界 22 的 `CharacterPlacer` 已明确证明还有脚本动态生成的 pilot 等角色；默认排除的 999、(99,99) 预置挂点也可能在剧情中被移动进场。因此“该地图已放置人物均已载入”与“游戏流程中的所有人物均已出场”是两个不同结论。
