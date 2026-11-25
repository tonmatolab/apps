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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// サーバーを止めて一時フォルダを消す。Windows は止めた直後だとファイルがまだ掴まれていて消せないので、少し待ちながら何度か試す
async function stop() {
  try { if (process.platform === 'win32') execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' }); else process.kill(-proc.pid); } catch {}
  for (let i = 0; i < 20 && fs.existsSync(tmp); i++) {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { await wait(500); }
  }
  if (fs.existsSync(tmp)) console.log('  （一時フォルダを消せませんでした：' + tmp + '）');
}
for (let i = 0; i < 120 && !/Ready on/.test(log); i++) await wait(1000);
if (!/Ready on/.test(log)) { console.log('サーバーが起動しませんでした\n' + log.slice(-2000)); await stop(); process.exit(1); }

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
  // PKチャレンジは終了（試合中のPKになった）。古い画面から呼ばれても何も起きない
  const pk = await call('/pk/start', { code: A, body: {} });
  check(pk.status === 410 && pk.j.error === 'pk_ended', 'PKチャレンジは終了している');
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
  // 新しい試合（Phase 2）：自分の試合の流れ・細かい成績、全員向けの結果にNPCの名前も出る
  {
    const st1 = (await call('/state', { code: A })).j, L = st1.me.last;
    check(L && Array.isArray(L.log) && Array.isArray(L.ht) && L.ht.length === 2, '前の試合に名前つきの流れと前半のスコアがある');
    check(L.role === 'injured' || L.role === 'bench' || (L.st && L.st.pa >= 0), '出場したら細かい成績（パスなど）がある');
    const goals = st1.results.list.flatMap((r) => r.goals);
    check(goals.length > 0 && goals.every((g) => typeof g.who === 'string'), `結果のゴールに名前がある（${goals.length}点）`);
    const ex0 = (await call('/admin/export', { headers: { 'X-Admin-Key': ADMIN } })).j;
    const ns = JSON.parse(ex0.npcstats.find((r) => r.k === 'season').v);
    check(Object.keys(ns.stats).length > 300, `NPCの今季の成績が保存される（${Object.keys(ns.stats).length}人）`);
  }
  // 今季の個人ランキング（NPCも含む）
  {
    const rk = await call('/ranking?lg=1&cat=goals&who=all', { code: A });
    check(rk.status === 200 && rk.j.top.length > 0 && rk.j.top.some((r) => r.type === 'npc'), '個人ランキングにNPCが載る');
    check(rk.j.top.every((r, i) => i === 0 || rk.j.top[i - 1].v >= r.v), '個人ランキングは大きい順');
    const ru = await call('/ranking?lg=all&cat=assists&who=user', { code: A });
    check(ru.status === 200 && ru.j.top.every((r) => r.type === 'user'), '本物のプレイヤーだけに絞れる');
    check((await call('/ranking?lg=9&cat=xxx&who=zzz')).status === 200, 'おかしな指定でも落ちない');
  }
  // シーズンを最後まで → オフ → 新シーズン
  await call('/dev/tick', { body: { n: 17 } });
  let st = (await call('/state', { code: A })).j;
  {
    const h = st.seasonHistory.at(-1);
    check(h && h.awards && h.awards.lg[1].scorer.length && h.awards.lg[1].mvp && h.awards.lg[1].xi.length === 11, 'シーズン終了で個人賞（得点王・MVP・ベストイレブン）が記録される');
    const ex2 = (await call('/admin/export', { headers: { 'X-Admin-Key': ADMIN } })).j;
    const npcAw = ex2.rosters.flatMap((r) => JSON.parse(r.data)).filter((p) => p.aw && p.aw.length).length;
    check(npcAw >= 30, `NPCの受賞が名簿に保存される（${npcAw}人）`);
    const myRow = st.me.history.at(-1), mine = (w) => myRow.awards.some((a) => a.endsWith(w));
    const L = h.awards.lg[{ 欧州: 0, '1部': 1, '2部': 2 }[myRow.lg]];
    check(mine('得点王') === L.scorer.some((x) => x.name === st.me.name), '自分の得点王と記録が一致');
  }
  check(st.world.phase === 'off' && st.me.status === 'off', 'シーズンが終わってオフになる');
  check(st.me.history.length === 1, '経歴に1シーズン分が記録される');
  // オフに移籍を希望する（1回だけ）
  {
    const r1 = await call('/request', { code: A, body: {} });
    check(r1.status === 200 && r1.j.me.offer && r1.j.me.offer.requested, `オフに移籍を希望できる（${r1.status}${r1.j && r1.j.error ? ' ' + r1.j.error : ''}）`);
    check(r1.j.me.offer.list.filter((o) => !o.stay).every((o) => typeof o.fee === 'number'), '移籍のオファーに移籍金が付く');
    const r2 = await call('/request', { code: A, body: {} });
    check(r2.status === 400 && r2.j.error === 'already', '移籍の希望は1回だけ');
    check(Array.isArray(st.records.npcLegends), 'NPCレジェンドの一覧が画面に届く');
  }
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
  // 得意能力・必殺技・立ち位置・見通し
  {
    const su = await call('/signup', { body: { name: '得意 確認', pos: 'MF', appeal: 'pas' } });
    check(su.status === 200 && su.j.state.me.appeal === 'pas', '得意能力を選んで登録できる');
    // （ポジションに合わない得意能力は world.test.js で確認。ここで登録を増やすと、同じIPの登録の上限に当たる）
    const C2 = su.j.code; await call('/join', { code: C2, body: { i: 0 } });
    const mv = await call('/move', { code: C2, body: { move: '雷鳴シュートとても長い名前' } });
    check(mv.status === 200 && mv.j.me.move === '雷鳴シュートとても長', `必殺技の名前を決められる（10文字まで：${mv.j.me && mv.j.me.move}）`);
    check((await call('/move', { code: C2, body: { move: 'しね' } })).j.error === 'bad_move', '使えない言葉は必殺技にできない');
    const st2 = (await call('/state', { code: C2 })).j;
    check(st2.me.depth && st2.me.depth.rank >= 1 && /番手/.test(st2.me.depth.text), `チーム内の立ち位置が分かる（${st2.me.depth && st2.me.depth.text}）`);
    // 休眠：長く来ていない人は、オフの終わりに枠を空ける → 戻ってきたらクラブを選び直す
    const debut = st2.me.debutYear;
    await call('/dev/seen', { body: { ms: 15 * 24 * 3600000 } });
    for (let k = 0; k < 25; k++) { const w = (await call('/public')).j.world; if (w.phase === 'season' && w.week === 0 && k > 0) break; await call('/dev/tick', { body: { n: 1 } }); }
    const exD = (await call('/admin/export', { headers: { 'X-Admin-Key': ADMIN } })).j;
    const dm = exD.players.map((p) => JSON.parse(p.data)).find((m) => m.pl.name === '得意 確認');
    check(dm && dm.status === 'dormant' && dm.pl.club == null && dm.prevClub != null, `長く来ていない人は休眠になり、クラブの枠を空ける（${dm && dm.status}）`);
    const back = (await call('/state', { code: C2 })).j;
    check(back.me.status === 'draft' && back.me.returning && back.me.draft.length > 0 && back.me.move === '雷鳴シュートとても長', '戻ってくると、空いているクラブから選び直せる（必殺技などはそのまま）');
    const jn = await call('/join', { code: C2, body: { i: 0 } });
    check(jn.status === 200 && (jn.j.me.status === 'active' || jn.j.me.status === 'decided') && jn.j.me.debutYear === debut && !jn.j.me.returning, '選び直すとまた試合に出られる（デビューの年はそのまま）');
    // 登録したままクラブを選ばない人は、24時間で休眠になり定員の枠を空ける（同じIPの登録の上限に当たらないよう、別のIPから登録）
    const su3 = await call('/signup', { body: { name: '未選択 確認', pos: 'DF' }, headers: { 'CF-Connecting-IP': '10.9.9.9' } });
    check(su3.status === 200 && su3.j.state.me.status === 'draft', `クラブを選ぶ前の人を作れる（${su3.status} ${su3.j && su3.j.error || ''}）`);
    const before = (await call('/public')).j.world.players;
    await call('/dev/seen', { body: { ms: 23 * 3600000 } }); await call('/dev/tick', { body: { n: 1 } });
    const st47 = (await call('/admin/export', { headers: { 'X-Admin-Key': ADMIN } })).j.players.map((p) => JSON.parse(p.data)).find((m) => m.pl.name === '未選択 確認');
    check(st47 && st47.status === 'draft', '24時間たつまでは、クラブを選ぶ前のまま');
    await call('/dev/seen', { body: { ms: 25 * 3600000 } }); await call('/dev/tick', { body: { n: 1 } });
    const exI = (await call('/admin/export', { headers: { 'X-Admin-Key': ADMIN } })).j.players.map((p) => JSON.parse(p.data));
    const idle = exI.find((m) => m.pl.name === '未選択 確認');
    check(idle && idle.status === 'dormant' && idle.pl.club == null, `24時間クラブを選ばないと休眠になる（${idle && idle.status}）`);
    const joined = exI.find((m) => m.pl.name === '得意 確認');
    check(joined && joined.status !== 'dormant' && joined.pl.club != null, `クラブにいる人は24時間来なくても休眠にならない（${joined && joined.status}）`);
    const after = (await call('/public')).j.world.players;
    check(after === before - 1, `休眠の人は参加人数に数えない（${before}人 → ${after}人）`);
    const back3 = (await call('/state', { code: su3.j.code })).j;
    check(back3.me.status === 'draft' && !back3.me.returning && back3.me.draft.length > 0, 'あとで来ても、そのままクラブを選べる（「おかえりなさい」は出さない）');
    // 使えない言葉：空白・カタカナ・半角で書きかえても止める
    for (const bad of ['シ ネ', 'ｼﾈ', '綾部 死んでくれます', 'ＦＵＣＫ']) {
      const r = await call('/signup', { body: { name: bad, pos: 'FW' }, headers: { 'CF-Connecting-IP': '10.8.8.8' } });
      check(r.j && r.j.error === 'bad_name', `使えない言葉の名前は登録できない（${bad}：${r.j && r.j.error}）`);
    }
    // 管理用の名前の変更（キーがないと見えない）
    const AK = { 'X-Admin-Key': ADMIN };
    check((await call('/admin/rename', { body: { id: 'x' } })).status === 404 && (await call('/admin/ng')).status === 404, '管理用の操作はキーがないと使えない');
    const ex0 = (await call('/admin/export', { headers: AK })).j.players.map((p) => JSON.parse(p.data));
    const tgt = ex0.find((m) => m.pl.name === '得意 確認');
    const rn = await call('/admin/rename', { body: { id: tgt.id, to: '改名 確認' }, headers: AK });
    check(rn.status === 200 && rn.j.from === '得意 確認' && rn.j.to === '改名 確認', `管理用に名前を変えられる（${rn.status} ${JSON.stringify(rn.j)}）`);
    const me2 = (await call('/state', { code: C2 })).j.me;
    check(me2.name === '改名 確認' && me2.move === '雷鳴シュートとても長', `本人の画面にも新しい名前が出る（${me2.name}）`);
    const exR = (await call('/admin/export', { headers: AK })).j;
    check(!exR.world.includes('得意 確認') && !exR.players.some((p) => p.data.includes('得意 確認')), '速報・記録・データに古い名前が残らない');
    const auto = await call('/admin/rename', { body: { id: tgt.id }, headers: AK });
    check(/^選手\d{4}$/.test(auto.j.to), `名前を指定しなければ「選手＋数字」（${auto.j.to}）`);
    const ngl = await call('/admin/ng', { headers: AK });
    check(ngl.status === 200 && Array.isArray(ngl.j.players), '使えない言葉を含む名前の一覧を出せる');
  }
  { const bad = log.split(/\r?\n/).filter((l) => /Uncaught|TypeError|ReferenceError/.test(l)); check(!bad.length, 'サーバーのログにエラーがない' + (bad.length ? '：' + bad.slice(0, 4).join(' / ').slice(0, 600) : '')); }
} catch (e) {
  failures++; console.log('  ✗ 例外: ' + (e.stack || e));
} finally {
  await stop();
}
console.log(`online: ${failures ? failures + ' failed' : 'all passed'}`);
process.exit(failures ? 1 : 0);
