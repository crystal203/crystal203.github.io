/**
 * 名片图 OCR —— 零依赖实现
 *
 * 为什么能做得简单：
 *   名片图是服务端用**同一个模板**渲染的，实测不同玩家尺寸完全恒定
 *   （900 x 3201 @ w600，6/6 相同），所以版面坐标固定，不需要通用 OCR。
 *
 * 实现分三层：
 *   1) decodePng()       —— 用内置 zlib 解 PNG（无第三方依赖）
 *   2) findTextBands()   —— 行投影找文字行（不写死 y 坐标，抗小幅位移）
 *   3) 模板匹配          —— 把每个数字归一化后与模板比对
 *
 * 模板的标注是**自监督**来的：接口虽然不再返回图鉴分项，但仍返回
 * guardianmasterylevel / rank-* / ghdmg / pt-slm / coopexpeditionlike，
 * 而这些值同时也渲染在图上 —— 于是"图上的某个数字"和"接口给的已知值"
 * 可以自动配对，用来生成数字模板，不需要人工标注。
 *
 * 用法：
 *   node card-ocr.mjs decode <file.png>        解码并打印基本信息
 *   node card-ocr.mjs bands  <file.png>        打印文字行分布（调试版面）
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

// ---------------- PNG 解码（8bit，灰/RGB/RGBA）----------------
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG');
  let off = 8;
  let w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  let palette = null, trns = null;

  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
      if (bitDepth !== 8) throw new Error('只支持 8bit，实际 ' + bitDepth);
    } else if (type === 'PLTE') palette = Buffer.from(data);
    else if (type === 'tRNS') trns = Buffer.from(data);
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (!w || !h) throw new Error('缺 IHDR');

  const chans = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : 4;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * chans;
  const out = Buffer.alloc(w * h * 4);       // 统一成 RGBA
  const line = Buffer.alloc(stride);
  const prev = Buffer.alloc(stride);
  let p = 0;

  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    raw.copy(line, 0, p, p + stride);
    p += stride;
    // 反过滤
    for (let i = 0; i < stride; i++) {
      const a = i >= chans ? line[i - chans] : 0;
      const b = prev[i];
      const c = i >= chans ? prev[i - chans] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      line[i] = v & 0xff;
    }
    // 写 RGBA
    for (let x = 0; x < w; x++) {
      let r, g, bl, al = 255;
      if (colorType === 0 || colorType === 4) {
        r = g = bl = line[x * chans];
        if (colorType === 4) al = line[x * chans + 1];
      } else if (colorType === 3) {
        const idx = line[x];
        r = palette[idx * 3]; g = palette[idx * 3 + 1]; bl = palette[idx * 3 + 2];
        if (trns && idx < trns.length) al = trns[idx];
      } else {
        r = line[x * chans]; g = line[x * chans + 1]; bl = line[x * chans + 2];
        if (colorType === 6) al = line[x * chans + 3];
      }
      const o = (y * w + x) * 4;
      out[o] = r; out[o + 1] = g; out[o + 2] = bl; out[o + 3] = al;
    }
    line.copy(prev);
  }
  return { w, h, data: out };
}

// 灰度（0-255）
export function toGray(img) {
  const g = new Uint8Array(img.w * img.h);
  for (let i = 0, n = img.w * img.h; i < n; i++) {
    const o = i * 4;
    g[i] = (img.data[o] * 299 + img.data[o + 1] * 587 + img.data[o + 2] * 114) / 1000 | 0;
  }
  return g;
}

/** 行投影：返回每行"暗像素"数量 */
export function rowDark(gray, w, h, thr = 128) {
  const rows = new Int32Array(h);
  for (let y = 0; y < h; y++) {
    let c = 0;
    const base = y * w;
    for (let x = 0; x < w; x++) if (gray[base + x] < thr) c++;
    rows[y] = c;
  }
  return rows;
}

/** 把行投影切成"文字带"（连续的暗像素行）*/
export function findTextBands(rows, minCount = 3, minHeight = 6, gap = 3) {
  const bands = [];
  let start = -1, blank = 0;
  for (let y = 0; y < rows.length; y++) {
    if (rows[y] >= minCount) {
      if (start < 0) start = y;
      blank = 0;
    } else if (start >= 0) {
      blank++;
      if (blank >= gap) {
        const end = y - blank;
        if (end - start + 1 >= minHeight) bands.push({ y0: start, y1: end, h: end - start + 1 });
        start = -1; blank = 0;
      }
    }
  }
  if (start >= 0) {
    const end = rows.length - 1;
    if (end - start + 1 >= minHeight) bands.push({ y0: start, y1: end, h: end - start + 1 });
  }
  return bands;
}

/** 在一个文字带内按列投影切出字形框 */
export function findGlyphs(gray, w, y0, y1, thr = 128, minW = 2, gap = 2) {
  const dark = new Int32Array(w);
  for (let x = 0; x < w; x++) {
    let c = 0;
    for (let y = y0; y <= y1; y++) if (gray[y * w + x] < thr) c++;
    dark[x] = c;
  }
  const boxes = [];
  let start = -1, blank = 0;
  for (let x = 0; x < w; x++) {
    if (dark[x] > 0) { if (start < 0) start = x; blank = 0; }
    else if (start >= 0) {
      blank++;
      if (blank >= gap) {
        const end = x - blank;
        if (end - start + 1 >= minW) boxes.push({ x0: start, x1: end, w: end - start + 1 });
        start = -1; blank = 0;
      }
    }
  }
  if (start >= 0) boxes.push({ x0: start, x1: w - 1, w: w - start });
  return boxes;
}

/** 把带内字形按大间隔分组成"列"（名片是两列网格） */
export function groupColumns(boxes, w, minGap = 60) {
  if (!boxes.length) return [];
  const groups = [[boxes[0]]];
  for (let i = 1; i < boxes.length; i++) {
    const prev = boxes[i - 1], cur = boxes[i];
    if (cur.x0 - prev.x1 >= minGap) groups.push([cur]);
    else groups[groups.length - 1].push(cur);
  }
  return groups;
}

/** 字形自身的墨水上下边界（字号无关的归一化必须用它，否则不同区块字号不同会对不上） */
export function glyphInkRange(gray, w, box, y0, y1, thr = 128) {
  let top = -1, bot = -1;
  for (let y = y0; y <= y1; y++) {
    let dark = false;
    for (let x = box.x0; x <= box.x1; x++) {
      if (gray[y * w + x] < thr) { dark = true; break; }
    }
    if (dark) { if (top < 0) top = y; bot = y; }
  }
  return top < 0 ? { y0, y1 } : { y0: top, y1: bot };
}

/** 把一个字形归一化成 GW x GH 的 0/1 位图。
 *
 *  归一化要点（都实测过）：
 *   1) 按字形**自身**的墨水范围归一化 —— 名片里"历史最高"区块字号约 25px、
 *      "图鉴"区块约 19px，不去掉尺度差异，同一套模板无法通用。
 *   2) **拉伸填满**整个 GW x GH，不保持宽高比。
 *      试过"按高度缩放 + 水平居中保留宽高比"，实测反而更差（数字被缩窄后
 *      大片留白，与别的数字的留白互相混淆）。拉伸之后每个数字都填满画布，
 *      形状差异被放大，反而分得开。
 */
export function sampleGlyph(gray, w, box, y0, y1, gw = 12, gh = 18) {
  const r = glyphInkRange(gray, w, box, y0, y1);
  const sw = box.x1 - box.x0 + 1, sh = r.y1 - r.y0 + 1;
  const out = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const sx = box.x0 + Math.floor((gx + 0.5) * sw / gw);
      const sy = r.y0 + Math.floor((gy + 0.5) * sh / gh);
      out[gy * gw + gx] = gray[sy * w + sx] < 128 ? 1 : 0;
    }
  }
  return out;
}

/** 把位图打包成 base64（模板文件用，比 JSON 数字数组小得多） */
export function packBits(bm) {
  const bytes = Buffer.alloc(Math.ceil(bm.length / 8));
  for (let i = 0; i < bm.length; i++) if (bm[i]) bytes[i >> 3] |= 1 << (i & 7);
  return bytes.toString('base64');
}

export function unpackBits(str, len) {
  const bytes = Buffer.from(str, 'base64');
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) if (bytes[i >> 3] & (1 << (i & 7))) out[i] = 1;
  return out;
}

export function loadTemplates(file) {
  const t = JSON.parse(fs.readFileSync(file, 'utf8'));
  // 兼容两种存法：只存平均模板（templates）或存全部样本（samples）
  t.glyphW = t.glyphW || 12;
  t.glyphH = t.glyphH || 18;
  return t;
}

/** 与模板比对，返回最佳数字与得分（1 - 归一化汉明距离） */
export function matchGlyph(bitmap, T) {
  const n = T.glyphW * T.glyphH;
  const pool = T.templates || T.samples;
  let best = { digit: '?', score: -1 };
  for (const d of Object.keys(pool)) {
    const list = Array.isArray(pool[d]) ? pool[d] : [pool[d]];
    for (const item of list) {
      const tpl = typeof item === 'string' ? unpackBits(item, n) : item;
      let diff = 0;
      for (let i = 0; i < n; i++) diff += (bitmap[i] !== tpl[i]) ? 1 : 0;
      const score = 1 - diff / n;
      if (score > best.score) best = { digit: d, score };
    }
  }
  return best;
}

/** 识别一串字形里的数字（跳过符号/汉字），返回 { text, scores } */
export function readDigits(gray, w, glyphs, y0, y1, T) {
  const out = [];
  const scores = [];
  for (const box of glyphs) {
    const bm = sampleGlyph(gray, w, box, y0, y1, T.glyphW, T.glyphH);
    // 太窄的当作小数点/分隔符，不当数字
    if (box.w <= 3) { out.push('.'); scores.push(1); continue; }
    const m = matchGlyph(bm, T);
    out.push(m.digit);
    scores.push(m.score);
  }
  return { text: out.join(''), scores };
}

// ---------------- 生产版：整张名片提取 ----------------
//
// 版面映射（实测不同玩家尺寸完全恒定 900x3201，见 ocr-layout-map.mjs）：
//   #3/#5/#7   历史最高 6 格（接口仍返回，可用于自检）
//   #10/#12    其他资料（协力伤害 / 史莱姆分数 / 点赞 / 守护者精通等级）
//   #15 #17    图鉴总和（不算精通）：攻击 / 防御 / 生命
//   #20 #22    英雄图鉴：攻击 / 防御 / 生命
//   #25 #27 #29 道具羁绊装备图鉴：道具攻/生、道具防/装备攻、装备生/装备防
//   #32 #34    守护者等级：攻击 / 生命 / 防御
//   #37        浮游城：攻击塔 / 生命塔
//   #40 #41 #43 #44  守护者精通矩阵（战士/射手 与 坦克/辅助）
//
// 注意：`%` 也会被当成一个字形的宽度读出来，所以"百分比"的读取是
// "读完整列、丢掉最后一个字形（那就是 %）"，剩下的解析成数字。
const FIELD_MAP = [
  [15, 0, 'atkTotal'], [15, 1, 'defTotal'], [17, 0, 'hpTotal'],
  [20, 0, 'heroAtk'], [20, 1, 'heroDef'], [22, 0, 'heroHp'],
  [25, 0, 'itemAtkBond'], [25, 1, 'itemHpBond'],
  [27, 0, 'itemDefBond'], [27, 1, 'gearAtk'],
  [29, 0, 'gearHp'], [29, 1, 'gearDef'],
  [32, 0, 'gdAtk'], [32, 1, 'gdHp'], [34, 0, 'gdDef'],
  [37, 0, 'towerAtk'], [37, 1, 'towerHp'],
];
// 精通矩阵：每条带 4 列，每列是"汉字标签 + 数字"
const MASTERY_MAP = [
  [40, ['warriorAtk', 'warriorSkill', 'archerAtk', 'archerSkill']],
  [41, ['warriorHp', 'warriorDef', 'archerHp', 'archerDef']],
  [43, ['tankAtk', 'tankSkill', 'supportAtk', 'supportSkill']],
  [44, ['tankHp', 'tankDef', 'supportHp', 'supportDef']],
];

/** 把每一带切成列（列间用大间隔 60px 分隔），并记下每个字形的水墨高度。
 *  水墨高度是区分"汉字 / 数字"的关键：实测同一带里数字明显更矮
 *  （精通网格：数字 15，汉字 18-19；等级带：数字 19，汉字 23-24）。
 *  只按宽度分不行 —— 有些汉字（如"御"）会被切成窄块，混进数字里。 */
export function bandsToColumns(gray, w, h) {
  const bands = findTextBands(rowDark(gray, w, h));
  return bands.map(bd => {
    const gs = findGlyphs(gray, w, bd.y0, bd.y1);
    const cols = [];
    let cur = [];
    const push = box => {
      const ink = glyphInkRange(gray, w, box, bd.y0, bd.y1);
      cur.push({ x0: box.x0, x1: box.x1, w: box.w, ih: ink.y1 - ink.y0 + 1 });
    };
    for (const box of gs) {
      if (cur.length && box.x0 - cur[cur.length - 1].x1 >= 60) { cols.push(cur); cur = []; }
      push(box);
    }
    if (cur.length) cols.push(cur);
    return { y0: bd.y0, y1: bd.y1, h: bd.h, cols };
  });
}

/** 数字/小数点字形：水墨高度明显小于带高就当数字（用来排除混在列里的汉字）。
 *
 *  但**图鉴那几个区块的数字本身就是满高**（ih = 带高 = 19），此时严格过滤会
 *  把数字也滤掉 —— 所以做成自适应：滤完为空就退回全列。
 *  这样做是安全的：百分比列已经按位置丢掉了末尾的 `%`，剩下的本来就都是数字。 */
const digitGlyphs = (col, bandH) => {
  const strict = col.filter(b => b.ih <= bandH - 3);
  // 小数点（极矮）不算"筛出了有效数字"，否则会因为只筛出一个小数点而不回退
  const usable = strict.filter(b => b.ih >= 8);
  return usable.length ? strict : col;
};

/** 把 OCR 文本解析成数字（容忍读出来的前导/尾随小数点、以及混进来的符号） */
function parseNum(text) {
  const s = text.replace(/[^0-9.]/g, '').replace(/^\.+/, '').replace(/\.+$/, '');
  if (!s) return null;
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : null;
}

/** 读一个百分比：先丢掉最后一个字形（那是 %），再按水墨高度筛出数字 */
function readPercent(gray, w, col, y0, y1, bandH, T) {
  const body = col.slice(0, Math.max(0, col.length - 1));
  const digits = digitGlyphs(body, bandH);
  if (!digits.length) return null;
  return parseNum(readDigits(gray, w, digits, y0, y1, T).text);
}

/** 读一个整数：按水墨高度筛出数字（汉字标签自然被排除） */
function readInt(gray, w, col, y0, y1, bandH, T) {
  const digits = digitGlyphs(col, bandH);
  if (!digits.length) return null;
  return parseNum(readDigits(gray, w, digits, y0, y1, T).text);
}

/**
 * 从一张名片 PNG 里提取全部字段。
 * 返回 { fields, mastery, anchors, ok, reason }
 *   anchors 是接口仍返回、可用于自检的那几个值（图上也有）。
 */
export function extractCard(pngBuffer, T) {
  const img = decodePng(pngBuffer);
  const gray = toGray(img);
  const bands = bandsToColumns(gray, img.w, img.h);

  if (bands.length < 45) {
    return { ok: false, reason: '版面不符合预期（文字带 ' + bands.length + ' 条，期望 ≥45）', fields: null, mastery: null };
  }

  const fields = {};
  const missing = [];
  for (const [bi, ci, name] of FIELD_MAP) {
    const band = bands[bi];
    const col = band && band.cols[ci];
    const v = col ? readPercent(gray, img.w, col, band.y0, band.y1, band.h, T) : null;
    if (v == null) missing.push(name);
    else fields[name] = v;
  }

  const mastery = {};
  for (const [bi, names] of MASTERY_MAP) {
    const band = bands[bi];
    if (!band) continue;
    names.forEach((nm, i) => {
      const col = band.cols[i];
      const v = col ? readInt(gray, img.w, col, band.y0, band.y1, band.h, T) : null;
      if (v != null) mastery[nm] = v;
    });
  }

  // 接口仍返回、可用来自检的锚点
  const A = (bi, ci) => readInt(gray, img.w, bands[bi].cols[ci], bands[bi].y0, bands[bi].y1, bands[bi].h, T);
  const anchors = {
    rank44: A(3, 0), rank33: A(3, 1),
    rankChampion: A(5, 0), rankDeath: A(5, 1),
    rankTower: A(7, 0), rankTts: A(7, 1),
    like: A(12, 0), gml: A(12, 1),
  };

  return {
    ok: missing.length === 0,
    reason: missing.length ? '有字段没读出来：' + missing.join(',') : null,
    fields, mastery, anchors,
    size: { w: img.w, h: img.h },
  };
}

// ---------------- CLI 调试 ----------------
const isMain = process.argv[1] && process.argv[1].endsWith('card-ocr.mjs');
if (isMain) {
  const cmd = process.argv[2];
  const file = process.argv[3];
  if (cmd === 'extract') {
    const T = loadTemplates('D:/github/new44/ocr-templates.json');
    const r = extractCard(fs.readFileSync(file), T);
    console.log(JSON.stringify(r, null, 1));
  } else if (cmd === 'decode' || cmd === 'bands' || cmd === 'glyphs') {
    const img = decodePng(fs.readFileSync(file));
    const gray = toGray(img);
    const rows = rowDark(gray, img.w, img.h);
    const bands = findTextBands(rows);
    console.log('图像 ' + img.w + 'x' + img.h + '   文字带 ' + bands.length + ' 条');
    if (cmd === 'bands') {
      bands.forEach((b, i) => {
        const maxDark = Math.max.apply(null, Array.from(rows.subarray(b.y0, b.y1 + 1)));
        console.log('  #' + String(i).padStart(3) + '  y ' + String(b.y0).padStart(4) + '..' + String(b.y1).padStart(4)
          + '  h=' + String(b.h).padStart(3) + '  峰值=' + maxDark);
      });
    } else if (cmd === 'glyphs') {
      bands.forEach((b, i) => {
        const boxes = findGlyphs(gray, img.w, b.y0, b.y1);
        const cols = groupColumns(boxes, img.w);
        const desc = cols.map(g => '[' + g.length + '字形 ' + g[0].x0 + '..' + g[g.length - 1].x1 + ']').join(' ');
        console.log('  #' + String(i).padStart(3) + ' y' + String(b.y0).padStart(4) + ' h' + String(b.h).padStart(3)
          + '  字形' + String(boxes.length).padStart(3) + '  列: ' + desc);
      });
    }
  } else {
    console.log('用法: node card-ocr.mjs decode|bands|glyphs <file.png>');
  }
}
