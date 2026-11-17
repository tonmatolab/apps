// 全アプリ共通のカウンター＆ランキングAPI（Cloudflare Workers + D1）
//   GET  /get?keys=a,b             → {"a": 3, "b": 1}
//   POST /hit/<key>                → {"value": 4}   （+1して新しい値を返す）
//   POST /score   {game, ms}       → {id, token, rank, total, top10}   （小さいほど上位）
//   POST /name    {game, id, token, name} → {ok, rank}   （トップ10に入った記録だけ名前を登録できる）
//   GET  /board?game=iai           → {total, top: [{rank, name, ms}]}
// key / game は英小文字・数字・ハイフンのみ

const KEY_RE = /^[a-z0-9-]{1,64}$/;
const ALLOWED_ORIGINS = [
  'https://tonmatolab.github.io',
  'https://tonmatolab.tonmatolab.workers.dev',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
];
// ゲームごとの記録の有効範囲（ありえない値は受け付けない）
const GAMES = {
  iai: { min: 100, max: 1000 },
  chikoku: { min: 60000, max: 800000 }, // 8:57からの経過ミリ秒（ゲーム内時間・遅刻も含む）
};
const TOP_N = 10;
const NG_WORDS = ['死ね', 'しね', '殺す', 'ころす', 'fuck', 'shit', 'ちんこ', 'まんこ', 'ちんぽ', 'sex'];
const DEFAULT_NAME = '名無しの侍';

function cors(req) {
  const origin = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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

async function body(req) {
  try { return await req.json(); } catch { return {}; }
}

function cleanName(raw) {
  let s = String(raw || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim();
  s = [...s].slice(0, 12).join('');
  if (!s) return null;
  const low = s.toLowerCase();
  if (NG_WORDS.some((w) => low.includes(w))) return null;
  return s;
}

async function rankOf(env, game, ms, id) {
  // 同タイムは先に出した人が上
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE game = ? AND (ms < ? OR (ms = ? AND id < ?))')
    .bind(game, ms, ms, id).first();
  return r.n + 1;
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

    if (req.method === 'POST' && url.pathname === '/score') {
      const b = await body(req);
      const g = GAMES[b.game];
      const ms = Math.round(Number(b.ms));
      if (!g || !Number.isFinite(ms) || ms < g.min || ms > g.max) return json(req, { error: 'invalid' }, 400);
      const token = crypto.randomUUID();
      const row = await env.DB.prepare('INSERT INTO scores (game, ms, token, created) VALUES (?, ?, ?, ?) RETURNING id')
        .bind(b.game, ms, token, Date.now()).first();
      const rank = await rankOf(env, b.game, ms, row.id);
      const total = (await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE game = ?').bind(b.game).first()).n;
      return json(req, { id: row.id, token, rank, total, top10: rank <= TOP_N });
    }

    if (req.method === 'POST' && url.pathname === '/name') {
      const b = await body(req);
      if (!GAMES[b.game]) return json(req, { error: 'invalid' }, 400);
      const name = cleanName(b.name);
      if (!name) return json(req, { error: 'bad_name' }, 400);
      const s = await env.DB.prepare('SELECT id, ms, token, name FROM scores WHERE id = ? AND game = ?').bind(Number(b.id), b.game).first();
      if (!s || s.token !== b.token) return json(req, { error: 'forbidden' }, 403);
      if (s.name) return json(req, { error: 'already' }, 409);
      const rank = await rankOf(env, b.game, s.ms, s.id);
      if (rank > TOP_N) return json(req, { error: 'not_top', rank }, 409);
      await env.DB.prepare('UPDATE scores SET name = ? WHERE id = ?').bind(name, s.id).run();
      return json(req, { ok: true, rank, name });
    }

    if (req.method === 'GET' && url.pathname === '/board') {
      const game = url.searchParams.get('game');
      if (!GAMES[game]) return json(req, { error: 'invalid' }, 400);
      const rows = await env.DB.prepare('SELECT name, ms FROM scores WHERE game = ? ORDER BY ms ASC, id ASC LIMIT ?').bind(game, TOP_N).all();
      const total = (await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE game = ?').bind(game).first()).n;
      return json(req, { total, top: rows.results.map((r, i) => ({ rank: i + 1, name: r.name || DEFAULT_NAME, ms: r.ms })) });
    }

    return json(req, { error: 'not found' }, 404);
  },
};
