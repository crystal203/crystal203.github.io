# 原生资料工作台

目标是把重复的拆包、解密、配置定位和汇编加载变为可复现工具。网站只提交运行时需要的数据和小型证据；完整 APK、解码缓存、SQLite 索引及约百 MiB 原生代码段留在 `E:\GTFiles\native-workbench`，不混入网页资产。

## 一次准备

```powershell
python tools/native/recover-native.py --apk E:\GTFiles\_fromTry\ktblgzyqshxgjzjdqhmx_3.51.0_0805_pr_01_20260907_120749_c6d8e.apk --unicorn-libs E:\GTFiles\online-native-evidence\python-deps --out E:\GTFiles\online-native-evidence\oct12
python tools/native/native-workbench.py prepare --apk E:\GTFiles\_fromTry\ktblgzyqshxgjzjdqhmx_3.51.0_0805_pr_01_20260907_120749_c6d8e.apk --native-root E:\GTFiles --cache E:\GTFiles\native-workbench --unity-libs E:\GTFiles\GTMap\GTMapWeb\tools\python-libs
```

输出目录按 **APK SHA-256 前 16 位**隔离，`current.json` 指向当前版本。`report.json` 保留每一个 ZIP 条目的 CRC/大小/SHA、每类解码数量、Unity 类型计数以及全部失败记录。失败不会被替换为空 JSON 或标成成功。

| 输出 | 内容 |
| --- | --- |
| `apk/` | APK 全条目原样展开，包括原生库、元数据、GameScript、Tilemaps 和 AssetBundles |
| `unity/` | TextAsset 二进制导出及旧格式缓存；新类型树按 source/pathId 索引，按需导出单文件 |
| `unity-objects.jsonl` | 全对象索引与已解码类型树，包含原始 fileID/pathID、未解码对象和错误 |
| `scripts/` | 全部本机加密 Lua 解密和 LZ4 解压后的源码 |
| `static/` | 全部可解密静态数据；JSON 校验，二进制容器单独保留 |
| `maps.kong.zip` | CDN 与 APK 的 `.bytes` / `.tilemap` 解密解压后的 KONG 容器，按来源隔离、连续归档，避免数千个小文件 |
| `index.sqlite` | Lua、静态 JSON、事件 JSON、Unity 类型树、符号表、C# 声明的 FTS5 索引 |
| `profile.json` | 当前 APK/ELF 哈希、ELF 地址映射、认证代码段、元数据和符号表出处 |

地图 KONG 的结构化解码继续复用 `tools/gtmap/strict_kong.py`，不另写一个不一致的坐标/枚举解析器。APK 的 plaintext Lua 与 CDN 的 encrypted Lua 是独立来源，检索结果会带来源路径，不能用后者覆盖前者。

## 日常定位

```powershell
python tools/native/native-workbench.py search --cache E:\GTFiles\native-workbench '"DoorOpenSfxHandleName"'
python tools/native/native-workbench.py search --cache E:\GTFiles\native-workbench '"ForestMainNewSection4"'
python tools/native/native-workbench.py method --cache E:\GTFiles\native-workbench DoorBehaviour
python tools/native/native-workbench.py disasm --profile E:\GTFiles\native-workbench\11ad39a67bb2a7ba\profile.json --start 0x6307e04 --end 0x6307f84 --out E:\GTFiles\door-defaults.txt
```

断点后只重试失败对象并刷新地图，无需重建全部索引：

```powershell
python tools/native/native-workbench.py refresh --native-root E:\GTFiles --cache E:\GTFiles\native-workbench --unity-libs E:\GTFiles\GTMap\GTMapWeb\tools\python-libs
```

类型树批量写入 JSONL，避免数万个小文件的写入开销。检索中 `unity/.../<pathId>.json` 为虚拟对象路径；用 `object --cache <缓存> --source <结果中的 apk/... 容器路径> --id <pathId> --out <输出.json>` 提取指定对象。

地图通过 `map --cache <缓存> --member <report.maps.entries 中的 member> --out <地图.kong>` 按需导出；归档不改变 KONG 内容，coverage 保留加密源和解码结果的 SHA。

FTS 查询支持引号短语、AND/OR/前缀；包含标点的内码应加双引号。`method` 查询用类名/方法名 substring，返回起止地址。反汇编按 ELF RELATIVE 重定位表还原指针槽，并使用 mmap 读取 ELF 和三个认证 overlay，不再每次把完整 SO 复制进 Python 内存。输出标注直接 BL 目标、可恢复字面量与 float32 常量；按 4 字节扫描，遇到无效指令显式输出 `.word`，不截断整个方法。

反汇编的简单寄存器跟踪仅用于导航，分支/循环汇合、虚调用、IFix 包装器及反编译出的类名仍要人工复核。汇编中的 symbol 名称是索引提示，不等于真实类型语义；必须核对字段偏移、构造器、call site、float 位模式和调用约定。

## 加固恢复

`profiles/3.51.0.json` 固定原始 ARM64 ELF SHA、保护解码器入口、种子、XOR、页置换、三个段的 VA/文件偏移/长度/CRC/SHA。`recover-native.py` 用 APK 自带 `libtprt` 的解码函数在受限 Unicorn ARM64 VM 中恢复数据；只有 CRC32 **和** SHA-256 都匹配才写出代码段。版本不匹配即拒绝套用旧地址。

`native-workbench.py` 只给匹配该原始 ELF 哈希的版本挂载已认证 overlay。直接反汇编受保护/置换后的原始 text 会产生看似可运行但语义错误的代码，旧的逐页猜测映射不能替代认证段。

Lua：AES-256-CBC/PKCS7 → LZ4 block；static_data：文件头派生 salt/key → AES-CBC → raw DEFLATE；地图：地图名派生 SHA-256 key → AES-CBC → raw DEFLATE。实现集中在工具中，避免重新人工抄密钥和猜参数。旧文档 `E:\GTFiles\GuardianTales_解密文档.md` 可作研究出处，但其中 D:\try 脚本路径和部分早期“未破”描述需要按本次 coverage/profile 复核。

## 明确保留的边界

全量展开 APK 不等于所有字节都已语义反编译。`k1ng` 二进制表保留原始内容；缺少类型树的 MonoBehaviour、纹理/网格/DEX 等在对象或 ZIP 索引中明确登记。`global-metadata.dat` 的版本相关头部 XOR 与 `[0x1000,0x5000)` 加密区域不能混为一谈；本工具没有把那段标记成已破解。字面量读取仍有边界校验，不成功时不制造文本。

这次实际覆盖记录提交在 `tools/native/evidence/apk-3.51.0-coverage.json`。新增 APK 必须新建 profile，重新恢复认证并生成 coverage；不得用旧版绝对地址证明新版行为。
