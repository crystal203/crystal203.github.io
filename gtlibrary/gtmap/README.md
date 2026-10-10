# GTMap · 坎公地图

纯静态子系统。唯一入口是 `../index.html#view=map&map=afterworld_1_1`，内部应用 `apps/map/` 直接打开会返回统一入口。运行时仅用浏览器 JavaScript、WebGL、WebCrypto 与原生 deflate-raw 解压，不需要 Node、Python、Unity 或后端。

已收录 **2054 / 2054 个原始地图文件**：首批 206 个，第二、三批各 617 个，末批 614 个。其中 **2053 张地图可完整解码**，覆盖 KONG v9、v11–v16；`short_story_clevatess_test` 无法按已知地图名解密，保留原密文并在“杂项与测试”中明确提示，不伪造预览。目录记录具体编号、源分类、版本、图块数和 SHA-256。

分类从 `E:/GTFiles/static_data_dec/chapterdata.json`、`stages.json` 和 `strings-zhCN.json` 生成：主线世界按 ChapterNo 排列，外传随后按游戏顺序排列，短篇、回忆、副本、合作、公会、PVP 等使用多级目录。支线、通道、噩梦、地狱和章节活动差分归回对应故事。1688 张地图直接匹配关卡表，184 张根据文件名系列归并，182 张零散与测试地图集中在一个杂项目录。共有 38 个根目录、113 个目录节点；不存在源地图的空目录不会展示。中文名称保留字符串键，分类依据及多玩法共用地图的关联见 `../tools/gtmap/evidence/classification-audit.json`。
## 结构

- `core.js`：可复用 `MapRuntime`，实例化网格、原始 Shader 材质、云雾粒子、相机、拾取与销毁；`assetsForMap(pack, doc)` 抽取当前地图依赖。
- `native-material.js`：适配游戏包里的 GLES3 顶点/片元程序，绑定原生局部顶点、两组 UV、实例矩阵、材质参数与混合状态。
- `decoder.js` / `worker.js`：严格 KONG 解码；支持原始密文或明文，拒绝截断与无法解释的容器尾部，未知组件的原始载荷完整保留。
- `assets/catalog.json`：2054 个地图源文件及多级分类目录；`maps/` 保存原始加密文件；`packs/` 保存按依赖组合生成的共享模型与材质；`textures/` 保存原始纹理。
- `../apps/map/`：选择、筛选、文件打开和预览 UI；通过 `GTBridge` 通知父页选择，通过 `GTResources` 读取资源，使用共享主题。`core/map-catalog.js` 与人物索引一样由父页和内部视图共享一次加载 Promise，避免重复请求地图目录。
- `../tools/gtmap/`：离线导出、原始材质恢复、校验与证据。源游戏数据只读；全部部署资产已生成，无需在浏览器执行这些工具。

共享 Three.js 和 OrbitControls 保存在 `vendor/`。新资源走本站，未加入指向旧提交的 CDN 前缀。已接入逻辑路径 `resources/map/` → `gtmap/assets/`、`loadCore('map')` 及现有有界 Service Worker 缓存。首批保留一个共享包，第二批使用 17 个共享包，第三批使用 180 个、末批使用 267 个按图块依赖生成的 gzip 资源包；浏览器通过 DecompressionStream 解压，无需后端。选择地图时只读取对应包与实际用到的纹理，页面最多保留两个包的加载 Promise。末批包最大约 6.3 MB（解压后最大约 27.0 MB），首批包约 19.2 MB，均小于当前 20 MiB 单文件缓存上限；仅按需缓存，不预下载整批。

## 使用

顶部第四个“地图”入口打开工作区。左侧默认显示分类卡片，进入子目录后逐级浏览；主动选择“全部地图”才显示全部列表。“‹ 返回”返回上一级，每级目录分别记忆滚动位置，搜索和选择地图也不会重置已有位置；会话内切换子系统及刷新保留目录位置。搜索可匹配地图编号、关卡中文名、章节和玩法名，支持“属性塔”“合作远征”“竞技场”等常用别称。顶部统一搜索使用相同目录名称。选中地图后地址包含 `view=map&map=<编号>&category=<分类>`，刷新、分享链接和浏览器前进/后退沿用统一路由。切换到其他子系统释放 Worker、贴图、材质、几何体、控制器和 WebGL 上下文，再返回时恢复地图选择。

中键平移，右键旋转，滚轮缩放，左键查看图块，F 适配。斜视自动开启 Unity 斜投影，俯视自动关闭，亦可手动切换。支持图层、环境云雾、事件标记和亮度。事件标记在地图与透明环境之后绘制，不参与深度遮挡。移动端通过“选择地图”按钮展开列表，单指平移、双指缩放。

“打开文件”允许读取目录中已收录地图的 `.bytes` 或明文 `.tilemap`；文件名需要保留原地图编号，内容必须与目录校验值一致。不在源文件集合中的其他地图明确提示未收录；无法解密的测试图明确标注状态。

## 资源及验证范围

首批共 480 个图块模板、615 个网格、38 个原始材质和 30 个纹理条目。末批直接从原生 AssetBundle 提取 12681 个图块模板、14112 个网格、828 个材质与 471 个纹理条目，部分与旧批共享，覆盖 63 类着色器；发布时按每张地图的依赖拆包。原始 APK/bundle 恢复 MatCap、透明阴影、加色、发光与水流材质，不以统一颜色替代机关贴图。

源数据仍有缺失：`island`、`main_one_act` 的图块包不在现有文件中；部分角色外部依赖、旧名称或动态组件无法显示。`civilwar_minigame.tileset` 不在原包中，只恢复同一原包里名称完全一致且唯一的 5 个图块，其余保留缺失记录。原始测试地图中的 `ti=-1` 保存为未解析图块占位，不从其他编号借图块。界面显示缺少依赖、图块和未显示元素的数量，末批详细记录见 `../tools/gtmap/evidence/final-export-audit.json`。

人物动画、游戏脚本、部分动态效果和缺失的原始网格尚未显示；界面逐图显示对应数量，`assets/export-audit.json` 与 `../tools/gtmap/evidence/expansion-export-audit.json` 保留各批具体未恢复记录。冥界云雾恢复原始发射器与参数，以固定随机种子显示，极小噪声位移仍未实现。第三批缺失的旧名称、外部依赖、动态组件和原生无限材质参数见 `../tools/gtmap/evidence/third-export-audit.json`。原生 GLES 公式保持材质的遮罩、渐变、第二 UV、发光、水流和混合方式；地图文件不包含完整灯光控制器，依赖全局灯光的材质暂用中性方向光，不生成游戏动态点光源网格。多通道深度预处理与动态角色效果仍未完整还原。

`desert_1_5` 的 32 个 `[gimmick]water` 具有原始网格，但旧 YAML 导出的材质引用丢失；现从 desert bundle → effects/commons 恢复 `Water_desert` 及蓝色水纹，使用 `Unlit/Lava-Distort-Flow` 原始流动公式。水面修复和事件覆盖的像素检查见 `../tools/gtmap/checks/water-events.html`。

全部原始密文的复制哈希均一致；2053 张可解码地图使用网页同一 JavaScript 解码器通过 SHA-256、图块数和事件数校验，另一个文件验证为明确的解密失败状态。结果见 `../tools/gtmap/evidence/final-source-validation.json`。旧版 v11 的难度标记与 v12 不同，v9 没有 handles 段；全部 15 个 v11 和 23 个 v9 容器完整消费至 EOF。MinimapLayerRegion v4 的可选 Color32 数据按条件读取，字段语义仍以候选名称标注。

浏览器检查入口：`../tools/gtmap/checks/batch.html` 检查末批 613 张可解码地图及冥界、沙漠回归样本的 GPU 构建、Shader 编译与核心操作；`../tools/gtmap/checks/directories.html` 验证多级导航、各层滚动恢复、地图选择、中文搜索和失败提示。既有 1440 张地图的上一轮完整 GPU 验证记录继续保留。测试不能证明所有动态元素或全局环境都与游戏一致。

## 复用核心

```js
import {loadCore} from './core/api.js';
const {MapRuntime, decodeMap, assetsForMap} = await loadCore('map');
const doc = await decodeMap(bytes, mapId);
const runtime = new MapRuntime(hostElement, {onPick, onChange});
await runtime.loadAssets(assetsForMap(pack, doc), loadOriginalImage);
await runtime.build(doc);
runtime.setView('top');
// 使用结束
runtime.dispose();
```

离线重新导出（需要源文件路径及 Python 的 numpy、PyYAML、UnityPy；生成器中的本机路径可按需调整）：

```sh
python tools/gtmap/build-batch.py
python tools/gtmap/recover-materials.py
python tools/gtmap/extend-batch.py
python tools/gtmap/recover-expansion-materials.py
python tools/gtmap/build-expansion-packs.py
python tools/gtmap/import-third-batch.py
python tools/gtmap/build-third-packs.py
python tools/gtmap/import-final-batch.py
python tools/gtmap/build-final-packs.py
python tools/gtmap/classify-maps.py
python tools/gtmap/recover-native-animations.py
node tools/gtmap/verify-source.mjs
node tools/prepare-deploy.mjs
```

扩容脚本以 `tools/gtmap/batches/first-206.json` 为固定首批清单；逐图完整解析并缓存校验结果，然后恢复原始材质，生成依赖完整的包，最后更新目录。严格校验旧纹理的校验值，避免新批次改变已有地图贴图。

最后一条沿用资源库现有的离线缓存版本生成流程，网页运行不依赖 Node。资源变更后需要重新生成缓存版本，再随整个站点发布到 GitHub Pages。

当前地图部署资产共约 915.3 MB（十进制），其中末批 267 个 gzip 包合计 448.3 MB。新增 613 张可解码地图与两个回归样本均完成 GPU 构建，着色器编译无失败；9 张没有静态模型的地图单列记录，界面显示已解码但无静态模型的提示。汇总见 `../tools/gtmap/evidence/validation.json`，上一轮 1440 张地图验证见 `third-validation.json`。

100% 下每个地图单位为 32 CSS 像素，适配保留实际缩放比例，点击比例恢复 100%。此基准不会随地图边界变化。缩放验证见 `../tools/checks/map-scale.html`。

合作远征三季的 12 种 dot 地砖模板通过 `assets/native-animations.json` 恢复 CustomAnimator 的 RGB/Alpha 状态曲线。曲线实现复用 `core/animation-curve.js`；颜色状态采样由 `core/custom-animator.js` 完成。`[gimmick]dot_tile_3x3` 的暗红色来自源动画而非另找替代贴图。像素验证见 `../tools/checks/coop-dot.html`，源 Bundle 哈希见 `../tools/gtmap/evidence/native-animation-audit.json`。这个修复不表示所有机关行为或粒子均已恢复。

“环境云雾”控件只作用于目前已适配的粒子发射器，不控制所有静态雾面；其他章节的源云雾仍可进一步恢复。可恢复效果、GLB/Blender 与视频导出方案，以及 GitHub Pages 1 GB 容量限制见 `../docs/static-export-feasibility.md`。