// オンライン：Bチーム（リザーブ）。満員でも若手を引退させない・Bチームの試合・1軍への昇格
//   node tests/soccer/reserve.test.mjs
import * as G from '../../soccer-online-api/src/sim.js';
const SL = G.SL;

let failures = 0;
const check = (c, m) => { if (!c) { failures++; console.log('  ✗ ' + m); } else if (process.env.VERBOSE) console.log('  ✓ ' + m); };

const w = G.newWorldState(), npcs = SL.newNpcWorld(w.clubs, 1), now = Date.now();
// どのクラブも1軍が満員（ダミーの人で埋める）
const members = [];
for (const c of w.clubs) for (let i = 0; i < G.capOf(c.id); i++) { const d = G.newMember(`d${c.id}_${i}`, `a${c.id}_${i}`, 'ダミー', 'MF'); d.status = 'decided'; d.pl.club = c.id; d.seenAt = now; members.push(d); }
const strong = w.clubs.filter((c) => c.lg === 1).sort((a, b) => b.str - a.str)[0];
// 強いクラブにいる、まだ力の足りない若手（契約が切れる）
const m = G.newMember('me', 'acc', 'B 太郎', 'MF');
m.status = 'active'; m.pl.club = strong.id; m.pl.contract = 1; m.pl.salary = 500; m.seenAt = now; m.pl.age = 21;
members.push(m);

// 1軍がどこも満員：新人は Bチームから
{
  const rk = G.newMember('rk', 'rk', '新人', 'FW');
  const d = G.draftOffers(rk, w, members); rk.draft = d;
  check(d.length > 0 && d.every((o) => o.reserve && o.salary === G.RESERVE_SALARY), `1軍がどこも満員なら、新人には Bチームの候補（${d.length}件）`);
  check(G.join(rk, w, 0, members) === null && rk.reserve && rk.status === 'active', 'Bチームとして入団できる（定員と関係なく）');
  check(G.humansAt(members.concat([rk]), rk.pl.club) === G.capOf(rk.pl.club), 'Bチームの人はクラブの定員に数えない');
}
// シーズン終了：戦力外でも引退させず、Bチームという行き先がある
G.endSeason(w, members, npcs, null);
{
  const o = m.offer;
  check(m.status === 'off' && o.res.released && !o.forced, `戦力外でも強制引退にならない（forced=${o.forced}）`);
  check(G.offerList(m).some((x) => x.reserve && x.club === strong.id), '今のクラブの Bチームに入る選択肢がある');
  const plan = G.planAuto(m, w, members, npcs);
  check(plan.kind === 'stay' && plan.offer && plan.offer.reserve, '選ばなければ Bチームへ（自動）');
}
G.finishOffseason(w, members, now, npcs);
check(m.reserve && m.status === 'active' && m.pl.club === strong.id, 'オフが終わると Bチームの選手として新シーズン');
// Bチームの試合：1軍の成績は増えず、Bチームの成績が増える
{
  for (let i = 0; i < 6; i++) G.playMatchday(w, members, npcs, null);
  check(m.season.apps === 0 && m.rsv.apps >= 1 && m.rsvLast && m.rsvLast.week === 6, `Bチームの試合に出る（1軍 ${m.season.apps}試合・B ${m.rsv.apps}試合）`);
  check(m.reserve, '1軍が満員のうちは Bチームのまま');
}
// Bチームのシーズン：経歴に「Bチーム」として残り、生涯スコアには入らない
{
  const before = G.scoreNow(m, w);
  while (w.week < SL.SEASON_WEEKS) G.playMatchday(w, members, npcs, null);
  G.endSeason(w, members, npcs, null);
  const row = m.history.at(-1);
  check(row.lg === 'Bチーム' && row.apps === 0 && row.reserve && row.reserve.apps >= 1, `経歴に Bチームのシーズン（B ${row.reserve.apps}試合・${row.reserve.goals}点）`);
  check(G.scoreNow(m, w) === before, 'Bチームの成績は生涯スコアに入らない');
  check(m.offer.reserve && !m.offer.forced && G.planAuto(m, w, members, npcs).kind === 'stay', 'オフ：1軍の空きがなければ Bチームに残る');
  G.finishOffseason(w, members, now, npcs);
}
// 1軍に空きが出て、力がつけば昇格
{
  const gone = members.find((x) => x.pl.club === strong.id && x !== m && !x.reserve && x.status !== 'retired');
  if (gone && G.clubFull(members, strong.id, 'MF', m)) { gone.status = 'dormant'; gone.pl.club = null; } // 休眠で1人分空く（ダミーが移籍などで抜けていれば、もう空いている）
  for (const k of Object.keys(m.pl.stats)) m.pl.stats[k] = 90;
  G.playMatchday(w, members, npcs, null);
  check(!m.reserve && m.fromReserve && m.pl.club === strong.id, '1軍に空きが出たら、力のある Bチームの人は昇格する');
  check((w.news || []).some((n) => n.t.includes('1軍に昇格')), 'リーグ速報に昇格が出る');
  check(G.humansAt(members, strong.id) === G.humansAt(members, strong.id, null, m) + 1, '昇格した人は1軍の定員に数える');
}
// 称号：たたき上げ
{
  m.status = 'off'; m.pl.age = 33;
  G.retire(m, w);
  check(m.summary.titles.includes('ol_reserve'), '引退すると「たたき上げ」の称号');
  check(SL.titleInfo('ol_reserve') && SL.titleInfo('ol_reserve').online, '「たたき上げ」はオンライン専用の称号');
}

// Bチームの上限（全体 RESERVE_CAP 人）：満員なら新人の候補なし・戦力外の人は今のクラブに1年残る
{
  const w2 = G.newWorldState(), np2 = SL.newNpcWorld(w2.clubs, 1), ms = [];
  for (const c of w2.clubs) for (let i = 0; i < G.capOf(c.id); i++) { const d = G.newMember(`e${c.id}_${i}`, 'x', 'ダミー', 'MF'); d.status = 'decided'; d.pl.club = c.id; d.seenAt = now; ms.push(d); }
  for (let i = 0; i < G.RESERVE_CAP; i++) { const r = G.newMember('r' + i, 'r', 'B', 'MF'); r.status = 'decided'; r.pl.club = i % 40 + 10; r.reserve = true; r.seenAt = now; ms.push(r); }
  check(G.reserveCount(ms) === G.RESERVE_CAP && !G.reserveOpen(ms), `Bチームが${G.RESERVE_CAP}人で満員`);
  check(G.draftOffers(G.newMember('n', 'n', '新人', 'DF'), w2, ms).length === 0, '1軍も Bチームも満員なら、新人の候補はなし（登録で止める）');
  const p = G.newMember('p', 'p', '戦力外', 'MF'); p.status = 'active'; p.pl.club = strong.id; p.pl.contract = 1; p.pl.age = 21; p.seenAt = now; ms.push(p);
  G.endSeason(w2, ms, np2, null);
  const L = G.offerList(p);
  check(!p.offer.forced && L.some((x) => x.keep && x.club === strong.id) && !L.some((x) => x.reserve), 'Bチームが満員なら、戦力外の人は今のクラブに1年残れる（引退にならない）');
}
// 満員のせいで引退になった人を Bチームに戻す（図鑑の記録も取り消す）
{
  const r = G.newMember('rt', 'rt', '戻る人', 'FW');
  r.history = [{ year: 2027, age: 20, club: w.clubs[12].name, clubId: 12, lg: '1部', number: 9, apps: 5, starts: 2, goals: 1, assists: 0, cs: 0, rating: 6.2, rank: 5, awards: [], ovr: 55, salary: 300 }];
  r.totals.apps = 5; r.totals.goals = 1; r.status = 'off'; r.pl.club = 12; r.pl.age = 21;
  G.retire(r, w);
  check(r.status === 'retired' && r.col.lives === 1 && Object.keys(r.col.t).length > 0, '引退すると図鑑に記録される');
  check(G.restoreToReserve(r, w) && (r.status === 'active' || r.status === 'decided'), '引退を取り消せる');
  check(r.reserve && r.pl.club === 12 && !r.summary && r.restored, '最後にいたクラブの Bチームの選手に戻る');
  check(r.col.lives === 0 && Object.keys(r.col.t).length === 0 && !Object.keys(r.col.clubs).length, 'その人生の図鑑の記録は取り消す（あとで本当に引退したときに入る）');
  check(!G.restoreToReserve(r, w), '引退していない人には何もしない');
}

console.log(`reserve: ${failures ? failures + ' failed' : 'all passed'}`);
process.exitCode = failures ? 1 : 0;
