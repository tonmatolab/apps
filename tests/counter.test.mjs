// カウンター＆ランキングAPI（counter-api）のテスト。手元で wrangler dev を起動して確かめる（本番には触らない）
//   node tests/counter.test.mjs
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8797, B = `http://127.0.0.1:${PORT}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'counter-test-'));
const CFG = ['--config', 'counter-api/wrangler.toml', '--persist-to', tmp];
let failures = 0;
const check = (c, m) => { if (!c) { failures++; console.log('  ✗ ' + m); } else if (process.env.VERBOSE) console.log('  ✓ ' + m); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = (cmd) => execSync(`npx wrangler@4 d1 execute tonmatolab-counter --local ${CFG.join(' ')} --json --command "${cmd}"`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString();

// 表を作り、本番と同じく「件数をまだ持っていない記録」を先に入れておく
execSync(`npx wrangler@4 d1 execute tonmatolab-counter --local ${CFG.join(' ')} --file counter-api/schema.sql`, { cwd: ROOT, stdio: 'ignore' });
sql('DROP TABLE hist'); // 本番と同じく、表はサーバーが最初に作る
sql("INSERT INTO scores (game, ms, token, created) VALUES " + Array.from({ length: 25 }, (_, i) => `('onigiri', ${100 + i * 10}, 't${i}', 0)`).join(','));

const proc = spawn('npx', ['wrangler@4', 'dev', ...CFG, '--port', String(PORT)], { cwd: ROOT, shell: true });
let log = ''; proc.stdout.on('data', (d) => { log += d; }); proc.stderr.on('data', (d) => { log += d; });
async function stop() {
  try { if (process.platform === 'win32') execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' }); else process.kill(-proc.pid); } catch {}
  for (let i = 0; i < 20 && fs.existsSync(tmp); i++) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { await wait(500); } }
}
for (let i = 0; i < 120 && !/Ready on/.test(log); i++) await wait(1000);
if (!/Ready on/.test(log)) { console.log('サーバーが起動しませんでした\n' + log.slice(-1500)); await stop(); process.exit(1); }

const call1 = async (p, body) => { const r = await fetch(B + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, j: await r.json().catch(() => null) }; };
const call = async (p, body) => { try { return await call1(p, body); } catch (e) { await wait(300); return call1(p, body); } }; // 手元のサーバーはたまに接続が切れるので1回だけやり直す
const realCount = (g) => JSON.parse(sql(`SELECT COUNT(*) AS n FROM scores WHERE game = '${g}'`))[0].results[0].n;
try {
  // 件数をまだ持っていないゲーム：最初に数えて入れる
  const b1 = await call('/board?game=onigiri');
  check(b1.s === 200 && b1.j.total === 25 && b1.j.top.length === 10 && b1.j.top[0].ms === 340, `ランキングの件数と上位（${b1.j && b1.j.total}件・1位 ${b1.j && b1.j.top[0].ms}）`);
  // 記録を出すたびに件数が1つ増える（数え直した値と一致する）
  const sc = [];
  for (const ms of [999, 50, 345, 120]) sc.push((await call('/score', { game: 'onigiri', ms })).j);
  check(sc.map((x) => x.total).join() === '26,27,28,29', `記録を出すたびに件数が増える（${sc.map((x) => x.total).join()}）`);
  check(sc[0].rank === 1 && sc[0].top10 && sc[1].rank === 27 && !sc[1].top10 && sc[2].rank === 2, `順位（${sc.map((x) => x.rank).join()}）`);
  check((await call('/board?game=onigiri')).j.total === realCount('onigiri'), '持っている件数と、実際の記録の数が同じ');
  { const r = (await call('/score', { game: 'onigiri', ms: 121 })).j, bd = (await call('/board?game=onigiri')).j; check(Array.isArray(r.top) && r.top.length === 10 && JSON.stringify(r.top) === JSON.stringify(bd.top) && r.total === bd.total, '記録を送った返事に、/board と同じ上位10件が入る'); }
  // 件数のないゲームで、いきなり記録を出しても正しい
  const f = (await call('/score', { game: 'nobiru', ms: 500 })).j;
  check(f.total === 1 && f.rank === 1, `初めてのゲームの最初の記録（${f.total}件・${f.rank}位）`);
  check((await call('/board?game=nobiru')).j.total === 1, '初めてのゲームの件数');
  // 名前の登録（トップ10）・件数のキーは外から読み書きできない
  check((await call('/name', { game: 'onigiri', id: sc[0].id, token: sc[0].token, name: 'テスト' })).j.ok === true, 'トップ10は名前を登録できる');
  // トップ100までは名前を登録できる（27位でも）。使えない言葉は書きかえても止める
  check(sc[1].canName === true && sc[1].top10 === false, '11位より下でも、100位までなら名前を登録できる印が付く');
  check((await call('/name', { game: 'onigiri', id: sc[1].id, token: sc[1].token, name: 'ｼﾈ' })).j.error === 'bad_name', '使えない言葉は半角でも止める');
  check((await call('/name', { game: 'onigiri', id: sc[1].id, token: sc[1].token, name: '二十七位' })).j.ok === true, '11位より下（いまは29位）でも名前を登録できる');
  // 表示数：省略で10、limit で100まで
  const b10 = (await call('/board?game=onigiri')).j, b100 = (await call('/board?game=onigiri&limit=100')).j, b999 = (await call('/board?game=onigiri&limit=999')).j;
  check(b10.top.length === 10 && b100.top.length === 30 && b999.top.length === 30 && b100.top[29].name === '二十七位', `表示数（省略 ${b10.top.length}・100 ${b100.top.length}・上限を超えても100まで）`);
  check((await call('/hit/score:onigiri', {})).s === 404 && JSON.stringify((await call('/get?keys=score:onigiri')).j) === '{}', '件数のキーは /hit・/get から触れない');
  // ふつうのカウンター
  // サッカー人生（名前が必須）：名前なしでは送れない。名無しの記録はランキングに出ず、件数にも数えない
  sql("INSERT INTO scores (game, ms, token, created, name) VALUES ('soccer2', 5000, 'a', 0, NULL), ('soccer2', 4000, 'b', 0, '先輩'), ('soccer2', 3000, 'c', 0, NULL)");
  check((await call('/score', { game: 'soccer2', ms: 3500 })).j.error === 'bad_name' && (await call('/score', { game: 'soccer2', ms: 3500, name: 'ｼﾈ' })).j.error === 'bad_name', 'サッカー人生は名前なし・使えない名前では送れない');
  const s2 = (await call('/score', { game: 'soccer2', ms: 4500, name: '新人' })).j;
  check(s2.rank === 1 && s2.total === 2 && s2.name === '新人' && !s2.canName, `名前つきで送ると、名前のある記録の中での順位（${s2.rank}位／${s2.total}件）`);
  const bd = (await call('/board?game=soccer2')).j;
  check(bd.total === 2 && bd.top.map((r) => r.name).join() === '新人,先輩', `名無しの記録はランキングに出ない（${bd.top.map((r) => r.name).join()}）`);
  check((await call('/score', { game: 'soccer2', ms: 100, name: '下位' })).j.rank === 3, '名無しの記録は順位にも数えない');
  // 名前の横の印（いちばんレアな称号のID）。英数字の短いIDだけ残す・ほかのゲームには付かない
  const tg = (await call('/score', { game: 'soccer2', ms: 4800, name: '印あり', tag: 'wcw' })).j;
  check(tg.top.find((r) => r.name === '印あり')?.tag === 'wcw', '印が送った直後のランキングに出る');
  check((await call('/board?game=soccer2')).j.top.find((r) => r.name === '印あり')?.tag === 'wcw', '印がランキングに出る');
  const badTag = (await call('/score', { game: 'soccer2', ms: 4700, name: '変な印', tag: '<b>x</b>' })).j;
  check(!badTag.top.find((r) => r.name === '変な印')?.tag, '英数字でない印は捨てる');
  check(!(await call('/score', { game: 'onigiri', ms: 777, tag: 'wcw' })).j.top.some((r) => r.tag), '印のないゲームには付かない');
  // 週間ランキング：送った記録が今週の表に入る・順位・印・ほかのゲームにはない
  const wq = [];
  for (const [ms, nm] of [[3000, '週一'], [5000, '週二'], [4000, '週三'], [5000, '週四']]) wq.push((await call('/score', { game: 'soccerq2', ms, name: nm, tag: 'g1' })).j);
  check(wq.map((x) => x.week && x.week.rank).join() === '1,1,2,2' && wq[3].week.total === 4, `今週の順位（${wq.map((x) => x.week && x.week.rank).join()}）`);
  const wb = (await call('/board?game=soccerq2&period=week')).j;
  check(wb.total === 4 && wb.top.map((r) => r.name).join() === '週二,週四,週三,週一' && wb.top[0].tag === 'g1' && /^\d{4}-\d{2}-\d{2}$/.test(wb.week), `今週のランキング（${wb.top.map((r) => r.name).join()}・${wb.week}）`);
  const lw = (await call('/board?game=soccerq2&period=lastweek')).j;
  check(lw.total === 0 && lw.top.length === 0, '先週は空');
  const ow = (await call('/board?game=onigiri&period=week')).j;
  check(ow.top.length > 0 && !ow.week, '週間のないゲームは今までどおり全期間');
  // 500件を超えたら下から消える（表は500件のまま）・ランク外は null
  sql("INSERT INTO weekly (game, wk, o, sid, ms, name) SELECT 'soccerq2', '" + wb.week + "', 9000 * 1000000000 + (999999999 - (100000 + value)), 100000 + value, 9000, 'まとめて' FROM (WITH RECURSIVE c(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM c WHERE value < 496) SELECT value FROM c)");
  sql("UPDATE counters SET value = value + 496 WHERE key = 'wk:soccerq2:" + wb.week + "'");
  const out = (await call('/score', { game: 'soccerq2', ms: 10, name: '下位', tag: 'g1' })).j;
  check(out.week && out.week.rank === null && out.week.total === 501, `500位より下はランク外（${JSON.stringify(out.week)}）`);
  const inn = (await call('/score', { game: 'soccerq2', ms: 9500, name: '上位', tag: 'g1' })).j;
  const cnt = JSON.parse(sql("SELECT COUNT(*) AS n FROM weekly WHERE game = 'soccerq2'"))[0].results[0].n;
  check(inn.week.rank === 1 && cnt === 500, `500件のときに上位が入ると、いちばん下が消える（${inn.week.rank}位・${cnt}件）`);
  // 順位は帯（hist）を使って数える：全部数えたときの順位と同じになる（大きいほど上位・小さいほど上位・同点・帯の境目）
  {
    const brute = (rows, ms, id, desc) => rows.filter((r) => (desc ? r.ms > ms : r.ms < ms) || (r.ms === ms && r.id < id)).length + 1;
    let ok = true, bad = '';
    for (const [game, desc, gen] of [['soccerq', true, (i) => [1, 2, 100, 101, 102, 5000, 5049, 5050, 5051, 99999][i % 10] + (i % 3 === 0 || i % 10 === 9 ? 0 : Math.floor(Math.random() * 9000))], ['iai', false, (i) => 100 + Math.floor(Math.random() * 900)]]) {
      const rows = [];
      for (let i = 0; i < 120; i++) {
        const ms = i % 7 === 0 && rows.length ? rows[rows.length - 1].ms : gen(i); // 同点も入れる
        const r = (await call('/score', { game, ms })).j; rows.push({ id: r.id, ms });
        const want = brute(rows, ms, r.id, desc);
        if (r.rank !== want) { ok = false; bad = `${game} ${ms}: ${r.rank}位（正しくは${want}位）`; break; }
      }
    }
    check(ok, '帯を使った順位が、全部数えた順位と同じ' + (bad ? '：' + bad : ''));
    // 前からある記録（onigiri）にも帯が作られていて、順位が正しい
    const o = (await call('/score', { game: 'onigiri', ms: 300 })).j;
    const want = JSON.parse(sql("SELECT COUNT(*) AS n FROM scores WHERE game = 'onigiri' AND (ms > 300 OR (ms = 300 AND id < " + o.id + "))"))[0].results[0].n + 1;
    check(o.rank === want, `前からある記録も帯で数える（${o.rank}位・正しくは${want}位）`);
    const hs = JSON.parse(sql("SELECT game, SUM(n) AS n FROM hist GROUP BY game"))[0].results;
    const real = JSON.parse(sql("SELECT game, COUNT(*) AS n FROM scores WHERE name IS NOT NULL OR game NOT IN ('soccer2','soccerq2') GROUP BY game"))[0].results;
    check(hs.every((h) => real.find((r) => r.game === h.game).n === h.n), '帯の記録数の合計が、実際の記録数と同じ（' + hs.map((h) => h.game + ' ' + h.n).join('・') + '）');
  }
  // 画面は Content-Type を付けずに送る（text/plain。ブラウザが事前確認のリクエストを送らない）
  { const send = () => fetch(B + '/score', { method: 'POST', headers: { Origin: 'http://localhost:5173' }, body: JSON.stringify({ game: 'iai', ms: 250 }) }); const r = await send().catch(async () => { await wait(300); return send(); }); const j = await r.json(); check(r.status === 200 && j.rank >= 1 && j.top, 'Content-Type なしの送信も受け付ける'); }
  check((await call('/hit/test-key', {})).j.value === 1 && (await call('/get?keys=test-key')).j['test-key'] === 1, 'カウンターは今までどおり');
  const bad = log.split(/\r?\n/).filter((l) => /Uncaught|TypeError|ReferenceError|D1_ERROR/.test(l)); check(!bad.length, 'サーバーのログにエラーがない' + (bad.length ? '：' + bad.slice(0, 3).join(' / ') : ''));
} catch (e) { failures++; console.log('  ✗ 例外: ' + (e.stack || e)); } finally { await stop(); }
console.log(`counter: ${failures ? failures + ' failed' : 'all passed'}`);
process.exit(failures ? 1 : 0);
