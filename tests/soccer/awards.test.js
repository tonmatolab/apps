// 個人ランキング・個人賞（core-awards.js）のテスト
//   node tests/soccer/awards.test.js
'use strict';
const { seeded, check, failed } = require('./lib');
const SL = require('./sl');

SL.setRng(seeded(2024));
const s = SL.newGame('テスト 太郎', 'FW');
s.p.stats = { spd: 88, sht: 95, pas: 75, drb: 85, def: 40, phy: 80, gk: 10 };
SL.joinClub(s, s.draft[0]); delete s.draft; SL.startSeason(s);
while (s.phase === 'season') SL.playWeek(s);

// ----- ランキング -----
const entries = SL.npcEntries(s.npcs, s.npcSeason, s.clubs);
entries.push(SL.userEntry(s.p, s.season, s.clubs, { key: 'me', me: true }));
check(entries.length > 500 && entries.filter((e) => e.type === 'user').length === 1, `表にNPCと自分が並ぶ（${entries.length}人）`);
const lg = SL.clubOf(s).lg;
for (const cat of Object.keys(SL.RANK_CATS)) {
  const r = SL.ranking(entries, cat, { lg, n: 10 });
  check(r.top.every((x, i) => i === 0 || r.top[i - 1].v >= x.v), `${SL.RANK_CATS[cat].name}：大きい順`);
  check(r.top.every((x) => x.lg === lg), `${SL.RANK_CATS[cat].name}：選んだリーグだけ`);
  if (SL.RANK_CATS[cat].pos) check(r.top.every((x) => SL.RANK_CATS[cat].pos.includes(x.pos)), `${SL.RANK_CATS[cat].name}：対象のポジションだけ`);
}
check(SL.ranking(entries, 'rating', { lg }).top.every((x) => x.apps >= SL.MIN_RATE_APPS), '平均評価は出場数の条件を満たす人だけ');
check(SL.ranking(entries, 'goals', { who: 'npc' }).top.every((x) => x.type === 'npc'), 'NPCだけに絞れる');
const mineOnly = SL.ranking(entries, 'goals', { who: 'user' });
check(mineOnly.top.length <= 1 && (!mineOnly.top.length || mineOnly.top[0].me), '本物のプレイヤーだけに絞れる');
const g = SL.ranking(entries, 'goals', { lg, n: 3 });
check(s.season.goals === 0 || (g.mine && g.mine.v === s.season.goals), `自分の順位が分かる（${g.mine ? g.mine.rank + '位 ' + g.mine.v + '点' : 'なし'}）`);

// ----- 個人賞（シーズン終了） -----
const res = SL.endSeason(s);
const rec = s.leagueHistory.at(-1);
check(s.leagueHistory.length === 1 && rec.year === s.year, '歴代の受賞者が1シーズン分たまる');
for (const L of SL.LEAGUES) {
  const A = rec.lg[L.id];
  check(A.champion && A.scorer.length >= 1 && A.scorer[0].v >= 5, `${L.short}：優勝と得点王（${A.scorer.map((x) => x.name + ' ' + x.v).join(',')}）`);
  check(A.mvp && A.best.FW && A.best.MF && A.best.DF && A.best.GK, `${L.short}：MVPとポジション別最優秀`);
  const xp = {}; A.xi.forEach((x) => { xp[x.pos] = (xp[x.pos] || 0) + 1; });
  check(A.xi.length === 11 && xp.GK === 1 && xp.DF === 4 && xp.MF === 4 && xp.FW === 2, `${L.short}：ベストイレブンは4-4-2`);
  check(SL.isEU(L.id) ? !A.rookie : !!A.rookie, `${L.short}：新人王は国内リーグだけ`);
}
check(rec.world && rec.world.name, '世界年間最優秀選手がいる');
// 自分の賞と、歴代の記録が食い違わない
const myA = rec.lg[res.row.lg === '欧州' ? 0 : res.row.lg === '1部' ? 1 : 2], has = (w) => res.awards.some((a) => a.endsWith(w));
check(has('得点王') === myA.scorer.some((x) => x.type === 'user'), '得点王：自分の賞と記録が一致');
check(has('MVP') === (myA.mvp && myA.mvp.type === 'user'), 'MVP：自分の賞と記録が一致');
check(has('ベストイレブン') === myA.xi.some((x) => x.type === 'user'), 'ベストイレブン：自分の賞と記録が一致');
check(res.league === myA && typeof res.npcG === 'number', 'シーズン終了の画面用に自分のリーグの賞を返す');
// NPCの受賞は本人のデータに残る
const npcWinners = s.npcs.filter((p) => p.aw && p.aw.length);
check(npcWinners.length >= 30 && npcWinners.every((p) => p.aw.every((a) => a.startsWith(String(s.year)))), `NPCの受賞が名簿に残る（${npcWinners.length}人）`);
console.log(`    あなた：${res.awards.join('・') || 'なし'}（${s.history.at(-1).goals}点・評価${s.history.at(-1).rating}）`);

// ----- 同点の得点王は全員 -----
{
  const E = [{ key: 'a', name: 'A', type: 'npc', pos: 'FW', lg: 1, club: 10, apps: 18, goals: 9, assists: 0, rating: 7, tackles: 0, inters: 0, saves: 0, cs: 0 },
    { key: 'b', name: 'B', type: 'user', pos: 'FW', lg: 1, club: 11, apps: 18, goals: 9, assists: 1, rating: 6.9, tackles: 0, inters: 0, saves: 0, cs: 0 }];
  const aw = SL.seasonAwards(E, () => [10, 11]);
  check(aw.byLg[1].scorer.length === 2 && aw.won.get('b').includes('1部得点王'), '同点なら得点王は2人とも');
}

console.log(`awards: ${failed() ? failed() + ' failed' : 'all passed'}`);
process.exitCode = failed() ? 1 : 0;
