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

/** 把一个字形归一化成 GW x GH 的**灰度墨水**值（0=白底，255=最黑）。
 *
 *  为什么用灰度而不是二值：
 *   上游调小字号后，`8` 中间那一横只有约 1 像素，二值化（阈值 128）很容易把它抹掉，
 *   于是 `0` 和 `8` 分不开（实测 0 被读成 8）。灰度保留了笔画浓淡，能分开。
 *
 *  归一化要点（都实测过）：
 *   1) 按字形**自身**的墨水范围归一化 —— 不同区块字号不同，不去掉尺度差异就没法共用模板。
 *   2) **拉伸填满**整个 GW x GH，不保持宽高比。
 *      试过"按高度缩放 + 水平居中保留宽高比"，实测反而更差。
 */
export function sampleGlyph(gray, w, box, y0, y1, gw = 16, gh = 24) {
  const r = glyphInkRange(gray, w, box, y0, y1);
  const sw = box.x1 - box.x0 + 1, sh = r.y1 - r.y0 + 1;
  const out = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const sx = box.x0 + Math.floor((gx + 0.5) * sw / gw);
      const sy = r.y0 + Math.floor((gy + 0.5) * sh / gh);
      out[gy * gw + gx] = 255 - gray[sy * w + sx];   // 反相：墨=255
    }
  }
  return out;
}

/** 打包成 base64（模板文件用，比 JSON 数字数组小得多） */
export function packBytes(arr) {
  return Buffer.from(arr).toString('base64');
}

export function unpackBytes(str, len) {
  const b = Buffer.from(str, 'base64');
  const out = new Uint8Array(len);
  out.set(b.subarray(0, Math.min(len, b.length)));
  return out;
}

export function loadTemplates(file) {
  const t = JSON.parse(fs.readFileSync(file, 'utf8'));
  t.glyphW = t.glyphW || 16;
  t.glyphH = t.glyphH || 24;
  return t;
}

/** 灰度 L1 匹配：返回最佳数字与得分（1 - 平均灰度差/255） */
export function matchGlyph(bitmap, T) {
  const n = T.glyphW * T.glyphH;
  const pool = T.templates || {};
  let best = { digit: '?', score: -1 };
  for (const d of Object.keys(pool)) {
    const raw = pool[d];
    const list = Array.isArray(raw) ? raw : [raw];
    for (const item of list) {
      const tpl = typeof item === 'string' ? unpackBytes(item, n) : item;
      let diff = 0;
      for (let i = 0; i < n; i++) diff += Math.abs(bitmap[i] - tpl[i]);
      const score = 1 - diff / n / 255;
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

/** 与"汉字模板"比对（T.chars）。区块标题用它读，和数字模板分开，互不干扰。 */
export function matchChar(bm, T) {
  const n = T.glyphW * T.glyphH;
  let best = { ch: '?', score: -1 };
  const pool = T.chars || {};
  for (const ch of Object.keys(pool)) {
    // ⚠️ 模板可能是"一个 base64 串"也可能是"串的数组"。
    //    直接 for...of 一个字符串会遍历它的**每个字符**，解出来全是垃圾
    //    （踩过：所有标题都被读成同一个字）。
    const raw = pool[ch];
    const list = Array.isArray(raw) ? raw : [raw];
    for (const item of list) {
      const s = typeof item === 'string' ? unpackBytes(item, n) : item;
      let diff = 0;
      for (let i = 0; i < n; i++) diff += Math.abs(bm[i] - s[i]);
      const score = 1 - diff / n / 255;
      if (score > best.score) best = { ch, score };
    }
  }
  return best;
}

/** 把一串字形读成汉字串（区块标题用） */
export function readChars(gray, w, glyphs, y0, y1, T) {
  let out = '';
  let sum = 0;
  for (const box of glyphs) {
    const bm = sampleGlyph(gray, w, box, y0, y1, T.glyphW, T.glyphH);
    const m = matchChar(bm, T);
    out += m.ch;
    sum += m.score;
  }
  return { text: out, score: glyphs.length ? sum / glyphs.length : 0 };
}

// ---------------- 生产版：整张名片提取 ----------------
//
// ⚠️ 上游有两个会造成错位的改动，都踩过：
//   1) 加标题栏、调字号 —— 图高从 900x3201 → 900x2865（序号整体后移一位）
//   2) **按玩家数据省略区块** —— 没有精通数据的玩家会整块省掉「守护者精通」，
//      图高变成 2456 / 2159，带数 46 / 39 / 34。固定序号在这里会整体串行。
//
// 所以改成**按区块标题定位**：
//   - 区块标题的特征很明确：只有 1 列、左对齐（x0 < 60）、高度 ≤30（名字行更高）、
//     字形数 3~8（顶部标题栏 23 个、名字行 9~12 个，都不在这个范围）
//   - 区块按出现顺序与已知顺序一一对应：历史最高 / 其他资料 / 图鉴总和 /
//     英雄图鉴 / 道具装备图鉴 / 守护者等级 / 浮游城 / 守护者精通（可缺）
//   - 每个区块内，值带在 标题+2、+4、+6…（标签带、值带交替）
//   - 守护者精通是网格：标题+1 表头，标题+2/+3 与 +5/+6 是数值行
//
// 这样插标题栏、调字号、省略尾部区块都不影响。
//
// 注意：`%` 也会被当成一个字形读出来，所以"百分比"的读取是
// "读完整列、丢掉最后一个字形（那就是 %）"，剩下的解析成数字。
const SECTIONS = [
  { // 历史最高
    rows: [
      [['rank44'], ['rank33']],
      [['rankChampion'], ['rankDeath']],
      [['rankTower'], ['rankTts']],
    ],
  },
  { // 其他资料（第 1 行是协力伤害/史莱姆分数，用不上）
    rows: [
      [[''], ['']],
      [['like'], ['gml']],
    ],
  },
  { rows: [[['atkTotal'], ['defTotal']], [['hpTotal'], ['']]] },                                   // 图鉴总和
  { rows: [[['heroAtk'], ['heroDef']], [['heroHp'], ['']]] },                                      // 英雄图鉴
  { rows: [[['itemAtkBond'], ['itemHpBond']], [['itemDefBond'], ['gearAtk']], [['gearHp'], ['gearDef']]] }, // 道具装备图鉴
  { rows: [[['gdAtk'], ['gdHp']], [['gdDef'], ['']]] },                                            // 守护者等级
  { rows: [[['towerAtk'], ['towerHp']]] },                                                         // 浮游城
];

// 守护者精通的 4 个数值行（每条带 4 列）
const MASTERY_ROWS = [
  ['warriorAtk', 'warriorSkill', 'archerAtk', 'archerSkill'],
  ['warriorHp', 'warriorDef', 'archerHp', 'archerDef'],
  ['tankAtk', 'tankSkill', 'supportAtk', 'supportSkill'],
  ['tankHp', 'tankDef', 'supportHp', 'supportDef'],
];


/** 把每一带切成列（列间用大间隔 60px 分隔），并记下每个字形的水墨高度。
 *  水墨高度是区分"汉字 / 数字"的关键：实测同一带里数字明显更矮
 *  （精通网格：数字 15，汉字 18-20；等级带：数字 19，汉字 23-24）。
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

/** 找出"看起来像区块标题"的带：1 列、左对齐、不太高、字形数 3~8。
 *  这只是**候选**，真正的区块识别是把标题文字读出来再比对（见 identifySection）。 */
function findTitleCandidates(bands) {
  const out = [];
  bands.forEach((b, i) => {
    if (b.cols.length !== 1) return;
    const col = b.cols[0];
    if (col.length < 3 || col.length > 8) return;   // 区块标题 3~6 个字
    if (col[0].x0 >= 60) return;                    // 必须左对齐
    if (b.h > 30) return;                           // 名字行更高
    out.push(i);
  });
  return out;
}

// 区块标题全集。上游按玩家数据省略区块（实测 19/26/34/39/46 带的版面都有），
// 所以**不能按出现顺序对应**，必须把标题读出来认。
const KNOWN_TITLES = ['历史最高', '其他资料', '图鉴总和', '英雄图鉴', '道具装备图鉴', '守护者等级', '浮游城', '守护者精通'];
// 各标题 → 上表的索引（用于取字段定义）；图鉴总和与图鉴总和（不算精通）是同一个
const TITLE_INDEX = {
  '历史最高': 0, '其他资料': 1, '图鉴总和': 2,
  '英雄图鉴': 3, '道具装备图鉴': 4,
  '守护者等级': 5, '浮游城': 6, '守护者精通': 7,
};

/** 把读出来的标题串归一到 KNOWN_TITLES 里的某一个（容忍个别字读错） */
function identifySection(text) {
  if (!text) return -1;
  if (TITLE_INDEX[text] != null) return TITLE_INDEX[text];
  // 模糊：按相同字符数最多者
  let best = -1, bestHit = 0;
  for (const t of KNOWN_TITLES) {
    let n = 0;
    for (let i = 0; i < Math.min(t.length, text.length); i++) if (t[i] === text[i]) n++;
    if (n > bestHit) { bestHit = n; best = TITLE_INDEX[t]; }
  }
  // 至少要认出 2 个字，否则宁可判为未知（避免把区块认错、字段全串）
  return bestHit >= 2 ? best : -1;
}

/** 数字/小数点字形：水墨高度明显小于本列最高的那些，就当数字（用来排除混在列里的汉字）。
 *
 *  ⚠️ 判据用**本列自身的最大水墨高**，不要用带高 ——
 *     带高会受"这一列里最高的那个字形"影响，遇到「第0」这种
 *     只有两个字形、一高一矮的情况反而不稳。
 *
 *  而**图鉴那几个区块的数字本身就是满高**，此时严格过滤会把数字也滤掉 ——
 *  所以做成自适应：滤完为空就退回全列。
 *  这样做是安全的：百分比列已经按位置丢掉了末尾的 `%`，剩下的本来就都是数字。 */
const digitGlyphs = (col /*, bandH */) => {
  let maxIh = 0;
  for (const b of col) if (b.ih > maxIh) maxIh = b.ih;
  const strict = col.filter(b => b.ih <= maxIh - 3);
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

/** 在一个字形框**内部**按更小的列间隔再切一次。
 *  用途：`%` 有时会和最后一个数字粘成一段（宽度约 27，而数字仅 9-11、% 约 15），
 *  整段丢掉会把数字一起丢（踩过：`7.2%` 读成 `7`）。 */
function splitBox(gray, w, box, y0, y1, gap = 1) {
  const dark = [];
  for (let x = box.x0; x <= box.x1; x++) {
    let c = 0;
    for (let y = y0; y <= y1; y++) if (gray[y * w + x] < 128) c++;
    dark.push(c);
  }
  const out = [];
  let start = -1, blank = 0;
  for (let i = 0; i < dark.length; i++) {
    if (dark[i] > 0) { if (start < 0) start = i; blank = 0; }
    else if (start >= 0) {
      blank++;
      if (blank >= gap) {
        const end = i - blank;
        out.push({ x0: box.x0 + start, x1: box.x0 + end, w: end - start + 1 });
        start = -1; blank = 0;
      }
    }
  }
  if (start >= 0) out.push({ x0: box.x0 + start, x1: box.x1, w: box.x1 - (box.x0 + start) + 1 });
  return out;
}

/** 读一个百分比。
 *
 *  `%` 的处理是这里的关键：它有时是独立的一段（宽约 15），
 *  有时会和最后一个数字**粘成一段**（宽约 27）。无脑丢掉最后一段会把数字一起丢掉，
 *  所以按宽度判断：
 *    最后一段 w >= 20  → 数字+% 粘连 → 在框内重切，只丢最右那段（%）
 *    最后一段 w >= 13  → 独立的就是 % → 丢掉
 *    否则              → 没有 %，不动
 */
function readPercent(gray, w, col, y0, y1, bandH, T) {
  let body = col.slice();
  const last = body[body.length - 1];
  if (last && last.w >= 20) {
    const sub = splitBox(gray, w, last, y0, y1);
    if (sub.length >= 2) body = body.slice(0, -1).concat(sub.slice(0, -1));
  } else if (last && last.w >= 13) {
    body = body.slice(0, -1);
  }
  const digits = digitGlyphs(body, bandH);
  if (!digits.length) return null;
  return parseNum(readDigits(gray, w, digits, y0, y1, T).text);
}

/** 判断一个字形框是不是"占位块"。
 *
 *  上游对**没有数据**的格子不画数字，画的是一个填满的浅灰块。
 *  不识别它的话，低置信匹配会硬猜一个数字
 *  （踩过：占位块被读成 8，分数只有 0.74，而真数字是 0.93+）。
 *
 *  ⚠️ 判据是"**有没有白底**"，不是"够不够黑"：
 *     实测卡面文字最深只有灰 102（maxInk 恒为 153，从不纯黑），按最大墨量判会
 *     把真数字一起误判。而最小墨量分得很干净：
 *       真数字  minInk ≈ 6    （框内有白底）
 *       占位块  minInk ≈ 110  （整块填满）
 *
 *  返回 true 表示"这不是字，是占位块"。 */
export function isPlaceholder(gray, w, box, y0, y1, minInkThr = 60) {
  const r = glyphInkRange(gray, w, box, y0, y1);
  let minInk = 255;
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const ink = 255 - gray[y * w + x];
      if (ink < minInk) minInk = ink;
      if (minInk <= minInkThr) return false;   // 框内有白底 → 是真字
    }
  }
  return true;   // 整块填满、没有白底 → 占位块
}

/** 读一个整数（「第N名」「等级.N」「攻击42」这类）。
 *
 *  ⚠️ 用**宽度**筛数字，不要用高度：汉字 w≈19-23、数字 w≈7-13，差得很开；
 *     而水墨高度在「第0名」这种列里汉字和数字几乎一样高，筛不出来。
 *  滤完为空就退回全列，避免把纯数字列滤空。 */
function readInt(gray, w, col, y0, y1, bandH, T) {
  const narrow = col.filter(b => b.w <= 14);
  const use = narrow.length ? narrow : col;
  // 整列都是占位块 → 这个格子没有数据，别猜
  if (use.every(b => isPlaceholder(gray, w, b, y0, y1))) return null;
  return parseNum(readDigits(gray, w, use, y0, y1, T).text);
}

/**
 * 从一张名片 PNG 里提取全部字段。
 * 返回 { fields, mastery, anchors, ok, reason, sections, bandCount, size }
 */
export function extractCard(pngBuffer, T) {
  const img = decodePng(pngBuffer);
  const gray = toGray(img);
  const bands = bandsToColumns(gray, img.w, img.h);

  // 1) 候选标题带 → 读标题文字 → 认出是哪个区块
  const cands = findTitleCandidates(bands);
  const found = [];                 // [{ sec, band }]
  const unknown = [];
  for (const bi of cands) {
    const band = bands[bi];
    const col = band.cols[0];
    const r = readChars(gray, img.w, col, band.y0, band.y1, T);
    const sec = identifySection(r.text);
    if (sec >= 0) found.push({ sec, band: bi, text: r.text });
    else unknown.push({ band: bi, text: r.text });
  }

  const secOf = {};
  found.forEach(f => { if (secOf[f.sec] == null) secOf[f.sec] = f.band; });

  if (Object.keys(secOf).length < 3) {
    return {
      ok: false, fields: null, mastery: null, anchors: {},
      reason: '版面不符合预期：只认出 ' + Object.keys(secOf).length + ' 个区块（标题读作 '
        + found.map(f => f.text).join('/') + (unknown.length ? '，另有未知 ' + unknown.map(u => u.text).join('/') : '') + '）',
      size: { w: img.w, h: img.h }, bandCount: bands.length, sections: found.map(f => f.text),
    };
  }

  const fields = {};
  const missing = [];
  const readAt = (bandIdx, ci, mode) => {
    const band = bands[bandIdx];
    if (!band) return null;
    const col = band.cols[ci];
    if (!col) return null;
    return mode === 'int'
      ? readInt(gray, img.w, col, band.y0, band.y1, band.h, T)
      : readPercent(gray, img.w, col, band.y0, band.y1, band.h, T);
  };

  // 2) 逐个已识别区块，读它的值带（标题+2、+4、+6…）
  SECTIONS.forEach((def, sec) => {
    const t = secOf[sec];
    if (t == null) return;                       // 这个区块被上游省略了
    const mode = sec <= 1 ? 'int' : 'pct';       // 历史最高/其他资料是整数，其余是百分比
    def.rows.forEach((row, j) => {
      row.forEach((names, ci) => {
        const name = names[0];
        if (!name) return;
        const v = readAt(t + 2 * (j + 1), ci, mode);
        if (v == null) missing.push(name);
        else fields[name] = v;
      });
    });
  });

  // 3) 守护者精通（网格：标题+1 表头，数值行在 +2/+3，第二组表头 +4，数值行 +5/+6）
  const mastery = {};
  const mt = secOf[7];
  if (mt != null) {
    const offsets = [2, 3, 5, 6];
    MASTERY_ROWS.forEach((names, j) => {
      const band = bands[mt + offsets[j]];
      if (!band) return;
      names.forEach((nm, ci) => {
        const col = band.cols[ci];
        const v = col ? readInt(gray, img.w, col, band.y0, band.y1, band.h, T) : null;
        if (v != null) mastery[nm] = v;
      });
    });
  }

  // 4) 接口仍返回、图上也有 → 可用于自检
  const ANCHOR_KEYS = ['rank44', 'rank33', 'rankChampion', 'rankDeath', 'rankTower', 'rankTts', 'like', 'gml'];
  const anchors = {};
  ANCHOR_KEYS.forEach(k => { if (fields[k] != null) anchors[k] = fields[k]; });

  return {
    ok: missing.length === 0,
    reason: missing.length ? '有字段没读出来：' + missing.join(',') : null,
    fields, mastery, anchors,
    sections: found.map(f => f.text),
    unknownTitles: unknown.map(u => u.text),
    bandCount: bands.length,
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
