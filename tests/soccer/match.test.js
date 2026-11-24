// 試合エンジン（core-match.js）のテスト
//   node tests/soccer/match.test.js
'use strict';
const { seeded, check, failed } = require('./lib');
const SL = require('./sl');

SL.setRng(seeded(4711));
const clubs = SL._.newWorld(), npcs = SL.newNpcWorld(clubs, 5);
const pool = (cid, humans = []) => SL.clubSquad(npcs, cid, humans.map((h) => ({ pos: h.p.pos }))).npcs.map((p) => ({ p, human: false })).concat(humans);

// ----- 1試合の形 -----
{
  const raw = SL.simMatch([{ club: clubs[10], pool: pool(10) }, { club: clubs[11], pool: pool(11) }]);
  const f = SL.finishMatch(raw);
  for (const sd of raw.S) {
    check(sd.slots.filter((x) => x.start).length === 11, '先発は11人');
    check(sd.slots.filter((x) => !x.start).length <= 7, '控えは7人まで');
    const pos = {}; sd.slots.filter((x) => x.start).forEach((x) => { pos[x.slot] = (pos[x.slot] || 0) + 1; });
    check(pos.GK === 1 && pos.DF === 4 && pos.MF === 4 && pos.FW === 2, `4-4-2（${JSON.stringify(pos)}）`);
    check(sd.slots.filter((x) => !x.start && x.on != null).length <= 3, '交代は3人まで');
    check(new Set(sd.slots.map((x) => x.p)).size === sd.slots.length, '同じ選手が2回出ない');
    check(sd.slots.every((x) => x.on == null || (x.mins >= 0 && x.mins <= 90)), '出場時間は0〜90分');
  }
  const goals = [0, 0]; for (const e of raw.events) if (e.t === 'goal' || (e.t === 'pk' && e.res)) goals[e.side]++;
  check(goals[0] === f.gh && goals[1] === f.ga, 'スコアとゴールの数が合う');
  const lineGoals = raw.S.map((sd) => sd.slots.reduce((a, x) => a + x.line.g, 0));
  check(lineGoals[0] === f.gh && lineGoals[1] === f.ga, '選手のゴールの合計がスコアと合う');
  check(raw.S.every((sd) => sd.slots.filter((x) => x.on != null).every((x) => x.rating >= 3.5 && x.rating <= 10)), '評価点は3.5〜10');
  check(raw.S.flatMap((sd) => sd.slots).filter((x) => x.motm).length === 1, 'マン・オブ・ザ・マッチは1人');
  check(f.ht[0] <= f.gh && f.ht[1] <= f.ga, '前半のスコアは最終スコア以下');
}

// ----- たくさん回したときの数 -----
{
  const N = 1500;
  let goals = 0, lam = 0, pks = 0, yc = 0, rc = 0;
  const rate = { GK: [], DF: [], MF: [], FW: [] };
  const share = { GK: 0, DF: 0, MF: 0, FW: 0 };
  for (let i = 0; i < N; i++) {
    const lg = i % 3, cl = clubs.filter((c) => c.lg === lg), h = cl[i % 10], a = cl[(i + 1 + (i % 9)) % 10];
    const raw = SL.simMatch([{ club: h, pool: pool(h.id) }, { club: a, pool: pool(a.id) }]);
    const f = SL.finishMatch(raw);
    goals += f.gh + f.ga; lam += raw.lam[0] + raw.lam[1];
    for (const e of raw.events) { if (e.t === 'pk') pks++; if (e.t === 'yc') yc++; if (e.t === 'rc') rc++; }
    for (const sd of raw.S) for (const x of sd.slots) if (x.start) { rate[x.p.pos].push(x.rating); share[x.p.pos] += x.line.g; }
  }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  check(Math.abs(goals / lam - 1) < .06, `得点の平均が期待値どおり（${(goals / N).toFixed(2)} / 期待 ${(lam / N).toFixed(2)}）`);
  check(goals / N > 2.4 && goals / N < 3.8, `1試合の得点は2.4〜3.8（${(goals / N).toFixed(2)}）`);
  check(pks / N > .12 && pks / N < .4, `PKは1試合0.12〜0.4回（${(pks / N).toFixed(2)}）`);
  check(yc / N > 1.2 && yc / N < 4 && rc / N < .4, `警告・退場の数（警告 ${(yc / N).toFixed(1)}・退場 ${(rc / N).toFixed(2)}）`);
  const r = Object.fromEntries(Object.entries(rate).map(([k, v]) => [k, avg(v)]));
  check(Math.max(...Object.values(r)) - Math.min(...Object.values(r)) <= .2, `先発の平均評価がポジションでそろう（${Object.entries(r).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' ')}）`);
  check(Object.values(r).every((v) => v > 6.2 && v < 6.8), '平均評価は6.2〜6.8');
  const tot = Object.values(share).reduce((a, b) => a + b, 0);
  check(share.FW / tot > .4 && share.FW / tot < .65 && share.MF > share.DF && share.GK === 0, `ゴールはFWが中心（FW ${(share.FW / tot * 100).toFixed(0)}% MF ${(share.MF / tot * 100).toFixed(0)}% DF ${(share.DF / tot * 100).toFixed(0)}%）`);
}

// ----- 本物のプレイヤー：同じくらいの実力ならNPCより少し先発しやすい／PKを自分で蹴る -----
{
  const club = clubs[13];
  const fw = npcs.filter((p) => p.club === 13 && p.pos === 'FW').sort((a, b) => SL.ovr(b) - SL.ovr(a));
  const me = { name: 'テスト 本人', pos: 'FW', age: 24, stats: { ...fw[1].stats }, cond: 0, fatigue: 0 };
  let starts = 0;
  for (let i = 0; i < 400; i++) {
    const raw = SL.simMatch([{ club, pool: pool(13, [{ p: me, human: true, me: true }]) }, { club: clubs[14], pool: pool(14) }]);
    if (raw.S[0].slots.find((x) => x.me && x.start)) starts++;
  }
  check(starts / 400 > .5, `先発クラスと同じ能力なら半分以上先発する（${(starts / 4).toFixed(0)}%）`);
  // 自分がキッカーのPKは、結果を決めずに残せる
  const star = { name: 'テスト 本人', pos: 'FW', age: 24, stats: { spd: 90, sht: 99, pas: 80, drb: 85, def: 40, phy: 80, gk: 10 }, cond: 2, fatigue: 0 };
  let found = null;
  for (let i = 0; i < 3000 && !found; i++) {
    const raw = SL.simMatch([{ club, pool: pool(13, [{ p: star, human: true, me: true }]) }, { club: clubs[14], pool: pool(14) }], { deferPk: true });
    if (raw.events.some((e) => e.t === 'pk' && e.pending)) found = raw;
  }
  check(!!found, '自分がPKキッカーになる試合がある');
  if (found) {
    const before = found.events.filter((e) => e.t === 'goal').filter((e) => e.side === 0).length;
    const f = SL.finishMatch(found, true);
    const pk = found.events.find((e) => e.t === 'pk' && e.a.me);
    check(pk.res === true && !pk.pending && f.gh >= before + 1, '蹴ったPKの結果がスコアに入る');
    const log = SL.matchLog(found, 0);
    check(log.some((e) => e.t === 'pk' && e.me), '試合の流れに自分のPKが出る');
  }
}

// ----- 一人用の1週間：自分のPKを蹴ってから続ける -----
{
  SL.setRng(seeded(99));
  const s = SL.newGame('テスト 太郎', 'FW');
  s.p.stats = { spd: 90, sht: 99, pas: 80, drb: 85, def: 40, phy: 80, gk: 10 };
  SL.joinClub(s, s.draft[0]); delete s.draft; SL.startSeason(s);
  let pkSeen = 0, mineSet = 0;
  while (s.phase === 'season') {
    const pk = SL.prepareWeek(s);
    check(JSON.stringify(s).indexOf('_pre') < 0, '途中の試合は保存データに入らない');
    if (pk) pkSeen++;
    const w = SL.playWeek(s, { pk: pk ? true : null });
    if (pk) { check(w.match.pk && w.match.pk.mine && w.match.pk.goal, '自分で決めたPKがその週の試合に入る'); mineSet++; }
    check(w.match.gf === w.match.events.filter((e) => e.side === 'us').length, '自分のチームの得点と流れが合う');
  }
  const S = s.season;
  check(S.apps > 0 && S.shots >= S.goals && S.passes >= S.passOk && S.tackles >= 0, `今季の細かい成績がたまる（シュート${S.shots}・パス${S.passOk}/${S.passes}）`);
  const ns = Object.values(s.npcSeason);
  check(ns.length > 400 && ns.reduce((a, x) => a + x[3], 0) > 300, `NPCの今季の成績がたまる（${ns.length}人・${ns.reduce((a, x) => a + x[3], 0)}得点）`);
  const tableGoals = Object.values(s.table).reduce((a, t) => a + t.gf, 0);
  const npcGoals = ns.reduce((a, x) => a + x[3], 0) + S.goals;
  check(npcGoals <= tableGoals && npcGoals >= tableGoals - 40, `NPC＋自分のゴールが順位表の得点とほぼ合う（${npcGoals} / ${tableGoals}）`);
  console.log(`    PK ${pkSeen}回（自分で蹴った ${mineSet}）`);
}

console.log(`match: ${failed() ? failed() + ' failed' : 'all passed'}`);
process.exitCode = failed() ? 1 : 0;
