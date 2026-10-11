# 原生人物脚底阴影考察

脚底椭圆阴影是独立于 Spine 骨骼的图集精灵，不需要实时灯光投影。现有地图人物桥接只导入骨骼，因此漏掉了 prefab 的 shadow 子物体；把人物的 Spine atlas 查全并不会自动带回这个阴影。现在已接入原图集阴影；没有原始引用的资源保持无阴影，不统一补画黑圆。

## 可核对的资源链

以 FullExtract 的 `Assets/characters/boss_shadow_beast/boss_shadow_beast.prefab` 为例：

- `shadow` 子 GameObject（1730242686860875），Transform 4061268324235159：局部位置 (0,0,0)，旋转 X=90°，缩放 (1,1,1)，即精灵平面铺在 XZ 地面。
- MeshRenderer 不投射、不接收实时阴影；MeshFilter 初始 fileID=0，由脚本重建精灵网格。
- MonoBehaviour 114044625135789424 是 `CustomSprite`（脚本 GUID 0a1525af630af932dca7143824c3bdfd）；`SpriteName=shadow.png`、`PixelToWorld=0.0085`、`IgnoreOriginalSize=1`、`TintColor=(1,1,1,1)`、`LocalScale=(1,1)`。
- Atlas GUID 3af95d0ee9f462f42b715a2f6b8be6da 指向 `Assets/spritesheets/battle ui/battle_custom_shear.prefab`，其 AtlasData 是 `battle.txt`，AtlasMaterial 指向 `battle_shear.mat`（GUID 1d9a8a5ee859d8948afe561bbcb41c9a）。
- `battle.txt` 中 shadow.png 的 frame 是 x=792,y=940,w=67,h=30，未旋转、未裁剪、sourceSize=67×30。按这个 prefab 的比例，基础尺寸约为 0.5695×0.255 世界单位，再受角色/阴影缩放控制。`battle.asset` 也记录同一矩形；现有 gtatlas 的 battle 图集已收录此精灵。

在 `Assets/characters` 下扫描 2,152 个 prefab，其中 1,780 个明确包含 `SpriteName: shadow.png`；1,753 个比例为 0.0085，26 个为 0.0095，1 个为 0.02。这不是全部角色的统一尺寸保证，ondemand、theatres 及继承 prefab 还需各自读取。

不要把 `Assets/effects/commons/materials/shadow.mat` 当作上述角色阴影材质；角色 prefab 实际引用的是 battle_shear。AssetRipper 导出的 shader GUID 为占位值，不能仅从材质保存的 _SrcBlend/_DstBlend/_ZWrite 默认值推断实际 shader 的最终混合与深度状态。

## 动态控制依据

`E:/GTFiles/dump/Scripts.dll.cs` 中 Oak.SpineController 保留了独立的 shadowTransform、CustomSprite、isShadowActive、rotateShadowByCameraAngle 与相机缓存，并有 IsShadowActive、RotateShadowByCameraAngle、ShadowOffsetY、ShadowScale 和 SetShadowAlpha 接口。这里只把字段和接口作为控制能力证据，不从名称推测尚未核对的每帧公式。

Lua 的实际调用进一步说明阴影不是始终固定：

- `decrypted/Battle/BattleAction/Support/HalfVampireSupportBattleAction.lua:108,126` 分别调用 SetShadowAlpha(0) / (1)。
- `decrypted/Quest/ShortStory/Clevatess/Main/Section9.lua:1739,1857` 隐藏后按 progress 恢复透明度。
- `decrypted/Frontend/MarbleEventFloor.lua:80,96` 对角色调用 SetShadowRotation(Quaternion.identity)。

## 接入判断

能够在静态网页中按原 frame 生成带透明纹理的地面四边形，并从每个 prefab 提取大小、局部变换、显隐、颜色及 Atlas 引用。阴影应跟随人物位置和用户微调，保持独立于站立/跳跃的骨骼姿势；必要时以极小地面偏移或经核对的深度策略避免 z-fighting，并受墙体正常遮挡。

精确还原仍需核对原 shader、原生相机旋转补偿、ShadowOffsetY/ShadowScale 更新及跳跃/飞行/隐身脚本。仅按统一半径画黑圆，会丢失各角色大小、材质与剧情显隐差异；当前以图集透明混合及轻微地面深度偏移接入，尚未声称完整复刻 Shear shader 和原生相机补偿公式。脚部防穿地是另一项相机深度修正，不能替代该阴影。

## 已接入的实现

`tools/gtmap/build-character-shadows.py` 扫描可关联资源的 FullExtract prefab，并定向读取既有 APK 角色审计中的内置包，生成 `gtmap/assets/character-shadows.json.gz`。目前有 2,554 个资源默认值、2,617 个 prefab 覆盖；4 个默认映射存在歧义的资源不猜测默认值，明确的 prefab 覆盖仍可使用。数据保留来源文件 SHA256、图集原 frame、比例、TintColor、LocalScale 和祖先局部变换。

`gtmap/character-shadows.js` 按地图人物所在图层批量绘制原始 `battle/shadow.png`。局部变换转换到地图坐标系；阴影跟随位置、旋转、缩放、图层与手动显隐，跳跃时留在人物路径的地面基点。人物淡入淡出与独立 shadow 指令控制透明度。主界面提供总开关、单人物开关、透明度和倍率；单人物修改沿用地图撤销记录。切换角色资源会重新选择对应的阴影数据。

阴影不会启动另一套 Spine 解析，也不会额外逐人物读取贴图；同一地图共享一张 battle 纹理，按图层实例化。阴影读取失败只在人物诊断中报告，不阻止骨骼显示。关闭“随地图加载人物”时也跳过阴影索引与图片读取。
