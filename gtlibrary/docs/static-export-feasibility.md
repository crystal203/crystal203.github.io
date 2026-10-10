# 静态部署、原生效果与导出可行性

考察日期：2026-10-10。以下视频、模型导出是可行性结论，当前没有新增 MP4、MOV、GLB 或 .blend 导出按钮。网页运行仍是 HTML、CSS、JavaScript；仓库中的 Python/Node 工具仅用于离线整理和验证资产。

## 本次落实

- 地图 100% 统一为每个地图单位 32 CSS 像素。适配显示实际比例；点击比例恢复 100%。窗口尺寸、切换俯视/斜视不会改变这一基准。
- 主搜索采用共享资源目录：20 个图集、7879 个可见图集区域、1751 个 Spine 资源、5365 个可用特效，另有独立目录中的全部 2054 张地图。42 个完全透明的图集占位按原查看器规则过滤。搜索保留具体区域、方向及特效路径，不将同角色的其他资源当作不存在。
- 从原始 AssetBundle 提取 94 个 `_kong` 日服立绘的骨骼、atlas、整幅纹理与背景，接入原立绘浏览、关联资源和统一搜索。资源位于 `resources/illust-jp/`，不以头像代替立绘。Spine 字符串解码改为正确 UTF-8；另从原包修复两个旧资源的损坏骨骼/atlas，覆盖路径位于 `resources/spine-recovered/`。
- 合作远征三季的 12 种 dot 地砖模板恢复原始 CustomAnimator 材质颜色。用户所指 `[gimmick]dot_tile_3x3` 原本就是白色底图，RGB 由源状态曲线设为 `(0.17, 0, 0.01)`，透明度在半秒内从 0 淡入 0.4。恢复的是染色状态图，尚未恢复该机关的所有粒子和游戏行为。

## 可以继续恢复哪些地图效果

云雾并非冥界专属。源包/图块清单中还存在远征的 `FX_cloud1/2/3`、久远传说的 `FX_cloud`、圣诞的 `FX_front_cloud`、恶魔郡引用的 `FX_cloud_1`、魔陀丽山的前后景云等。部分是已经随网格显示的雾面，部分是尚未导出的粒子发射器。现在的“环境云雾”开关只控制已适配的冥界四种粒子预制体；没有对应发射器时禁用，不能据此判断整张地图不存在云雾。

末批原生导出审计出现 747 个 ParticleSystem 组件实例、42 个 SpriteRenderer、1 个 SkinnedMeshRenderer；这是审计批次的组件出现次数，并非全部游戏的独立效果数。还可从源包恢复蜡烛火焰、烟囱烟、落叶、萤火、传送门、电光等。已有特效核心与本次抽出的曲线采样器可以复用，但要保留发射形状、局部坐标、排序、子发射器与生命周期，不能仅贴一张图片冒充。

地图已经适配 63 类原生 Shader 的静态材质公式，部分水流、熔岩、遮罩和发光在运行。还原游戏完整环境仍需研究动态灯光网格、多通道深度、水面关联相机、场景控制器、昼夜/天气/关卡状态。现有地图文件和预制体不足以自动恢复全部游戏脚本。缺少源网格或外部依赖的地图仍应明确报告缺失。

## Spine 与特效的视频导出

| 目标 | 纯浏览器可行性 | 保留透明度 |
| --- | --- | --- |
| MP4 / H.264 | 可行，逐帧渲染、WebCodecs 编码、JS 封装 MP4 | 常规 H.264 管线不保留透明度 |
| MOV / H.264 | 可行，用同一编码帧封装 QuickTime 容器 | MOV 后缀不会让 H.264 自动具有透明度 |
| MOV / ProRes 4444 | 需要额外软件编码器，当前不能保证实用性能 | 编码器与像素格式支持时可保留 |
| PNG 序列 ZIP | 可行，浏览器直接输出原始 RGBA 帧 | 可保留，适合后续剪辑 |

现有 GIF 导出已具有固定时间步长和 RGBA 读取路径，Spine 在调色板量化前的帧、FX 的 `captureFrame(time, size, background)` 均可复用。将其抽成独立帧源，设置准确微秒时间戳、固定帧率、编码队列背压，关闭已提交的 VideoFrame，最后下载 Blob。视频生成不需要服务器。

WebCodecs 只产生编码数据块，需要另加 JS 封装器；Mediabunny 提供 MP4 与 MOV 输出格式，可作为静态 JS 随站点发布。本机浏览器检测到 H.264、VP9、HEVC 编码配置可用；这只是配置探测，没有在本次生成视频样片，也不能代表所有浏览器/硬件。MediaRecorder 的 QuickTime MIME 不受支持并不妨碍 JS 自己封装 MOV。实时录屏可能掉帧，不宜作为精确逐帧导出的主要路径。

透明 MOV 的难点在编码器。Mediabunny 的 ProRes 扩展目前提供的是解码器；不能将其误当作 ProRes 导出能力。软件/WASM 编码可以另行考察，但大图长视频受内存和耗时限制。较可靠的第一版应为不透明 MP4/MOV 与透明 PNG 序列。

依据：[WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API)、[Mediabunny 输出容器](https://mediabunny.dev/guide/output-formats)、[ProRes 扩展说明](https://mediabunny.dev/guide/extensions/prores)。

## 地图导出到 Blender

首选 **GLB（glTF 2.0）**，可以把网格、子网格材质、两组 UV、顶点色、节点变换和纹理打包成一个文件，使用 Blender 自带 glTF 导入器打开。能够表示的相机、灯光、骨骼和动画也可纳入；是否导出取决于源数据实际恢复范围。OBJ 只能作为简化的几何备用格式，不能满足完整场景目标。

地图核心已经持有网格、源材质、图块实例矩阵和层级，适合另加独立 `gtmap/export.js`。保留每层节点、图块 ID 和源资源 ID；共用网格/材质以避免巨大重复。默认用标准节点实例保证导入兼容，而不是依赖特定 GPU 实例扩展。很大的地图可提供按图层合并选项，同时另存图块定位信息。

GLB 的标准材质采用 PBR 或 unlit，并不能直接存储 Unity 自定义 Shader 程序。MatCap、加色混合、深度水面、屏幕空间阴影、面向相机的公告板、材质 UV 动画、粒子和事件脚本都需要转换或烘焙。源节点动画与材质动画也要区分，不能声称 glTF 动画自动覆盖所有材质曲线。标准相机同样不能直接表达游戏在顶点程序中实施的斜投影。

若目标是尽可能多保留功能，建议导出 ZIP：`map.glb` + `blender_setup.py` + `source-materials.json` + `effects.json`。GLB 本身开箱可看基本场景；用户在 Blender 运行附带脚本后，可重建一部分材质节点、动画与粒子并保存为 .blend。这里 Python 运行在用户的 Blender 中，不是网站服务器，符合纯静态网页约束。另可选择固定时刻/视角烘焙，但该结果不应冒充可动态重现的原生材质。

当前没有可靠的现成方案让纯浏览器直接生成功能完整、与原游戏效果一致的 .blend；也没有在本次生成 GLB 或完成 Blender 导入实测。GLB 方案的基础格式支持由 [Blender 官方 glTF 导入器](https://github.com/KhronosGroup/glTF-Blender-IO) 与 [KHR_materials_unlit 规范](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_unlit/README.md) 确认，具体 Unity 材质转换是本项目后续工程工作。

## GitHub Pages 容量与部署条件

当前地图资产约 915 MB，新增日服立绘约 286 MB，两者已约 1.20 GB；加上已有三个领域资源，整库资产约 3.48 GB。GitHub 官方限制已发布 Pages 站点不超过 1 GB，不能把整个工作目录原样作为 Pages 发布包。自定义 Actions 只豁免每小时构建次数限制，不能消除站点容量上限。[GitHub Pages 限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)

可继续采用纯静态架构：Pages 放界面、代码和目录元数据，大资源放可公开读取、支持 CORS 的静态资源镜像/CDN；发布包排除相应大资源目录。现有三个旧领域的 CDN 地址固定于已核验的旧提交，本次新地图与日服资源暂从本站读。要正式发布新增资产，必须先上传资源到实际可用的静态镜像，再配置新资源前缀；不能把尚未公开的新提交写入 CDN 假装已部署。原路径回退规则也需与发布包是否含原件一致。

本次只做本地工程与 Git commit，没有执行远端上传、push 或正式 Pages 发布。