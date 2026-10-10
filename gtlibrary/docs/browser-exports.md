# 浏览器端动画与地图导出

这些功能在 GitHub Pages 的 HTML/JS 环境运行，不调用 Node、FFmpeg 或远端编码服务。编码与材质烘焙均在用户浏览器完成。开发验证使用 FFprobe 和 Khronos Validator，部署时不需要它们。

## 动画

Spine 的「导出动画」区保留 GIF，并增加 MP4、MOV、PNG 序列 ZIP。特效系统在原有导出格式菜单中提供相同四种格式。尺寸、裁剪、帧率、播放速度、起止时间、图层与背景沿用原有操作。导出完成后保留保存链接，支持取消，恢复预览状态。

| 格式 | 编码 / 内容 | 透明度 |
|---|---|---|
| GIF | 原有调色板编码 | 1 位 |
| MP4 | H.264 / AVC，无音轨 | 不支持，使用颜色幕布 |
| MOV | QuickTime 容器、H.264 / AVC，无音轨 | 不支持，使用颜色幕布 |
| PNG 序列 ZIP | 逐帧 PNG + sequence.json | 完整 Alpha，包括半透明边缘 |

视频通过固定时间戳取帧，不录屏、不受浏览器实际播放帧率影响。最后一帧按真实剩余时长写入。H.264 所需偶数尺寸通过边缘补齐实现，不拉伸或重新裁剪。PNG 按原始尺寸保存，sequence.json 包含帧率、时长和逐帧时长。特效原始尺寸倍率继续使用最近邻缩放。

MP4/MOV 需要安全上下文（HTTPS 或 localhost）、WebCodecs 和当前设备支持的 H.264 编码器。编码前检查当前尺寸；不支持时明确提示用户降低尺寸或选择 PNG 序列。MP4/MOV 是有损视频，精确像素颜色请使用无损 PNG 序列。MOV 不等于 ProRes 4444，本实现不提供 ProRes 或透明 MOV。单边最多 4096 px、单帧最多 8M 像素，最多 3600 帧；PNG 累积数据超过 512 MiB 时提示缩短范围。

核心入口 `core/animation-export.js: exportAnimation(options)` 接收 RGBA 帧提供者 `getFrame(index, seconds)`，与应用 UI 独立。返回 Blob、扩展名、尺寸、帧数、时长。支持 AbortSignal 与 onProgress。

## 地图

展开地图下方的「导出模型」，选择格式、当前可见地图或选中图块、烘焙精度、快照时间与是否包含特效。

| 格式 | 文件内容 | 建议用途 |
|---|---|---|
| GLB | 网格、法线、内嵌烘焙贴图、无光照材质、相机、图层/图块层级、元数据 | 首选：直接导入 Blender 等支持 glTF 2.0 的工具 |
| Blender 套件 ZIP | GLB、blender_setup.py、源材质/特效元数据、源贴图与原始几何/UV、源地图、说明 | 在 Blender 中进一步设置加法材质、相机、色彩管理 |
| OBJ 套件 ZIP | OBJ、MTL、textures/、元数据、说明 | 兼容旧工具；材质还原能力弱于 GLB |

导出基于当前加载的资源和临时变换：隐藏物块和关闭的图层不进入文件，移动、任意旋转、缩放会反映到模型；不会改写原地图文件。GLB 坐标为 Y 向上，OBJ 转为 Z 向上，1 格对应 1 米。

材质烘焙执行预览正在使用的 GLES 或 ShaderMaterial 表达式。独立三角形图集避免原始 UV 重叠造成不同法线/MatCap 的颜色冲突，边缘扩展避免采样黑缝。相同网格、方向、材质与粒子参数共享烘焙资源。GLB 使用普通节点引用共享网格，不要求导入器支持 GPU instancing 扩展。材质采用 KHR_materials_unlit，避免导入软件再次打光导致变暗。

支持浮点渲染目标时，第二个 GPU 点绘制通道捕获顶点着色器计算后的坐标，因此斜切、位移和当前 billboard 朝向也能进入静态模型；不支持时保留原始网格，并在元数据中记录。每个三角形可选 16/32/64 px，复杂网格的单张图集上限 2048 px，可能降低实际单三角形精度。烘焙贴图累计超过 512 MiB 时提示缩小范围或降低精度；OBJ 文本超过 512 MiB、整个套件超过 1 GiB 时提示改用 GLB 或缩小范围。

Blender 套件解压后可直接导入 GLB。更接近网页的设置方式：在 Blender 的 Scripting 工作区打开解压目录中的 blender_setup.py 并运行。脚本只使用 Blender 内置 bpy，导入同目录 GLB，为新导入模型的加法材质重建透明+发光表面，并设定 Standard 色彩和正交相机；这不是网站后台 Python，也不是网页生成 .blend 文件。

### 还原边界

- 地图特效为指定时刻的网格/贴图快照，不包含 Unity 粒子时间线、碰撞、事件或游戏脚本。
- MatCap 和视角相关材质的颜色固定为导出时的视角；后续改变 Blender 相机不会重新运行 Unity 着色器。
- 加法混合不是 GLB/OBJ 的标准材质能力；普通 GLB/OBJ 近似为透明贴图，Blender 套件的脚本进一步补充加法表面。
- 预览本身未恢复的人物、动态实体、缺失源资源不会因导出而出现。烘焙沿用预览有效光照，不额外发明游戏场景灯光。
- 复用网格时不逐实例重新烘焙基于绝对世界位置的材质差异；需要逐位置计算的特殊效果可能有差别。
- PNG 图集是 8 位颜色，HDR 发光在 GLB 中不能完整保留。源材质/贴图元数据用于后续调整。

核心入口 `gtmap/core.js: MapRuntime.export(options)` 暂停模拟、捕获当前选择和资源，将工作委托给 `gtmap/export.js`，结束或取消后释放临时 GPU 资源并恢复预览。应用只组织 UI、进度和下载。

## 依赖与验证

依赖随仓库保存，运行时无需 CDN 下载：Mediabunny 1.61.3（视频编码/封装）、fflate 0.8.2（ZIP），均附 MIT 许可证。Three.js 使用现有 r180。QA 页面使用与 r180 一致的官方 GLTFLoader，文件位于 tools/export-checks，不参与应用运行。

- `tools/export-checks/exports.html`：视频、PNG 半透明、真实地图烘焙、标准 GLB 重新导入、选中物块微调、取消恢复。
- `tools/export-checks/animation-apps.html`：真实 Spine / 特效应用导出。
- `tools/export-checks/evidence/`：编码探测、GLB 规范检查与浏览器报告。

本机没有安装 Blender，因此不能声称已经在 Blender 中实测整个套件；已验证 glTF 标准结构、官方 Three.js 导入器重新渲染及 Blender 脚本语法。GitHub Pages 资源容量与静态资源镜像方案仍遵循现有部署说明。

参考：[Mediabunny 输出格式](https://mediabunny.dev/guide/output-formats)、[媒体源](https://mediabunny.dev/guide/media-sources)、[Blender 官方 glTF 导入器](https://github.com/KhronosGroup/glTF-Blender-IO)。

已完成关键验证：Spine MP4（6 帧 / 0.5 s）、真实特效 MOV（14 帧 / 0.7 s）、MP4/MOV 容器与 PNG 半透明、OBJ 索引/法线/UV/贴图路径、Blender 套件内容及脚本语法、取消恢复、选中图块微调。完整 afterworld_1_1 导出 13,590 个实例、652 种材质，约 79 MiB，无跳过材质；Khronos Validator 完整检查 0 错误、0 警告，标准 GLTFLoader 重新渲染没有失败程序。
