/**
 * gt-toolbox launcher
 *
 * Serves the bundled pages and forwards API calls for them.
 *
 * Why a local server is required even though the pages are just HTML:
 *   1) The pages call the upstream API, which only answers requests that carry an
 *      allowed Referer. A script on a page cannot set Referer, so the request has
 *      to leave from a server that can, i.e. this process.
 *   2) Opening the pages as file:// does not help: the upstream does not send CORS
 *      headers to requests without a known origin, so the browser can never read
 *      the response body.
 *
 * Layout (must stay as-is):
 *   site/gt.html                      <- self-contained calculator
 *   site/new44/index.html             <- simulator, loads ../gt.html in an iframe
 *   site/new44/ruleEngine.js          <- dynamically imports ./rule/*.js at runtime
 *   site/new44/simEngine.js
 *   site/new44/rule/*.js
 *   site/new44/asset/*.png
 *
 * Usage:  node launcher.mjs        (or double-click launch.bat)
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = join(HERE, 'site');
// Do NOT read process.env.PORT: some environments set it globally (CI, editors,
// hosting shells) and it would silently collide with an unrelated service.
// Use a CLI flag instead, and auto-avoid a busy port below.
const argPort = (() => {
  const i = process.argv.indexOf('--port');
  if (i >= 0 && process.argv[i + 1]) return Number(process.argv[i + 1]);
  const m = process.argv.find((a) => /^--port=\d+$/.test(a));
  return m ? Number(m.split('=')[1]) : 8000;
})();
const PORT = Number.isFinite(argPort) && argPort > 0 ? argPort : 8000;
// The pages hard-code this port, so it must NOT be moved. Only used to warn.
const PROXY_PORT = 8799;
const UPSTREAM = 'https://open.ww2.ren';
const UPSTREAM_REFERER = 'https://gtlc.ww2.ren/';
// Fallback UA must be a FULL browser UA: the upstream rejects minimal ones
// (e.g. "Mozilla/5.0") with 403 / "非公开接口". The pages normally send a real
// browser UA, which is forwarded as-is; this is only used if that is missing.
const FALLBACK_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
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

// ---------------------------------------------------------------- proxy
// The pages auto-detect localhost and send their API calls here.
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
      console.log('  [api]  ' + up.status + '  ' + req.url.slice(0, 96));
    } catch (e) {
      res.writeHead(502, { ...cors, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('proxy error: ' + e.message);
      console.log('  [api]  502  ' + e.message);
    }
  }).listen(PROXY_PORT, '127.0.0.1', () => {
    console.log('  api  proxy : http://127.0.0.1:' + PROXY_PORT + '/api/gt-top');
  }).on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.log('  api  proxy : port ' + PROXY_PORT + ' already in use - assuming it is already running.');
    } else {
      console.log('  api  proxy : FAILED - ' + e.message);
    }
  });
}

// ---------------------------------------------------------------- static
// Try the preferred port, then a few neighbours, so a busy port never blocks
// startup. The pages only care about the hostname, so any port is fine.
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
    if (e.code === 'EADDRINUSE') console.log('               No free port found in ' + PORT + '..' + (PORT + 20));
  });

  server.listen(port, '127.0.0.1', () => {
    const sim = 'http://127.0.0.1:' + port + '/new44/index.html';
    const calc = 'http://127.0.0.1:' + port + '/gt.html';
    console.log('  web server : ' + sim);
    console.log('               ' + calc);
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
