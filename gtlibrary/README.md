# 坎公资源库

唯一主入口是 `gtlibrary/index.html`，站点首页的“坎公资源库”卡片指向此处。项目为纯静态网站，可放在普通静态服务器或 GitHub Pages 上；运行时无需 Node 或后端。由于资源使用 fetch 和 ES modules，请通过 HTTP 打开，不能通过 file:// 直接运行。

## 目录职责

```text
gtlibrary/
  index.html / library.js / library.css   统一导航、搜索、人物关联与路由
  apps/atlas/                             图集界面
  apps/spine/                             像素动画界面
  apps/fx/                                特效界面
  gtatlas/core.js + assets/                图集解码、透明筛选、旋转裁切与资源
  gtasset/core.js + assets/                Spine 解码、实例化与资源
  gtasset/equipment.js / emotion.js        装备、表情能力
  gtfx/core.js + assets/                   特效运行器与资源
  gtfx/gif-sizing.js / gif-worker.js       GIF 尺寸处理和编码适配
  core/api.js                             三种核心能力的延迟加载接口
  core/resources.js                       逻辑资源路径和去重别名解析
  core/registry.js / bridge.js             人物关联、应用通信与销毁协议
  resources/registry.js                    三方共同的人物索引
  shared/theme.css                        应用共享样式
  vendor/                                 单份第三方运行库
```

三个领域目录没有 `index.html`。`apps/*/index.html` 是主界面调用的内部视图，顶层直接打开会转回主入口。原来的独立网页代码、测试工具及重复资源副本留在开发归档，未作为网页运行资产发布。

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

资源读取前加载 `core/resources.js`，使用 `GTResources.url(path, base)` 或 `GTResources.fetch(path, options)`。逻辑前缀 `resources/atlas/`、`resources/spine/`、`resources/fx/` 分别映射到三个领域的 `assets/`，历史物理路径也会应用去重别名。资源不可绕过解析器直接拼接：部分文件已由相同内容的公共副本承接。仅按 SHA-256 完全相同的内容去重，不依据相似名称合并。

新增资源应放进对应领域 `assets/`，维护该领域原有清单以及共同人物索引；新重复项还需更新 `core/resources.js` 别名。人物关联以资源实际 ID 为准，星级和方向在打开具体 Spine 资源时保留。

## 本次验证与恢复位置

原部署完整备份、迁移脚本、校验记录、截图及旧入口在 `D:\GTAsset\gtfxweb\development\library-integration`；不属于部署内容。原资源共核验完整性，去重归档 1238 个副本，部署区节省 119607369 字节（约 114.1 MiB）。开发归档仍占空间，保留用于恢复。

已实际查看哈娜图集、Spine 动画及连锁链条特效 0.350 秒画面；迁移后已验证 512 × 512 透明 GIF 编码完成、三星切片对应三星皮肤、装备图集延迟载入，以及内部入口转回统一主界面。10,185 个原资源经解析后的内容与原部署 SHA-256 一致，16 个应用与核心脚本通过语法检查。没有将该样例验证视为全部特效的画面正确性证明。特效解释器保留已有渲染范围和限制。
