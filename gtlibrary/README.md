# 坎公资源库

纯静态资源库，包含图集、像素动画、人物特效、地图、动画剪辑（GTVideo）、音频、角色图鉴和在线关卡预览。

右上角可切换简体中文和 English，语言偏好保存在当前浏览器。资源搜索同时接受已收录的中英文名称和内码。

安装 Node.js 22+ 后双击 `start-local.cmd`，统一启动本机网站（默认端口 `8765`）和 GTVideo Agent 连接服务（`47631`）。在 GTVideo 页面点击「连接 Agent」并在小窗授权即可，无需再运行 bridge 命令。重复启动会复用同一资源库的服务；按 `Ctrl+C` 停止本次启动的服务。支持 `start-local.cmd 9000 --no-open`，添加 `--no-agent` 仅运行网站。网站静态服务无需 npm 依赖。也可部署到普通静态服务器；请通过 HTTP 打开 `index.html`。

项目目录只保留网页代码、资源、静态服务入口及必要的项目说明：

- `index.html`、`library.js`、`library.css`、`sw.js`：入口、导航与缓存。
- `apps/`、`core/`、`shared/`、`vendor/`：各功能界面、公共模块、依赖和本地服务器。
- `gtatlas/`、`gtasset/`、`gtfx/`、`gtmap/`、`gtaudio/`、`gtwiki/`、`gtonline/`、`resources/`：功能实现、运行素材和目录索引。

`core/locales/ui-en.json` 配置英文界面文案。`core/locales/game-names.json` 根据 `E:/GTFiles/static_data_dec` 中的 `strings-zhCN.json` 和 `strings-enUS.json` 配置展示名称和游戏术语。`assets` 以资源内码为键，值依次为中文名、英文名。`terms` 以完整中文术语为键。缺少可靠英文对应的资源沿用现有名称或内码。

较新的英雄、地图和物品优先采用在英文串表还原池中核对过的词条。部分地图、时装和贴纸使用资源库补充的英文显示名。`game-names.json` 的 `dialogue` 按字符串键配置在线关卡台词。`core/locales/wiki-en.json` 收录英文图鉴的角色背景、技能、专武和觉醒说明。说明优先采用官方英文词条，缺失或与当前数值不符时以图鉴对应版本的机制和参数为准。

开发工具、导入器、查找器、生成脚本、工作缓存与全部开发文档已迁到 **`E:/GTFiles/gtlibrary-workbench`**。网站运行和静态服务不依赖此目录；Agent 连接工具保留在工作台 `tools/gtvideo`。启动脚本优先读取 `GT_VIDEO_TOOLS`，其次查找相邻工作台和本机 `E:/GTFiles` 工作台；缺少工具时仍可运行网站。

维护入口见 [工作台说明](E:/GTFiles/gtlibrary-workbench/README.md)，完整功能说明见 [项目指南](E:/GTFiles/gtlibrary-workbench/docs/project-guide.md)，特效制作规则和既往教训见 [交接文档](E:/GTFiles/gtlibrary-workbench/docs/fx-restoration-handoff.md) 与 [复原教训](E:/GTFiles/gtlibrary-workbench/docs/fx-restoration-lessons.md)。
