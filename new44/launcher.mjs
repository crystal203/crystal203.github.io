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
import { readFile, stat, existsSync } from 'node:fs';
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
function startProxy() {
  createServer(async (req, res) => {
    const cors = {
      'Access-Control-Allow-Origin': req.headers.origin || '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '600',
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
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
          'User-Agent': (req.headers['user-agent'] && req.headers['user-agent'].length > 40)
            ? req.headers['user-agent'] : FALLBACK_UA,
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
