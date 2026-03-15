/**
 * ============================================================
 *  VERCEL PROXY SERVER
 *  File: server.js  (root of vercel project)
 *
 *  Vercel serverless functions don't support WebSocket natively.
 *  This custom server handles the WS upgrade properly.
 * ============================================================
 */

const http      = require('http');
const WebSocket = require('ws');

const MELBET_WS_BASE = 'wss://india.melbet.com/games-frame/sockets/crash';
const PROXY_SECRET   = process.env.PROXY_SECRET || 'crash_secret_123';
const PORT           = process.env.PORT || 3000;

// Create HTTP server
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost`);

  // Health check
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status:  'running',
      service: 'Melbet Crash WS Proxy',
      region:  'Mumbai (India)',
      uptime:  Math.round(process.uptime()) + 's',
      connect: `wss://YOUR_VERCEL_URL/?secret=${PROXY_SECRET}`
    }, null, 2));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

// WebSocket server — handles incoming connections from Koyeb
const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url    = new URL(req.url, 'http://localhost');
  const secret = url.searchParams.get('secret');

  // Reject if wrong secret
  if (secret !== PROXY_SECRET) {
    console.log(`[PROXY] ❌ Rejected — wrong secret from ${req.socket.remoteAddress}`);
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (clientWs) => {
    console.log(`[PROXY] ✅ Koyeb connected from ${req.socket.remoteAddress}`);

    // Build Melbet WS URL — pass through any query params from the client
    // The client can pass gr=, whence=, etc.
    const melbetUrl = MELBET_WS_BASE + '?' + [
      'ref=8',
      'gr=1182',
      'whence=55',
      'fcountry=71',
      'appGuid=games-web-host-b2c-web-v3',
      'lng=en',
      'v=1.5'
    ].join('&');

    console.log(`[PROXY] Connecting to Melbet: ${melbetUrl}`);

    const upstream = new WebSocket(melbetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Origin':     'https://india.melbet.com',
        'Referer':    'https://india.melbet.com/en/games/crash',
      }
    });

    upstream.on('open', () => {
      console.log(`[PROXY] ✅ Connected to Melbet WebSocket`);
    });

    // Melbet → Koyeb (game data)
    upstream.on('message', (data, isBinary) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data, { binary: isBinary });
      }
    });

    // Koyeb → Melbet (handshake / keepalive)
    clientWs.on('message', (data, isBinary) => {
      if (upstream.readyState === WebSocket.OPEN) {
        upstream.send(data, { binary: isBinary });
      }
    });

    upstream.on('close', (code, reason) => {
      console.log(`[PROXY] Melbet WS closed (${code})`);
      if (clientWs.readyState === WebSocket.OPEN) clientWs.close(code);
    });

    
    upstream.on('error', (err) => {
      console.error(`[PROXY] Upstream error: ${err.message}`);
      if (clientWs.readyState === WebSocket.OPEN) clientWs.close(1011);
    });

    clientWs.on('close', (code) => {
      console.log(`[PROXY] Koyeb disconnected (${code})`);
      if (upstream.readyState === WebSocket.OPEN) upstream.close();
    });

    clientWs.on('error', (err) => {
      console.error(`[PROXY] Client error: ${err.message}`);
    });
  });
});

server.listen(PORT, () => {
  console.log(`[PROXY] ✅ WS Proxy server running on port ${PORT}`);
  console.log(`[PROXY] Health: http://localhost:${PORT}/health`);
  console.log(`[PROXY] Secret: ${PROXY_SECRET}`);
});