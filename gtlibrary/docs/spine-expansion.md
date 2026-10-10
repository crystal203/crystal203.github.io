# 剧情与活动 Spine 补录

本次添加 1525 个可选择条目：1429 个角色／怪物、75 个立绘、21 个骨骼特效／剧情动画。共 3614 个骨架；旧库和补录共 3276 个 Spine 条目。数据与全站搜索、人物索引、中文显示名称、骨架视角选择同步。

资源来源为 `D:/GTAsset/FullExtract/ExportedProject/Assets`。脚本通过 `.meta` GUID 连接 SkeletonData 的 `skeletonJSON`、`atlasAssets`、Atlas 的 `atlasFile`、材质 `_MainTex`，按 prefab 路径分类。贴图来自原材质引用；同名导出修订保留独立条目，完全相同资源合并。独立 atlas 页名避免不同资源使用同名贴图时串图；二进制骨架不转换编码。930 个相同骨架或纹理文件通过别名共享，节约约 71 MiB。

`E:/GTFiles/static_data_dec/{npc,heroes,monsters,strings-zhCN}.json` 提供资源引用、NPC 名称、角色内码、皮肤与中文检索。找不到明确中文对应关系时保留原名。例：NPC 303592 的 `aw_main_character_kid` 指向 `/ondemand/afterworld/characters/aw_hana_kid`，入口显示“哈娜（幼年）”。原始 Bundle 与该条目四个文本资产逐字节一致，详见 `tools/spine-expansion-source-check.json`。

Spine 页面新增“其他”，支持多骨架选择。特效页仍处理原有粒子／网格特效；本次没有将活动 UI、菜单、按钮等资源全部混入角色列表。排除目录和源数据缺陷在审计文件逐条列出。`big_maiden_hand` 缺失的 `hand_shadow` 同样存在于原包，因此仅保留可用部件，不生成替代素材。

新增资源位于 `resources/spine-expansion/`，原 CDN 的资产目录保持不变。Service Worker 按需缓存补录资源，沿用 128 MiB / 256 项上限，不预缓存全库。新增资产约 478 MiB；实际部署须使用项目既有的静态资源镜像／精简 Pages 发布包方案。

解析检查与浏览器抽查已完成，证据见 `tools/spine-expansion-validation.json`、`tools/spine-expansion-browser-validation.json`。自动取景先将附件包围盒居中，使原点偏移较大的技能部件也能直接显示；多骨架按钮支持换行。

网页只需静态托管，无 Node 服务或运行依赖。缓存版本可用 `python tools/refresh-cache-version.py` 更新；生成好的缓存标识已经包含在此次修改中。

`tools/spine-expansion/` 保存 Python 库存和导入脚本；默认工作目录为 `E:/GTFiles/_manual/spine-expansion`，可用 `GT_SPINE_WORK` 指定。工作目录保留完整 GUID 库存、已验证的解析资料和浏览器截图。导入脚本读取这些资料生成 `staged/`；源路径需按本机环境调整。后续导入会替换已有补录索引，避免重复添加。
