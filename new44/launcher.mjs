/**
 * gt-toolbox launcher
 *
 * 一份代码，两种形态自动适配：
 *
 *   仓库形态（本文件在 new44/ 下）
 *       站点根 = 上一级（仓库根），因为 new44/index.html 要在 iframe 里加载 ../gt.html
 *   打包形态（本文件在 gt-toolbox/ 下）
 *       站点根 = 同级的 site/ 目录
 *
 * 判断依据：同级有没有 site/ 目录。
 *
 * 它起两个监听（都只绑 127.0.0.1）：
 *   8000  静态文件
 *   8799  API 代理 —— 这个才是关键：
 *         接口会校验请求来源（Referer/Origin 必须是白名单域名），
 *         而浏览器不允许网页设置这两个头，所以必须由服务端转发。
 *         页面检测到自己跑在 localhost，会自动把请求发到 8799。
 *
 * 用法:  node launcher.mjs [--port 8000]      或双击 launch.bat
 */
import { createServer } from 'node:http';
// 注意：readFile / stat 必须来自 node:fs/promises。
// 从 node:fs 引入的是回调版，无回调调用会直接抛错（曾因此全部 404）。
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));

// 打包形态同级有 site/；否则是仓库形态，站点根为上一级
const PACKAGED = existsSync(join(HERE, 'site'));
const SITE_ROOT = PACKAGED ? join(HERE, 'site') : join(HERE, '..');

// 不要读 process.env.PORT：某些环境会全局设置它（CI、编辑器、托管 shell），
// 会静默撞上无关服务。用命令行参数，并且端口被占用时自动往后退。
const argPort = (() => {
  const i = process.argv.indexOf('--port');
  if (i >= 0 && process.argv[i + 1]) return Number(process.argv[i + 1]);
  const m = process.argv.find((a) => /^--port=\d+$/.test(a));
  return m ? Number(m.split('=')[1]) : 8000;
})();
const PORT = Number.isFinite(argPort) && argPort > 0 ? argPort : 8000;
// 页面里硬编码了这个端口，不能改，只用于提示
const PROXY_PORT = 8799;

const UPSTREAM = 'https://open.ww2.ren';
const UPSTREAM_REFERER = 'https://gtlc.ww2.ren/';
// 兜底 UA 必须是完整的浏览器 UA：上游会把极简 UA（如 "Mozilla/5.0"）判为非法调用。
// 页面正常会带真实浏览器 UA，这里只在缺失时兜底。
const FALLBACK_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.mp3': 'audio/mpeg',
};

// ---------------------------------------------------------------- API proxy
//
// 三条路径：
//   /api/gt-top     透传 JSON 接口（现在返回明文了，不再需要解密）
//   /api/card-image 下载玩家名片图 —— 请求由服务端发出，所以**不受**浏览器跨源规则
//                   约束（CORP / Referer 防盗链 / cookie 门禁都拦不住它），
//                   是网页直连 <img> 之外的可靠路径
//   /api/card-ocr   OCR：把名片图读成结构化数值（图鉴分项只有图里有，见下方说明）
//
// 关于 OCR：名片图里包含接口已经不返回的分项数据（图鉴加成、守护者等级、浮游城、
// 精通矩阵），所以这些只能从图上读。实现见 card-ocr.mjs。

// ---------------- OCR（名片图 → 结构化数值）----------------
//
// 背景：接口现在只返回 17 个字段，图鉴分项（图鉴加成 / 守护者等级 / 浮游城 /
// 精通矩阵）**只有名片图里有**，所以这些数据必须从图上读。
//
// 实现见 card-ocr.mjs：PNG 用内置 zlib 解，版面固定（实测 900x3201 恒定），
// 数字识别用模板匹配；模板是**自监督**生成的 —— 接口仍返回的 rank-* /
// guardianmasterylevel / coopexpeditionlike 同时也渲染在图上，两者自动配对，
// 不需要人工标注。实测 112/112 已知值全部读对。
import { extractCard, loadTemplates } from './card-ocr.mjs';

const TEMPLATES_PATH = join(SITE_ROOT, 'new44', 'ocr-templates.json');
let OCR_TEMPLATES = null;
let OCR_ERROR = null;
try {
  OCR_TEMPLATES = loadTemplates(TEMPLATES_PATH);
} catch (e) {
  OCR_ERROR = '模板加载失败（' + TEMPLATES_PATH + '）：' + e.message;
}

const IMG_HEADERS = () => ({
  'User-Agent': FALLBACK_UA,
  Accept: 'image/avif,image/webp,image/png,*/*',
  Referer: UPSTREAM_REFERER,
});

// ext="webp" 给人看（小），ext="png" 给 OCR 用（Node 侧能解）
function cardImageUrl(uuid, ch, name, ext = 'webp') {
  return UPSTREAM + '/screenshot/data_card/w600/img.' + ext
    + '?uuid=' + encodeURIComponent(uuid || '') + '&ch=' + encodeURIComponent(ch || 'cn')
    + '&name=' + encodeURIComponent(name || '') + '&hide=1&diytheme=light';
}

function startProxy() {
  createServer(async (req, res) => {
    const cors = {
      'Access-Control-Allow-Origin': req.headers.origin || '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '600',
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }

    const u = new URL(req.url, 'http://127.0.0.1');

    // ---- 名片图（服务端下载，不受跨源规则约束）----
    if (u.pathname === '/api/card-image') {
      const name = u.searchParams.get('name') || '';
      try {
        const up = await fetch(cardImageUrl(u.searchParams.get('uuid'), u.searchParams.get('ch'), name), { headers: IMG_HEADERS() });
        const buf = Buffer.from(await up.arrayBuffer());
        res.writeHead(up.status, {
          ...cors,
          'Content-Type': up.headers.get('content-type') || 'image/webp',
          'Content-Length': buf.length,
          'Cache-Control': 'public, max-age=86400',
        });
        res.end(buf);
        console.log('  [img] ' + up.status + '  ' + (buf.length / 1024).toFixed(0) + 'KB  ' + name);
      } catch (e) {
        res.writeHead(502, { ...cors, 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('image proxy error: ' + e.message);
        console.log('  [img] 502  ' + e.message);
      }
      return;
    }

    // ---- OCR：名片图 → 结构化数值 ----
    if (u.pathname === '/api/card-ocr') {
      const name = u.searchParams.get('name') || '';
      if (!OCR_TEMPLATES) {
        res.writeHead(501, { ...cors, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, reason: OCR_ERROR }));
        return;
      }
      try {
        const t0 = Date.now();
        // OCR 必须用 PNG —— Node 侧的解码器只解 PNG（webp 没有内置解码器）
        const up = await fetch(cardImageUrl(u.searchParams.get('uuid'), u.searchParams.get('ch'), name, 'png'), { headers: IMG_HEADERS() });
        if (!up.ok) throw new Error('上游返回 ' + up.status);
        const buf = Buffer.from(await up.arrayBuffer());
        const r = extractCard(buf, OCR_TEMPLATES);
        r.ms = Date.now() - t0;
        res.writeHead(r.ok ? 200 : 500, { ...cors, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(r));
        console.log('  [ocr] ' + (r.ok ? 'ok' : '失败') + '  ' + (r.ms) + 'ms  ' + name);
      } catch (e) {
        res.writeHead(502, { ...cors, 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, reason: String((e && e.message) || e) }));
        console.log('  [ocr] 502  ' + e.message);
      }
      return;
    }

    // ---- JSON 接口透传 ----
    if (!req.url.startsWith('/api/')) {
      res.writeHead(404, { ...cors, 'Content-Type': 'text/plain' });
      res.end('only /api/* is proxied');
      return;
    }
    try {
      const up = await fetch(UPSTREAM + req.url, {
        headers: {
          Referer: UPSTREAM_REFERER,
          Origin: UPSTREAM_REFERER.replace(/\/$/, ''),
          // 固定用浏览器 UA，不透传调用方的：
          // 上游只认"完整浏览器 UA"，透传会让 curl / PowerShell 这类调用方一律 403。
          'User-Agent': FALLBACK_UA,
          Accept: '*/*',
        },
      });
      const buf = Buffer.from(await up.arrayBuffer());
      res.writeHead(up.status, {
        ...cors,
        'Content-Type': up.headers.get('content-type') || 'application/json; charset=utf-8',
      });
      res.end(buf);
      console.log('  [api] ' + up.status + '  ' + req.url.slice(0, 96));
    } catch (e) {
      res.writeHead(502, { ...cors, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('proxy error: ' + e.message);
      console.log('  [api] 502  ' + e.message);
    }
  }).listen(PROXY_PORT, '127.0.0.1', () => {
    console.log('  api  proxy : http://127.0.0.1:' + PROXY_PORT + '/api/gt-top');
    console.log('               http://127.0.0.1:' + PROXY_PORT + '/api/card-image');
    console.log('               http://127.0.0.1:' + PROXY_PORT + '/api/card-ocr   (OCR 未接入)');
  }).on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.log('  api  proxy : port ' + PROXY_PORT + ' in use - assuming a proxy is already running.');
    } else {
      console.log('  api  proxy : FAILED - ' + e.message);
    }
  });
}

// ---------------------------------------------------------------- static
// 首选端口被占用就往后试几个，避免因为端口冲突起不来。
// 页面只关心主机名，端口随意。
function startStatic(port, attempt) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      let rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
      if (rel === '' || rel.endsWith('/')) rel += 'index.html';
      const file = join(SITE_ROOT, rel);
      if (!file.startsWith(SITE_ROOT)) { res.writeHead(403); res.end('403'); return; }
      const st = await stat(file);
      if (st.isDirectory()) { res.writeHead(403); res.end('403'); return; }
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 not found');
    }
  });

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE' && attempt < 20) {
      if (attempt === 0) console.log('  web server : port ' + port + ' busy, trying ' + (port + 1) + ' ...');
      startStatic(port + 1, attempt + 1);
      return;
    }
    console.log('  web server : FAILED - ' + e.message);
    if (e.code === 'EADDRINUSE') console.log('               no free port in ' + PORT + '..' + (PORT + 20));
  });

  server.listen(port, '127.0.0.1', () => {
    // 打包形态站点根就是 site/，所以路径固定；仓库形态站点根是仓库根，也一样。
    const sim = 'http://127.0.0.1:' + port + '/new44/index.html';
    const calc = 'http://127.0.0.1:' + port + '/gt.html';
    console.log('  web server : ' + sim);
    console.log('               ' + calc);
    console.log('  站点根     : ' + SITE_ROOT + (PACKAGED ? '   (打包形态)' : '   (仓库形态)'));
    console.log('');
    console.log('  Opening the browser. Keep this window open while using the tools.');
    console.log('  Press Ctrl+C to stop.');
    console.log('');
    spawn('cmd', ['/c', 'start', '', sim], { detached: true, stdio: 'ignore' }).unref();
    spawn('cmd', ['/c', 'start', '', calc], { detached: true, stdio: 'ignore' }).unref();
  });
}

console.log('');
console.log('  gt-toolbox');
console.log('  ----------');
startProxy();
startStatic(PORT, 0);
