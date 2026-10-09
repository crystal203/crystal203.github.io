(function () {
      "use strict";

      // =====================================================================
      // 常量
      // =====================================================================

      // 数据版本：与 E:\GTFiles\{illust,character}_<版本> 对应。
      // 每次重新生成 assets/ 后必须改这里，否则浏览器会吃旧缓存的 assets.js。
      var DATA_VERSION = "261004-2";
      var QUERY = "?v=" + DATA_VERSION;

      // 新旧导出的后缀都接受，索引小的优先。
      var ATLAS_EXT = [".atlas", ".atlas.txt"];
      var BYTES_EXT = [".bytes", ".skel.bytes"];
      var PNG_EXT = [".png", ".rgba4444.png"];

      var VARIANT_LABEL = { "": "默认", front: "正面", back: "背面", side: "侧面", tentacle: "触手" };
      var VARIANT_ORDER = { "": 0, front: 1, back: 2, side: 3, tentacle: 4 };
      // 没有视角表时，canonical 数据一律是 front/back/side 三视角。
      var DEFAULT_VARIANTS = ["front", "back", "side"];

      var SCALE_MIN = Math.pow(2, -6.25);
      var SCALE_MAX = Math.pow(2, 6.25);
      var FIT_MARGIN = 0.92;

      var $ = function (id) { return document.getElementById(id); };

      var canvas = $("canvas");
      var stage = $("stage");
      var gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false })
        || canvas.getContext("experimental-webgl", { alpha: true });

      if (!gl) {
        document.body.innerHTML = '<p style="padding:24px;font:14px sans-serif;color:#e8ebf1">'
          + '当前浏览器不支持 WebGL，无法预览 Spine 动画。</p>';
        return;
      }

      var renderer = new spine.webgl.SceneRenderer(canvas, gl);

      var app = {
        folder: "illust",
        all: [],
        shown: [],
        variants: {},
        loadToken: 0,
        skeleton: null,
        animState: null,
        tracks: { action: "", emote: "", sub: "" },
        opacity: {},
        enabled: {},
        pickEnabled: true,
        slotRows: [],
        zh: {},
        current: null,
        cursor: -1,
        listLimit: 20,
        variant: "",
        emotionData: null, emotionLoading: null, emotion: null,
        expressionByCharacter: Object.create(null), expressionCatalog: Object.create(null),
        sheets: {},
        itemSheet: null,
        selectedItem: null,
        itemLimit: 20,
        equipment: null,
        equipmentByCharacter: Object.create(null),
        model: null,
        pendingTarget: null,
        pendingSkinTier: null,
        paused: false,
        nearest: true,
        debug: false,
        pos: { x: 0, y: 0 },
        scale: 1,
        region: { x: 0, y: 0, w: 0, h: 0 },
        viewTouched: false,
        refitTimer: 0,
        dragging: false,
        dragAt: { x: 0, y: 0 },
        regionDrag: null,
        exporting: false,
        exportFpsTarget: 30,
        cache: {},
        activeKey: null,
        picked: null,
        forced: {},
        downAt: { x: 0, y: 0 }
      };

      // =====================================================================
      // 小工具
      // =====================================================================

      function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

      function scaleToSlider(scale) { return clamp(50 + 8 * Math.log2(scale), 0, 100); }
      function sliderToScale(value) { return clamp(Math.pow(2, (value - 50) / 8), SCALE_MIN, SCALE_MAX); }

      function suffixUrls(prefix, extensions) {
        var out = [];
        for (var i = 0; i < extensions.length; i++) out.push(prefix + extensions[i] + QUERY);
        return out;
      }

      function unique(urls) {
        var out = [];
        for (var i = 0; i < urls.length; i++) if (out.indexOf(urls[i]) < 0) out.push(urls[i]);
        return out;
      }

      // 图集文本里的页名：非缩进、以 .png 结尾、且下一行是 size: 的行。
      var parseAtlasPages=GTSpineCore.pages;

      // =====================================================================
      // 资源加载
      // =====================================================================

      function tryEach(urls, attempt) {
        var index = 0;
        function step() {
          if (index >= urls.length) return Promise.reject(new Error("全部候选地址均不可用: " + urls.join(" , ")));
          var url = urls[index++];
          return attempt(url).catch(function (err) {
            if (err && err.name === "AbortError") throw err;   // 被新的一次切换取消，别再试下一个
            if (index >= urls.length) throw err;
            return step();
          });
        }
        return step();
      }

      // file:// 下 fetch 的 status 是 0，此时 ok 为 false 但不是错误 —— 放行，
      // 这样用 --allow-file-access-from-files 直接开本地文件也能用（完全不走 HTTP）。
      function checkResponse(res, url) {
        if (res.status && !res.ok) throw new Error(url + " " + res.status);
        return res;
      }

      function fetchText(urls, signal) {
        return tryEach(urls, function (url) {
          return GTResources.fetch(url, signal ? { signal: signal } : undefined)
            .then(function (res) { return checkResponse(res, url).text(); });
        });
      }

      function fetchBinary(urls, signal) {
        return tryEach(urls, function (url) {
          return GTResources.fetch(url, signal ? { signal: signal } : undefined)
            .then(function (res) { return checkResponse(res, url).arrayBuffer(); });
        });
      }

      // 图片也走 fetch（可被 abort），再交给 <img> 解码 —— 上传路径仍是 texImage2D(<img>)，
      // 与原来完全一致，只是多了一次可取消的下载。
      function loadImage(url, signal) {
        return GTResources.fetch(url, signal ? { signal: signal } : undefined)
          .then(function (res) { return checkResponse(res, url).blob(); })
          .then(function (blob) {
            app.timing.imgBytes = (app.timing.imgBytes || 0) + blob.size;
            var objectUrl = URL.createObjectURL(blob);
            return new Promise(function (resolve, reject) {
              var img = new Image();
              img.onload = function () {
                var done = function () { URL.revokeObjectURL(objectUrl); resolve(img); };
                // decode() 让浏览器在内部线程完成解码，避免 texImage2D 时把大 PNG 解码砸在主线程上
                if (img.decode) img.decode().then(done, done);
                else done();
              };
              img.onerror = function () {
                URL.revokeObjectURL(objectUrl);
                reject(new Error("图片解码失败: " + url));
              };
              img.src = objectUrl;
            });
          });
      }

      function loadManifest(folder) {
        return GTResources.fetch("../../resources/spine/" + folder + "/assets.js" + QUERY)
          .then(function(response) { return checkResponse(response, folder).text(); })
          .then(function(text) {
            // Export files contain one JSON assignment, not arbitrary executable code.
            var match = text.match(/(?:window\.)?spineAssets\s*=\s*([\s\S]*?);?\s*$/);
            if (!match) throw new Error("资源清单格式不可用: " + folder);
            window.spineAssets = JSON.parse(match[1].replace(/;\s*$/, ""));
          });
      }

      // 兼容三种清单形态：数组 / 对象数组 / {assets, variants}
      function readManifest() {
        var raw = window.spineAssets;
        var names = [], variants = {};
        function addVariantMap(map) {
          if (!map || typeof map !== "object") return;
          for (var key in map) {
            if (Object.prototype.hasOwnProperty.call(map, key) && Array.isArray(map[key])) {
              variants[key] = map[key].slice();
            }
          }
        }
        if (Array.isArray(raw)) {
          for (var i = 0; i < raw.length; i++) {
            var item = raw[i];
            if (typeof item === "string") names.push(item);
            else if (item && typeof item.name === "string") {
              names.push(item.name);
              if (Array.isArray(item.variants)) variants[item.name] = item.variants.slice();
            }
          }
        } else if (raw && typeof raw === "object") {
          var list = Array.isArray(raw.assets) ? raw.assets : (Array.isArray(raw.names) ? raw.names : []);
          for (var k = 0; k < list.length; k++) {
            if (typeof list[k] === "string") names.push(list[k]);
            else if (list[k] && typeof list[k].name === "string") names.push(list[k].name);
          }
          addVariantMap(raw.variants);
        }
        addVariantMap(window.spineAssetVariants);
        return { names: names, variants: variants };
      }

      function variantsOf(folder, name) {
        if (folder !== "character") return [""];
        var list = app.variants[name];
        if (!list || !list.length) return DEFAULT_VARIANTS.slice();
        return list.slice().sort(function (a, b) {
          var oa = a in VARIANT_ORDER ? VARIANT_ORDER[a] : 9;
          var ob = b in VARIANT_ORDER ? VARIANT_ORDER[b] : 9;
          return oa - ob || (a < b ? -1 : a > b ? 1 : 0);
        });
      }

      function variantLabel(variant) {
        return variant in VARIANT_LABEL ? VARIANT_LABEL[variant] : variant;
      }

      function currentVariant(folder, name) {
        var list = variantsOf(folder, name);
        if (list.length <= 1) return list[0] || "";
        return list.indexOf(app.variant) >= 0 ? app.variant : list[0];
      }

      function refreshVariantSelector(folder, name) {
        var list = variantsOf(folder, name);
        var wrapper = $("skeletonVariantWrapper");
        var buttons = $("skeletonVariantButtons");
        app.variant = currentVariant(folder, name);
        buttons.innerHTML = "";
        for (var i = 0; i < list.length; i++) {
          var button = document.createElement("button");
          button.type = "button";
          button.className = "tiny" + (list[i] === app.variant ? " primary" : "");
          button.dataset.variant = list[i];
          button.setAttribute("aria-pressed", list[i] === app.variant ? "true" : "false");
          button.textContent = variantLabel(list[i]);
          buttons.appendChild(button);
        }
        wrapper.style.display = (folder === "character" && list.length > 1) ? "flex" : "none";
      }

      // =====================================================================
      // 目录 / 资源选择
      // =====================================================================

      // 仅在载入期间出现的轻提示
      function setLoading(on) {
        var hint = $("loadingHint");
        if (hint) hint.classList.toggle("on", !!on);
      }

      function setFolder(folder) {
        app.folder = folder;
        app.model = null;
        $("equipmentPanel").style.display = folder === "character" ? "block" : "none";
        refreshEquipmentPanel();
        if (folder === "character") {$("equipmentStatus").textContent=app.itemSheet ? "" : "点击物品搜索框载入装备图集";$("equipmentPanel").addEventListener("focusin",ensureItems,{once:true});$("equipmentPanel").addEventListener("pointerdown",ensureItems,{once:true});}
        var isCustom = folder === "custom";
        // custom 时用「本地资源」表单顶掉搜索那一块，不再往画布上弹窗
        $("searchBlock").style.display = isCustom ? "none" : "block";
        $("customUploadPanel").classList.toggle("on", isCustom);
        $("skeletonVariantWrapper").style.display = "none";

        if (isCustom) {
          setLoading(false);
          app.all = [];
          app.shown = [];
          app.zh = {};
          app.current = null;
          $("assetSearchBox").value = "";
          renderAssetList();
          return;
        }

        loadManifest(folder).then(function () {
          var manifest = readManifest();
          app.all = manifest.names;
          app.variants = manifest.variants;
          // 中文名 sidecar：拿不到也不影响使用，回落到内码
          return GTResources.fetch("../../resources/spine/" + folder + "/names.zh.json" + QUERY)
            .then(function (res) { return res.ok ? res.json() : {}; })
            .catch(function () { return {}; });
        }).then(function (zh) {
          app.zh = zh || {};
          app.current = null;
          $("assetSearchBox").value = "";
          applyFilter();

          // 从 gtatlas 之类外部跳进来的目标：把它顶到列表最前面并选中，
          // 免得它落在首批结果之外、看不到高亮。
          var target = app.pendingTarget;
          app.pendingTarget = null;
          if (target && target.folder === app.folder && target.name) {
            var resolved = resolveTargetName(target.name);
            if (resolved.name && app.all.indexOf(resolved.name) >= 0) {
              app.pendingSkinTier = resolved.tier;
              app.shown = [resolved.name].concat(app.shown.filter(function (n) {
                return n !== resolved.name;
              }));
              renderAssetList();
              selectAsset(resolved.name);
            } else {
              app.current="";
              $("assetSearchBox").value=target.name;
              applyFilter();
              $("loadingHint").textContent="当前清单没有对应资源";
              if(window.console && console.debug)
              console.debug("[gtasset] 跳转目标不在当前清单里:", target.folder, target.name);
            }
          }
          if (app.shown.length && app.current === null) selectAsset(app.shown[0]);
        }).catch(function (err) {
          app.all = [];
          app.shown = [];
          app.zh = {};
          app.current = null;
          renderAssetList();
          window.alert(err.message);
        });
      }

      function displayName(name) {
        return app.zh[name] || name;
      }

      // gtasset 里星阶有两种形态：有的导出成独立资源（admiral_3 在清单里），
      // 有的留在同一个骨骼里当皮肤（adela_noble 的皮肤有 adela_noble_3/4/5）。
      // 所以 GET 收到别处的名字时，先原样试，再逐层还原：
      //   1. 剥掉 gtatlas 的变体后缀 _kong / _circle / _myth
      //      （Kong 区、圆形头像、开花形态 —— 这三个正来自 gtatlas 自己的 SAFE_SUFFIXES，
      //        剥掉不改变名称含义；_ex / _cm 是独立档位，不能剥，剥了会串名）
      //   2. 剥掉星阶 _1~_99，退回基名，并记下星阶交给皮肤去还原
      var VARIANT_SUFFIX_RE = /_(kong|circle|myth)$/;
      var TIER_SUFFIX_RE = /^(.+)_(\d{1,2})$/;

      function resolveTargetName(name) {
        if (!name) return { name: name, tier: null };
        var raw = String(name);
        var candidates = [raw];
        var stripped = raw.replace(VARIANT_SUFFIX_RE, "");
        if (stripped !== raw) candidates.push(stripped);

        for (var i = 0; i < candidates.length; i++) {
          if (app.all.indexOf(candidates[i]) >= 0) return { name: candidates[i], tier: null };
          var m = TIER_SUFFIX_RE.exec(candidates[i]);
          if (m && app.all.indexOf(m[1]) >= 0) return { name: m[1], tier: m[2] };
        }
        return { name: raw, tier: null };
      }

      // 搜索：中文名与内码都能命中。**只过滤列表，不加载资源** ——
      // 以前每敲一个字都会重新拉图集和骨骼，纯属浪费。
      function applyFilter() {
        var keyword = $("assetSearchBox").value.trim().toLowerCase();
        app.cursor = -1;
        app.listLimit = 20;
        $("assetList").scrollTop = 0;
        app.shown = !keyword ? app.all.slice() : app.all.filter(function (name) {
          return name.toLowerCase().indexOf(keyword) >= 0
            || displayName(name).toLowerCase().indexOf(keyword) >= 0;
        });
        renderAssetList();
      }

      // ---------------------------------------------------------------------
      // 与 gtatlas 联动：列表行显示缩略图
      //
      // gtatlas 的精灵图是 TexturePacker 格式（frames + meta.image），帧名就是内码，
      // 所以换算很简单：illust 去掉 illust_ 前缀去 portraits 表里查，character 原样查 characters 表。
      // 两个项目在同一仓库、同一站点根下，用相对路径 ../gtatlas/ 即可。
      // ---------------------------------------------------------------------
      var GTATLAS_ASSETS = "../../resources/atlas/";
      var THUMB_SHEET = { illust: "portraits", character: "characters" };
      var THUMB_BOX = 30;

      function ensureThumbSheet(sheet) {
        var entry = app.sheets[sheet];
        if (entry) return entry;
        entry = { name: sheet, frames: null, img: null, w: 0, h: 0, failed: false };
        app.sheets[sheet] = entry;
        GTResources.fetch("../../resources/previews/" + sheet + ".json")
          .then(function (res) {
            if (!res.ok) throw new Error(res.status);
            return res.json();
          })
          .then(function (data) {
            entry.frames = (data && data.frames) || {};
            return GTResources.image("../../resources/previews/" + sheet + ".webp").then(function(img) {
              if(disposed)return;
              entry.img = img; entry.w = img.naturalWidth; entry.h = img.naturalHeight;
              renderAssetList();
            });
          })
          .catch(function (err) {
            entry.failed = true;
            if (window.console && console.debug) {
              console.debug("[gtasset] 缩略图不可用（" + sheet + "）:", err && err.message ? err.message : err);
            }
          });
        return entry;
      }

      // 两边帧名体系不完全一致，按可信度依次试：
      //   精确        —— 多数命中
      //   星阶分档    —— gtasset 存基名（captain_rabbit），gtatlas 只存 captain_rabbit_3/4/5
      //   去/加 _b    —— 一边有 _b 变体、另一边没有
      // 只认「数字结尾」和「_b」这两种受控后缀，绝不做任意前缀匹配，免得张冠李戴。
      var TIER_RE = /_\d{1,2}$/;

      function buildFrameIndex(entry) {
        if (entry.index) return entry.index;
        var index = { tier: {}, stripB: {} };
        for (var key in entry.frames) {
          if (!Object.prototype.hasOwnProperty.call(entry.frames, key)) continue;
          var m = TIER_RE.exec(key);
          if (m) {
            var base = key.slice(0, -m[0].length);
            var digit = parseInt(m[0].slice(1), 10);
            // 同一基名有多个分档时取最小的，结果稳定可预期
            if (index.tier[base] === undefined || digit < index.tier[base]) index.tier[base] = digit;
          }
          if (key.slice(-2) === "_b") {
            var bare = key.slice(0, -2);
            if (index.stripB[bare] === undefined) index.stripB[bare] = key;
          }
        }
        entry.index = index;
        return index;
      }

      function findFrame(entry, name) {
        if (!entry || !entry.frames) return null;
        var index = buildFrameIndex(entry);
        var keys = [name];
        if (TIER_RE.test(name)) keys.push(name.replace(TIER_RE, ""));
        if (index.tier[name] !== undefined) keys.push(name + "_" + index.tier[name]);
        if (name.slice(-2) === "_b") keys.push(name.slice(0, -2));
        keys.push(name + "_b");
        for (var i = 0; i < keys.length; i++) {
          if (entry.frames[keys[i]]) return entry.frames[keys[i]];
        }
        return null;
      }

      // 把精灵图里某一帧按 contain 摆进 box×box 的方框（居中）
      function makeThumb(entry, frame) {
        var thumb = document.createElement("canvas");
        thumb.className = "thumb";
        thumb.width = thumb.height = THUMB_BOX;
        if (!entry || !entry.img || !frame || !frame.frame) return thumb;
        var rect = frame.frame;
        var w = frame.rotated ? rect.h : rect.w, h = frame.rotated ? rect.w : rect.h;
        if (!w || !h) return thumb;
        var scale = Math.min(THUMB_BOX / w, THUMB_BOX / h);
        var context = thumb.getContext("2d");
        context.imageSmoothingEnabled = false;
        context.translate(THUMB_BOX / 2, THUMB_BOX / 2);
        if (frame.rotated) context.rotate(-Math.PI / 2);
        // The source rectangle is always the packed frame, never a square
        // expanded into neighboring sprites. Contain padding is transparent.
        context.drawImage(entry.img, rect.x, rect.y, rect.w, rect.h,
          -rect.w * scale / 2, -rect.h * scale / 2, rect.w * scale, rect.h * scale);
        return thumb;
      }

      function thumbFor(entry, name) {
        if (!entry || !entry.frames || !entry.img) return makeThumb(null, null);
        var key = app.folder === "illust" ? String(name).replace(/^illust_/, "") : name;
        var frame = findFrame(entry, key);
        return makeThumb(entry, frame);
      }

      // =====================================================================
      // Character equipment (one shared item atlas, independent character state)
      // =====================================================================
      function equipmentReady() {
        return app.folder === "character" && app.model && app.model.folder === "character"
          && app.model.name === app.current && app.equipment;
      }

      function equipmentState() {
        var name = app.model.name;
        return app.equipmentByCharacter[name]
          || (app.equipmentByCharacter[name] = Object.create(null));
      }

      function ensureItems() {
        if (app.itemSheet && !app.itemSheet.failed) return;
        var entry = app.itemSheet = { name: "items", frames: null, zh: {}, img: null };
        $("equipmentStatus").textContent = "正在加载物品图集……";
        Promise.all([
          GTResources.fetch(GTATLAS_ASSETS + "items.json" + QUERY).then(function (res) {
            return checkResponse(res, "items.json").json();
          }),
          GTResources.fetch(GTATLAS_ASSETS + "items.zh.json" + QUERY).then(function (res) {
            return res.ok ? res.json() : {};
          }).catch(function () { return {}; })
        ]).then(function (pair) {
          entry.frames = pair[0].frames || {};
          entry.zh = pair[1];
          return loadImage(GTATLAS_ASSETS + (pair[0].meta.image || "items.png") + QUERY);
        }).then(function (img) {
          entry.img = img;
          entry.w = img.naturalWidth;
          entry.h = img.naturalHeight;
          // items.png is straight alpha; the character renderer uses premultiplied alpha.
          var previous = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
          try { entry.texture = makeTexture(img); }
          finally { gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, previous); }
          entry.attachments = Object.create(null);
          restoreEquipment();
        }).catch(function (err) {
          entry.failed = true;
          $("equipmentStatus").textContent = "物品加载失败：" + err.message + "（切回 character 可重试）";
          refreshEquipmentPanel();
        });
      }

      function itemAttachment(name) {
        var sheet = app.itemSheet;
        if (!sheet || !sheet.texture || !sheet.frames[name]) return null;
        return sheet.attachments[name] || (sheet.attachments[name] = GTEquipment.createAttachment(
          spine, name, sheet.frames[name], sheet.texture, sheet.w, sheet.h));
      }

      function restoreEquipment() {
        if (!app.model || app.model.folder !== "character") {
          app.equipment = null;
          refreshEquipmentPanel();
          return;
        }
        if (app.equipment && app.equipment.skeleton === app.skeleton) app.equipment.clear();
        else app.equipment = new GTEquipment.Equipment(app.skeleton);
        var state = equipmentState();
        app.skeleton.slots.forEach(function (slot) {
          var item = state[GTEquipment.slotKey(slot.data.name)];
          var attachment = item && itemAttachment(item);
          if (attachment) app.equipment.equip(slot, attachment);
        });
        app.animState.apply(app.skeleton);
        populateEquipmentSlots();
        renderItemList();
      }

      function populateEquipmentSlots() {
        var select = $("equipmentSlot");
        var wanted = select.value;
        select.innerHTML = "";
        if (!equipmentReady()) return;
        var slots = app.skeleton.slots.filter(function (slot) {
          // A clipping slot must retain its clipping attachment.
          return !app.skeleton.data.skins.some(function (skin) {
            return skin.getAttachments().some(function (entry) {
              return entry.slotIndex === slot.data.index && entry.attachment instanceof spine.ClippingAttachment;
            });
          });
        });
        slots.sort(function (a, b) {
          function rank(slot) { return /weapon1/i.test(slot.data.name) ? 0 : /weapon|item/i.test(slot.data.name) ? 1 : 2; }
          return rank(a) - rank(b) || a.data.index - b.data.index;
        });
        slots.forEach(function (slot) {
          var option = document.createElement("option");
          option.value = GTEquipment.slotKey(slot.data.name);
          option.textContent = slot.bone.data.name + " · " + slot.data.name;
          select.appendChild(option);
        });
        if (Array.prototype.some.call(select.options, function (o) { return o.value === wanted; })) select.value = wanted;
        refreshEquipmentPanel();
      }

      function renderItemList() {
        var list = $("itemList");
        list.innerHTML = "";
        var sheet = app.itemSheet;
        if (!sheet || !sheet.img) { refreshEquipmentPanel(); return; }
        var keyword = $("itemSearch").value.trim().toLowerCase();
        var names = Object.keys(sheet.frames).filter(function (name) {
          var frame = sheet.frames[name].frame;
          return (frame.w > 1 || frame.h > 1) && (!keyword || name.toLowerCase().indexOf(keyword) >= 0
            || (sheet.zh[name] || "").toLowerCase().indexOf(keyword) >= 0);
        });
        names.sort(function (a, b) {
          return Number(GTEquipment.isPreferredItem(b, app.current)) - Number(GTEquipment.isPreferredItem(a, app.current))
            || a.localeCompare(b);
        });
        if (names.indexOf(app.selectedItem) < 0) app.selectedItem = names[0] || null;
        var fragment = document.createDocumentFragment();
        names.slice(0, app.itemLimit).forEach(function (name) {
          var button = document.createElement("button");
          button.type = "button";
          button.className = "asset-item" + (name === app.selectedItem ? " on" : "");
          button.dataset.name = name;
          var thumb = makeThumb(sheet, sheet.frames[name]);
          var text = document.createElement("span");
          text.className = "asset-text";
          var title = document.createElement("span");
          title.className = "zh";
          title.textContent = sheet.zh[name] || "未命名物品";
          var code = document.createElement("span");
          code.className = "code";
          code.textContent = name;
          text.appendChild(title);
          text.appendChild(code);
          button.appendChild(thumb);
          button.appendChild(text);
          button.addEventListener("click", function () {
            app.selectedItem = name;
            list.querySelectorAll(".asset-item").forEach(function (item) {
              item.classList.toggle("on", item.dataset.name === name);
            });
            refreshEquipmentPanel();
          });
          button.addEventListener("dblclick", function () {
            app.selectedItem = name;
            equipSelectedItem();
          });
          fragment.appendChild(button);
        });
        list.appendChild(fragment);
        list.dataset.hasMore = names.length > app.itemLimit ? "true" : "false";
        $("itemCount").textContent = names.length;
        $("itemMore").textContent = "已显示 " + Math.min(names.length, app.itemLimit) + " / " + names.length + " 件物品"
          + (names.length > app.itemLimit ? "（向下滚动继续显示）" : "");
        refreshEquipmentPanel();
      }

      function refreshEquipmentPanel() {
        var ready = equipmentReady();
        var key = $("equipmentSlot").value;
        var state = ready ? equipmentState() : {};
        var sheet = app.itemSheet;
        $("equipmentSlot").disabled = !ready;
        $("equipBtn").disabled = !ready || !key || !sheet || !sheet.texture || !app.selectedItem;
        $("unequipAllBtn").disabled = !ready || !Object.keys(state).length;
        if (ready && sheet && sheet.texture) {
          $("equipmentStatus").textContent = "";
        }
        renderEquippedList();
      }

      function renderEquippedList() {
        var list = $("equippedList");
        list.innerHTML = "";
        if (!equipmentReady()) return;
        var state = equipmentState(), sheet = app.itemSheet;
        var keys = Object.keys(state);
        if (!keys.length) {
          var empty = document.createElement("li");
          empty.className = "asset-more";
          empty.textContent = "暂无挂载";
          list.appendChild(empty);
        }
        keys.forEach(function (key) {
          var item = state[key];
          var slot = app.skeleton.slots.find(function (slot) { return GTEquipment.slotKey(slot.data.name) === key; });
          var row = document.createElement("li");
          row.className = "equipped-row";
          row.dataset.slotKey = key;
          row.appendChild(makeThumb(sheet, sheet && sheet.frames && sheet.frames[item]));
          var text = document.createElement("span");
          text.className = "asset-text";
          var title = document.createElement("span");
          title.className = "zh";
          title.textContent = sheet && sheet.zh[item] || "未命名物品";
          var code = document.createElement("span");
          code.className = "code";
          code.textContent = item;
          var mount = document.createElement("span");
          mount.className = "mount";
          mount.textContent = slot ? slot.bone.data.name + " · " + slot.data.name : key + "（本朝向无此挂点，状态保留）";
          text.appendChild(title);
          text.appendChild(code);
          text.appendChild(mount);
          row.appendChild(text);
          var remove = document.createElement("button");
          remove.type = "button";
          remove.className = "tiny";
          remove.textContent = "删除";
          remove.setAttribute("aria-label", "脱下 " + item + " · " + (slot ? slot.data.name : key));
          remove.addEventListener("click", function () { removeEquipment(key); });
          row.appendChild(remove);
          list.appendChild(row);
        });
      }

      function removeEquipment(key) {
        if (!equipmentReady()) return;
        delete equipmentState()[key];
        app.skeleton.slots.forEach(function (slot) {
          if (GTEquipment.slotKey(slot.data.name) === key) app.equipment.remove(slot);
        });
        app.animState.apply(app.skeleton);
        refreshEquipmentPanel();
      }

      $("itemSearch").addEventListener("input", function () { app.itemLimit = 20; renderItemList(); });
      $("itemList").addEventListener("scroll", function () {
        if (this.dataset.hasMore !== "true") return;
        if (this.scrollTop + this.clientHeight < this.scrollHeight - 10) return;
        var scrollTop = this.scrollTop;
        app.itemLimit += 40;
        renderItemList();
        this.scrollTop = scrollTop;
      });
      $("equipmentSlot").addEventListener("change", refreshEquipmentPanel);
      function equipSelectedItem() {
        if (!equipmentReady()) return;
        var key = $("equipmentSlot").value;
        if (!key) return;
        var attachment = itemAttachment(app.selectedItem);
        if (!attachment) return;
        equipmentState()[key] = app.selectedItem;
        app.skeleton.slots.forEach(function (slot) {
          if (GTEquipment.slotKey(slot.data.name) === key) app.equipment.equip(slot, attachment);
        });
        app.animState.apply(app.skeleton);
        refreshEquipmentPanel();
      }
      $("equipBtn").addEventListener("click", equipSelectedItem);
      $("unequipAllBtn").addEventListener("click", function () {
        if (!equipmentReady()) return;
        app.equipment.clear();
        app.equipmentByCharacter[app.model.name] = Object.create(null);
        app.animState.apply(app.skeleton);
        refreshEquipmentPanel();
      });

      function renderAssetList() {
        var list = $("assetList");
        list.innerHTML = "";
        var total = app.shown.length;
        var shown = Math.min(total, app.listLimit);
        var sheet = THUMB_SHEET[app.folder];
        var entry = sheet ? ensureThumbSheet(sheet) : null;
        var frag = document.createDocumentFragment();
        for (var i = 0; i < shown; i++) {
          var name = app.shown[i];
          var item = document.createElement("button");
          item.type = "button";
          item.className = "asset-item" + (name === app.current ? " on" : "");
          item.dataset.name = name;

          if (entry) {
            var thumb = thumbFor(entry, name);
            item.appendChild(thumb);
          }

          var text = document.createElement("span");
          text.className = "asset-text";

          var zh = document.createElement("span");
          zh.className = "zh";
          zh.textContent = displayName(name);
          text.appendChild(zh);
          if (displayName(name) !== name) {
            var code = document.createElement("span");
            code.className = "code";
            code.textContent = name;
            text.appendChild(code);
          }
          item.appendChild(text);

          item.addEventListener("click", function () { selectAsset(this.dataset.name); });
          frag.appendChild(item);
        }
        list.appendChild(frag);

        $("assetCount").textContent = total === app.all.length
          ? String(total)
          : total + " / " + app.all.length;
        list.dataset.hasMore = total > shown ? "true" : "false";
        $("assetMore").textContent = total > shown ? "向下滚动继续显示" : "";
      }

      function markCurrent(scroll) {
        var items = $("assetList").querySelectorAll(".asset-item");
        var hit = null;
        for (var i = 0; i < items.length; i++) {
          var on = items[i].dataset.name === app.current;
          items[i].classList.toggle("on", on);
          if (on) hit = items[i];
        }
        if (scroll && hit && hit.scrollIntoView) hit.scrollIntoView({ block: "nearest" });
      }

      function selectAsset(name) {
        if (!name) return;
        app.current = name;
        markCurrent(true);
        loadAsset(app.folder, name);
      }

      // 载入耗时与缓存占用不再显示在界面上，改成写控制台（要排查时按 F12 看）。
      // 分段：取 / 解析 / 界面 / 适配。
      function logLoad(started, cached) {
        var stats = cacheStats();
        var t = app.timing || {};
        var parts = [];
        if (t.fetch) {
          var kb = (t.bytes || 0) / 1024;
          var rate = t.fetch > 0 ? Math.round(kb / (t.fetch / 1000)) : 0;
          parts.push("取 " + Math.round(t.fetch) + " ms"
            + (kb > 1 ? "（" + Math.round(kb) + " KB · " + rate + " KB/s）" : ""));
        }
        if (t.parse) parts.push("解析 " + Math.round(t.parse));
        if (t.ui) parts.push("界面 " + Math.round(t.ui));
        if (t.fit) parts.push("适配 " + Math.round(t.fit));
        if (window.console && console.debug) {
          console.debug("[gtasset]", (cached ? "缓存命中 " : "载入 ")
            + Math.round(performance.now() - started) + " ms "
            + (parts.length ? "(" + parts.join(" / ") + ") " : "")
            + "缓存 " + stats.count + " 条 / " + stats.mb.toFixed(0) + " MB");
        }
      }

      function loadAsset(folder, name, inheritedTracks) {
        if (!name) return;
        var started = performance.now();
        var token = ++app.loadToken;
        app.model = null;
        refreshEquipmentPanel();
        // 关键：切换时取消上一次还在飞的请求。
        // 不取消的话每次加载都留 3 个请求在队列里，快速连点会越堆越多，
        // 而本地静态服务（python -m http.server）是单线程的，于是越切越慢。
        if (app.abort) {
          try { app.abort.abort(); } catch (e) { /* 已经结束就无所谓 */ }
        }
        var controller = window.AbortController ? new AbortController() : null;
        app.abort = controller;
        var signal = controller ? controller.signal : undefined;
        app.timing = {};

        refreshVariantSelector(folder, name);
        var variant = currentVariant(folder, name);

        // 解析结果命中缓存就直接复用：character 一个骨骼 170~200 个动画，
        // 重新解析要 20~100ms，来回对比时这一下最值钱。
        var key = cacheKey(folder, name, variant);
        var cached = cacheGet(key);
        if (cached) {
          (folder === "character" ? ensureEmotionData() : Promise.resolve()).then(function () {
            if (token !== app.loadToken) return;
            app.activeKey = key;
            app.model = { folder: folder, name: name, variant: variant };
            activateSkeleton(cached.atlas, cached.data, inheritedTracks);
            setLoading(false);
            logLoad(started, true);
          });
          return;
        }
        setLoading(true);

        var atlasUrls = suffixUrls("../../resources/spine/" + folder + "/" + name, ATLAS_EXT);
        var bytesUrls = (variant ? suffixUrls("../../resources/spine/" + folder + "/" + name + "_" + variant, BYTES_EXT) : [])
          .concat(suffixUrls("../../resources/spine/" + folder + "/" + name, BYTES_EXT));
        var imageUrls = suffixUrls("../../resources/spine/" + folder + "/" + name, PNG_EXT);

        // 图集与骨骼互不依赖，并行取，别串成三段往返
        Promise.all([fetchText(atlasUrls, signal), fetchBinary(bytesUrls, signal),
          folder === "character" ? ensureEmotionData() : Promise.resolve()]).then(function (pair) {
          app.timing.fetch = performance.now() - started;
          var atlasText = pair[0];
          var bytes = pair[1];
          var pages = parseAtlasPages(atlasText);
          var wanted = pages.length ? pages : [name + ".png"];
          return Promise.all(wanted.map(function (page, index) {
            var candidates = unique(["../../resources/spine/" + folder + "/" + page + QUERY]
              .concat(index === 0 ? imageUrls : []));
            return tryEach(candidates, function (url) { return loadImage(url, signal); });
          })).then(function (images) {
            app.timing.fetch = performance.now() - started;
            app.timing.bytes = atlasText.length + (bytes.byteLength || 0) + (app.timing.imgBytes || 0);
            return [atlasText, bytes, images];
          });
        }).then(function (triple) {
          if (token !== app.loadToken) return;
          app.activeKey = key;
          app.model = { folder: folder, name: name, variant: variant };
          buildSkeleton(triple[0], triple[1], triple[2], key, inheritedTracks);
          setLoading(false);
          logLoad(started, false);
        }).catch(function (err) {
          if (err && err.name === "AbortError") return;   // 被新的一次切换取消，属正常
          if (token !== app.loadToken) return;
          setLoading(false);
          window.alert("加载失败：" + name + "\n" + (err && err.message ? err.message : err));
        });
      }

      function makeTexture(image) {
        var texture = new spine.webgl.GLTexture(gl, image);
        var filter = app.nearest ? gl.NEAREST : gl.LINEAR;
        texture.setFilters(filter, filter);
        return texture;
      }

      function ensureEmotionData() {
        if (app.emotionLoading) return app.emotionLoading;
        app.emotionLoading = Promise.all([
          fetchText(["../../resources/spine/emotion/human_emotion.atlas" + QUERY]),
          fetchBinary(["../../resources/spine/emotion/human_emotion.bytes" + QUERY]),
          loadImage("../../resources/spine/emotion/human_emotion.png" + QUERY)
        ]).then(function (files) {
          var texture = makeTexture(files[2]);
          var atlas = new spine.TextureAtlas(files[0], function () { return texture; });
          var data = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(atlas))
            .readSkeletonData(new Uint8Array(files[1]));
          app.emotionData = { atlas: atlas, data: data };
          applyTextureFilter(atlas);
          return app.emotionData;
        }).catch(function (err) {
          app.emotionLoading = null;
          console.error("表情资源加载失败", err);
          return null;
        });
        return app.emotionLoading;
      }

      function applyTextureFilter(atlas) {
        if (!atlas || !atlas.pages) return;
        var filter = app.nearest ? gl.NEAREST : gl.LINEAR;
        for (var i = 0; i < atlas.pages.length; i++) {
          if (atlas.pages[i].texture) atlas.pages[i].texture.setFilters(filter, filter);
        }
      }

      // ---------------------------------------------------------------------
      // 解析结果缓存
      //
      // SkeletonData / TextureAtlas 解析出来就是不可变的，可以复用。这一条很关键：
      // character 一个骨骼带 170~200 个动画，SkeletonBinary 解析要 20~100ms 且全在
      // 主线程上 —— 这才是 character 感觉比立绘还慢的真正原因（立绘只有 2~4 个动画，
      // 而它的 PNG 解码已经被 img.decode 挪出主线程了）。
      //
      // 顺带修掉一个显存泄漏：以前每次切换都 new GLTexture，旧的从不 delete。
      // ---------------------------------------------------------------------
      var CACHE_LIMIT = 128 * 1024 * 1024;   // 纹理 + 解析后堆的合计预算
      var CACHE_MAX = 12;

      // 解析后的对象图远大于原始字节，实测（Node，--expose-gc）：
      //   character 386KB 骨骼 / 172 动画 -> 4.91 MB 堆（13.0 倍）
      //   character 734KB 骨骼 / 186 动画 -> 10.66 MB 堆（14.9 倍）
      //   illust   811KB 骨骼 /   4 动画 -> 1.32 MB 堆（1.7 倍）
      // 172~196 个动画会展开成几千个 timeline/frame 对象，这才是大头。
      // 只按纹理字节算预算的话（character 纹理才 64KB）上限永远触发不到，
      // 缓存会一路涨到条数上限 —— 40 条 character 就是约 354MB 堆，V8 反复大 GC，越切越卡。
      var HEAP_FACTOR = 16;

      function cacheStats() {
        var keys = Object.keys(app.cache);
        var total = 0;
        for (var i = 0; i < keys.length; i++) total += app.cache[keys[i]].bytes || 0;
        return { count: keys.length, mb: total / 1048576 };
      }

      function estimateAtlasBytes(atlas) {
        var total = 0;
        if (atlas && atlas.pages) {
          for (var i = 0; i < atlas.pages.length; i++) {
            var page = atlas.pages[i];
            if (page && page.width && page.height) total += page.width * page.height * 4;
          }
        }
        return total;
      }

      function disposeAtlas(atlas) {
        if (!atlas || !atlas.pages) return;
        for (var i = 0; i < atlas.pages.length; i++) {
          var texture = atlas.pages[i] && atlas.pages[i].texture;
          if (texture && texture.dispose) texture.dispose();
        }
      }

      function cacheKey(folder, name, variant) {
        return folder + "|" + name + "|" + variant;
      }

      function cacheGet(key) {
        var entry = app.cache[key];
        if (!entry) return null;
        delete app.cache[key];          // 命中后挪到末尾 = 最近使用
        app.cache[key] = entry;
        return entry;
      }

      function cachePut(key, entry) {
        var existing = app.cache[key];
        if (existing) {
          delete app.cache[key];
          if (existing !== entry) disposeAtlas(existing.atlas);
        }
        app.cache[key] = entry;

        // 从最久未用的开始淘汰，绝不淘汰当前正在显示的那一个
        var keys = Object.keys(app.cache).filter(function (k) { return k !== app.activeKey; });
        var total = 0, i;
        var count = Object.keys(app.cache).length;
        for (i = 0; i < Object.keys(app.cache).length; i++) total += app.cache[Object.keys(app.cache)[i]].bytes || 0;

        for (i = 0; i < keys.length; i++) {
          if (count <= CACHE_MAX && total <= CACHE_LIMIT) break;
          var victim = app.cache[keys[i]];
          if (!victim) continue;
          delete app.cache[keys[i]];
          count--;
          total -= victim.bytes || 0;
          disposeAtlas(victim.atlas);
        }
      }

      function buildSkeleton(atlasText, bytes, images, key, inheritedTracks) {
        var t0 = performance.now();
        var decoded=GTSpineCore.parse({spine:spine,atlasText:atlasText,bytes:bytes,images:images,createTexture:makeTexture});
        var atlas=decoded.atlas,data=decoded.data;

        if (key) {
          // 预算要同时算上纹理和解析后的堆，否则 character 这种"小纹理大对象图"根本压不住
          var cost = estimateAtlasBytes(atlas) + (bytes.byteLength || 0) * HEAP_FACTOR;
          cachePut(key, { atlas: atlas, data: data, bytes: cost });
        }
        app.timing.parse = performance.now() - t0;
        activateSkeleton(atlas, data, inheritedTracks);
      }

      function activateSkeleton(atlas, data, inheritedTracks) {
        var t0 = performance.now();
        app.atlas = atlas;
        if(app.model)GTBridge.selection({folder:app.model.folder,name:app.model.name});
        app.skeleton = GTSpineCore.createInstance(spine,data);   // data 共享，姿势各自独立
        app.skeleton.setToSetupPose();
        app.skeleton.updateWorldTransform();
        app.picked = null;

        populateSkins(data.skins);
        app.emotion = app.model && app.model.folder === "character" && app.emotionData
          ? new GTEmotion.Overlay(spine, app.skeleton, app.emotionData.data) : null;
        setupTracks(data.animations, inheritedTracks);
        restoreEquipment();
        app.animState.apply(app.skeleton);
        buildSlots(app.skeleton.slots);
        applyTextureFilter(atlas);
        app.timing.ui = performance.now() - t0;

        var t1 = performance.now();
        fitView();
        app.timing.fit = performance.now() - t1;

        syncRegion(true);
        applyAutoDuration();
      }

      // =====================================================================
      // 皮肤 / 轨道
      // =====================================================================

      function populateSkins(skins) {
        var select = $("skinSelector");
        select.innerHTML = "";
        var frag = document.createDocumentFragment();
        for (var i = 0; i < skins.length; i++) {
          var option = document.createElement("option");
          option.value = skins[i].name;
          option.textContent = skins[i].name;
          frag.appendChild(option);
        }
        select.appendChild(frag);
        select.disabled = skins.length === 0;
        // 默认就用最后一个皮肤（通常是最后追加、最完整的那套）
        if (skins.length && app.skeleton) {
          select.value = skins[skins.length - 1].name;
          app.skeleton.setSkinByName(select.value);
          app.skeleton.setSlotsToSetupPose();
        }

        // 从 gtatlas 带星阶跳进来时（帧名 adela_noble_3 在 gtasset 里不是独立资源，
        // 而是 adela_noble 这个骨骼里的一套皮肤），把皮肤切到对应那套。
        // 优先精确同名，其次 _3 结尾，最后才用「名字里含 3」兜底。
        var tier = app.pendingSkinTier;
        app.pendingSkinTier = null;
        if (tier && skins.length && app.skeleton) {
          var exact = (app.current ? app.current + "_" + tier : null);
          var picked = null;
          var i;
          if (exact) {
            for (i = 0; i < skins.length; i++) {
              if (skins[i].name === exact) { picked = skins[i].name; break; }
            }
          }
          if (!picked) {
            for (i = 0; i < skins.length; i++) {
              if (skins[i].name.slice(-tier.length - 1) === "_" + tier) { picked = skins[i].name; break; }
            }
          }
          if (!picked) {
            for (i = 0; i < skins.length; i++) {
              if (skins[i].name.indexOf(tier) >= 0) { picked = skins[i].name; break; }
            }
          }
          if (picked) {
            select.value = picked;
            app.skeleton.setSkinByName(picked);
            app.skeleton.setSlotsToSetupPose();
          }
        }
      }

      // 三条固定轨：动作 / 表情 [emo] / 子动画 [sub]
      function classify(name) {
        if (name.indexOf("[emo]") >= 0) return "emote";
        if (name.indexOf("[sub]") >= 0) return "sub";
        return "action";
      }

      function setupTracks(animations, inheritedTracks) {
        var buckets = { action: [], emote: [], sub: [] };
        for (var i = 0; i < animations.length; i++) {
          var name = animations[i].name;
          buckets[classify(name)].push(name);
        }
        var variant = currentVariant(app.folder, app.current);
        // character 默认三条轨都停在 idle：动作 idle_方向、表情 [emo]idle_方向、子动画 [sub]idle_方向。
        // 都是「找到了才开」，找不到就留空。illust 不参与（只按原规则开动作轨）。
        var withIdle = app.folder === "character";
        var defaults = {
          action: pickDefault(buckets.action, variant),
          emote: withIdle ? pickIdle(buckets.emote, "[emo]idle", variant) : "",
          sub: withIdle ? pickIdle(buckets.sub, "[sub]idle", variant) : ""
        };
        [["action", "trackAction"], ["emote", "trackEmote"], ["sub", "trackSub"]].forEach(function (pair) {
          var key = pair[0], wanted = defaults[key];
          if (inheritedTracks) wanted = GTEquipment.inheritAnimation(buckets[key], inheritedTracks[key], variant, wanted);
          fillTrackSelect($(pair[1]), buckets[key], wanted);
        });
        app.tracks = {
          action: $("trackAction").value,
          emote: $("trackEmote").value,
          sub: $("trackSub").value
        };
        if (app.model && app.model.folder === "character") setupExpressions(buckets.emote, variant);
        app.animState = new spine.AnimationState(new spine.AnimationStateData(app.skeleton.data));
        applyTracks();
      }

      function setupExpressions(names, variant) {
        var character = app.model.name;
        var catalog = app.expressionCatalog[character] || (app.expressionCatalog[character] = []);
        names.forEach(function (name) {
          var expression = GTEmotion.key(name);
          if (catalog.indexOf(expression) < 0) catalog.push(expression);
        });
        if (!Object.prototype.hasOwnProperty.call(app.expressionByCharacter, character)) {
          app.expressionByCharacter[character] = variant === "back" ? "idle" : GTEmotion.key(app.tracks.emote);
        }
        var selected = app.expressionByCharacter[character];
        var options = catalog.slice();
        var advanced = app.emotion ? app.emotion.skeleton.data.animations : [];
        advanced.forEach(function (animation) {
          var expression = GTEmotion.key(animation.name);
          if (expression !== "empty" && options.indexOf(expression) < 0) options.push(expression);
        });
        if (selected && options.indexOf(selected) < 0) options.push(selected);
        options.sort();
        fillTrackSelect($("trackEmote"), options, selected);
        resolveExpression();
      }

      function resolveExpression() {
        if (!app.model || app.model.folder !== "character") return;
        var nativeNames = app.skeleton.data.animations.filter(function (animation) {
          return classify(animation.name) === "emote";
        }).map(function (animation) { return animation.name; });
        var advancedNames = app.emotion && app.emotion.face ? app.emotion.skeleton.data.animations.map(function (animation) {
          return animation.name;
        }) : [];
        var resolved = GTEmotion.route(nativeNames, advancedNames, app.expressionByCharacter[app.model.name], app.model.variant);
        app.tracks.emote = resolved.native;
        if (app.emotion) app.emotion.select(resolved.advanced);
      }

      // 只在确实存在时才选中：先试带方向的 idle_<方向>，再试不带方向的 idle。
      function pickIdle(names, prefix, variant) {
        if (!names.length) return "";
        if (variant) {
          var withVariant = prefix + "_" + variant;
          if (names.indexOf(withVariant) >= 0) return withVariant;
        }
        if (names.indexOf(prefix) >= 0) return prefix;
        return "";
      }

      function pickDefault(names, variant) {
        if (!names.length) return "";
        if (variant) {
          var exact = "idle_" + variant;
          if (names.indexOf(exact) >= 0) return exact;
        }
        for (var i = 0; i < names.length; i++) {
          if (names[i].indexOf("idle") >= 0) return names[i];
        }
        return "";
      }

      function fillTrackSelect(select, names, wanted) {
        select.innerHTML = "";
        var frag = document.createDocumentFragment();
        var blank = document.createElement("option");
        blank.value = "";
        blank.textContent = "（不选）";
        frag.appendChild(blank);
        for (var i = 0; i < names.length; i++) {
          var option = document.createElement("option");
          option.value = names[i];
          option.textContent = names[i];
          frag.appendChild(option);
        }
        select.appendChild(frag);   // character 动作轨有近 200 项，一次性插入省掉反复重排
        select.value = names.indexOf(wanted) >= 0 ? wanted : "";
      }

      function applyTracks() {
        if (!app.animState) return;
        var map = [["action", 0], ["emote", 1], ["sub", 2]];
        for (var i = 0; i < map.length; i++) {
          var name = app.tracks[map[i][0]];
          var track = map[i][1];
          if (name) app.animState.setAnimation(track, name, true);
          else app.animState.clearTrack(track);
        }
      }

      function onTrackChange(key, value) {
        if (key === "emote" && app.model && app.model.folder === "character") {
          app.expressionByCharacter[app.model.name] = value;
          resolveExpression();
          // Clearing a track does not restore its last animated pose in Spine.
          app.skeleton.setToSetupPose();
        } else app.tracks[key] = value;
        applyTracks();
        app.animState.apply(app.skeleton);
        applyAutoDuration();
      }

      $("trackAction").addEventListener("change", function () { onTrackChange("action", this.value); });
      $("trackEmote").addEventListener("change", function () { onTrackChange("emote", this.value); });
      $("trackSub").addEventListener("change", function () { onTrackChange("sub", this.value); });

      // 一轮的「动画时间」长度（不除速度），取当前各轨里最长的一条
      function loopSeconds() {
        var longest = 0;
        if (app.animState) {
          for (var i = 0; i < app.animState.tracks.length; i++) {
            var entry = app.animState.getCurrent(i);
            if (entry && entry.animation && entry.animation.duration) {
              longest = Math.max(longest, entry.animation.duration);
            }
          }
        }
        if (app.emotion && app.emotion.animation) {
          var expression = app.emotion.state.getCurrent(0);
          if (expression) longest = Math.max(longest, expression.animation.duration);
        }
        return longest;
      }

      // 一轮的「真实时间」长度
      function loopDuration() {
        var speed = parseFloat($("speedSlider").value) || 1;
        var longest = loopSeconds();
        return longest > 0 ? longest / (speed || 1) : 0;
      }

      $("exportAutoDuration").addEventListener("change", applyAutoDuration);
      $("exportFps").addEventListener("input", function () {
        if (this.disabled) return;
        app.exportFpsTarget = Math.max(1, Math.min(100, parseInt(this.value, 10) || AUTO_FPS_TARGET));
      });
      $("exportFps").addEventListener("change", function () {
        if (this.disabled) return;
        app.exportFpsTarget = Math.max(1, Math.min(100, parseInt(this.value, 10) || AUTO_FPS_TARGET));
        this.value = app.exportFpsTarget;
      });

      // =====================================================================
      // 组件
      // =====================================================================

      function buildSlots(slots) {
        var list = $("slotSliders");
        list.innerHTML = "";
        app.opacity = {};
        app.enabled = {};
        app.slotRows = [];

        for (var i = 0; i < slots.length; i++) {
          var name = slots[i].data.name;
          var id = "slot-" + i;
          app.opacity[name] = 1;
          app.enabled[name] = true;

          var row = document.createElement("div");
          row.className = "slot-control";

          var toggle = document.createElement("input");
          toggle.type = "checkbox";
          toggle.id = id + "-toggle";
          toggle.checked = true;
          toggle.title = "显示 / 隐藏该组件";

          var label = document.createElement("label");
          label.textContent = name;
          label.title = "点这一行即选中该组件（画布上会描出它的范围）";

          var range = document.createElement("input");
          range.type = "range";
          range.id = id;
          range.min = "0";
          range.max = "1";
          range.step = "0.01";
          range.value = "1";

          var pct = document.createElement("span");
          pct.className = "slot-pct";
          pct.textContent = "100%";

          row.appendChild(toggle);
          row.appendChild(label);
          row.appendChild(range);
          row.appendChild(pct);
          list.appendChild(row);

          (function (slotName, rowEl, toggleEl, rangeEl, pctEl) {
            toggleEl.addEventListener("change", function () {
              app.enabled[slotName] = toggleEl.checked;
              rowEl.classList.toggle("off", !toggleEl.checked);
              // 刚被隐藏的组件如果正被选中，取消选中
              if (!toggleEl.checked && app.picked === slotName) highlightSlot(null);
            });
            rangeEl.addEventListener("input", function () {
              app.opacity[slotName] = parseFloat(rangeEl.value);
              pctEl.textContent = Math.round(app.opacity[slotName] * 100) + "%";
            });
            // 点行即选中：与「在画布上点组件」是同一个状态，画布会描出它的范围并打上名字标签。
            // 点在开关/滑块上时不抢，交给控件自己处理；双击取消选中。
            rowEl.addEventListener("click", function (event) {
              var tag = event.target && event.target.tagName;
              if (tag === "INPUT") return;
              highlightSlot(slotName);
            });
            rowEl.addEventListener("dblclick", function () {
              highlightSlot(null);
            });
          })(name, row, toggle, range, pct);
        }
        $("slotCount").textContent = String(slots.length);
      }

      function applySlotColors() {
        var skeleton = app.skeleton;
        if (!skeleton) return;
        for (var i = 0; i < skeleton.slots.length; i++) {
          var slot = skeleton.slots[i];
          var name = slot.data.name;
          if (app.enabled[name] === false) {
            slot.color.a = 0;
            app.forced[name] = true;
            continue;
          }
          var alpha = app.opacity[name];
          if (typeof alpha === "number" && alpha !== 1) {
            slot.color.a = alpha;
            app.forced[name] = true;
            continue;
          }
          // 之前被我们改过透明度，现在不再需要覆盖 —— 必须显式还原成 setup 透明度。
          // 不还原的话 slot.color 会一直停在我们写的 0（没有颜色时间轴的槽不会被动画刷新），
          // 表现就是「关掉再打开不显示，得动一下透明度滑块才回来」。
          if (app.forced[name]) {
            slot.color.a = slot.data.color.a;
            app.forced[name] = false;
          }
        }
      }

      // =====================================================================
      // 画布尺寸 / 取景
      // =====================================================================

      function resizeCanvas() {
        var w = Math.max(1, Math.round(stage.clientWidth));
        var h = Math.max(1, Math.round(stage.clientHeight));
        if (canvas.width === w && canvas.height === h) return;
        var oldW = canvas.width || w, oldH = canvas.height || h;
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
        renderer.camera.viewportWidth = w;
        renderer.camera.viewportHeight = h;
        renderer.camera.position.x = w / 2;
        renderer.camera.position.y = h / 2;
        renderer.camera.update();

        // 画布换了尺寸，之前那次适配就失效了。
        // 用户没手动动过视图时，延迟重新适配（防抖，避免拖窗口时疯狂 readPixels）；
        // 手动动过就按比例挪一下，保住用户调好的取景。
        if (app.skeleton) {
          if (app.viewTouched) {
            app.pos.x *= w / oldW;
            app.pos.y *= h / oldH;
          } else {
            if (app.refitTimer) clearTimeout(app.refitTimer);
            app.refitTimer = setTimeout(function () {
              app.refitTimer = 0;
              fitView();
            }, 120);
          }
        }
        syncRegion(false);
      }

      if (window.ResizeObserver) {
        new ResizeObserver(function () { resizeCanvas(); }).observe(stage);
      } else {
        window.addEventListener("resize", resizeCanvas);
      }
      window.addEventListener("resize", resizeCanvas);

      function setScale(scale) {
        app.scale = clamp(scale, SCALE_MIN, SCALE_MAX);
        $("scaleSlider").value = String(scaleToSlider(app.scale));
        $("scaleValue").textContent = "×" + app.scale.toFixed(app.scale < 0.1 ? 3 : 2);
      }

      // 附件世界顶点包围盒。**只用来给适配一个数量级正确的初始缩放**：
      // Clipping 是遮罩不是可见内容，跳过；没有顶点的附件跳过。
      function attachmentBounds(skeleton) {
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        var found = false;
        for (var i = 0; i < skeleton.slots.length; i++) {
          var slot = skeleton.slots[i];
          if (!slot.bone.active) continue;
          var att = slot.getAttachment();
          if (!att) continue;
          var verts = null;
          try {
            if (att instanceof spine.RegionAttachment) {
              verts = new Float32Array(8);
              att.computeWorldVertices(slot.bone, verts, 0, 2);
            } else if (att instanceof spine.MeshAttachment) {
              var count = att.worldVerticesLength;
              if (!count) continue;
              verts = new Float32Array(count);
              att.computeWorldVertices(slot, 0, count, verts, 0, 2);
            }
          } catch (e) {
            verts = null;
          }
          if (!verts) continue;
          for (var j = 0; j < verts.length; j += 2) {
            var x = verts[j], y = verts[j + 1];
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            found = true;
          }
        }
        if (!found || !isFinite(minX) || !isFinite(maxX)) return null;
        return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
      }

      function boneBounds(skeleton) {
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (var i = 0; i < skeleton.bones.length; i++) {
          var bone = skeleton.bones[i];
          if (bone.worldX < minX) minX = bone.worldX;
          if (bone.worldX > maxX) maxX = bone.worldX;
          if (bone.worldY < minY) minY = bone.worldY;
          if (bone.worldY > maxY) maxY = bone.worldY;
        }
        if (!isFinite(minX) || !isFinite(maxX)) return null;
        return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
      }

      // 屏幕上真正被画出来的像素包围盒。
      // 黑底/白底各渲一次、由色差反推 alpha —— 与上下文有没有 alpha 通道无关，永远成立；
      // 而且只统计可见内容（隐藏的槽、画面外的挂件不会被算进来）。
      //
      // 关键：渲到一个**自己的小 FBO**（宽 480）再读，而不是从默认帧缓冲读全画布。
      // 之前从默认帧缓冲 readPixels 全画布，4K 画布一次就是 33MB，还要 2~3 轮共 4~6 次；
      // 更糟的是浏览器可能已把默认帧缓冲交给合成器，驱动只能整窗拷贝，单次就上百毫秒
      // —— 这才是"切一个角色要几秒"的主因，跟资源大小无关。
      var MEASURE_W = 480;
      var measureTarget = null;

      function ensureMeasureTarget(w, h) {
        if (measureTarget && measureTarget.w === w && measureTarget.h === h) return measureTarget;
        if (measureTarget) {
          gl.deleteFramebuffer(measureTarget.fbo);
          gl.deleteTexture(measureTarget.tex);
        }
        var tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        var fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        if (!ok) {
          gl.deleteFramebuffer(fbo);
          gl.deleteTexture(tex);
          measureTarget = null;
          return null;
        }
        measureTarget = {
          fbo: fbo, tex: tex, w: w, h: h,
          black: new Uint8Array(w * h * 4),
          white: new Uint8Array(w * h * 4)
        };
        return measureTarget;
      }

      function measureVisibleBounds() {
        var W = canvas.width, H = canvas.height;
        if (!W || !H || !app.skeleton) return null;
        var mw = Math.min(MEASURE_W, W);
        var mh = Math.max(2, Math.round(mw * H / W));
        var t = ensureMeasureTarget(mw, mh);
        if (!t) return null;

        // 相机投影不变（仍是画布尺寸），只把 GL viewport 缩到小 FBO ——
        // 长宽比一致，所以画面被整体等比缩小，包围盒乘回比例即可。
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
        gl.viewport(0, 0, mw, mh);

        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        renderer.begin();
        drawScene();
        renderer.end();
        gl.readPixels(0, 0, mw, mh, gl.RGBA, gl.UNSIGNED_BYTE, t.black);

        gl.clearColor(1, 1, 1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        renderer.begin();
        drawScene();
        renderer.end();
        gl.readPixels(0, 0, mw, mh, gl.RGBA, gl.UNSIGNED_BYTE, t.white);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, W, H);

        var black = t.black, white = t.white;
        var minX = mw, minY = mh, maxX = -1, maxY = -1;
        for (var y = 0; y < mh; y++) {
          var row = y * mw * 4;
          for (var x = 0; x < mw; x++) {
            var i = row + x * 4;
            var diff = ((white[i] - black[i]) + (white[i + 1] - black[i + 1]) + (white[i + 2] - black[i + 2])) / 3;
            if (255 - diff > 8) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX < 0) return null;

        var sx = W / mw, sy = H / mh;
        return {
          minX: Math.max(0, (minX - 1) * sx),
          minY: Math.max(0, (minY - 1) * sy),
          maxX: Math.min(W - 1, (maxX + 2) * sx),
          maxY: Math.min(H - 1, (maxY + 2) * sy)
        };
      }

      // 骨架变换归零后的本地包围盒（只给初始缩放用）
      function localBoundGuess() {
        var skeleton = app.skeleton;
        skeleton.scaleX = skeleton.scaleY = 1;
        skeleton.x = 0;
        skeleton.y = 0;
        skeleton.updateWorldTransform();
        return attachmentBounds(skeleton) || boneBounds(skeleton);
      }

      // 适配：本地包围盒给粗估缩放 → 原点先落到画布中心 → 用可见像素包围盒迭代收敛到正中。
      function fitView() {
        var skeleton = app.skeleton;
        if (!skeleton) return;
        var W = canvas.width, H = canvas.height;

        var scale = 1;
        var guess = localBoundGuess();
        if (guess) {
          var gw = Math.max(1e-6, guess.maxX - guess.minX);
          var gh = Math.max(1e-6, guess.maxY - guess.minY);
          scale = clamp(0.45 * Math.min(W / gw, H / gh), SCALE_MIN, SCALE_MAX);
        }

        var x = W / 2, y = H / 2;

        for (var pass = 0; pass < 3; pass++) {
          skeleton.scaleX = skeleton.scaleY = scale;
          skeleton.x = x;
          skeleton.y = y;
          skeleton.updateWorldTransform();

          var m = measureVisibleBounds();
          if (!m) {
            if (pass === 0) break;        // 测不到（FBO 不可用等）就保留解析粗估，别越缩越小
            if (scale <= SCALE_MIN) break;
            scale = Math.max(SCALE_MIN, scale * 0.4);
            x = W / 2;
            y = H / 2;
            continue;
          }
          var mw = m.maxX - m.minX + 1;
          var mh = m.maxY - m.minY + 1;
          var k = clamp(FIT_MARGIN * Math.min(W / mw, H / mh), 0.2, 5);
          var cx = (m.minX + m.maxX) / 2;
          var cy = (m.minY + m.maxY) / 2;
          // 像素 = 位移 + 缩放 × 本地坐标，据此反推新变换，使包围盒中心落到画布中心
          x = W / 2 - k * (cx - x);
          y = H / 2 - k * (cy - y);
          scale = clamp(scale * k, SCALE_MIN, SCALE_MAX);
          if (Math.abs(k - 1) < 0.04) break;
        }

        app.pos.x = x;
        app.pos.y = y;
        setScale(scale);
        skeleton.scaleX = skeleton.scaleY = scale;
        skeleton.x = x;
        skeleton.y = y;
        skeleton.updateWorldTransform();
        app.viewTouched = false;
      }

      // 让导出范围框贴住当前屏幕上可见的模型
      function fitRegionToModel() {
        if (!app.skeleton) return;
        app.skeleton.updateWorldTransform();
        var m = measureVisibleBounds();
        if (!m) return;
        setRegion({
          x: m.minX,
          y: canvas.height - 1 - m.maxY,
          w: m.maxX - m.minX + 1,
          h: m.maxY - m.minY + 1
        });
      }

      // 原尺寸：缩放固定为 1:1（不做任何缩放），只把可见内容居中
      function actualSize() {
        var skeleton = app.skeleton;
        if (!skeleton) return;
        setScale(1);

        var guess = localBoundGuess();
        app.pos.x = canvas.width / 2 - (guess ? (guess.minX + guess.maxX) / 2 : 0);
        app.pos.y = canvas.height / 2 - (guess ? (guess.minY + guess.maxY) / 2 : 0);
        skeleton.scaleX = skeleton.scaleY = 1;
        skeleton.x = app.pos.x;
        skeleton.y = app.pos.y;
        skeleton.updateWorldTransform();

        // 再用可见像素包围盒精确居中
        var m = measureVisibleBounds();
        if (m) {
          app.pos.x += canvas.width / 2 - (m.minX + m.maxX) / 2;
          app.pos.y += canvas.height / 2 - (m.minY + m.maxY) / 2;
          skeleton.x = app.pos.x;
          skeleton.y = app.pos.y;
          skeleton.updateWorldTransform();
        }
        app.viewTouched = true;
      }

      // =====================================================================
      // 导出范围
      // =====================================================================

      function clampRegion(r) {
        var W = canvas.width, H = canvas.height;
        r.w = Math.max(1, Math.min(Math.round(r.w), W));
        r.h = Math.max(1, Math.min(Math.round(r.h), H));
        r.x = Math.max(0, Math.min(Math.round(r.x), W - r.w));
        r.y = Math.max(0, Math.min(Math.round(r.y), H - r.h));
        return r;
      }

      function setRegion(r) {
        app.region = clampRegion({
          x: r.x, y: r.y, w: r.w, h: r.h
        });
        $("regionX").value = app.region.x;
        $("regionY").value = app.region.y;
        $("regionW").value = app.region.w;
        $("regionH").value = app.region.h;
        drawRegionBox();
      }

      function drawRegionBox() {
        var box = $("exportRegion");
        box.style.left = app.region.x + "px";
        box.style.top = app.region.y + "px";
        box.style.width = app.region.w + "px";
        box.style.height = app.region.h + "px";
      }

      function syncRegion(reset) {
        if (reset || !app.region.w || !app.region.h) {
          setRegion({ x: 0, y: 0, w: canvas.width, h: canvas.height });
        } else {
          setRegion(app.region);
        }
      }

      ["regionX", "regionY", "regionW", "regionH"].forEach(function (id) {
        $(id).addEventListener("change", function () {
          setRegion({
            x: parseInt($("regionX").value, 10) || 0,
            y: parseInt($("regionY").value, 10) || 0,
            w: parseInt($("regionW").value, 10) || 1,
            h: parseInt($("regionH").value, 10) || 1
          });
        });
      });

      $("regionFull").addEventListener("click", function () {
        setRegion({ x: 0, y: 0, w: canvas.width, h: canvas.height });
      });
      $("regionFit").addEventListener("click", fitRegionToModel);

      (function bindRegionDrag() {
        var box = $("exportRegion");

        function localPoint(event) {
          var rect = stage.getBoundingClientRect();
          return { x: event.clientX - rect.left, y: event.clientY - rect.top };
        }

        function startDrag(mode, dir, event) {
          app.regionDrag = {
            mode: mode,
            dir: dir,
            at: localPoint(event),
            start: { x: app.region.x, y: app.region.y, w: app.region.w, h: app.region.h }
          };
          event.preventDefault();
          event.stopPropagation();
        }

        // 8 个手柄：拉伸
        box.querySelectorAll(".h").forEach(function (node) {
          node.addEventListener("mousedown", function (event) {
            startDrag("resize", node.dataset.dir, event);
          });
        });

        // 边上其余位置：平移
        box.querySelectorAll(".edge").forEach(function (node) {
          node.addEventListener("mousedown", function (event) {
            startDrag("move", "", event);
          });
        });

        // 手柄/边都盖在画布上，滚轮要转发给缩放，不能让框吃掉
        box.addEventListener("wheel", function (event) {
          event.preventDefault();
          zoomAt(canvasPoint(event.clientX, event.clientY), Math.pow(1.0016, -event.deltaY));
        }, { passive: false });

        window.addEventListener("mousemove", function (event) {
          var d = app.regionDrag;
          if (!d) return;
          var p = localPoint(event);
          var dx = p.x - d.at.x, dy = p.y - d.at.y;
          var s = d.start;

          if (d.mode === "move") {
            setRegion({ x: s.x + dx, y: s.y + dy, w: s.w, h: s.h });
            return;
          }

          var left = s.x, top = s.y, right = s.x + s.w, bottom = s.y + s.h;
          if (d.dir.indexOf("w") >= 0) left += dx;
          if (d.dir.indexOf("e") >= 0) right += dx;
          if (d.dir.indexOf("n") >= 0) top += dy;
          if (d.dir.indexOf("s") >= 0) bottom += dy;
          if (right - left < 8) { if (d.dir.indexOf("w") >= 0) left = right - 8; else right = left + 8; }
          if (bottom - top < 8) { if (d.dir.indexOf("n") >= 0) top = bottom - 8; else bottom = top + 8; }
          setRegion({ x: left, y: top, w: right - left, h: bottom - top });
        });

        window.addEventListener("mouseup", function () { app.regionDrag = null; });
      })();

      // =====================================================================
      // 渲染
      // =====================================================================

      // 调试叠层：自己画，完全不用 spine-webgl 的 SkeletonDebugRenderer。
      // 两个原因：
      //  1) 那个渲染器内部混用两套坐标基准（骨骼线把 skeleton.x/y 多加一次，网格/区域
      //     用 computeWorldVertices 只加一次），没有哪个相机设置能同时对齐两者；
      //  2) 它的 ShapeRenderer.check() 用 mesh.numVertices() 判容量，而那个值只有 flush()
      //     才会更新，于是第一批图形永远不会自动 flush，顶点数会越界写出缓冲区、整批报废。
      // 这里：全部只用 Line 图元（不触发类型切换的 flush），并且自己按顶点预算周期 flush。
      function drawDebugOverlay() {
        var skeleton = app.skeleton;
        var shapes = renderer.shapes;
        if (!skeleton || !shapes || !renderer.enableRenderer) return;

        renderer.enableRenderer(shapes);   // 由 SceneRenderer 绑定 shader、设置 MVP 并 begin()

        var budget = 0;
        function spend(vertices) {
          budget += vertices;
          if (budget >= 8000) {
            shapes.flush();                // 8000 顶点 × 6 float = 48000 < 65520 上限
            budget = 0;
          }
        }
        function seg(x1, y1, x2, y2) {
          spend(2);
          shapes.line(x1, y1, x2, y2);
        }

        var i, n;
        var verts = new Float32Array(1024);

        // 被点选中的组件：高亮它的几何轮廓（与「骨骼」开关无关，始终可见）
        if (app.picked) {
          shapes.setColor(new spine.Color(0.35, 0.95, 1, 1));
          for (i = 0, n = skeleton.slots.length; i < n; i++) {
            var pickedSlot = skeleton.slots[i];
            if (pickedSlot.data.name !== app.picked) continue;
            var pickedAtt = pickedSlot.getAttachment();
            if (pickedAtt instanceof spine.MeshAttachment) {
              var pc = pickedAtt.worldVerticesLength;
              if (pc) {
                if (verts.length < pc) verts = new Float32Array(pc);
                pickedAtt.computeWorldVertices(pickedSlot, 0, pc, verts, 0, 2);
                var pt = pickedAtt.triangles;
                for (var pt2 = 0; pt2 + 2 < pt.length; pt2 += 3) {
                  var pa = pt[pt2] * 2, pb = pt[pt2 + 1] * 2, pc2 = pt[pt2 + 2] * 2;
                  seg(verts[pa], verts[pa + 1], verts[pb], verts[pb + 1]);
                  seg(verts[pb], verts[pb + 1], verts[pc2], verts[pc2 + 1]);
                  seg(verts[pc2], verts[pc2 + 1], verts[pa], verts[pa + 1]);
                }
              }
            } else if (pickedAtt instanceof spine.RegionAttachment) {
              var pq = new Float32Array(8);
              pickedAtt.computeWorldVertices(pickedSlot.bone, pq, 0, 2);
              seg(pq[0], pq[1], pq[2], pq[3]);
              seg(pq[2], pq[3], pq[4], pq[5]);
              seg(pq[4], pq[5], pq[6], pq[7]);
              seg(pq[6], pq[7], pq[0], pq[1]);
            }
            break;
          }
        }

        if (app.debug) {

          // 网格三角线
          shapes.setColor(new spine.Color(1, 0.62, 0.14, 0.5));
          for (i = 0, n = skeleton.slots.length; i < n; i++) {
            var slot = skeleton.slots[i];
            if (slot.bone && slot.bone.active === false) continue;
            var mesh = slot.getAttachment();
            if (!(mesh instanceof spine.MeshAttachment)) continue;
            var count = mesh.worldVerticesLength;
            if (!count) continue;
            if (verts.length < count) verts = new Float32Array(count);
            mesh.computeWorldVertices(slot, 0, count, verts, 0, 2);

            var tri = mesh.triangles;
            for (var t = 0; t + 2 < tri.length; t += 3) {
              var a = tri[t] * 2, b = tri[t + 1] * 2, c = tri[t + 2] * 2;
              seg(verts[a], verts[a + 1], verts[b], verts[b + 1]);
              seg(verts[b], verts[b + 1], verts[c], verts[c + 1]);
              seg(verts[c], verts[c + 1], verts[a], verts[a + 1]);
            }
          }

          // 区域附件边框
          shapes.setColor(new spine.Color(0.45, 0.6, 1, 0.9));
          var quad = new Float32Array(8);
          for (i = 0, n = skeleton.slots.length; i < n; i++) {
            var slotR = skeleton.slots[i];
            var region = slotR.getAttachment();
            if (!(region instanceof spine.RegionAttachment)) continue;
            region.computeWorldVertices(slotR.bone, quad, 0, 2);
            seg(quad[0], quad[1], quad[2], quad[3]);
            seg(quad[2], quad[3], quad[4], quad[5]);
            seg(quad[4], quad[5], quad[6], quad[7]);
            seg(quad[6], quad[7], quad[0], quad[1]);
          }

          // 骨骼线
          shapes.setColor(new spine.Color(1, 0.22, 0.22, 0.95));
          for (i = 0, n = skeleton.bones.length; i < n; i++) {
            var bone = skeleton.bones[i];
            if (!bone.parent) continue;
            seg(bone.worldX, bone.worldY,
              bone.worldX + bone.data.length * bone.a,
              bone.worldY + bone.data.length * bone.c);
          }

          // 关节点（circle(false) 也是 Line 图元，整层不出现类型切换）
          shapes.setColor(new spine.Color(0.3, 1, 0.4, 0.95));
          for (i = 0, n = skeleton.bones.length; i < n; i++) {
            spend(12);
            shapes.circle(false, skeleton.bones[i].worldX, skeleton.bones[i].worldY, 3);
          }
        }

        renderer.end();
      }

      var lastFrame = performance.now();

      function drawScene() {
        renderer.drawSkeleton(app.skeleton, true);
        if (app.emotion && app.emotion.update()) renderer.drawSkeleton(app.emotion.skeleton, true);
      }

      function render(now) {
        if(disposed)return;
        requestAnimationFrame(render);
        if(document.hidden)return;
        var skeleton = app.skeleton;
        if (!skeleton || !app.animState) return;

        var delta = Math.min(0.1, (now - lastFrame) / 1000);
        lastFrame = now;
        var speed = parseFloat($("speedSlider").value) || 0;

        // 暂停时不推进动画（仍然绘制，所以平移/缩放/取景照常可用）
        if (!app.exporting && !app.paused) {
          app.animState.update(delta * speed);
          if (app.emotion && app.emotion.animation) app.emotion.state.update(delta * speed);
        }
        app.animState.apply(skeleton);
        skeleton.scaleX = app.scale;
        skeleton.scaleY = app.scale;
        skeleton.x = app.pos.x;
        skeleton.y = app.pos.y;
        skeleton.updateWorldTransform();
        applySlotColors();
        updateSlotTag();

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        renderer.begin();
        drawScene();
        renderer.end();

        if (app.debug || app.picked) drawDebugOverlay();
      }

      // =====================================================================
      // 交互
      // =====================================================================

      function canvasPoint(clientX, clientY) {
        var rect = canvas.getBoundingClientRect();
        var x = (clientX - rect.left) * (canvas.width / rect.width);
        var yTop = (clientY - rect.top) * (canvas.height / rect.height);
        return { x: x, glY: canvas.height - yTop };
      }

      function zoomAt(point, factor) {
        var previous = app.scale;
        var next = clamp(previous * factor, SCALE_MIN, SCALE_MAX);
        if (next === previous) return;
        var worldX = (point.x - app.pos.x) / previous;
        var worldY = (point.glY - app.pos.y) / previous;
        app.pos.x = point.x - next * worldX;
        app.pos.y = point.glY - next * worldY;
        setScale(next);
        app.viewTouched = true;
      }

      // 单个组件在世界坐标里的包围盒（画布标注用）
      function slotBounds(slot) {
        if (!slot || (slot.bone && slot.bone.active === false)) return null;
        var att = slot.getAttachment();
        if (!att) return null;
        var verts = null;
        try {
          if (att instanceof spine.RegionAttachment) {
            verts = new Float32Array(8);
            att.computeWorldVertices(slot.bone, verts, 0, 2);
          } else if (att instanceof spine.MeshAttachment) {
            var count = att.worldVerticesLength;
            if (!count) return null;
            verts = new Float32Array(count);
            att.computeWorldVertices(slot, 0, count, verts, 0, 2);
          }
        } catch (e) {
          return null;
        }
        if (!verts || verts.length < 2) return null;
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (var i = 0; i < verts.length; i += 2) {
          if (verts[i] < minX) minX = verts[i];
          if (verts[i] > maxX) maxX = verts[i];
          if (verts[i + 1] < minY) minY = verts[i + 1];
          if (verts[i + 1] > maxY) maxY = verts[i + 1];
        }
        if (!isFinite(minX) || !isFinite(maxX)) return null;
        return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
      }

      // 选中组件的画布标注：把组件名贴在它包围盒的上方（每帧跟着动画走）
      function updateSlotTag() {
        var tag = $("slotTag");
        if (!tag) return;
        if (!app.picked || !app.skeleton) {
          tag.classList.remove("on");
          return;
        }
        var slot = null;
        for (var i = 0; i < app.skeleton.slots.length; i++) {
          if (app.skeleton.slots[i].data.name === app.picked) {
            slot = app.skeleton.slots[i];
            break;
          }
        }
        var box = slotBounds(slot);
        if (!box) {
          tag.classList.remove("on");
          return;
        }
        tag.textContent = app.picked;
        tag.style.left = ((box.minX + box.maxX) / 2).toFixed(1) + "px";
        tag.style.top = (canvas.height - box.maxY - 8).toFixed(1) + "px";
        tag.classList.add("on");
      }

      // 点是否落在三角形内
      function inTriangle(px, py, x1, y1, x2, y2, x3, y3) {
        var d1 = (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
        var d2 = (px - x3) * (y2 - y3) - (x2 - x3) * (py - y3);
        var d3 = (px - x1) * (y3 - y1) - (x3 - x1) * (py - y1);
        var hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
        var hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
        return !(hasNeg && hasPos);
      }

      // 按绘制顺序从最上层往下找，命中的第一个组件就是点到的那个。
      // px / pyUp 用的是画布像素坐标（屏幕坐标 == 世界坐标，y 向上）。
      function pickSlotAt(px, pyUp) {
        var skeleton = app.skeleton;
        if (!skeleton) return null;
        var order = skeleton.drawOrder;
        var verts = new Float32Array(1024);
        for (var i = order.length - 1; i >= 0; i--) {
          var slot = order[i];
          var name = slot.data.name;
          if (app.enabled[name] === false) continue;
          if (slot.bone && slot.bone.active === false) continue;
          var att = slot.getAttachment();
          if (!att) continue;

          if (att instanceof spine.MeshAttachment) {
            var count = att.worldVerticesLength;
            if (!count) continue;
            if (verts.length < count) verts = new Float32Array(count);
            att.computeWorldVertices(slot, 0, count, verts, 0, 2);
            var tri = att.triangles;
            for (var t = 0; t + 2 < tri.length; t += 3) {
              var a = tri[t] * 2, b = tri[t + 1] * 2, c = tri[t + 2] * 2;
              if (inTriangle(px, pyUp, verts[a], verts[a + 1], verts[b], verts[b + 1], verts[c], verts[c + 1])) {
                return name;
              }
            }
          } else if (att instanceof spine.RegionAttachment) {
            var q = new Float32Array(8);
            att.computeWorldVertices(slot.bone, q, 0, 2);
            if (inTriangle(px, pyUp, q[0], q[1], q[2], q[3], q[4], q[5]) ||
              inTriangle(px, pyUp, q[0], q[1], q[4], q[5], q[6], q[7])) {
              return name;
            }
          }
        }
        return null;
      }

      function highlightSlot(name) {
        // 三条规则集中在这里，所有调用点自然一致：
        //   1. 关了「点选组件」→ 不允许选中
        //   2. 组件被隐藏 → 不允许选中（隐藏的东西不该能被点出来）
        //   3. name 传空（双击、点空白处）→ 取消选中
        if (!app.pickEnabled) name = null;
        if (name && app.enabled[name] === false) name = null;
        app.picked = name || null;
        var rows = $("slotSliders").querySelectorAll(".slot-control");
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          var label = row.querySelector("label");
          var on = !!name && label && label.textContent === name;
          row.classList.toggle("picked", on);
          if (on && row.scrollIntoView) row.scrollIntoView({ block: "nearest" });
        }
      }

      canvas.addEventListener("mousedown", function (event) {
        app.dragging = true;
        app.dragAt = { x: event.clientX, y: event.clientY };
        app.downAt = { x: event.clientX, y: event.clientY };
      });

      window.addEventListener("mousemove", function (event) {
        if (!app.dragging) return;
        var rect = canvas.getBoundingClientRect();
        app.pos.x += (event.clientX - app.dragAt.x) * (canvas.width / rect.width);
        app.pos.y -= (event.clientY - app.dragAt.y) * (canvas.height / rect.height);
        app.dragAt = { x: event.clientX, y: event.clientY };
        app.viewTouched = true;
      });

      window.addEventListener("mouseup", function (event) {
        var wasDragging = app.dragging;
        app.dragging = false;
        if (!wasDragging || !app.skeleton) return;
        // 位移很小才算「点击」，否则是在平移拖动，不能抢这个操作
        if (Math.abs(event.clientX - app.downAt.x) + Math.abs(event.clientY - app.downAt.y) > 5) return;
        if (!app.pickEnabled) return;                       // 关了「点选组件」就不做命中检测
        var point = canvasPoint(event.clientX, event.clientY);
        highlightSlot(pickSlotAt(point.x, point.glY));
      });

      // 双击画布取消选中
      canvas.addEventListener("dblclick", function () {
        highlightSlot(null);
      });

      $("pickToggle").addEventListener("change", function () {
        app.pickEnabled = this.checked;
        if (!app.pickEnabled) highlightSlot(null);          // 关掉时清掉已有的选中
      });

      canvas.addEventListener("wheel", function (event) {
        event.preventDefault();
        zoomAt(canvasPoint(event.clientX, event.clientY), Math.pow(1.0016, -event.deltaY));
      }, { passive: false });

      $("scaleSlider").addEventListener("input", function () {
        setScale(sliderToScale(parseFloat($("scaleSlider").value)));
        app.viewTouched = true;
      });

      $("speedSlider").addEventListener("input", function () {
        $("speedValue").textContent = "×" + (parseFloat($("speedSlider").value) || 0).toFixed(2);
        applyAutoDuration();
      });

      $("fitBtn").addEventListener("click", fitView);
      $("actualSizeBtn").addEventListener("click", actualSize);

      $("nearestToggle").addEventListener("change", function () {
        app.nearest = $("nearestToggle").checked;
        applyTextureFilter(app.atlas);
        if (app.emotionData) applyTextureFilter(app.emotionData.atlas);
        if (app.itemSheet && app.itemSheet.texture) {
          var filter = app.nearest ? gl.NEAREST : gl.LINEAR;
          app.itemSheet.texture.setFilters(filter, filter);
        }
      });

      $("debugToggle").addEventListener("change", function () {
        app.debug = $("debugToggle").checked;
      });

      $("folderSelector").addEventListener("change", function () {
        setFolder($("folderSelector").value);
      });

      $("skeletonVariantButtons").addEventListener("click", function (event) {
        var button = event.target.closest("button[data-variant]");
        if (!button || !app.current || app.variant === button.dataset.variant) return;
        app.variant = button.dataset.variant;
        loadAsset(app.folder, app.current, Object.assign({}, app.tracks));
      });

      // 输入只过滤列表，不加载资源；↑↓ 在结果里移动，Enter 载入。
      // 过滤本身做 70ms 防抖：每次按键都重建几百行 DOM 也会拖手感。
      var filterTimer = 0;

      function flushFilter() {
        if (filterTimer) {
          clearTimeout(filterTimer);
          filterTimer = 0;
        }
        applyFilter();
      }

      $("assetSearchBox").addEventListener("input", function () {
        if (filterTimer) clearTimeout(filterTimer);
        filterTimer = setTimeout(function () {
          filterTimer = 0;
          applyFilter();
        }, 70);
      });

      $("assetList").addEventListener("scroll", function () {
        if (this.dataset.hasMore !== "true" || this.scrollTop + this.clientHeight < this.scrollHeight - 10) return;
        var scrollTop = this.scrollTop;
        app.listLimit += 40;
        renderAssetList();
        this.scrollTop = scrollTop;
      });

      $("assetSearchBox").addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === "ArrowDown" || event.key === "ArrowUp") {
          if (filterTimer) flushFilter();
        }
        if (event.key === "Enter") {
          event.preventDefault();
          if (app.cursor >= 0 && app.cursor < app.shown.length) selectAsset(app.shown[app.cursor]);
          else if (app.shown.length) selectAsset(app.shown[0]);
          return;
        }
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        if (!app.shown.length) return;
        var step = event.key === "ArrowDown" ? 1 : -1;
        app.cursor = app.cursor < 0
          ? (step > 0 ? 0 : app.shown.length - 1)
          : (app.cursor + step + app.shown.length) % app.shown.length;
        var cursorName = app.shown[app.cursor];
        if (app.cursor >= app.listLimit) {
          app.listLimit = app.cursor + 20;
          renderAssetList();
        }
        var nodes = $("assetList").querySelectorAll(".asset-item");
        for (var i = 0; i < nodes.length; i++) {
          var on = nodes[i].dataset.name === cursorName;
          nodes[i].classList.toggle("cursor", on);
          if (on && nodes[i].scrollIntoView) nodes[i].scrollIntoView({ block: "nearest" });
        }
      });

      $("pauseBtn").addEventListener("click", function () {
        app.paused = !app.paused;
        this.textContent = app.paused ? "继续" : "暂停";
      });

      $("canvasBgColor").addEventListener("input", function () {
        canvas.style.background = this.value;
      });

      $("skinSelector").addEventListener("change", function () {
        if (!app.skeleton) return;
        app.skeleton.setSkinByName($("skinSelector").value);
        app.skeleton.setSlotsToSetupPose();
      });

      // =====================================================================
      // 自定义上传
      // =====================================================================

      var upload = { image: null, atlas: null, skeleton: null };

      ["customImage", "customAtlas", "customSkeleton"].forEach(function (id) {
        $(id).addEventListener("change", function (event) {
          var file = event.target.files[0];
          if (!file) return;
          if (id === "customImage") upload.image = file;
          if (id === "customAtlas") upload.atlas = file;
          if (id === "customSkeleton") upload.skeleton = file;
          $("customLoadBtn").disabled = !(upload.image && upload.atlas && upload.skeleton);
        });
      });

      function readAsText(file) {
        return new Promise(function (resolve) {
          var reader = new FileReader();
          reader.onload = function () { resolve(reader.result); };
          reader.readAsText(file);
        });
      }

      function readAsBuffer(file) {
        return new Promise(function (resolve) {
          var reader = new FileReader();
          reader.onload = function () { resolve(reader.result); };
          reader.readAsArrayBuffer(file);
        });
      }

      $("customLoadBtn").addEventListener("click", function () {
        Promise.all([readAsText(upload.atlas), readAsBuffer(upload.skeleton),
        loadImage(URL.createObjectURL(upload.image))]).then(function (results) {
          buildSkeleton(results[0], results[1], [results[2]], null);
        }).catch(function (err) {
          window.alert("载入失败：" + (err && err.message ? err.message : err));
        });
      });

      // =====================================================================
      // 导出 GIF —— 只有一条路径：gifenc（透明 / 纯色背景都走它）
      // =====================================================================

      function readFrameRGBA(w, h) {
        // 分别以黑底、白底渲染，由色差反推 alpha：与能否读回 alpha 通道无关，永远准。
        var count = w * h * 4;
        var black = new Uint8Array(count);
        var white = new Uint8Array(count);
        var rgba = new Uint8Array(count);

        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        renderer.begin();
        drawScene();
        renderer.end();
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, black);

        gl.clearColor(1, 1, 1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        renderer.begin();
        drawScene();
        renderer.end();
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, white);

        for (var i = 0; i < count; i += 4) {
          var diff = ((white[i] - black[i]) + (white[i + 1] - black[i + 1]) + (white[i + 2] - black[i + 2])) / 3;
          var a = Math.max(0, Math.min(255, Math.round(255 - diff)));
          rgba[i + 3] = a;
          if (a > 0) {
            rgba[i] = Math.min(255, Math.round(black[i] * 255 / a));
            rgba[i + 1] = Math.min(255, Math.round(black[i + 1] * 255 / a));
            rgba[i + 2] = Math.min(255, Math.round(black[i + 2] * 255 / a));
          }
        }
        return rgba;
      }

      function download(dataUrl, filename) {
        var link = document.createElement("a");
        link.href = dataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      // 自动模式下的目标帧率（够顺滑，文件也不至于过大）
      var AUTO_FPS_TARGET = 30;

      // 导出参数规划。GIF 帧间隔最小 10ms，所以间隔一律吸附到 10ms 的整数倍。
      // 自动模式：帧数由「一轮时长 × 目标帧率」决定，每帧推进的动画时间 = 一轮 ÷ 帧数，
      // 于是 N 帧正好覆盖一整轮，首尾严丝合缝。
      function exportPlan() {
        var speed = parseFloat($("speedSlider").value) || 1;
        var loopAnim = loopSeconds();
        var auto = $("exportAutoDuration").checked && loopAnim > 0;
        var period = loopAnim > 0 ? loopAnim / speed : 0;
        var frames, delayMs, stepAnim, duration;

        if (auto) {
          // 先把目标帧率吸附成 10ms 的整数倍间隔，再由间隔算帧数。
          // 反过来（先算帧数再吸附间隔）会让间隔的取整误差按帧累积，
          // 一轮下来播放时长能短 10%，看着就是"比网页快"。
          delayMs = Math.max(10, Math.round(1000 / AUTO_FPS_TARGET / 10) * 10);
          duration = period;
          frames = Math.max(2, Math.round(period * 1000 / delayMs));
          stepAnim = loopAnim / frames;
        } else {
          delayMs = Math.max(10, Math.round(1000 / app.exportFpsTarget / 10) * 10);
          duration = Math.max(0.1, parseFloat($("exportDuration").value) || 1);
          // 时长若仍等于整轮（只是解锁了帧率），照样按精确整轮算，不引入接缝
          var coverage = (period > 0 && Math.abs(duration - period) < 0.005) ? period : duration;
          frames = Math.max(2, Math.round(coverage * 1000 / delayMs));
          stepAnim = coverage * speed / frames;
          duration = coverage;
        }

        return {
          auto: auto, frames: frames, delayMs: delayMs, fpsEff: 1000 / delayMs,
          stepAnim: stepAnim, duration: duration, speed: speed, loopAnim: loopAnim
        };
      }

      function applyAutoDuration() {
        var auto = $("exportAutoDuration").checked;
        $("exportDuration").disabled = auto;
        $("exportFps").disabled = auto;
        if (auto) {
          var plan = exportPlan();
          $("exportFps").value = plan.fpsEff.toFixed(1);
          $("exportDuration").value = plan.duration.toFixed(2);
        } else {
          $("exportFps").value = app.exportFpsTarget;
        }
      }

      $("recordGifBtn").addEventListener("click", function () {
        if (!app.skeleton || !app.animState) {
          window.alert("请先加载一个资源再导出");
          return;
        }
        var button = $("recordGifBtn");
        var bar = $("exportBar");
        var fill = bar.querySelector("i");

        var plan = exportPlan();
        var duration = plan.duration;
        var frames = plan.frames;
        var stepAnim = plan.stepAnim;
        var speed = plan.speed;
        var transparent = $("exportTransparentBg").checked;
        var hex = $("exportBgColor").value;
        var bg = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

        var region = clampRegion(app.region);
        var W = canvas.width, H = canvas.height;
        var flip = document.createElement("canvas");
        flip.width = W;
        flip.height = H;
        var flipCtx = flip.getContext("2d");
        var out = document.createElement("canvas");
        out.width = region.w;
        out.height = region.h;
        var outCtx = out.getContext("2d");

        button.disabled = true;
        bar.classList.add("on");
        fill.style.width = "0%";
        app.exporting = true;

        var frame = 0;
        var gif = null;
        var palette = null;
        var delayMs = plan.delayMs;

        function progress(text, pct) {
          button.textContent = text;
          fill.style.width = pct + "%";
        }

        function done(ok, message) {
          app.exporting = false;
          button.disabled = false;
          button.textContent = "导出 GIF";
          bar.classList.remove("on");
          fill.style.width = "0%";
          if (!ok && message) window.alert(message);
        }

        import("../../vendor/gifenc.esm.js").then(function (mod) {
          gif = mod.GIFEncoder();

          // 包一层：任何一帧出错都要把 exporting 复位，否则渲染循环会一直不再推进动画
          function capture() {
            try {
              captureFrame();
            } catch (err) {
              done(false, "导出失败：" + (err && err.message ? err.message : err));
            }
          }

          function captureFrame() {
            app.animState.apply(app.skeleton);
            app.skeleton.updateWorldTransform();

            var rgba = readFrameRGBA(W, H);

            // readPixels 自下而上，翻正后按导出范围裁剪
            var img = flipCtx.createImageData(W, H);
            for (var y = 0; y < H; y++) {
              img.data.set(rgba.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
            }
            flipCtx.putImageData(img, 0, 0);
            outCtx.clearRect(0, 0, region.w, region.h);
            outCtx.drawImage(flip, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);
            var data = outCtx.getImageData(0, 0, region.w, region.h).data;

            if (!transparent) {
              for (var k = 0; k < data.length; k += 4) {
                var a = data[k + 3] / 255;
                data[k] = Math.round(data[k] * a + bg[0] * (1 - a));
                data[k + 1] = Math.round(data[k + 1] * a + bg[1] * (1 - a));
                data[k + 2] = Math.round(data[k + 2] * a + bg[2] * (1 - a));
                data[k + 3] = 255;
              }
            }

            var bytes = new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
            if (!palette) {
              palette = transparent
                ? mod.quantize(bytes, 256, { format: "rgba4444", oneBitAlpha: true })
                : mod.quantize(bytes, 256);
            }
            var index = transparent
              ? mod.applyPalette(bytes, palette, "rgba4444")
              : mod.applyPalette(bytes, palette);
            var opts = { palette: palette, delay: delayMs, repeat: 0, dispose: transparent ? 2 : 1 };
            if (transparent) {
              opts.transparent = true;
              opts.transparentIndex = 0;
            }
            gif.writeFrame(index, region.w, region.h, opts);

            frame++;
            progress("导出中 " + Math.round(frame / frames * 100) + "%", Math.round(frame / frames * 100));
            if (frame < frames) {
              // 相位只由导出推进，且步长恒定 = 一轮 / 帧数
              app.animState.update(stepAnim);
              if (app.emotion && app.emotion.animation) app.emotion.state.update(stepAnim);
              requestAnimationFrame(capture);
              return;
            }

            var out2 = gif.bytes();
            var binary = "";
            for (var j = 0; j < out2.length; j += 0x4000) {
              binary += String.fromCharCode.apply(null, out2.subarray(j, j + 0x4000));
            }
            download("data:image/gif;base64," + btoa(binary), "spine_export.gif");
            done(true);
          }

          progress("导出中 0%", 0);
          capture();
        }).catch(function (err) {
          done(false, "导出失败：" + (err && err.message ? err.message : err));
        });
      });

      // =====================================================================
      // 对外跳转接口（GET）
      //   index.html?folder=illust&name=illust_akayuki
      //   index.html?folder=character&name=akayuki_2
      // folder 缺省或非法时按 name 猜：带 illust_ 前缀按立绘，否则按角色。
      // =====================================================================

      function readUrlTarget() {
        var query = String(location.search || "").replace(/^\?/, "");
        if (!query) return null;
        var out = {};
        query.split("&").forEach(function (pair) {
          if (!pair) return;
          var eq = pair.indexOf("=");
          var key = eq < 0 ? pair : pair.slice(0, eq);
          var value = eq < 0 ? "" : pair.slice(eq + 1).replace(/\+/g, " ");
          try {
            out[decodeURIComponent(key)] = decodeURIComponent(value);
          } catch (e) {
            out[key] = value;
          }
        });
        var folder = out.folder;
        if (folder !== "illust" && folder !== "character" && folder !== "custom") {
          if (!out.name) return null;
          folder = String(out.name).indexOf("illust_") === 0 ? "illust" : "character";
        }
        return { folder: folder, name: out.name || "" };
      }

      // =====================================================================
      // 启动
      // =====================================================================

      var disposed=false;
      window.addEventListener("gt-dispose",function(){disposed=true;app.abort?.abort();Object.keys(app.cache).forEach(function(k){disposeAtlas(app.cache[k].atlas);});});
      resizeCanvas();
      renderer.camera.update();
      setScale(1);
      $("speedValue").textContent = "×1.00";
      syncRegion(true);
      applyAutoDuration();
      requestAnimationFrame(render);

      var urlTarget = readUrlTarget();
      if (urlTarget) {
        $("folderSelector").value = urlTarget.folder;
        app.pendingTarget = urlTarget;
      }
      setFolder($("folderSelector").value);
    })();