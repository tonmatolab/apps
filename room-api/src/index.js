// 友達と遊ぶ部屋サーバー（Cloudflare Workers + Durable Objects）
//   POST /api/rooms {game}            → {code}  4桁の合言葉で新しい部屋を作る
//   GET  /api/rooms/<code>            → {exists, status, players}
//   GET  /api/rooms/<code>/ws?pid=&name= → WebSocket（部屋の中のやりとりは全部これ）
export { Room } from './room.js';

const ALLOWED_ORIGINS = [
  'https://tonmatolab.github.io',
  'https://tonmatolab.tonmatolab.workers.dev',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];
const GAMES = ['reversi'];
const okOrigin = (o) => ALLOWED_ORIGINS.includes(o) || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(o);

function cors(req) {
  const origin = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': okOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
const json = (req, body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors(req) },
});
const roomStub = (env, code) => env.ROOM.get(env.ROOM.idFromName('room-' + code));

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(req) });
    const p = url.pathname;

    if (p === '/api/rooms' && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const game = GAMES.includes(body.game) ? body.game : 'reversi';
      for (let n = 0; n < 12; n++) {
        const code = String(1000 + ((crypto.getRandomValues(new Uint32Array(1))[0] % 9000)));
        const r = await roomStub(env, code).fetch('https://room/init', { method: 'POST', body: JSON.stringify({ code, game }) });
        if (r.ok) return json(req, { code });
      }
      return json(req, { error: '部屋がいっぱいです。少し待ってからもう一度' }, 503);
    }

    const m = p.match(/^\/api\/rooms\/(\d{4})(\/ws)?$/);
    if (m) {
      const stub = roomStub(env, m[1]);
      if (m[2]) {
        if (req.headers.get('Upgrade') !== 'websocket') return new Response('websocket only', { status: 426 });
        const origin = req.headers.get('Origin');
        if (origin && !okOrigin(origin)) return new Response('forbidden', { status: 403 });
        return stub.fetch(req);
      }
      const r = await stub.fetch('https://room/info');
      return json(req, await r.json());
    }
    return json(req, { error: 'not found' }, 404);
  },
};
