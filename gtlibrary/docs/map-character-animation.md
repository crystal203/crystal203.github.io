# 地图人物动画接入考察

结论：可行。可以复用 gtasset 的 Spine 3.8 运行时、骨骼解析核心和角色资源，将动态三角形交给 gtmap 使用的 Three.js。全部运行于浏览器，适用于 GitHub Pages，不需要 Node 或服务端。

本次交付是独立开发原型 `tools/gtmap/character-preview.html` 和接入考察。**地图主界面尚未新增人物开关或人物动画功能**。原型地面、墙体和人物排列为合成验证场景，并非游戏地图还原。

## 已验证的链路

原型直接使用 `GTResources` 读取现有资源，因此保留逻辑路径别名、新补录资源、本地及 CDN 路径处理。调用 `GTSpineCore.parse/createInstance` 创建角色；Spine 的 `AnimationState` 更新姿势，现有 `SkeletonRenderer` 处理 attachment、裁剪、slot 绘制顺序和双色顶点数据；自定义 batch 接口将其交给 Three.js 网格。

| 原资源 | 正面动画数 | 骨骼数 | 验证 |
|---|---:|---:|---|
| desert_slave_2 | 168 | 25 | idle_front、walk_front、walk_back |
| desertelf_prison_officer | 164 | 16 | idle_front、walk_front、walk_back |
| aw_hana_kid | 167 | 19 | idle_front、walk_front、walk_back |

三个角色同时渲染，正面共 35 个 attachment draw，未发现失败的 WebGL program。透明边缘及测试墙遮挡可见。原型可切换正面、背面、侧面及待机、行走、跑步；本次浏览器只抽查上述动作，没有逐一验证所有选项。该结果证明合成链路可行，未进行整图大量人物性能测试。

人物使用相机朝向的竖直画面平面，三角形在同一场景中参与深度测试。正式接入须结合游戏人物的剪切/排序参数校准，不能把当前演示尺寸 0.04 当作游戏实际比例；纯俯视时也应明确人物如何呈现。

## 地图记录与资源映射

当前部署文件经现有 `decodeMap` 解密后的抽样统计：

| 地图 | CharacterPlaceholder 数 | 排除 x/z=999 的放置记录 | 组件版本 |
|---|---:|---:|---|
| desert_1_1 | 132 | 72 | v10 |
| afterworld_1_1 | 316 | 261 | v9 |

人物挂在事件图层的 `events[].properties` 上，不在静态 `tiles` 列表中。位置直接来自事件的三维浮点坐标。999 占位点通常用于剧情预置，应排除默认显示，同时允许用户单独查看。排除占位点不等于确认人物在游戏初始时可见，剧情条件仍需另行处理。

静态资料位于 `static_data_dec/{heroes,npc,monsters}.json`，应同时建立 Name/Id → SpineAssetName 的索引。例如：

* `desert_slave_for_quest` → heroes ID 96 → `desert_slave_2`。
* `desertelf_mad_male_bomb` → `desertelf_mad_male`，两个名字不可简单视为两个骨骼文件。
* `aw_main_character_kid` → npc ID 303592 → `/ondemand/afterworld/characters/aw_hana_kid`。
* `desertelf_prisoner` 等老地图名称在新版静态表里没有同名行，但仍有同名 Spine 资源，需精确资源名回退。

`afterworld_1_1` 的 261 个放置记录都能在这三张表中按 Name 找到；`desert_1_1` 只有 27/72 个按 Name 命中，需要使用仍存在的同名资源及显式别名。静态表命中只证明映射存在，不代表所有对应的骨骼、皮肤、装备均已验证。

外观解析要区分旧式 `asset:skin` 与新式 `/bundle/path:asset#skin`，保留星阶、皮肤和地图覆盖项，不能只取冒号或路径后的最后一段。人物中文名可复用静态文本与资源注册表。

## 正式接入前需要补齐的部分

1. **人物组件解码。** `gtmap/decoder.js` 当前只完整支持 CharacterPlaceholder v9。沙漠使用 v10，剩余字段尚未解释，不能直接套用 v9。原型只读取 v10 的共同头部 ID 作考察，没有修改生产解码器，也没有将未知字段猜成朝向或显隐状态。
2. **人物层与选取。** 在事件图层建立人物实例、独立显隐开关，将选择和边界接入 MapSelection。事件坐标不能照搬静态图块的 y×0.5 换算。朝向需核实原始枚举，再映射 front/back/side 与左右镜像；选中人物可切换实际存在的动作、皮肤和朝向。
3. **资源与性能。** 共享相同骨骼数据、图集及纹理，每个人保留独立姿势和时钟。只加载需要的人物，视野外暂停更新；合并相邻且纹理/混合方式相同的 slot draw，复用顶点缓冲，设置缓存上限。原型采用逐 attachment 网格，不能直接扩展为几百人默认全速播放。
4. **外观完整性。** 复用 gtasset 的装备和表情能力，保留 attachment、skin、双色 tint、混合方式、遮挡及阴影。每个角色开一个播放器/WebGL 上下文会妨碍共享与地图遮挡，推荐共享地图的渲染器。
5. **范围与导出。** 先实现摆放位置上的动画预览、播放/暂停和单人物控制；剧情脚本决定的出场、移动、战斗、寻路、变身另行处理。模型导出应明确选择当前姿势静态快照或排除人物，现有导出器不能自动等同于可导出的完整 Spine 动画。

建议第一阶段支持已确认的 v9 人物和手动指定资源预览，同时补齐 v10 原生布局，再扩展到旧世界地图。原型与文档均为静态文件，未引入新运行时依赖、没有重新解包，也未进行整库回归测试。
