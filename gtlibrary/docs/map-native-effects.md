# 地图原始特效与临时编辑

实现仍为静态 HTML/JS，运行时不依赖 Node、Unity 或后端。原始 AssetBundle 的解析在本地 Python 工具中完成，网页按图块集懒加载 gzip 特效配置与 PNG；现有地图包和其他三个子系统的资源快照未改写。

## 本次修复

- 合作远征伤害地砖使用原始 `FX_Iceground`、`FX_Smoke_aura_trail_b/c`、底面 `fx_quad_glow`，读取原始 CustomAnimator 的暗红色与透明度曲线。烟雾曾被底面遮住，现按 APK `globalgamemanagers` 的 TagManager 排序层处理：Under Effects、Default、Top Effects 等。没有生成或手绘替代贴图。
- 白色传送门是网格 UNorm8 顶点颜色被当作浮点数造成的过曝：源 `255` 必须送入 GPU 为 `1`。恢复了 499 个相关网格的原始格式描述；浮点 HDR 颜色保留。另修正 CustomAnimator 进入循环状态后丢失之前 RGB 值的问题。原始紫色光晕、蓝色孔环及双纹理滚动均保留。
- 从原始资源恢复 77 个图块集中的 893 个含特效/动画/排序配置模板、1432 个 ParticleSystem 配置、SpriteRenderer、Sprite 序列帧、CustomAnimator、UV 动画和原始 GLES 材质。源初始激活的发射器共 747 个，其中循环发射器 542 个；保持源文件中未激活的节点关闭。实例共用模拟器，按发射器/纹理进行 GPU 批量绘制。
- 左键选取，Ctrl＋左键增减多选。框覆盖一个图块的全部静态子模型及当前粒子范围；隐藏后仍保留框和编辑面板。移动、XYZ 旋转及 XYZ 缩放作用于整个选中图块，多选围绕共同中心变换。可还原选中/全部；修改仅在当前内存中，切换地图或刷新即清除，不写回地图、下载文件或浏览器存储。隐藏后显示计数同步更新。
- 大型地图“还原全部”批量更新实例，范围仅按网格统一重算，避免逐图块重复遍历同一批实例。

## 可测试的原始效果

勾选地图底部“地图特效”；在 100% 或更大比例下查看。特效在源文件中的位置生效，部分并非整张地图覆盖。

| 效果 | 地图编号 | 源图块 |
| --- | --- | --- |
| 红色伤害烟雾 | `coop_exp_s2_battle_1_hard`、`coop_exp_s3_battle_1_hard` | `[gimmick]dot_tile_*` |
| 紫色与蓝色传送门 | `coop_exp_s2_battle_1_hard` | `[GIMMICK]new_portal_enter` 等 |
| 冥界环境云雾 | `afterworld_1_1` | `FX_cloud_1/2` |
| 雪山薄雾 | `newnew_snowmountain_1_2` | `[fx]snow_fog` |
| 篝火及火星 | `snowmountain_1_3` | `[gimmick]campfire` |
| 火把、灯火和玉壶烟 | `coop_exp_s2_battle_1_hard` | `wall_town_fire`、`wall_town_jadepot` |
| 战场烟雾 | `civilwar_5`、`civilwar_6` | `fx_fire_smoke_slow_*` |
| 落叶 | `pixyworld_2`、`pixyworld_4`、`pixyworld_6` | `FX_pw_leaf_loop` |
| 烟囱烟和蒸汽 | `arena_race`、`short_story_slime` | `obj_roof_smoke1/2`、`wall_building_hotspring` |

`tools/gtmap/checks/scenes.html` 使用源地图局部区域提供七个效果的实景对照按钮。日常使用仍在资源库地图应用中。

## 还原边界

恢复了源贴图、动画帧、主要发射/寿命/颜色/大小/旋转/速度/力/UV 曲线、父子变换和材质表达式；浏览器粒子轨迹仍是近似模拟，随机分布、循环发射及 Noise 与 Unity 不完全一致。同一图块的多个实例共享随机样本。

尚未完整模拟碰撞、子发射器、速度驱动大小/旋转、继承速度、网格/蒙皮发射形状、部分多材质粒子及 CustomSprite/游戏脚本激活。未激活的战斗、破坏和事件阶段不会自动播放。人物 Spine、动态灯光/后处理及全部场景控制器不包含在这次恢复范围。不能据 Shader 编译通过声称游戏画面已逐像素还原。

岛屿和主屏幕测试图块集的原始请求路径 `tilesets/island`、`tilesets/main_one_act` 在已提供资源和 APK 中未找到；审计记录这两个缺口。角色依赖的旧路径会解析到源素材中的 part1/part2/part3 目录。

## 验证与复现

- `evidence/native-effects-browser-report.json`：全部 893 个模板 GPU 构建/原生 Shader 编译，无失败；清空后地图几何体释放为零。空挂点/控制器等列入 `empty`，不以伪造模型填充。
- `evidence/native-effects-interaction-report.json`：真实 WebGL 像素验证烟雾前景可见、传送门白环消除；左键/Ctrl、多选变换、显隐、还原、源地图不变与切换清除的检查。
- `checks/native-effects.html`：运行上述交互检查，可启动全部模板检查。大型测试缓存 `effects-fixtures.json.gz` 不入 Git，先执行 `checks/build-effect-fixtures.py` 从本地 `batches/final-master.json.gz` 再生。
- `checks/fx-regression.html`：20 个具备源贴图的原有角色特效、60 次 GPU 采样通过。旧目录另有 26 个样本引用当前工作目录不存在的 PNG，单独列入 `evidence/fx-regression-report.json` 的 `missing`，未计作通过；本次未改写其原始资源快照。
- `checks/mobile.html`：390 CSS 像素菜单、目录和选图回归。
- `recover-map-effects.py`：读取 `E:/GTFiles/files/AssetBundles/Android` 与提供的原始 APK，按依赖递归导出。可用 `--only <图块集名>` 更新指定图块集。
- `recover-vertex-formats.py`、`recover-sorting-layers.py`：恢复原始顶点格式及 TagManager 排序层。
- `evidence/native-effects-audit.json`、`vertex-format-audit.json` 和 `gtmap/assets/sorting-layers.json`：源依赖哈希、未支持模块和格式证据。

本次新增运行时资源约 32.6 MiB（1.48 MiB 配置与 31.11 MiB 源贴图）。静态部署原有的整体容量限制与分发方案保持不变，详见 `docs/static-export-feasibility.md`。
