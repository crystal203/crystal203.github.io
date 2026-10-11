# 地图人物动画

人物预览已接入主 library 的地图页面，复用 gtasset 的 Spine 3.8 骨骼解析、动画运行时、装备绑定和通用表情。所有资源加载、动画和编辑均在浏览器完成，适用于 GitHub Pages，不需要 Node 或服务端。

## 使用

- 左侧“随地图加载人物”决定下一张地图是否读取人物资源，并在本机记住设置。关闭时只统计占位记录，不读取人物索引、Spine 运行时、骨骼或贴图；地图人物面板可“载入此图人物”，不必重新加载地图。
- 地图下方的“人物”“人物动画”分别控制显示和播放。
- “地图人物”面板按中文名、内部编号、挂点或资源名搜索，点击人物即可选中并定位；也可在地图上直接选择。
- 人物检查器可以更换角色资源、四向朝向、皮肤、动作、表情、子动画、播放速度，以及单独暂停、重播。表情复用原生角色轨道和 human_emotion 的面部骨骼绑定。
- 装备使用静态表默认武器，也允许按原始物品 ID 为指定装备槽换装；0 表示卸下。贴图、裁剪和旋转信息来自现有物品图集，挂点与遮挡顺序由骨骼控制。
- 人物参与图块选择、微调、隐藏和撤回。模型导出保留当前人物姿势的静态快照，不包含 Spine 动画轨道。

默认显示地图中已放置的人物，排除 x/z 约为 999 以及 (99,99) 的预置挂点。位置存在不等于游戏开场可见：剧情条件、出场、移动、寻路、战斗和变身脚本不自动执行。未匹配或加载失败的人物会留在列表中显示原因，可以手动更换资源；人物加载失败不会阻止静态地图显示。

## 数据与坐标依据

人物来自事件图层 `events[].properties` 的 `Tilemaps.CharacterPlaceholder`，不是静态 tiles。事件 y 已是世界坐标；桥接 MapSelection 时先乘二，以抵消图块选择器内部的 y×0.5 换算，避免重复压缩高度。

静态表 `static_data_dec/{heroes,npc,monsters}.json` 提供 Name/Id → SpineAssetName、中文名及默认武器。映射同时支持旧式 `asset:skin` 与新式 `/bundle/path:asset#skin`，地图外观覆盖、同名骨骼及明确别名。例如：

| 地图记录 | 实际骨骼 |
|---|---|
| desert_slave_for_quest | desert_slave_2 |
| desertelf_mad_male_bomb | desertelf_mad_male |
| aw_main_character_kid | aw_hana_kid |

方向经现有 IL2CPP 原生 `VectorExtensions.ToDirection` 核对：1=后（+Z）、2=右（+X）、4=前（−Z）、8=左（−X）。左右共用 side 骨骼，左向镜像。人物尺寸和默认混合时间读取已导出 `MonoBehaviour/*SkeletonData.asset`，多数角色 scale 为 0.022；不沿用早期原型的演示比例 0.04。

生产解码器现支持 CharacterPlaceholder v1–v11，按原生 Deserialize（0x76386911fa74 / RVA 0x81fba74）的版本分支读取。v6 加入标签，v8/v9 增加头部字段，v4/v5/v7 分别增加 NPC 控制和外观字段。v10 的 c4 实际是浮点数，v11 在 c8 后加入 d8 布尔字段；全部字段保留原生偏移命名，不猜测游戏语义。旧版仅支持 v9/v10，导致世界 22 及大量旧地图的人物被忽略。

组件载荷有独立且明确的字节长度。未知或尚未支持的组件布局保留原始字节与解码错误；能确认人物共同头部时保留 ID 并提示部分解码，避免局部组件差异使整张地图打不开。KONG 容器的数量、索引、字节边界与末尾检查仍严格执行，不扫描字节来猜恢复位置。

## 渲染与性能

`gtasset/three-renderer.js` 将原 Spine SkeletonRenderer 的裁剪、attachment 网格、绘制顺序、双色顶点及混合方式交给地图共享的 Three.js 渲染器。相邻且纹理、混合方式相同的绘制批次合并；顶点缓冲复用，同一骨骼和图集共享解析结果及纹理，各人物保留独立姿势。不同朝向共用一次 atlas 文本读取，骨骼与图集并行请求；每个载入完成的人物只初始化自身姿势，列表/统计合并到一帧刷新，并定期让出主线程。每张地图最多四个并行人物加载任务；视野内动画按最高 30 Hz 更新，视野外与暂停人物停止姿势更新，切换地图释放资源。

人物使用朝向相机的竖直平面，保留深度测试。新增默认启用的“防止脚部穿地”：对低于角色锚点地平面的顶点，沿相机射线移到地平面前方，保持屏幕位置，避免脚下像素被地板截断；仍接受前景墙体遮挡。人物检查器可关闭修正，操作支持撤销。不按每帧动作包围盒抬高整个人物，以免走路或跳跃时漂浮抖动。

这是一项预览深度优化，尚未完整重建原游戏 Spine Shear 和所有剧情排序。锚点本身位于错误楼层、楼梯/桥梁和特殊材质仍可能需要位置微调；GLB 等导出保留原几何快照，不导出此相机相关的深度修正。

## 生成与定向验证

运行 `tools/gtmap/build-map-characters.py --root D:/github/gtlibrary` 生成索引；`--static`、`--assets`、`--output` 可指定数据源和输出。索引现有 2,868 个资源、29,862 个 Name/Id 查询键，读取 7,289 条导出比例记录和 APK 原生 SkeletonData 比例。prefab → SkeletonData → Atlas GUID 的关联也保留在索引 evidence 中。只有明确的源名称/引用用作别名，不使用近似名称来替换角色。

本次补入 APK 内置的 34 个资源，包括 princess（比例 0.02）、恶魔战士/弓手/巨人、平民、minotaurs 及元素外观等；默认皮肤也读取 prefab 的 initialSkinName，例如 princess 使用 normal 而非只含通用部件的 default，避免加载成功却只显示眼睛。这些基础资源不在下载的 FullExtract 中，来源为 E:/GTFiles/_fromTry 下的本地 3.51.0 APK，只定向读取内置角色包，没有重解全部资源。另补入此前被分到 other 而遗漏的 garage_car，保留 21 份原始外观骨骼；旧式 `garage_car:garage_car_a_dark` 能选择对应骨骼，不共用第一份赛车造型。来源、SHA256 与比例见 `tools/gtmap/evidence/apk-character-resources.json` 和 `garage-character-resource.json`。

`tools/gtmap/audit-map-characters.py` 对可用解密地图做字节和关联清查，输出 `evidence/map-character-inventory.json`。2,054 张部署地图中，本地有 2,053 张同 SHA256 明文；缺少 short_story_clevatess_test 的明文，因此没有把它算作已审计。64,597 条人物组件均完整消费载荷，包含 v1–v11；14,723 条为地图外预置，49,874 条为已放置，其中 48,913 条能关联到 Spine，961 条 / 115 个资源标识仍未关联。这是静态关联统计，不是 48,913 次实际渲染成功的声明。

剩余项包括已确认的非 Spine prefab（scarecrow、frog_cannon、mimic_a 等）和当前静态表/导出缺乏对应的旧记录（如 ds_prison_gaurd_male、部分 tower_hero_*）；清单保留所在地图、原始 ID 和已知来源。不把 3D/精灵挂点替换成类似的 Spine。当前人物列表明确显示记录总数、预置数、已载入/已放置、缺资源、无法解码及部分解码数；已确认非 Spine 的项注明组件类型。

世界 22 的 14 张地图共 633 条占位记录，其中 455 条已放置全部能关联；其余预置不自动执行出场脚本。主界面实际验证 fireworld_1 为 39/39、fireworld_6 为 60/60，均无资源加载失败。新增 35 组资源的 122 份骨骼完成浏览器解析，v1–v11 共 37 个版本/类型样本通过生产 JavaScript 解码器。脚部修正定向场景恢复了被地板遮住的像素，同时保留前景墙体遮挡，无着色器编译错误。没有进行全库渲染回归。24 个 princess 的定向初始化对比中，强制骨骼绘制由修改前 360 次减少为 48 次；跳过模式人物资源读取为 0，之后成功补载 24/24。princess 默认 normal 皮肤有 13 个可见 attachment；这里的开销数字是该固定场景的调用计数，不是全库耗时加速保证。

原生脚底阴影的资源、组件与还原边界见 [map-character-shadows.md](map-character-shadows.md)，后续已按原图集和 prefab 参数接入阴影。

事件考察见 [map-events-feasibility.md](map-events-feasibility.md)，已接入的走位、机关与原生片段见 [map-events-preview.md](map-events-preview.md)。地图占位并不包含所有由剧情脚本动态生成的人物。

早期合成场景原型仍保留在 `tools/gtmap/character-preview.html`，用于独立观察渲染链路；它不代表实际地图还原。
