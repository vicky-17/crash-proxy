/**
 * ============================================================
 *  VERCEL EDGE PROXY — api/ws.js
 *
 *  Uses Vercel Edge Runtime which supports WebSockets natively.
 *  No 10s timeout. Runs in Mumbai (bom1).
 *
 *  URL: wss://crash-proxy.vercel.app/api/ws?secret=crash_secret_123
 * ============================================================
 */

export const config = {
  runtime: 'edge',
  regions: ['bom1'],  // Mumbai
};

const MELBET_WS = 'wss://india.melbet.com/games-frame/sockets/crash?ref=8&gr=1182&whence=55&fcountry=71&appGuid=games-web-host-b2c-web-v3&lng=en&v=1.5';
const PROXY_SECRET = process.env.PROXY_SECRET || 'crash_secret_123';

export default async function handler(req) {
  const url    = new URL(req.url);
  const secret = url.searchParams.get('secret');

  // Health check for HTTP GET
  if (req.method === 'GET' && !req.headers.get('upgrade')) {
    return new Response(JSON.stringify({
      status:  'running',
      service: 'Melbet Crash WS Proxy (Edge)',
      region:  'bom1 Mumbai',
      connect: `wss://crash-proxy.vercel.app/api/ws?secret=${PROXY_SECRET}`
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  // Auth check
  if (secret !== PROXY_SECRET) {
    return new Response('Forbidden', { status: 403 });
  }

  // WebSocket upgrade
  const { 0: clientSocket, 1: serverSocket } = new WebSocketPair();

  serverSocket.accept();

  console.log('[PROXY] Client connected');

  // Connect to Melbet
  const upstream = new WebSocket(MELBET_WS, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Origin':     'https://india.melbet.com',
      'Referer':    'https://india.melbet.com/en/games/crash',
    }
  });

  // Melbet → Client
  upstream.addEventListener('message', (event) => {
    if (serverSocket.readyState === WebSocket.OPEN) {
      serverSocket.send(event.data);
    }
  });

  upstream.addEventListener('close', (event) => {
    console.log(`[PROXY] Upstream closed: ${event.code}`);
    serverSocket.close(event.code);
  });

  upstream.addEventListener('error', (event) => {
    console.error('[PROXY] Upstream error');
    serverSocket.close(1011);
  });

  // Client → Melbet
  serverSocket.addEventListener('message', (event) => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(event.data);
    }
  });

  serverSocket.addEventListener('close', (event) => {
    console.log(`[PROXY] Client disconnected: ${event.code}`);
    if (upstream.readyState === WebSocket.OPEN) upstream.close();
  });

  return new Response(null, {
    status: 101,
    webSocket: clientSocket,
  });
}