# 坎公资源库

唯一主入口是 `gtlibrary/index.html`，站点首页的“坎公资源库”卡片指向此处。项目为纯静态网站，可放在普通静态服务器或 GitHub Pages 上；运行时无需 Node 或后端。由于资源使用 fetch 和 ES modules，请通过 HTTP 打开，不能通过 file:// 直接运行。

动画现可导出 GIF、MP4、MOV 和透明 PNG 序列 ZIP；地图可导出带内嵌贴图的 GLB、OBJ 套件或 Blender 套件。详见 [浏览器导出说明](docs/browser-exports.md)。

## 目录职责

```text
gtlibrary/
  index.html / library.js / library.css   统一导航、搜索、人物关联与路由
  apps/atlas/                             图集界面
  apps/spine/                             像素动画界面
  apps/fx/                                特效界面
  apps/map/                               地图选择与预览界面
  gtatlas/core.js + assets/                图集解码、透明筛选、旋转裁切与资源
  gtasset/core.js + assets/                Spine 解码、实例化与资源
  gtasset/equipment.js / emotion.js        装备、表情能力
  gtfx/core.js + assets/                   特效运行器与资源
  gtmap/core.js + decoder.js + assets/     地图渲染、解码与按需资源
  gtfx/gif-sizing.js / gif-worker.js       GIF 尺寸处理和编码适配
  core/api.js                             四种核心能力的延迟加载接口
  core/resources.js                       逻辑资源路径和去重别名解析
  core/registry.js / bridge.js             人物关联、应用通信与销毁协议
  core/delivery*.js / cache-version.js     CDN 回退、图片读取与缓存版本
  resources/registry.js                    三方共同的人物索引
  resources/previews/                     列表专用缩略图与帧索引
  sw.js / tools/                          有界运行时缓存与发布前生成工具
  shared/theme.css                        应用共享样式
  vendor/                                 单份第三方运行库
```

四个领域目录没有 `index.html`。`apps/*/index.html` 是主界面调用的内部视图，顶层直接打开会转回主入口。原来的独立网页代码、测试工具及重复资源副本留在开发归档，未作为网页运行资产发布。

## 路由和联动

例如 `#view=spine&resource=hana&name=hana&folder=character` 打开哈娜像素动画，`#view=fx&resource=hana&character=hana` 打开关联特效。图集卡片和统一导航可在当前人物的三种资源之间切换；未收录对应资源时关联按钮不可用。URL 可分享，浏览器前进和后退可切换视图。

主界面一次仅创建一个活动 iframe。切换会执行 `GTBridge.dispose()`、取消/忽略旧加载并移除旧视图；重型渲染器不常驻。图集按页绘制，Spine 只载入所选骨骼，装备图集在操作装备区时载入，特效只载入所选效果引用的纹理与网格。三方使用同一人物身份索引和资源解析器；`postMessage` 同时校验来源和活动窗口。

## 调用核心

```js
import {loadCore} from './core/api.js';
const atlas = await loadCore('atlas');
const regions = atlas.parse(sheetJson, image);
const visible = atlas.filterVisible(regions, image);
atlas.draw(context2d, image, visible[0], outputWidth, outputHeight);

const spineCore = await loadCore('spine');
const pageNames = spineCore.pages(atlasText);
const decoded = spineCore.parse({
  spine: spineRuntime, atlasText, bytes: skeletonArrayBuffer,
  images: pageImages,
  createTexture: image => new spineRuntime.GLTexture(gl, image)
});
const skeleton = spineCore.createInstance(spineRuntime, decoded.data);
// 使用完毕释放纹理：decoded.dispose();

const {FxRuntime} = await loadCore('fx');
const runtime = new FxRuntime(canvas);
await runtime.load(effectManifest, path => GTResources.url(path, manifestUrl), {effect});
runtime.build(effect, 12345);
runtime.autoFit();
runtime.sample(0.35);
// 使用完毕：runtime.dispose();
```

核心加载器不载入应用界面或游戏图片。图集/Spine 核心同时兼容普通 script 调用，导出 `GTAtlasCore` / `GTSpineCore`；Spine 运行库和纹理创建由调用方提供。FX 核心使用共享 Three.js 模块，需要浏览器 WebGL 和 canvas。其输入是已导出的特效 manifest，不是原始 Unity 项目文件。

资源读取前依次加载 `core/cache-version.js`、`core/delivery-config.js`、`core/delivery.js` 和 `core/resources.js`。使用 `GTResources.fetch(path, options)` 读取数据、`GTResources.image(path, options)` 读取可取消的图片。`GTResources.url(path, base)` 只负责逻辑路径/别名解析，返回本站规范 URL；CDN 切换和回退由读取接口统一处理。逻辑前缀 `resources/atlas/`、`resources/spine/`、`resources/fx/` 分别映射到三个领域的 `assets/`，历史物理路径也会应用去重别名。资源不可绕过解析器直接拼接：部分文件已由相同内容的公共副本承接。仅按 SHA-256 完全相同的内容去重，不依据相似名称合并。

新增资源应放进对应领域 `assets/`，维护该领域原有清单以及共同人物索引；新重复项还需更新 `core/resources.js` 别名。人物关联以资源实际 ID 为准，星级和方向在打开具体 Spine 资源时保留。

## 本次验证与恢复位置

原部署完整备份、迁移脚本、校验记录、截图及旧入口在 `D:\GTAsset\gtfxweb\development\library-integration`；不属于部署内容。原资源共核验完整性，去重归档 1238 个副本，部署区节省 119607369 字节（约 114.1 MiB）。开发归档仍占空间，保留用于恢复。

已实际查看哈娜图集、Spine 动画及连锁链条特效 0.350 秒画面；迁移后已验证 512 × 512 透明 GIF 编码完成、三星切片对应三星皮肤、装备图集延迟载入，以及内部入口转回统一主界面。10,185 个原资源经解析后的内容与原部署 SHA-256 一致，16 个应用与核心脚本通过语法检查。没有将该样例验证视为全部特效的画面正确性证明。特效解释器保留已有渲染范围和限制。

## 特殊皮肤特效

特效索引同时收录 `effects/manual/` 和 `characters/<皮肤 ID>` 中的特效预设。皮肤以自己的资源 ID 关联，不回退到本体；例如 `hana_beachball` 对应海滩排球哈娜。图集卡片、统一搜索和特效角色列表均可直接打开。共有 45 个补充角色/皮肤分组、896 条预设及辅助预制体记录。

新增预设保留原始方向、缩放、时限及粒子模块，材质和纹理从原始导出恢复。相同纹理按内容哈希复用，运行时仍只载入当前选定特效。源文件缺失或转换不支持的条目保持不可用，不以本体特效或替代材质冒充。

## 加载与缓存

首页立即打开当前工作区，人物索引异步加载；图集视图直接共享父页面的索引和加载 Promise。首次进入普通首页无需下载 Three.js、Spine 或游戏图片。图集的图片、帧数据、中文名并行读取；切换时中止旧请求。

像素动画列表使用 `resources/previews/characters.*` 或 `portraits.*`，保留全部原始帧名用于星级匹配。特效列表使用 `fx.*`，等待当前特效加载后再取头像。特效头像图片从两个完整图集合计 11,826,503 字节减少到 170,534 字节（约减少 98.6%）；对应帧索引另有 14,153 字节。缩略图采用 WebP，仅用于列表，预览、装备及导出仍读取原始资源。

HTTPS 页面在工作区启动后注册 Service Worker，作用域仅为 `/gtlibrary/`。第三方库、人物索引、已使用的资源按需缓存，不预下载整库。缓存按先入先出限制为 256 项 / 128 MiB，单文件超过 20 MiB 不写入；失败响应不缓存，存储不可用时正常走网络。缓存可供不同 iframe 和后续访问复用，已缓存资源也可离线读取；整个站点不保证离线可用。

发布工具根据运行代码和所有资产的内容生成版本。数据、索引请求带版本参数，因此刷新页面即可读取新版本，即使旧标签页的 Worker 尚未退出。新 Worker 等旧标签页退出再接管，随后清理本资源库的旧缓存；第三方库本身更新时，应关闭旧标签页后再打开。应用 HTML、CSS 和业务代码不进入运行时缓存。

## CDN 接入

`core/delivery-config.js` 现在默认将三个领域的已有资源交给 jsDelivr GitHub 端点，固定到 `23234bbfe68b6185123875f2078d4ee8a167de7f`，无需新建 CDN 账户或购买域名。实测 `characters.png`、特效目录、哈娜特效 manifest、哈娜骨骼及 Three.js 文件均返回 HTTP 200，SHA-256 与本地相同。新的 `resources/previews/` 尚未包含在该提交中，因此仍从本站读取。公共运行库目前仍使用本站副本，并由 Service Worker 缓存。

资源约 2.12 GiB；jsDelivr 官方默认包上限为 150 MB、GitHub 单文件上限为 20 MB，见 [官方说明](https://github.com/jsdelivr/jsdelivr#restrictions)。这些限制不能直接证明每一个单文件 URL 都不可用，但也不能以样例成功保证整库都可用，因此保留超时和错误回退。目标网络的实际速度需部署后测量。

更新游戏资源时，先推送包含资源的提交，再将 `cdnBase` 中的 SHA 改为该提交；或者暂时设为空，从本站读取新资源。`prepare-deploy.mjs` 会检查固定提交与本地三个资产目录是否一致，有差异时阻止生成，避免发布后仍读到旧 CDN 资源。只修改应用代码或生成缩略图时无需更改资源提交。配置也支持通过 `cdnPrefixes` 指定哪些物理目录交给 CDN。

可以把资源放在 Cloudflare R2，并绑定自己的资源域名，通过 Cloudflare 缓存分发；[官方接入说明](https://developers.cloudflare.com/cache/interaction-cloudflare-products/r2/)要求绑定自有 Custom Domain。也可以使用提供 HTTPS、CORS 和可控缓存策略的现有对象存储/CDN。

1. 为每次资源发布创建不可覆盖的目录，例如 `https://assets.example.com/gtlibrary/r20261009/`，上传 `gtatlas/assets/`、`gtasset/assets/`、`gtfx/assets/`、`resources/previews/`，保留物理目录及大小写。不要上传逻辑 `resources/spine/` 等虚拟路径。
2. 设置正确的 Content-Type。允许来自站点的 GET 跨域读取，例如 R2 CORS：`AllowedOrigins: ["https://crystal203.github.io"]`、`AllowedMethods: ["GET", "HEAD"]`；公开无凭证资源也可用 `*`。参见 [R2 CORS 文档](https://developers.cloudflare.com/r2/buckets/cors/)。
3. 对这个版本目录设置缓存规则，包含 `.json`、`.bytes`、`.atlas` 和图片等全部资源；设置 `Cache-Control: public, max-age=31536000, immutable` 及匹配的边缘缓存期限。以响应头 `CF-Cache-Status: HIT` 或所用 CDN 的命中标记核验，不能仅以域名已经接入判断命中。
4. 将 `cdnBase` 改为该版本目录完整 URL，必须以 `/` 结尾，并将 `resources/previews/` 加入 `cdnPrefixes`；运行发布准备命令，然后发布网页。核验真实网络区域的首次加载表现后再决定 CDN 是否适合目标用户。

请求先解析去重别名，再读取 CDN。HTTP 错误、CORS 失败或超时均回退到本站同一物理资源；本视图内后续请求直接走本站，避免重复等待。默认超时 4 秒，包括响应体传输，可按实际网络调整 `cdnTimeoutMs`。用户主动取消请求不会触发回退。本机开发地址绕过 CDN。回退要求 GitHub Pages 仍保留资源副本；移除副本会失去这项保障。

## 发布与验证

在本目录执行（生成预览需要 Python 与 Pillow，生成缓存版本需 Node；启用固定 GitHub CDN 时还需 Git，用于核验本地资源与固定提交一致）：

```sh
python tools/build-previews.py
node tools/prepare-deploy.mjs
```

原图、帧表或特效角色清单变化后需重新生成预览；任意运行代码、资源或 CDN 配置变化后需重新生成缓存版本。把生成的 `resources/previews/` 与 `core/cache-version.js` 一同发布。生成结果已随本次修改保存，静态运行无需 Python 或 Node。

可选的浏览器回归检查：安装 Playwright 和其 Chromium 后执行 `node tools/verify-loading.cjs`；使用已有 Edge 可设置 `PLAYWRIGHT_CHANNEL=msedge`。该检查启动本机临时服务器，覆盖索引延迟下首屏可用、单次共享索引、缩略图、哈娜 Spine/特效、原尺寸 PNG、GIF、缓存命中/离线读取，以及模拟 CDN 成功、错误、超时、取消和回退。它不访问线上站点，不能据此宣称真实网络加载时间改善。

## 第四子系统：GTMap 地图

已接入 `gtmap/core.js` 和 `apps/map/`，导航、统一搜索、链接分享、按需资源读取与切换销毁沿用资源库机制。已收录全部 2054 个地图源文件（2053 张可解码，1 个测试文件无法解密；末批增加 614 个）；左侧默认分类浏览，主动选择“全部地图”才展示全列表；选择范围、复用接口、操作与已知渲染限制见 [GTMap 说明](gtmap/README.md)。入口：`index.html#view=map&map=afterworld_1_1`。`loadCore('map')` 只载入核心代码；地图文件、模型和贴图按选择加载，资源逻辑前缀为 `resources/map/`。新地图资源暂由本站读取，未接入旧 CDN 提交。发布工具已将 gtmap 纳入缓存版本生成。

地图现已收录全部 2054 个原始文件，其中 2053 张可完整解码，一个测试文件保留密文并明确提示无法解码。中文目录依据游戏章节表、关卡表和 `strings-zhCN.json` 生成，主线与外传优先按游戏顺序展示；短篇、副本、合作远征赛季、PVP 等使用多级目录。各目录独立保留滚动位置。详见 [GTMap 说明](gtmap/README.md)。

## 全量资源检索与日服立绘

统一搜索现在使用 `core/resource-catalog.js` 共享加载 `resources/search-index.json`；图集选择器使用同一个 `resources/atlas-catalog.json`。目录包括 20 个图集的 7879 个可见区域、1751 个 Spine 资源、5365 个可用特效，地图目录另收录全部 2054 张地图。具体帧和特效可直接打开；已由人物索引表示的同一资源不重复展示。

94 个 `_kong` 日服立绘从原始 Bundle 提取真实骨骼、atlas、纹理及背景，存储在 `resources/illust-jp/`。原立绘分类共 347 项，保留已有立绘默认选择；新条目带“日服立绘”中文标记和搜索别称。`core/resources.js` 负责逻辑路径别名，避免污染指向旧公开提交的 CDN 资产。另有 6 个原始文件修复副本位于 `resources/spine-recovered/`。

离线工具：`tools/import-jp-illust.py`、`tools/recover-spine-binaries.py`、`tools/build-search-index.py`；默认骨骼全量验证使用 `node --jitless tools/verify-spine-sources.cjs`（本机 Node JIT 存在离线批量解析崩溃，解释模式完成验证）。网页无需 Node。浏览器覆盖验证见 `tools/checks/resource-coverage.html` 与 `tools/resource-coverage-validation.json`。

地图缩放已统一为 100% 下每格 32 CSS 像素，适配显示真实比例；合作远征三季 12 种伤害地砖恢复原生暗红色与淡入状态曲线。视频/Blender 导出考察及新资产的 Pages 容量条件见 [静态部署与导出可行性](docs/static-export-feasibility.md)。当前整库资产超过 Pages 1 GB 上限，正式发布需要静态资源镜像和精简 Pages 发布包，不能原样上传整个目录。