# 开发辅助文件归档

2026-10-31：按用户要求，把不参与网页运行和现有导入/生成流程的历史辅助文件移出工程。

- 归档目录：`E:/GTFiles/_archives/gtlibrary/2026-10-31-unused-dev`
- 共 1,693 个文件，83.12 MiB；保留原目录结构，未删除。
- 完整文件名、原路径、SHA-256 和迁移原因：归档中的 `manifest.json`。
- 恢复：在 PowerShell 运行归档中的 `restore.ps1`；可用 `-RelativePath tools/fx/check-character-readiness.mjs` 只恢复指定文件。不会覆盖工程里已存在的文件。
- 如需还原本次调整的文档链接，额外传入 `-RestoreDocuments`；内容后来有变化时会跳过。

保留全部运行代码与素材、启动/发布工具、角色导入器及编译模块、原生查找器、资源生成工具、当前角色台账和复原教训。FX 原始 prefab/characters/appearances、图集内容索引，以及地图导入工作缓存仍被维护流程使用，继续保留。

| 迁出类别 | 文件数 |
| --- | ---: |
| Completed one-time migration/probe | 6 |
| Diagnostic data fixture/report | 4 |
| Historical development report/preview | 8 |
| Historical diagnostic/restoration receipt | 29 |
| Historical map evidence/check fixtures | 122 |
| Historical probe or recoverable backup | 1131 |
| Historical source probe/report | 146 |
| Legacy browser/check fixtures | 21 |
| Manually invoked diagnostic/check, no production caller | 78 |
| Python bytecode cache | 145 |
| Superseded restoration worklist/report | 3 |

## 历史文档引用

以下链接原指向历史收据，现可在归档的同名相对路径找到；恢复原文件后也可继续使用旧路径。

<a id="archive-523ff94d073d"></a>

`docs/fx-graph-audit.json` → `E:/GTFiles/_archives/gtlibrary/2026-10-31-unused-dev/docs/fx-graph-audit.json`

<a id="archive-68f37e76a17d"></a>

`docs/fx-material-audit.json` → `E:/GTFiles/_archives/gtlibrary/2026-10-31-unused-dev/docs/fx-material-audit.json`

<a id="archive-40950fe3ea73"></a>

`docs/fx-myth-inventory.json` → `E:/GTFiles/_archives/gtlibrary/2026-10-31-unused-dev/docs/fx-myth-inventory.json`

<a id="archive-691441d977e0"></a>

`docs/fx-myth-remaining.json` → `E:/GTFiles/_archives/gtlibrary/2026-10-31-unused-dev/docs/fx-myth-remaining.json`

<a id="archive-58faf57e28f7"></a>

`docs/fx-myth-remaining.md` → `E:/GTFiles/_archives/gtlibrary/2026-10-31-unused-dev/docs/fx-myth-remaining.md`

<a id="archive-89b28ca1cb97"></a>

`docs/fx-restoration-progress.json` → `E:/GTFiles/_archives/gtlibrary/2026-10-31-unused-dev/docs/fx-restoration-progress.json`

<a id="archive-bf20bfa2c9fe"></a>

`docs/fx-screen-audit.json` → `E:/GTFiles/_archives/gtlibrary/2026-10-31-unused-dev/docs/fx-screen-audit.json`

