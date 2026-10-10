# 机关状态、收集物与资源关联修补（2026-10-11）

网站仍为 GitHub Pages 静态 HTML/JS。新增资源是本地 Python 读取原始 bundle、已有解包资料与静态表后生成的 JSON/gzip/PNG，网页无需 Node、Unity 或后台服务。

## 使用

- 选中机关后，在“机关状态与动画”选择原始状态，可重播或直接查看终态。火炬、加速踏板、红蓝机关、钥匙门及战斗门保留已恢复的原始变换、显隐、材质/UV 和粒子动画。没有 Animator 的普通 DoorBehaviour 按 OpenHeight 等参数升降；源未提供高度时使用模型高度估算，并显示“升降预览”。未提供时长的升降预览用 0.5 秒。
- Q 选取、W 移动、E 旋转、R 缩放，拖动画面中的轴/平面/中心方块操作；可吸附到半格、15°、0.1 倍。数值微调保留在折叠区。多选围绕共同中心变换；还原选中/全部恢复原状态。
- “选中框”可单独关闭。同位置连续点击依射线命中顺序轮选不同图层/遮挡下方的物块；Ctrl 保留多选。
- “收集物”显示原始星片 prefab 和图集切片物品。星片恢复自 objectpoolspec 的 effects/stage/base → star_piece，保留核心、外壳、光晕及旋转；拾取物光晕作金色、加法混合预览校正，避免灰色透明贴图把光效压暗。
- 紫币与 PNG 使用同版本 items.atlas.txt 的坐标，正确处理旋转、裁剪和透明留白。按用户确认，世界 1–8 对应 purple_coin_1/2/4/5/6/7/8/3，世界 9 起对应同号图案；短篇及其他分类使用 purple_coin_event。旧地图变体按目录世界归属补齐，不根据 tileset 或地图名称猜币种。
- 地上物品按 TileProp.keyIndex → stagemetaitem.HandleNames.Item → Items.ItemSpecId → items.SpriteName 渲染，支持 items、characters、questItems；不虚构静态表未提供的物品图案。
- 宝箱沿同样方式查询 Box/Boxes，显示奖励数量、等级/权重及 gtatlas 原始图标。中文名优先使用物品 ID 对应文本，缺失时匹配 SpriteName 和移除品质后缀的键到 gtatlas 中文名。例如 9110092 / pearl_earring_accessory_unique → pearl_earring_accessory → 珍珠耳环。图案和名称不改变原始物品 ID。

## 数据与恢复边界

当前共恢复 913 个机关/动画模板、443 个 Animator 层、1320 个状态（983 个含可读取片段）、2038 个粒子配置，分布于 84 份按图块集加载的状态配置；其中 170 个门/关卡入口模板含 Animator。统计包括星片专用模板，不表示每个资源都完整复刻。

修正了只扫描最后一批地图模板造成的遗漏：现在合并 expansion/third/final 三批模板名，沙漠 battlegate 的 gate_desert_start/end 和钥匙门因此纳入。负播放速度的关闭片段按反向时间采样。

玩家手动选择状态；不运行剧情、碰撞、奖励领取或全部游戏条件。支持无条件 exit transition，BlendTree 暂取首个可读取片段，未完整实现动画对象引用曲线及所有 Unity 粒子模块。某些动画源片段未能匹配，具体见 native-states-audit.json 的 animatorError；不以合成动画声称已还原。炸弹花可切换源子组件；源未提供的完整游戏脚本绽放流程不作保证。临时编辑仅作用于当前展示，不写回原地图。

## 资源关联

修正 187 条跨模块关联（tools/resource-link-repairs.json）。包括 demonengineer_bunnyandroid → demon_engineer_bunny_android、sunyeo_firepower → sunyeo_fire_power，以及 spine_character_ 前缀资源；原别名仍可搜索，特效入口使用统一注册表的名称/别名。

## 整体 prefab 考察（未实际导入）

扫描 14,142 个非 tileset prefab，以至少两个非空 MeshFilter 作为组装候选条件，排除人物/Spine、特效、UI 等目录，得到 289 个候选：theatre 96、worldmap 150、tilemap 13、其他 30。它们尚未作为完整 prefab 根导入；候选数量不代表每个子网格都是真正的体积模型。

例如 dreamvillage 的 dv_moneyshot_start/end（3,845 / 1,696 个网格实例）、rosetta_minigame_object（2,300）、demonworld_cookie（2,220）、heavenhold_theatre（93）、launch_inn（71）、guild_arcade_racing_game_back（749）。路径、对象数、动画器和粒子统计见 tools/gtmap/evidence/whole-prefab-audit.json。本次仅考察这些整体资源，没有导入。

## MOV 透明度

MOV 容器可以承载透明视频，典型编码是 [Apple ProRes 4444](https://support.apple.com/en-sa/102207)。当前网站的 MOV 使用浏览器 H.264/AVC 编码，链路没有 Alpha；换扩展名或透明画布不能补回透明度。此次保留现有 MOV，完整透明输出继续使用 PNG 序列 ZIP。未增加 Node、FFmpeg 或远端转码服务。

## 复现与检查

1. recover-map-states.py 从已有 bundle/APK 依赖读取状态，可用 --only 限定图块集；随后 --pickup 补入星片专用模板。
2. build-map-items.py 从 static_data_dec、已导出的 tileset componentSpec、items.atlas.txt/PNG 和仓库 gtatlas 中文表生成 item-metadata.json.gz。
3. state_assets.py 裁剪状态配置的未引用资源；repair-resource-links.py、audit-whole-prefabs.py 分别生成关联修复与只读考察记录。

仅作必要核对：代表机关、门、星片、紫币及地上物品的浏览器显示/切换、拖拽移动、图标中文名、图集边界和资源依赖检查，另运行 git diff --check。检查范围和数据见 tools/gtmap/evidence/gimmick-item-checks.json；没有运行全地图回归。
