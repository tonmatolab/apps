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
sql("INSERT INTO scores (game, ms, token, created) VALUES " + Array.from({ length: 25 }, (_, i) => `('soccerq2', ${100 + i * 10}, 't${i}', 0)`).join(','));

const proc = spawn('npx', ['wrangler@4', 'dev', ...CFG, '--port', String(PORT)], { cwd: ROOT, shell: true });
let log = ''; proc.stdout.on('data', (d) => { log += d; }); proc.stderr.on('data', (d) => { log += d; });
async function stop() {
  try { if (process.platform === 'win32') execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: 'ignore' }); else process.kill(-proc.pid); } catch {}
  for (let i = 0; i < 20 && fs.existsSync(tmp); i++) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { await wait(500); } }
}
for (let i = 0; i < 120 && !/Ready on/.test(log); i++) await wait(1000);
if (!/Ready on/.test(log)) { console.log('サーバーが起動しませんでした\n' + log.slice(-1500)); await stop(); process.exit(1); }

const call = async (p, body) => { const r = await fetch(B + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, j: await r.json().catch(() => null) }; };
const realCount = (g) => JSON.parse(sql(`SELECT COUNT(*) AS n FROM scores WHERE game = '${g}'`))[0].results[0].n;
try {
  // 件数をまだ持っていないゲーム：最初に数えて入れる
  const b1 = await call('/board?game=soccerq2');
  check(b1.s === 200 && b1.j.total === 25 && b1.j.top.length === 10 && b1.j.top[0].ms === 340, `ランキングの件数と上位（${b1.j && b1.j.total}件・1位 ${b1.j && b1.j.top[0].ms}）`);
  // 記録を出すたびに件数が1つ増える（数え直した値と一致する）
  const sc = [];
  for (const ms of [999, 50, 345, 120]) sc.push((await call('/score', { game: 'soccerq2', ms })).j);
  check(sc.map((x) => x.total).join() === '26,27,28,29', `記録を出すたびに件数が増える（${sc.map((x) => x.total).join()}）`);
  check(sc[0].rank === 1 && sc[0].top10 && sc[1].rank === 27 && !sc[1].top10 && sc[2].rank === 2, `順位（${sc.map((x) => x.rank).join()}）`);
  check((await call('/board?game=soccerq2')).j.total === realCount('soccerq2'), '持っている件数と、実際の記録の数が同じ');
  // 件数のないゲームで、いきなり記録を出しても正しい
  const f = (await call('/score', { game: 'onigiri', ms: 500 })).j;
  check(f.total === 1 && f.rank === 1, `初めてのゲームの最初の記録（${f.total}件・${f.rank}位）`);
  check((await call('/board?game=onigiri')).j.total === 1, '初めてのゲームの件数');
  // 名前の登録（トップ10）・件数のキーは外から読み書きできない
  check((await call('/name', { game: 'soccerq2', id: sc[0].id, token: sc[0].token, name: 'テスト' })).j.ok === true, 'トップ10は名前を登録できる');
  check((await call('/hit/score:soccerq2', {})).s === 404 && JSON.stringify((await call('/get?keys=score:soccerq2')).j) === '{}', '件数のキーは /hit・/get から触れない');
  // ふつうのカウンター
  check((await call('/hit/test-key', {})).j.value === 1 && (await call('/get?keys=test-key')).j['test-key'] === 1, 'カウンターは今までどおり');
  const bad = log.split(/\r?\n/).filter((l) => /Uncaught|TypeError|ReferenceError|D1_ERROR/.test(l)); check(!bad.length, 'サーバーのログにエラーがない' + (bad.length ? '：' + bad.slice(0, 3).join(' / ') : ''));
} catch (e) { failures++; console.log('  ✗ 例外: ' + (e.stack || e)); } finally { await stop(); }
console.log(`counter: ${failures ? failures + ' failed' : 'all passed'}`);
process.exit(failures ? 1 : 0);
