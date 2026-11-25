// 全アプリ共通のカウンター＆ランキングAPI（Cloudflare Workers + D1）
//   GET  /get?keys=a,b             → {"a": 3, "b": 1}
//   POST /hit/<key>                → {"value": 4}   （+1して新しい値を返す）
//   POST /score   {game, ms}       → {id, token, rank, total, top10, canName, top}   （top：送ったあとの上位10件＝ /board と同じ形）   （小さいほど上位。canName：名前を登録できる＝トップ100）
//   POST /name    {game, id, token, name} → {ok, rank}   （トップ100に入った記録だけ名前を登録できる）
//   GET  /board?game=iai&limit=10  → {total, top: [{rank, name, ms}]}   （limit は1〜100。省略で10）
//   POST /bushou/tenka {name}      → 名将ガチャの天下統一（サーバーで勝敗を決める）
//   GET  /bushou/top               → 名将ガチャの全国番付
// key / game は英小文字・数字・ハイフンのみ

import { makeBushou, seeded, simulateBattle } from './bushou-core.js';
import { isNg } from '../../shared/ng-words.js'; // 名前に使えない言葉（オンラインリーグと共通）

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
  nobiru: { min: 10, max: 40000000000, desc: true }, // 伸ばした長さ（cm）。大きいほど上位。月まで約384億cm
  soccer: { min: 1, max: 100000, desc: true, anon: '名無しの選手' }, // サッカー人生の生涯スコア。大きいほど上位
  soccerq: { min: 1, max: 100000, desc: true, anon: '名無しの選手' }, // サッカー人生・60秒モード（おまかせ）は別ランキング
  // 試合の仕組みを新しくした（2026年11月）ので、生涯スコアは新しいランキングに。上の2つは旧ルールの記録として残す
  // needName：名前を付けた記録だけをランキングに出す（記録を送るときに名前が必須。名無しの記録は数えない）
  soccer2: { min: 1, max: 100000, desc: true, anon: '名無しの選手', needName: true },
  soccerq2: { min: 1, max: 100000, desc: true, anon: '名無しの選手', needName: true },
  onigiri: { min: 1, max: 100000, desc: true, anon: '名無しの職人' }, // おにぎり握り職人の査定額（円）。大きいほど上位
};
const TOP_N = 10;      // ランキングの表示数（省略したとき）
const MAX_N = 100;     // ランキングの表示数の上限。名前を登録できるのもこの順位まで
// 日替わりランキング：'chikoku-d20261118' のように、元のゲーム名＋日付で受け付ける
function gameRule(game) {
  if (typeof game !== 'string') return null;
  if (GAMES[game]) return GAMES[game];
  const m = game.match(/^([a-z]+)-d(\d{8})$/);
  return m && GAMES[m[1]] ? GAMES[m[1]] : null;
}
const DEFAULT_NAME = '名無しの侍';
// 名将ガチャ：登録者が少ないうちの対戦相手
const NPC_NAMES = ['足軽の権兵衛', '村の与作', '山賊の熊五郎', '浪人の半蔵', '若殿', '城下の茶屋娘', '旅の僧', '鍛冶屋の源', '漁師の太平', '商人の宗兵衛',
  '忍びの影丸', '弓取りの小太郎', '槍の又兵衛', '馬廻りの新八', '軍師見習い', '鬼の左近', '姫武者お市', '国境の守り', '赤備えの隊長', '天下の大将'];

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
  if (isNg(s)) return null;
  return s;
}

// ゲームごとの記録の件数。COUNT(*) は記録の数だけ行を読むので、counters に件数を持っておく。
// キーは「score:ゲーム名」（: は /get・/hit のキーに使えない文字なので、外からは読み書きできない）
// まだ件数がないゲームは、1回だけ数えて入れる
const needName = (game) => !!(gameRule(game) || {}).needName;
const namedSql = (game) => (needName(game) ? ' AND name IS NOT NULL' : ''); // 名前が必須のゲームは、名前のある記録だけ
const totalKey = (game) => (needName(game) ? 'named:' : 'score:') + game;
async function totalOf(env, game) {
  const k = totalKey(game);
  const r = await env.DB.prepare('SELECT value FROM counters WHERE key = ?').bind(k).first();
  if (r) return r.value;
  const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE game = ?' + namedSql(game)).bind(game).first()).n;
  await env.DB.prepare('INSERT INTO counters (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING').bind(k, n).run();
  return n;
}
// 記録が1件増えたとき（件数をまだ持っていなければ、増えたあとの記録を数えて入れる）
async function bumpTotal(env, game) {
  const r = await env.DB.prepare('UPDATE counters SET value = value + 1 WHERE key = ? RETURNING value').bind(totalKey(game)).first();
  return r ? r.value : totalOf(env, game);
}

// 順位：自分より上の帯（hist）の記録数の合計＋同じ帯で自分より上の記録数＋1。
// 前は自分より上の記録を全部数えていて、1回で平均1,000行以上を読んでいた（2026年11月25日に D1 の無料枠を使い切った）
const BUCKET = 'CAST(floor(ln(?) * 100) AS INTEGER)'; // 点数の帯（1%きざみ）。帯の計算はいつも SQL でする（JS とずれないように）
const histKey = (game) => 'hist:' + game;
async function histReady(env, game) {
  if (await env.DB.prepare('SELECT 1 AS ok FROM counters WHERE key = ?').bind(histKey(game)).first()) return true;
  // まだないゲーム：scores から作る（まとめて1つの処理で。同時に2回作っても結果は同じ）
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS hist (game TEXT NOT NULL, b INTEGER NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (game, b))'), // 表がまだなければ作る（schema.sql と同じ）
    env.DB.prepare('DELETE FROM hist WHERE game = ?').bind(game),
    env.DB.prepare(`INSERT INTO hist (game, b, n) SELECT game, CAST(floor(ln(ms) * 100) AS INTEGER), COUNT(*) FROM scores WHERE game = ?${namedSql(game)} GROUP BY 2`).bind(game),
    env.DB.prepare('INSERT INTO counters (key, value) VALUES (?, 1) ON CONFLICT(key) DO NOTHING').bind(histKey(game)),
  ]);
  return false; // いま作ったので、今回の記録はもう入っている
}
// 記録が1件ランキングに入ったとき（名前が必須のゲームは名前のある記録だけ）
async function histAdd(env, game, ms) {
  if (!(await histReady(env, game))) return;
  await env.DB.prepare(`INSERT INTO hist (game, b, n) VALUES (?, ${BUCKET}, 1) ON CONFLICT(game, b) DO UPDATE SET n = n + 1`).bind(game, ms).run();
}
// ランキングの上位 n 件
async function boardTop(env, game, n) {
  const rows = await env.DB.prepare(`SELECT name, ms FROM scores WHERE game = ?${namedSql(game)} ORDER BY ms ${gameRule(game).desc ? 'DESC' : 'ASC'}, id ASC LIMIT ?`).bind(game, n).all();
  return rows.results.map((r, i) => ({ rank: i + 1, name: r.name || gameRule(game).anon || DEFAULT_NAME, ms: r.ms }));
}
async function rankOf(env, game, ms, id) {
  // 同タイムは先に出した人が上。desc のゲームは大きいほど上位
  const desc = gameRule(game).desc, cmp = desc ? '>' : '<';
  await histReady(env, game);
  const up = await env.DB.prepare(`SELECT COALESCE(SUM(n), 0) AS n FROM hist WHERE game = ? AND b ${cmp} ${BUCKET}`).bind(game, ms).first();
  // 同じ帯の中：帯の幅は1%なので、点数を ±1.1% にしぼってから帯が同じものだけ数える
  const lo = desc ? ms : Math.floor(ms / 1.011) - 1, hi = desc ? Math.ceil(ms * 1.011) + 1 : ms;
  const same = await env.DB.prepare(`SELECT COUNT(*) AS n FROM scores WHERE game = ? AND ms BETWEEN ? AND ? AND CAST(floor(ln(ms) * 100) AS INTEGER) = ${BUCKET} AND (ms ${cmp} ? OR (ms = ? AND id < ?))${namedSql(game)}`)
    .bind(game, lo, hi, ms, ms, ms, id).first();
  return up.n + same.n + 1;
}

export default {
  // 失敗しても CORS つきの JSON で返す（D1 の無料枠を使い切ったときなど。ブラウザには「通信できない」ではなくエラーとして届く）
  async fetch(req, env) {
    try { return await handle(req, env); } catch (e) { console.log('error', String(e && e.message || e).slice(0, 200)); return json(req, { error: 'busy' }, 503); }
  },
};
async function handle(req, env) {
  {
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
      const g = gameRule(b.game);
      const ms = Math.round(Number(b.ms));
      if (!g || !Number.isFinite(ms) || ms < g.min || ms > g.max) return json(req, { error: 'invalid' }, 400);
      let name = null;
      if (needName(b.game)) { name = cleanName(b.name); if (!name) return json(req, { error: 'bad_name' }, 400); }
      const token = crypto.randomUUID();
      const row = await env.DB.prepare('INSERT INTO scores (game, ms, token, created, name) VALUES (?, ?, ?, ?, ?) RETURNING id')
        .bind(b.game, ms, token, Date.now(), name).first();
      await histAdd(env, b.game, ms);
      const rank = await rankOf(env, b.game, ms, row.id);
      const total = await bumpTotal(env, b.game);
      // top：送ったあとのランキング上位10件（画面がすぐに /board を取り直さなくて済むように）
      return json(req, { id: row.id, token, rank, total, top10: rank <= TOP_N, canName: !name && rank <= MAX_N, name, top: await boardTop(env, b.game, TOP_N) });
    }

    if (req.method === 'POST' && url.pathname === '/name') {
      const b = await body(req);
      if (!gameRule(b.game)) return json(req, { error: 'invalid' }, 400);
      const name = cleanName(b.name);
      if (!name) return json(req, { error: 'bad_name' }, 400);
      const s = await env.DB.prepare('SELECT id, ms, token, name FROM scores WHERE id = ? AND game = ?').bind(Number(b.id), b.game).first();
      if (!s || s.token !== b.token) return json(req, { error: 'forbidden' }, 403);
      if (s.name) return json(req, { error: 'already' }, 409);
      const rank = await rankOf(env, b.game, s.ms, s.id);
      if (rank > MAX_N) return json(req, { error: 'not_top', rank }, 409);
      await env.DB.prepare('UPDATE scores SET name = ? WHERE id = ?').bind(name, s.id).run();
      if (needName(b.game)) { await bumpTotal(env, b.game); await histAdd(env, b.game, s.ms); } // 名前が必須のゲームは、名前が付いてからランキングに数える
      return json(req, { ok: true, rank, name });
    }

    if (req.method === 'GET' && url.pathname === '/board') {
      const game = url.searchParams.get('game');
      if (!gameRule(game)) return json(req, { error: 'invalid' }, 400);
      const n = Math.max(1, Math.min(MAX_N, Math.floor(Number(url.searchParams.get('limit'))) || TOP_N));
      return json(req, { total: await totalOf(env, game), top: await boardTop(env, game, n) });
    }

    // ===== 名将ガチャ：天下統一 =====
    if (req.method === 'POST' && url.pathname === '/bushou/tenka') {
      const b0 = await body(req);
      const raw = String(b0.name || '');
      const me = makeBushou(raw);
      if (!me.name || !cleanName(me.name)) return json(req, { error: 'bad_name' }, 400);
      await env.DB.prepare('INSERT INTO bushou (key, name, power, rarity, created) VALUES (?, ?, ?, ?, ?) ON CONFLICT(key) DO NOTHING')
        .bind(me.key, me.name, me.power, me.rarity.id, Date.now()).run();
      // 対戦相手：登録済みの武将からランダム＋足りない分はNPC。弱い順に並べ、最後は全国最強
      const pool = (await env.DB.prepare('SELECT name FROM bushou WHERE key != ? AND hidden = 0 ORDER BY RANDOM() LIMIT 30').bind(me.key).all()).results.map((r) => r.name);
      const npc = NPC_NAMES.filter((n) => !pool.includes(n));
      const seen = new Set([me.key]);
      let opps = [];
      for (const n of [...pool, ...npc]) { const o = makeBushou(n); if (!seen.has(o.key)) { seen.add(o.key); opps.push(o); } }
      opps.sort((a, b) => a.power - b.power);
      // 弱い〜強いまで均等に9人選ぶ
      const picked = [];
      for (let i = 0; i < 9 && opps.length; i++) picked.push(opps[Math.min(opps.length - 1, Math.floor(i * opps.length / 9))]);
      const bossRow = await env.DB.prepare('SELECT name FROM bushou WHERE key != ? AND hidden = 0 ORDER BY power DESC LIMIT 1').bind(me.key).first();
      let boss = bossRow ? makeBushou(bossRow.name) : makeBushou('織田信長');
      if (picked.some((p) => p.key === boss.key)) boss = makeBushou(boss.key === makeBushou('織田信長').key ? '武田信玄' : '織田信長');
      const list = [...new Map(picked.map((p) => [p.key, p])).values()].slice(0, 9).concat([boss]);
      // 連戦（負けたらそこで終わり）
      const matches = [];
      let streak = 0;
      for (const o of list) {
        const seed = crypto.randomUUID();
        const r = simulateBattle(me, o, seeded('battle:' + seed));
        const win = r.winner === 0;
        matches.push({ name: o.name, seed, win, boss: o === boss });
        if (!win) break;
        streak++;
      }
      await env.DB.prepare('UPDATE bushou SET runs = runs + 1, wins = wins + ?, best_streak = MAX(best_streak, ?) WHERE key = ?').bind(streak, streak, me.key).run();
      const best = (await env.DB.prepare('SELECT best_streak FROM bushou WHERE key = ?').bind(me.key).first()).best_streak;
      const rank = (await env.DB.prepare('SELECT COUNT(*) AS n FROM bushou WHERE hidden = 0 AND best_streak > ?').bind(best).first()).n + 1;
      const total = (await env.DB.prepare('SELECT COUNT(*) AS n FROM bushou WHERE hidden = 0').first()).n;
      return json(req, { name: me.name, matches, streak, best, rank, total, unified: streak === list.length });
    }

    if (req.method === 'GET' && url.pathname === '/bushou/top') {
      const streak = (await env.DB.prepare('SELECT name, rarity, best_streak AS v FROM bushou WHERE hidden = 0 AND best_streak > 0 ORDER BY best_streak DESC, created ASC LIMIT 10').all()).results;
      const power = (await env.DB.prepare('SELECT name, rarity, power AS v FROM bushou WHERE hidden = 0 ORDER BY power DESC, created ASC LIMIT 10').all()).results;
      const total = (await env.DB.prepare('SELECT COUNT(*) AS n FROM bushou WHERE hidden = 0').first()).n;
      return json(req, { streak, power, total });
    }

    return json(req, { error: 'not found' }, 404);
  }
}
