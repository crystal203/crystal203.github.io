# gtAudio：共享音频库

第六项资源功能，入口 `index.html#view=audio`。BGM、音效、语音均使用 AudioClip 内码，不翻译曲名。顶部统一搜索也能直接定位音频。试听页支持内码搜索、资源组/分类筛选、分页、原生浏览器播放控件、单曲循环、连续播放、上一首/下一首、下载、来源与 SoundHandleSpec 查询。切换模块会停止并释放当前音频。

## 数据与来源

| 路径 | 职责 |
| --- | --- |
| `gtaudio/data/catalog.json` | AudioClip 目录、内码默认版本、大小/时长/采样率/声道/哈希 |
| `gtaudio/data/provenance.json` | 每条记录的导出路径、APK/CDN bundle、pathId 和来源哈希 |
| `gtaudio/data/handles.json` | 原生 SoundHandleSpec、BGM 表；静态表覆盖已恢复的默认值 |
| `gtaudio/data/native-mixers.json` | APK 中完整 AudioMixer、快照、分组、AudioSource 的序列化配置 |
| `gtaudio/data/import-report.json` | 全量导入计数、去重后字节数、缺失 handle 报告 |
| `gtaudio/data/offline-package.json` | GTOfflineServer 发行资源索引及匹配 APK 的逐包哈希、AudioClip ID 和版本记录 |
| `gtaudio/assets/<SHA 前两位>/<SHA>.<格式>` | 按文件内容去重的实际音频 |
| `gtaudio/catalog.js` | 惰性目录加载、内码解析、搜索与规范 URL |
| `gtaudio/core.js` | AudioBank 和 AudioMixer；供关卡共享 |

导入范围包括 `D:\gtasset\fullextract\ExportedProject\Assets` 中所有音频、指定 APK 的全部 audio bundle、`E:\GTFiles\files\AssetBundles` 中已经下载的 audio/voice bundle，以及此前 1-1 单独恢复的原始音频。**没有下载到本机的 CDN 资源不在本次覆盖范围内。** 不同来源的同名音频保留独立记录，字节相同的文件合并存储。默认解析优先使用本机当前 CDN 版本，随后是此前明确恢复的关卡版本、APK 版本、完整导出版本；显式 clip ID 可固定任一版本。catalog.bindings 按 stage.id 固定本次迁移前的 1-1 音频 SHA，避免迁移时被其他语言或同名新版覆盖；新关卡可建立自己的版本绑定。

已有 OGG 原样复制；APK 的 FSB 通过 UnityPy/FMOD 解码为 PCM WAV；缓存 bundle 的 PCM 使用 FFmpeg 无损 FLAC 存储。没有增益归一化、重采样或再次有损编码。两种解码器/版本产生的不同字节保留为不同记录，不以“名字相同”判断内容相同。FLAC 总采样数在管道编码头里可能为空，目录时长使用原始 AudioClip 的 m_Length。

完整来源和编译版本在导入报告中，不能用目录记录数代替唯一音频文件数，也不能把内码别名误算成新的音频。

2026-10-25 更新：已从 `GTOfflineServer/assets/resource-index.json` 声明的当前发行资源和 `assets/game.apk` 抓取全部音频，包括中、英、日角色语音、剧情配音、BGM 和音效。索引版本为 3.51.0 / 15.46，包含 10 月 23 日并入的中英文包。共核对 653 个包、46,446 条包内 AudioClip 记录；现有导出按相同 bundle SHA-256/pathId 复用，新增 36,140 条目录记录、32,395 个内容文件，保留全部旧版本及关卡绑定。重复编码不视为独立台词。每包的资源索引 SHA-1／大小、匹配 APK 哈希及输出文件哈希均已核验；原始发行目录保持只读。

`GTWiki` 通过明确 clip ID 关联三语台词，使用共享 `findClip` / `clipURL`，不依赖同名内码默认语言。首次点击才载入目录和音频。详见 [英雄台词与播放](wiki-voice-lines.md)。

## 生成

依赖 Python、UnityPy、PyCryptodome（原生工作台使用）、FFmpeg。本机 UnityPy 位于 `E:\GTFiles\GTMap\GTMapWeb\tools\python-libs`。推荐先生成到空目录，核对报告，再复制到库中：

```powershell
python tools/audio/build-audio.py --assets D:\gtasset\fullextract\ExportedProject\Assets --native-root E:\GTFiles --apk E:\GTFiles\_fromTry\ktblgzyqshxgjzjdqhmx_3.51.0_0805_pr_01_20260907_120749_c6d8e.apk --unity-libs E:\GTFiles\GTMap\GTMapWeb\tools\python-libs --online D:\github\gtlibrary\gtonline --out E:\GTFiles\audio-build\gtaudio
```

运行时没有 Python、FFmpeg 或 UnityPy 依赖。不预缓存整个音频库，HTMLAudioElement 按需流式读取；Range 请求不进入站点的 Service Worker 缓存。游戏的 AudioBank 按需解码，默认 PCM 缓存上限 64 MiB，播放中的 AudioBuffer 独立持有，切换关卡/退出会取消请求并释放缓存。加载失败会报告并允许重试。

更新发行包音频时使用 `tools/audio/import-offline-audio.py --package E:/GTFiles/GTOfflineServer --out <空的暂存gtaudio目录> --unity-libs <UnityPy目录>`。脚本按发行资源索引选择包并验证源哈希，不依赖散落的历史下载目录；新增 PCM 以无损 FLAC 保存，原采样率／声道及精确总帧数保持。输出 `data/offline-checkpoint.jsonl` 只作本机断点记录，**不要随网站发布**。将新增 assets 和四份更新元数据（catalog、provenance、import-report、offline-package）合入 gtaudio 后，运行台词关联脚本、`tools/wiki/verify-voice-audio.py --hash-files`、`node tools/audio/verify-audio.mjs` 和发布缓存工具。存在同名容器副本时，provenance 的 `assetPaths` 区分实际角色路径和历史副本。

## 调用

```js
import {findClip,clipURL,AudioMixer} from '../gtaudio/core.js';
const clip = await findClip('02_gimmick_door_down_01');
audioElement.src = clipURL(clip); // 仅选择后加载
const mixer = new AudioMixer(stage.nativeMechanics.soundHandles,{binding:stage.id});
await mixer.effect('02_gimmick_door_down_01');
await mixer.music('bgm_forest_bright');
mixer.effect({name:'01_rustle_01', id:'rope', action:'start'});
mixer.effect({id:'rope', action:'stop', fadeOut:.5});
// 离开时：mixer.dispose();
```

`gtonline/audio.js` 只保留 StageAudio 兼容导出，音频路径和加载逻辑归共享库。旧的 `gtonline/assets/audio` 音频副本已移除；迁移出处并入 provenance。默认用户总音量保留 .3，叠乘原生 Volume/Pitch，不按“听起来太响”改写素材。原生 DSP、快照切换、空间衰减、优先级/RepeatTerm 的完整仿真仍需独立实现；本次保存了原始混音配置，不能声称浏览器已完全复现 Unity 的混音器。

## 机关门

`Oak.DoorBehaviour` 构造器恢复范围 `0x6307e04..0x6307f84`：Open 为 `02_gimmick_door_down_01`，Close 为 `02_gimmick_door_up_01`；`UpdateState 0x630432c..0x6305100` 分别从 `+0xc8/+0xd0` 取音频。两个音效均存在于 APK 原始序章 sfx bundle。它们与战斗锁门的 `01_gate_show_01/01_gate_destroy_01` 是不同机制。

`gtmap/native-door.js` 保留这些默认值和原生地址，优先使用门上序列化的自定义值。GTOnline 在门目标状态**真正变化**时播放；初始化/载入存档/剧情准备的 `still` 开门不误播，重复 applyWorld 不叠加音效。构造器/状态机摘录保存在 `tools/native/evidence/door-*.txt`。

## 提交前生成缓存版本

音频使资源库达到数 GiB，提交前可先 `git add -- .`，再运行 `node tools/prepare-deploy.mjs --staged`，最后重新暂存 `core/cache-version.js`。该模式复用 Git 已计算的内容哈希，拒绝未暂存的运行时变化或缺失文件，仍校验原有 CDN 快照。默认模式保留直接读取全部文件的检查。

缓存导出的 FLAC 写入精确 PCM 帧数，避免流式封装造成浏览器时长无限和无法定位进度。本轮历史流式文件通过最终帧 CRC8/CRC16 校验取得帧数，只修改 STREAMINFO；全部压缩音频帧保持一致，结果见 `gtaudio/data/flac-finalization.json`。
