# 坎公资源库

纯静态资源库，包含图集、像素动画、人物特效、地图、动画剪辑（GTVideo）、音频、角色图鉴和在线关卡预览。

安装 Node.js 22+ 后双击 `start-local.cmd`，统一启动本机网站（默认端口 `8765`）和 GTVideo Agent 连接服务（`47631`）。在 GTVideo 页面点击「连接 Agent」并在小窗授权即可，无需再运行 bridge 命令。重复启动会复用同一资源库的服务；按 `Ctrl+C` 停止本次启动的服务。支持 `start-local.cmd 9000 --no-open`，添加 `--no-agent` 仅运行网站。网站静态服务无需 npm 依赖。也可部署到普通静态服务器；请通过 HTTP 打开 `index.html`。

项目目录只保留网页代码、资源、静态服务入口及必要的项目说明：

- `index.html`、`library.js`、`library.css`、`sw.js`：入口、导航与缓存。
- `apps/`、`core/`、`shared/`、`vendor/`：各功能界面、公共模块、依赖和本地服务器。
- `gtatlas/`、`gtasset/`、`gtfx/`、`gtmap/`、`gtaudio/`、`gtwiki/`、`gtonline/`、`resources/`：功能实现、运行素材和目录索引。

开发工具、导入器、查找器、生成脚本、工作缓存与全部开发文档已迁到 **`E:/GTFiles/gtlibrary-workbench`**。网站运行和静态服务不依赖此目录；Agent 连接工具保留在工作台 `tools/gtvideo`。启动脚本优先读取 `GT_VIDEO_TOOLS`，其次查找相邻工作台和本机 `E:/GTFiles` 工作台；缺少工具时仍可运行网站。

维护入口见 [工作台说明](E:/GTFiles/gtlibrary-workbench/README.md)，完整功能说明见 [项目指南](E:/GTFiles/gtlibrary-workbench/docs/project-guide.md)，特效制作规则和既往教训见 [交接文档](E:/GTFiles/gtlibrary-workbench/docs/fx-restoration-handoff.md) 与 [复原教训](E:/GTFiles/gtlibrary-workbench/docs/fx-restoration-lessons.md)。
