export const config = {
  runtime: 'edge',
  regions: ['bom1'],
};

export default function handler(req) {
  return new Response(JSON.stringify({
    status:  'running',
    service: 'Melbet Crash WS Proxy',
    region:  'bom1 Mumbai',
    ws_url:  'wss://crash-proxy.vercel.app/api/ws?secret=YOUR_SECRET',
    note:    'Connect via /api/ws not /'
  }, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
}