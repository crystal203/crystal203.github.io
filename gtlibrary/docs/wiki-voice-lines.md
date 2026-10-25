# 英雄台词

角色详情的“英雄台词”章节按版本展示中文、英语、日语文本。版本包含普通、开花、骑士性格和特殊时装；支持三语对照、单语显示、按类型和台词全文搜索。台词类型旁的播放按钮使用“语音语言”选择的中文、英语或日语录音，文本显示语言独立选择。切换角色时重置版本和搜索，保留语言选择。

播放器使用 gtAudio 的显式 clip ID 和共享 URL 解析。音频文件只在点击播放后加载，目录元数据复用主界面统一搜索的加载结果；支持暂停、进度和音量。切换语音语言、版本、角色、搜索或离开模块会停止并释放音频；迟到的加载不会继续播放。缺失录音的按钮显示“暂无…语音”，不以其他语言或角色替代。源包同名但不同的有效录音可通过“录音版本”选择；相同源对象的不同编码副本只选一个。

文本来自 `strings-zhCN.json`、`strings-enUS.json`、`strings-jaJP.json`。同时读取 `Voice_`（触碰、邮件等）与 `cv_`（战斗、养成、召唤等）词条，不导入声优署名或语音设置。相同类型、版本、语言的完全相同文本合并；源表存在差异时，以“文本 1／文本 2”分别保留，其他语言不代替缺失语言。显示时清理游戏富文本标记，原始文本及来源词条仍保留在数据中。

台词类型中文名参考 [BWIKI 诺克希娅的语音一览](https://wiki.biligame.com/gt/诺克希娅#语音一览)，网页运行时不访问 BWIKI。

语音匹配依据匹配 APK 的 `Oak.CharacterVoiceType` 枚举常量（`tools/wiki/voice-types.json`）、`heroes.json` 的 `VoiceId`、骑士性格及原始时装语音后缀，使用 `VoiceId × 10000 + Personality × 1000 + VoiceType` 内码。普通类型为 1–36，召唤为 94–96，队长技能为 101，特殊剧情为 501–508；没有按词条排列顺序猜编号。开花或时装仅在同一语言、同一类型的文本完全一致且该变体没有独立录音时共享相应普通版本录音；`audioShared` 记录来源组。不同语言不互相兜底。

## 更新数据

先运行原有 `build_wiki.py` 更新角色资料，再运行：

```powershell
python tools/wiki/build-voice-lines.py --source E:/GTFiles/static_data_dec --report E:/GTFiles/_tools/gtwiki/voice-lines-report.json
python tools/audio/import-offline-audio.py --package E:/GTFiles/GTOfflineServer --out E:/GTFiles/audio-latest/gtaudio --unity-libs E:/GTFiles/GTMap/GTMapWeb/tools/python-libs
# 核验后将暂存 gtaudio 的新增 assets 及 data 元数据复制到仓库 gtaudio；保留已有资产。
python tools/wiki/link-voice-audio.py --source E:/GTFiles/static_data_dec
python tools/wiki/verify-voice-lines.py --source E:/GTFiles/static_data_dec
python tools/wiki/verify-voice-audio.py --hash-files
node tools/prepare-deploy.mjs
```

文本导入脚本默认仓库是脚本所在仓库，可用 `--repo` 指定。`--output` 可指定输出目录以预览变更。只有 `gtwiki/data/<角色>.json` 被更新，原有字段保留；`voiceLines` 字段随该角色详情一起按需加载。每组含 `id`、中文 `label` 和 `lines`；每行含事件 `type`、中文 `label`、三语文本数组 `texts` 和原词条 `keys`。未提供文本的语言为空数组。音频关联脚本为每行增加三语 clip ID 数组 `audio`、预期原生内码 `audioName`，以及必要时的 `audioShared`。重新生成台词文本后必须再运行 `link-voice-audio.py`。

2026-10-25 从 GTOfflineServer 当前发行包（3.51.0，资源索引 15.46，包含 10 月 23 日合并的配音）及其匹配 APK 提取全部 653 个音频包，覆盖 46,446 条包内 AudioClip 记录。现有图鉴 173 位角色中，149 位有可关联录音；中文关联 6,377 项、英语 6,017 项、日语 6,735 项类型／版本记录。没有对应包的角色仍显示台词和缺失提示。详见 [共享音频库](audio-library.md)。

本次源表覆盖现有目录全部 173 位角色，257 个版本分组、7,768 项类型／版本记录。原表还有未纳入当前角色目录的词条（例如小公主、默认提示及部分后续角色），导入报告的 `unresolved` 列表保留这些词条，避免按相似名称误配给已有角色。台词内码的明确拼写差异、泰坦族警卫与玛蒂的资源名差异有显式映射；没有进行模糊匹配。
