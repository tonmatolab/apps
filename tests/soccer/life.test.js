// NPCの1年（成長・衰え・移籍・引退・新人・レジェンド）を30シーズン以上回しても、名簿が崩れないか
//   node tests/soccer/life.test.js
'use strict';
const { seeded, check, failed } = require('./lib');
const SL = require('./sl');

SL.setRng(seeded(31));
let s = SL.newGame('テスト 一郎', 'MF', { mode: 'quick' });
const pol = Object.keys(SL.POLICY)[0];
SL.autoDraft(s, pol);
const famous0 = new Set(s.npcs.filter((p) => p.fam).map((p) => p.id));
let seasons = 0, retiredTotal = 0, movesTotal = 0;
const perSeason = [];
while (seasons < 32) {
  const before = new Set(s.npcs.map((p) => p.id));
  const o = SL.autoYear(s, pol); seasons++;
  const rep = s.lastNpcOff;
  if (rep) { retiredTotal += rep.nRetired; movesTotal += rep.nMoves; perSeason.push(rep.nRetired); }
  if (o.retire) {
    SL.autoLastMatch(s); SL.retire(s);
    s = SL.nextGeneration(s, SL.childName(s.p.name), 'FW');
    SL.autoDraft(s, pol);
  }
}
const n = s.npcs;
check(seasons >= 30, `${seasons}シーズン回した（世代をまたいで同じ世界）`);
check(n.length === 1540, `NPCは1540人のまま（${n.length}）`);
check(new Set(n.map((p) => p.id)).size === n.length && new Set(n.map((p) => p.name)).size === n.length, 'IDと名前が重複しない');
let quotaOk = true, numOk = true, strOk = true;
const gaps = [];
for (const c of s.clubs) {
  const l = n.filter((p) => p.club === c.id), q = {};
  l.forEach((p) => { q[p.pos] = (q[p.pos] || 0) + 1; });
  if (l.length !== 22 || q.GK !== 3 || q.DF !== 7 || q.MF !== 7 || q.FW !== 5) quotaOk = false;
  if (new Set(l.map((p) => p.no)).size !== 22) numOk = false;
  const top = l.map(SL.ovr).sort((a, b) => b - a).slice(0, 11), avg = top.reduce((a, b) => a + b, 0) / 11;
  gaps.push(avg - c.str);
  if (Math.abs(avg - c.str) > 9) strOk = false;
}
check(quotaOk, '全クラブ22人で、ポジションの枠（GK3・DF7・MF7・FW5）が崩れない');
check(numOk, '全クラブで背番号が重複しない');
check(strOk, `先発11人の強さがクラブの強さから大きくずれない（差 ${Math.min(...gaps).toFixed(1)}〜${Math.max(...gaps).toFixed(1)}）`);
const ages = n.map((p) => p.age), avgAge = ages.reduce((a, b) => a + b, 0) / ages.length;
check(Math.max(...ages) <= 39 && Math.min(...ages) >= 17 && avgAge > 22 && avgAge < 30, `年齢が自然（${Math.min(...ages)}〜${Math.max(...ages)}歳・平均${avgAge.toFixed(1)}）`);
check(n.every((p) => Object.values(p.stats).every((v) => Number.isInteger(v) && v >= 1 && v <= 99)), '能力が1〜99');
const avgRet = retiredTotal / perSeason.length;
check(avgRet > 25 && avgRet < 110, `毎年それなりの人数が引退し、新人が入る（平均${avgRet.toFixed(0)}人/年）`);
check(movesTotal / perSeason.length > 3, `NPCの移籍が起きる（平均${(movesTotal / perSeason.length).toFixed(1)}件/年）`);
check(n.filter((p) => famous0.has(p.id)).length < famous0.size, '有名選手も年をとって引退していく（世代交代）');
check(s.npcLegends.length > 5 && s.npcLegends.every((l) => l.name && l.years && l.clubs.length), `レジェンドが記録される（${s.npcLegends.length}人）`);
check(s.npcLegends.every((l, i) => i === 0 || s.npcLegends[i - 1].score >= l.score), 'レジェンドはスコアの高い順');
const youngStars = n.filter((p) => p.age <= 23 && SL.ovr(p) >= 75).length;
check(youngStars > 3, `若手から強い選手が育つ（23歳以下で総合75以上 ${youngStars}人）`);
console.log(`    レジェンド上位：${s.npcLegends.slice(0, 3).map((l) => `${l.name}（${l.pos}・${l.years}・${l.goals}G・最高${l.best}）`).join(' / ')}`);
check(n.every((p) => !p.reborn), '一人用では転生しない');
// 転生（オンラインだけ）：60シーズン、NPCの1年だけを回す
{
  SL.setRng(seeded(77));
  const clubs = SL._.newWorld(), npcs = SL.newNpcWorld(clubs, 1), legends = [], rebirth = [];
  let reborn = [], dupOk = true, rosterOk = true;
  for (let y = 0; y < 60; y++) {
    const rep = SL.npcOffseason(npcs, clubs, {}, 2027 + y, legends, [], { rebirth });
    reborn = reborn.concat(rep.reborn);
    if (new Set(npcs.map((p) => p.name)).size !== npcs.length) dupOk = false;
    for (const c of clubs) { const l = npcs.filter((p) => p.club === c.id), q = {}; l.forEach((p) => { q[p.pos] = (q[p.pos] || 0) + 1; }); if (l.length !== 22 || q.GK !== 3 || q.DF !== 7 || q.MF !== 7 || q.FW !== 5) rosterOk = false; }
  }
  const now = npcs.filter((p) => p.reborn);
  check(reborn.length > 20, `有名選手が転生して戻ってくる（60年で${reborn.length}人）`);
  check(dupOk, '同じ名前の選手が同時に2人いることはない');
  check(rosterOk, '転生しても全クラブ22人・ポジションの枠どおり');
  check(now.every((p) => p.fam && p.reborn >= 2 && SL._.FAMOUS.some((f) => f[0] === p.name)), '転生した選手は有名選手の名前で、何度目の人生かが分かる');
  check(reborn.every((r) => r.gen >= 2), '転生は2度目の人生から');
  const grown = now.filter((p) => p.age >= 24 && SL.ovr(p) >= 75).length;
  check(grown > 0, `転生した選手がまた一流に育つ（24歳以上で総合75以上 ${grown}人）`);
  console.log(`    転生の例：${reborn.slice(0, 3).map((r) => `${r.name}（${r.gen}度目・${r.club}）`).join(' / ')}`);
}
// 成長の型
{
  const counts = {};
  for (let i = 0; i < 400; i++) { const p = SL._.newPlayer('型 ' + i, 'FW'); counts[p.gtype] = (counts[p.gtype] || 0) + 1; }
  check(Object.keys(SL.GTYPE).every((k) => counts[k] > 0) && counts.genius < counts.steady, `成長の型が分かれる（${JSON.stringify(counts)}）`);
  const a = { name: '型 A', pos: 'FW' }; SL.gtypeOf(a); const b = { name: '型 A', pos: 'FW' }; SL.gtypeOf(b);
  check(a.gtype === b.gtype, '型のない古い選手は名前から同じ型が決まる');
  // フィジカル型はスピードが、テクニック型はシュートが伸びやすい
  const grow = (gtype, k) => { let t = 0; for (let i = 0; i < 200; i++) { const p = SL._.newPlayer('伸 ' + i, 'FW'); p.gtype = gtype; const v = p.stats[k]; for (let w = 0; w < 18; w++) SL._.train(p, k, 1.7); t += p.stats[k] - v; } return t / 200; };
  const ps = grow('physical', 'spd'), ts = grow('technique', 'spd'), pt = grow('physical', 'sht'), tt = grow('technique', 'sht');
  check(ps > ts && tt > pt, `型で伸びやすい能力が違う（スピード：フィジカル${ps.toFixed(1)} / テクニック${ts.toFixed(1)}、シュート：フィジカル${pt.toFixed(1)} / テクニック${tt.toFixed(1)}）`);
}
// 特殊能力
{
  const p = { name: 'x', pos: 'FW', age: 30, stats: { spd: 70, sht: 90, pas: 60, drb: 85, def: 30, phy: 82, gk: 10 } };
  const sk = SL.skillsOf(p);
  check(sk.length <= 3 && sk.includes('finisher'), `能力から特殊能力が決まる（${sk.map((k) => SL.SKILLS[k].name).join('・')}）`);
  check(SL.skillsOf({ ...p, stats: { ...p.stats, sht: 60, drb: 60, phy: 60 }, age: 22 }).length === 0, '能力が足りなければ特殊能力はない');
}
console.log(`life: ${failed() ? failed() + ' failed' : 'all passed'}`);
process.exitCode = failed() ? 1 : 0;
