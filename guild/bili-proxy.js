export default {
  async fetch(request, env, ctx) {
    // 允许的来源（生产环境建议指定具体域名）
    const ALLOWED_ORIGINS = ['*', 'http://localhost:*', 'https://*.pages.dev'];
    const origin = request.headers.get('Origin') || '*';
    
    // 处理预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Proxy-Cookie',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    try {
      // 解析请求URL
      const url = new URL(request.url);
      const endpoint = url.pathname.replace(/^\/proxy\//, '');
      
      // 基础配置
      const BILI_API = 'https://api.game.bilibili.com/game/player/tools/kan_gong';
      const APP_KEY = 'a5e793dd8b8e425c9bff92ed79e4458f';
      const APP_SECRET = 'xoNO7qa9761mNPyLtTn8zxPeX80iLnDonYCOzqS7bG8=';
      
      // 从请求头或环境变量获取Cookie（优先级：请求头 > 环境变量）
      const sessdata = request.headers.get('X-Proxy-Cookie') || env.SESSDATA;
      if (!sessdata) {
        return new Response(JSON.stringify({ code: -1, message: 'Missing SESSDATA' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 解析前端传来的查询参数
      const params = new URLSearchParams(url.search);
      const date = params.get('date');
      const page_num = params.get('page_num');
      const page_size = params.get('page_size');

      // 生成签名（与Python逻辑一致）
      const ts = Math.floor(Date.now() / 1000);
      const nonce = Array(3).fill(0).map(() => 
        crypto.getRandomValues(new Uint8Array(3))
          .reduce((s, b) => s + b.toString(16).padStart(2, '0'), '')
      ).join('-');
      
      // 构建签名字典
      const signData = { ts, nonce, appkey: APP_KEY };
      if (date) signData.date = date;
      
      // 排序并生成签名
      const sortedKeys = Object.keys(signData).sort();
      const paramStr = sortedKeys.map(k => `${k}=${signData[k]}`).join('&');
      const signStr = paramStr + `&secret=${APP_SECRET}`;
      
      // Worker中使用Web Crypto API计算MD5
      const signBuf = new TextEncoder().encode(signStr);
      const signHash = await crypto.subtle.digest('MD5', signBuf);
      const sign = Array.from(new Uint8Array(signHash))
        .map(b => b.toString(16).padStart(2, '0')).join('');
      
      signData.sign = sign;

      // 构建最终请求参数
      const finalParams = new URLSearchParams({
        ...signData,
        ...(date && { date }),
        ...(page_num && { page_num }),
        ...(page_size && { page_size })
      });

      // 请求B站API
      const targetUrl = `${BILI_API}/${endpoint}?${finalParams.toString()}`;
      const biliResponse = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'Cookie': `SESSDATA=${sessdata}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const responseData = await biliResponse.json();

      // 返回响应 + CORS头
      return new Response(JSON.stringify(responseData), {
        status: biliResponse.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Proxy-Cookie',
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        }
      });

    } catch (error) {
      return new Response(JSON.stringify({ 
        code: -1, 
        message: 'Proxy error: ' + error.message 
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin
        }
      });
    }
  }
};