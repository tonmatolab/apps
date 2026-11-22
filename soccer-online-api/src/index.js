// サッカー人生 オンラインリーグ API（Cloudflare Workers + Durable Objects）
//   GET  /api/public                 → リーグの概要（だれでも）
//   GET  /api/rankings               → 現役プレイヤー全員の全国ランキング（ログイン中なら自分の順位も）
//   POST /api/signup {name, pos}     → {code, state}  code は引き継ぎコード（これがログインの鍵）
//   GET  /api/state                  → 自分と所属リーグの状態（Authorization: Bearer <code>）
//   POST /api/join {i}               → 入団先を選ぶ
//   POST /api/training {k}           → 練習メニューを変える
//   POST /api/casino/roulette {bets} → ルーレットを1回まわす（1節10回まで）
//   POST /api/decide {choice}        → オフの契約：'stay' / 'retire' / オファーの番号
//   POST /api/nextgen {name, pos}    → 引退後、次の世代を始める
//   POST /api/dev/tick {n}           → 開発用：n節すすめる（DEV=1 のときだけ）
export { League } from './league.js';

const ALLOWED_ORIGINS = [
  'https://tonmatolab.github.io',
  'https://tonmatolab.tonmatolab.workers.dev',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];
function cors(req) {
  const origin = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(req) });
    if (!url.pathname.startsWith('/api/')) return new Response('not found', { status: 404, headers: cors(req) });
    const stub = env.LEAGUE.get(env.LEAGUE.idFromName('world-1'));
    const res = await stub.fetch(req);
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors(req))) out.headers.set(k, v);
    return out;
  },
};
