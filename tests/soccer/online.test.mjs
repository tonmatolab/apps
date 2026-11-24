// オンラインリーグの通しテスト（手元で wrangler dev を起動して、APIを一通り叩く）
//   node tests/soccer/online.test.mjs
// 本番には一切アクセスしない。データは一時フォルダに作り、終わったら消す。
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 8799, B = `http://127.0.0.1:${PORT}/api`, ADMIN = 'local-test-admin-key-0123456789';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'soccer-online-test-'));
let failures = 0;
const check = (c, m) => { if (!c) { failures++; console.log('  ✗ ' + m); } else if (process.env.VERBOSE) console.log('  ✓ ' + m); };

// サーバーを起動
const proc = spawn('npx', ['wrangler@4', 'dev', '--config', 'soccer-online-api/wrangler.toml', '--port', String(PORT), '--persist-to', tmp,
  '--var', 'DEV:1', '--var', `ADMIN_KEY:${ADMIN}`, '--var', 'RL_MINUTES:60'], { cwd: ROOT, shell: true });
let log = '';
proc.stdout.on('data', (d) => { log += d; }); proc.stderr.on('data', (d) => { log += d; });
function stop() {
  try { if (process.platform === 'win32') execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' }); else process.kill(-proc.pid); } catch {}
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 120 && !/Ready on/.test(log); i++) await wait(1000);
if (!/Ready on/.test(log)) { console.log('サーバーが起動しませんでした\n' + log.slice(-2000)); stop(); process.exit(1); }

const call = async (p, { code, body, headers = {} } = {}) => {
  const r = await fetch(B + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(code ? { Authorization: 'Bearer ' + code } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  return { status: r.status, j };
};

try {
  // 登録・入団
  const users = [];
  for (const [name, pos] of [['通し 一', 'FW'], ['通し 二', 'MF'], ['通し 三', 'DF'], ['通し 四', 'GK']]) {
    const r = await call('/signup', { body: { name, pos } });
    check(r.status === 200 && r.j.code, `${name}を登録できる`);
    check(r.j.state.me.money === 500, `${name}の支度金が500万円`);
    const jn = await call('/join', { code: r.j.code, body: { i: r.j.state.me.draft.length - 1 } });
    check(jn.status === 200 && jn.j.me.status === 'active', `${name}が入団できる`);
    users.push({ name, code: r.j.code });
  }
  const A = users[0].code;
  check((await call('/state', { code: 'XXXX-XXXX-XXXX-XXXX' })).status === 401, '間違ったコードは拒否');
  check((await call('/training', { code: A, body: { k: 'sht' } })).status === 200, '練習を変えられる');
  // お金・ミニゲーム
  const pk = await call('/pk/start', { code: A, body: {} });
  check(pk.status === 200, 'PKを始められる');
  let pkLast; for (let i = 0; i < 5; i++) pkLast = await call('/pk/kick', { code: A, body: { dir: 'L', high: false, power: .5 } });
  check(pkLast.j.reward != null, 'PKを5本蹴ると賞金が出る');
  check((await call('/pk/start', { code: A, body: {} })).j.error === 'pk_done', 'PKは1節に1回');
  const bet = await call('/casino/bet', { code: A, body: { bets: [{ k: 'red', a: 10 }] } });
  check(bet.status === 200 && bet.j.myBets.length === 1, 'ルーレットに賭けられる');
  // 節の途中で失敗させると、保存が取り消される
  const before = (await call('/state', { code: A })).j;
  const fail = await call('/dev/fail-tick', { body: {} });
  check(fail.status === 500 && fail.j.failed, 'わざと失敗させた節はエラーになる');
  const afterFail = (await call('/state', { code: A })).j;
  check(afterFail.world.week === before.world.week, `失敗した節は進まない（第${before.world.week}節のまま）`);
  check(afterFail.me.money === before.me.money && afterFail.me.season.apps === before.me.season.apps, '失敗した節の成績・お金は残らない');
  check(afterFail.casino.myBets.length === 1, '失敗しても賭けは残っている');
  const ok = await call('/dev/tick', { body: { n: 1 } });
  check(ok.status === 200 && ok.j.world.week === before.world.week + 1, '失敗のあと、普通に1節進む');
  // シーズンを最後まで → オフ → 新シーズン
  await call('/dev/tick', { body: { n: 17 } });
  let st = (await call('/state', { code: A })).j;
  check(st.world.phase === 'off' && st.me.status === 'off', 'シーズンが終わってオフになる');
  check(st.me.history.length === 1, '経歴に1シーズン分が記録される');
  await call('/dev/tick', { body: { n: 2 } });
  st = (await call('/state', { code: A })).j;
  check(st.world.phase === 'season' && st.me.status === 'active', 'オフが終わって新シーズン');
  // ランキング・公開情報
  const rk = await call('/rankings', { code: A });
  check(rk.status === 200 && rk.j.score.mine, '全国ランキングに自分の順位がある');
  const pub = await call('/public');
  check(pub.status === 200 && pub.j.world.players === 4 && Array.isArray(pub.j.news), '公開情報が取れる');
  // 書き出し → 読み込み で同じ状態に戻る
  check((await call('/admin/export')).status === 404, '合言葉なしの書き出しは拒否');
  const ex = await call('/admin/export', { headers: { 'X-Admin-Key': ADMIN } });
  check(ex.status === 200 && ex.j.accounts.length === 4 && ex.j.players.length === 4, '全データを書き出せる');
  const snapshot = (await call('/state', { code: A })).j;
  await call('/dev/tick', { body: { n: 3 } }); // 状態を進めてから…
  const im = await call('/dev/import', { body: ex.j });
  check(im.status === 200 && im.j.players === 4, `書き出したデータを読み込める（${im.status} ${JSON.stringify(im.j).slice(0, 200)}）`);
  const restored = (await call('/state', { code: A })).j;
  check(restored.world.week === snapshot.world.week && restored.me.money === snapshot.me.money && JSON.stringify(restored.me.history) === JSON.stringify(snapshot.me.history), '読み込むと書き出した時点の状態に戻る');
  for (const u of users) check((await call('/state', { code: u.code })).status === 200, `${u.name}は戻したあともログインできる`);
  // クラブ・名簿（Phase 1）
  {
    const st0 = (await call('/state', { code: A })).j;
    check(st0.clubs.length === 30 && st0.clubs.every((c) => c.short && c.mark && c.atk != null), 'クラブに略称・エンブレム文字・特徴がある');
    check(st0.squad && st0.squad.rows.length === 22 && st0.squad.rows.some((r) => r.me && r.type === 'user'), `自分のクラブの名簿が22人で、自分が入っている（${st0.squad && st0.squad.rows.length}）`);
    check(st0.squad.rows.filter((r) => r.type === 'npc').every((r) => r.name && r.ovr > 0 && r.style && !('stats' in r)), '名簿のNPCに名前・総合力・スタイルがある（細かい能力は出さない）');
    check(ex.j.rosters && ex.j.rosters.length === 30, '書き出しに名簿（30クラブ）が入っている');
    const npcIds = ex.j.rosters.flatMap((r) => JSON.parse(r.data).map((p) => p.id));
    check(npcIds.length === 660 && new Set(npcIds).size === 660, 'NPCは660人でIDが重複しない');
    // 名簿のない、古い形（v1）の世界を読み込むと、クラブ名が付け直され、名簿が作られる
    const w1 = JSON.parse(ex.j.world);
    w1.v = 1; for (const c of w1.clubs) { c.name = `旧クラブ${c.id}`; c.city = `旧${c.id}`; for (const k of ['short', 'mark', 'atk', 'dfn', 'depth', 'youth', 'money', 'pop', 'recruit', 'nat']) delete c[k]; }
    const lgBefore = w1.clubs.map((c) => c.lg).join();
    const im1 = await call('/dev/import', { body: { ...ex.j, world: JSON.stringify(w1), rosters: undefined } });
    check(im1.status === 200 && im1.j.npcs === 660, `v1の世界を読み込むと名簿ができる（${im1.status} ${im1.j && im1.j.npcs}）`);
    const ex1 = (await call('/admin/export', { headers: { 'X-Admin-Key': ADMIN } })).j, w2 = JSON.parse(ex1.world);
    check(w2.v === 2 && w2.clubs.every((c) => c.short && !c.name.startsWith('旧')), '世界が v2 になり、クラブ名が新しくなる');
    check(w2.clubs.map((c) => c.lg).join() === lgBefore, '移行しても今の所属リーグはそのまま');
    await call('/dev/import', { body: { ...ex.j, world: JSON.stringify(w1), rosters: undefined } });
    const ex1b = (await call('/admin/export', { headers: { 'X-Admin-Key': ADMIN } })).j;
    check(ex1.rosters.length === 30 && JSON.stringify(ex1.rosters) === JSON.stringify(ex1b.rosters), '同じデータから作り直すと同じ名簿になる（決まったシード）');
    const stA = (await call('/state', { code: A })).j;
    check(stA.me.money === snapshot.me.money && JSON.stringify(stA.me.history) === JSON.stringify(snapshot.me.history), '移行してもプレイヤーのお金・経歴はそのまま');
  }
  // 引退 → 次の世代
  for (let i = 0; i < 9; i++) await call('/dev/tick', { body: { n: 40 } });
  for (let k = 0; k < 40; k++) { st = (await call('/state', { code: users[1].code })).j; if (st.me.status === 'retired' || (st.me.status === 'off' && st.me.offer.canRetire)) break; await call('/dev/tick', { body: { n: 1 } }); }
  if (st.me.status === 'off') await call('/decide', { code: users[1].code, body: { choice: 'retire' } });
  st = (await call('/state', { code: users[1].code })).j;
  check(st.me.status === 'retired' && st.me.summary && st.me.summary.titles.length > 0, '引退して称号が付く');
  const ng = await call('/nextgen', { code: users[1].code, body: { name: '通し 二世', pos: 'FW' } });
  check(ng.status === 200 && ng.j.me.gen === 2 && ng.j.me.lineage.length === 1, '次の世代を始められる');
  { const bad = log.split(/\r?\n/).filter((l) => /Uncaught|TypeError|ReferenceError/.test(l)); check(!bad.length, 'サーバーのログにエラーがない' + (bad.length ? '：' + bad.slice(0, 4).join(' / ').slice(0, 600) : '')); }
} catch (e) {
  failures++; console.log('  ✗ 例外: ' + (e.stack || e));
} finally {
  stop();
}
console.log(`online: ${failures ? failures + ' failed' : 'all passed'}`);
process.exit(failures ? 1 : 0);
