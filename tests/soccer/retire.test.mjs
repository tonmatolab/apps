// オンライン：今季限りで引退の宣言・引退する前の見通し（どちらも30歳から）
//   node tests/soccer/retire.test.mjs
import * as G from '../../soccer-online-api/src/sim.js';
const SL = G.SL;

let failures = 0;
const check = (c, m) => { if (!c) { failures++; console.log('  ✗ ' + m); } else if (process.env.VERBOSE) console.log('  ✓ ' + m); };

const w = G.newWorldState(), npcs = SL.newNpcWorld(w.clubs, 1), now = Date.now();
const mk = (age) => { const m = G.newMember('m' + age, 'a' + age, 'ベテラン' + age, 'FW'); m.status = 'active'; m.pl.club = 12; m.pl.age = age; m.pl.contract = 3; m.seenAt = now;
  m.history = [{ year: w.year - 1, age: age - 1, club: w.clubs[12].name, clubId: 12, lg: '1部', number: 9, apps: 30, starts: 30, goals: 12, assists: 4, cs: 0, rating: 7, rank: 4, awards: [], ovr: 70, salary: 900 }];
  m.totals.apps = 30; m.totals.goals = 12; m.totals.assists = 4; return m; };

// 30歳未満は宣言できない
{
  const y = mk(29);
  check(G.planRetire(y, w, true) === 'too_young' && !y.retirePlan, '29歳は今季限りの引退を宣言できない');
  check(G.RETIRE_AGE === 30, '引退できるのは30歳から');
}
// 30歳：宣言・取り消し
const v = mk(31);
{
  check(G.planRetire(v, w, true) === null && v.retirePlan === w.year, '31歳は今季限りの引退を宣言できる');
  check((w.news || []).some((n) => n.t.includes('今季限りでの現役引退を発表')), 'リーグ速報に発表が出る');
  check(G.planRetire(v, w, false) === null && !v.retirePlan, 'シーズン中なら取り消せる');
  G.planRetire(v, w, true);
  const off = { ...v, status: 'off' };
  check(G.planRetire(off, w, true) === 'not_now', 'オフには宣言できない（オフはそのまま引退を選ぶ）');
}
// 見通し：スコア・ランク・称号・ボーナス
{
  const pv = G.retirePreviewOf(v, w);
  check(pv.score > 0 && ['SS', 'S', 'A', 'B', 'C', 'D'].includes(pv.letter) && Array.isArray(pv.titles) && pv.titles.length > 0 && pv.bonus >= 0, `見通し：${pv.score}点・ランク${pv.letter}・称号${pv.titles.length}個・ボーナス+${pv.bonus}`);
  check(pv.newTitles.length === pv.titles.length, '図鑑が空なら、手に入る称号はすべて「新しく入る」');
  check(!pv.next || pv.next.need > 0, '次のランクまでの点数');
}
// シーズンが終わったら、宣言した人は引退（オファーは出ない）。宣言していない人は今までどおりオフへ
{
  const other = mk(32);
  const members = [v, other];
  G.endSeason(w, members, npcs, null);
  check(v.status === 'retired' && v.summary && !v.retirePlan && !v.offer, `宣言した人はシーズンの終わりに引退（${v.summary && v.summary.retireAge}歳）`);
  check(other.status === 'off' && other.offer, '宣言していない人は今までどおりオフ（契約を選ぶ）');
  check(v.col.lives === 1, '引退は図鑑に記録される');
}

console.log(`retire: ${failures ? failures + ' failed' : 'all passed'}`);
process.exitCode = failures ? 1 : 0;
