// 全アプリ共通のカウンターAPI（Cloudflare Workers + D1）
//   GET  /get?keys=a,b   → {"a": 3, "b": 1}
//   POST /hit/<key>      → {"value": 4}   （+1して新しい値を返す）
// key は英小文字・数字・ハイフンのみ（例: nobunaga-play）

const KEY_RE = /^[a-z0-9-]{1,64}$/;
const ALLOWED_ORIGINS = [
  'https://tonmatolab.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

function cors(req) {
  const origin = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(req, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors(req) },
  });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(req) });

    if (req.method === 'GET' && url.pathname === '/get') {
      const keys = (url.searchParams.get('keys') || '').split(',').filter((k) => KEY_RE.test(k)).slice(0, 20);
      const out = Object.fromEntries(keys.map((k) => [k, 0]));
      if (keys.length) {
        const rows = await env.DB.prepare(
          `SELECT key, value FROM counters WHERE key IN (${keys.map(() => '?').join(',')})`
        ).bind(...keys).all();
        for (const r of rows.results) out[r.key] = r.value;
      }
      return json(req, out);
    }

    const hit = url.pathname.match(/^\/hit\/([^/]+)$/);
    if (req.method === 'POST' && hit && KEY_RE.test(hit[1])) {
      const row = await env.DB.prepare(
        'INSERT INTO counters (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1 RETURNING value'
      ).bind(hit[1]).first();
      return json(req, { value: row.value });
    }

    return json(req, { error: 'not found' }, 404);
  },
};
