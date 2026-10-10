import os
from pathlib import Path
W=Path(os.environ.get('GT_SPINE_WORK','E:/GTFiles/_manual/spine-expansion'));R=Path('D:/github/gtlibrary');S=W/'staged'
p=R/'apps/spine/app.js';s=p.read_text('utf-8-sig')
s=s.replace('var DATA_VERSION = "261004-2";', 'var DATA_VERSION = "261010-expansion-1";')
s=s.replace('      function loadManifest(folder) {','      var supplementCatalog;\n      function loadSupplement() {\n        if (!supplementCatalog) supplementCatalog = GTResources.fetch("../../resources/spine-expansion/catalog.json" + QUERY)\n          .then(function(response) { return checkResponse(response, "补充 Spine 目录").json(); })\n          .catch(function(error) { supplementCatalog = null; throw error; });\n        return supplementCatalog;\n      }\n\n      function loadManifest(folder) {')
needle='''                });
              });
          });
      }

      // 兼容三种清单形态'''
replacement='''                });
              });
          }).then(function() {
            return loadSupplement().then(function(catalog) {
              app.supplementNames = {};
              app.supplementAliases = {};
              var rows = catalog.groups[folder] || [];
              rows.forEach(function(row) {
                window.spineAssets.push({ name: row.name, variants: row.variants });
                app.supplementNames[row.name] = row.label;
                app.supplementAliases[row.name] = row.aliases.join(" ").toLowerCase();
              });
            });
          });
      }

      // 兼容三种清单形态'''
assert needle in s;s=s.replace(needle,replacement)
s=s.replace('''        if (folder !== "character") return [""];
        var list = app.variants[name];
        if (!list || !list.length) return DEFAULT_VARIANTS.slice();''','''        var list = app.variants[name];
        if (!list || !list.length) return folder === "character" ? DEFAULT_VARIANTS.slice() : [""];''')
s=s.replace('(folder === "character" && list.length > 1)', '(list.length > 1)')
s=s.replace('tentacle: "触手" }', 'tentacle: "触手", body: "躯干", foot: "脚部", hand: "手部", bird: "鸟", knight_female: "女骑士", knight_male: "男骑士", princess: "公主", queen: "女王" }')
s=s.replace('var x = W / 2, y = H / 2;', 'var x = W / 2 - (guess ? scale * (guess.minX + guess.maxX) / 2 : 0);\n        var y = H / 2 - (guess ? scale * (guess.minY + guess.maxY) / 2 : 0);')
s=s.replace('''            x = W / 2;
            y = H / 2;''','''            x = W / 2 - (guess ? scale * (guess.minX + guess.maxX) / 2 : 0);
            y = H / 2 - (guess ? scale * (guess.minY + guess.maxY) / 2 : 0);''')
s=s.replace('本地包围盒给粗估缩放 → 原点先落到画布中心', '本地包围盒给粗估缩放 → 包围盒中心先落到画布中心')
s=s.replace('app.zh = Object.assign({}, zh || {}, folder === "illust" ? app.jpNames : {});','app.zh = Object.assign({}, zh || {}, folder === "illust" ? app.jpNames : {}, app.supplementNames);')
s=s.replace('''            || displayName(name).toLowerCase().indexOf(keyword) >= 0;''','''            || displayName(name).toLowerCase().indexOf(keyword) >= 0
            || (app.supplementAliases[name] || "").indexOf(keyword) >= 0;''')
s=s.replace('folder !== "illust" && folder !== "character" && folder !== "custom"', 'folder !== "illust" && folder !== "character" && folder !== "effect" && folder !== "custom"')
target=S/'apps/spine/app.js';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(s,'utf-8')
s=(R/'apps/spine/index.html').read_text('utf-8-sig').replace('<option value="character">character</option>', '<option value="character">character</option>\n              <option value="effect">Spine 特效／剧情动画</option>')
s=s.replace('</style>', '#skeletonVariantWrapper, #skeletonVariantButtons { flex-wrap: wrap; }\n    #skeletonVariantButtons { min-width: 0; }\n  </style>')
(S/'apps/spine/index.html').write_text(s,'utf-8')
print('Viewer patched in staging')
