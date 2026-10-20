# 英雄台词

角色详情的“英雄台词”章节按版本展示中文、英语、日语文本。版本包含普通、开花、骑士性格和特殊时装；支持三语对照、单语显示、按类型和台词全文搜索。切换角色时重置版本和搜索，保留显示语言。

文本来自 `strings-zhCN.json`、`strings-enUS.json`、`strings-jaJP.json`。同时读取 `Voice_`（触碰、邮件等）与 `cv_`（战斗、养成、召唤等）词条，不导入声优署名或语音设置。相同类型、版本、语言的完全相同文本合并；源表存在差异时，以“文本 1／文本 2”分别保留，其他语言不代替缺失语言。显示时清理游戏富文本标记，原始文本及来源词条仍保留在数据中。

台词类型中文名参考 [BWIKI 诺克希娅的语音一览](https://wiki.biligame.com/gt/诺克希娅#语音一览)，网页运行时不访问 BWIKI。本文功能仅展示文本。

## 更新数据

先运行原有 `build_wiki.py` 更新角色资料，再运行：

```powershell
python tools/wiki/build-voice-lines.py --source E:/GTFiles/static_data_dec --report E:/GTFiles/_tools/gtwiki/voice-lines-report.json
python tools/wiki/verify-voice-lines.py --source E:/GTFiles/static_data_dec
node tools/prepare-deploy.mjs
```

导入脚本默认仓库是脚本所在仓库，可用 `--repo` 指定。`--output` 可指定输出目录以预览变更。只有 `gtwiki/data/<角色>.json` 被更新，原有字段保留；`voiceLines` 字段随该角色详情一起按需加载。每组含 `id`、中文 `label` 和 `lines`；每行含事件 `type`、中文 `label`、三语文本数组 `texts` 和原词条 `keys`。未提供文本的语言为空数组。

本次源表覆盖现有目录全部 173 位角色，257 个版本分组、7,768 项类型／版本记录。原表还有未纳入当前角色目录的词条（例如小公主、默认提示及部分后续角色），导入报告的 `unresolved` 列表保留这些词条，避免按相似名称误配给已有角色。台词内码的明确拼写差异、泰坦族警卫与玛蒂的资源名差异有显式映射；没有进行模糊匹配。
