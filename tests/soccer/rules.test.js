// ルールの回帰テスト（サッカー人生 core.js）
// 決まったシードで何人もの一生を回し、結果の統計と「指紋（ハッシュ）」を記録と比べる。
//   node tests/soccer/rules.test.js           … 記録（baseline.json）と比べる
//   node tests/soccer/rules.test.js --update  … 今の結果で記録を作り直す（ルールを意図して変えたときだけ）
// 指紋が変わったら「ゲームの結果が1つでも変わった」という意味。リファクタリングでは変わってはいけない。
'use strict';
const path = require('path');
const { seeded, hash, check, failed, readJSON, writeJSON } = require('./lib');
const SL = require('./sl');

const BASELINE = path.join(__dirname, 'baseline.json');
const POSES = ['FW', 'MF', 'DF', 'GK'];
const POLICIES = Object.keys(SL.POLICY);
const CHALLENGES = [null, ...Object.keys(SL.CHALLENGES)];

// 一人の一生（60秒モードと同じ自動進行）
function autoLife(s, policy) {
  SL.autoDraft(s, policy);
  for (let y = 0; y < 30; y++) { const o = SL.autoYear(s, policy); if (o.retire) break; }
  SL.autoLastMatch(s);
  return SL.retire(s);
}

// 一人の一生（じっくりモード：毎週の練習・出来事・試合を画面と同じ順で進める）
function manualLife(s, rnd) {
  SL.joinClub(s, s.draft[Math.floor(rnd() * s.draft.length)]); delete s.draft;
  SL.startSeason(s);
  const main = SL.mainStats(s.p.pos);
  for (let year = 0; year < 30; year++) {
    while (s.phase === 'season') {
      s.training = s.p.fatigue > 60 && s.challenge !== 'norest' ? 'rest' : main[s.week % main.length];
      if (rnd() < .1) { for (const it of SL.shopList(s)) if (!it.ng && rnd() < .3) SL.buy(s, it.id); }
      const w = SL.playWeek(s);
      if (w.event) { const e = SL.eventById(w.event); SL.resolveEvent(s, w.event, e.choices ? Math.floor(rnd() * e.choices.length) : 0); }
    }
    SL.endSeason(s); SL.nationalYear(s); SL.ageUp(s);
    const off = SL.offers(s);
    if (SL.mustRetire(s, off) || (SL.canRetire(s) && rnd() < .15)) break;
    const opts = off.transfers.slice(); if (off.contract) opts.push(off.contract);
    if (off.expiring || off.released || rnd() < .3) { const o = opts[Math.floor(rnd() * opts.length)]; if (!o) break; SL.accept(s, o); }
    SL.startSeason(s);
  }
  const info = SL.lastMatchInfo(s);
  SL.playLastMatch(s, Math.floor(rnd() * info.scenes.length), rnd() < .5);
  return SL.retire(s);
}

function run() {
  const rnd = seeded(20261124);
  SL.setRng(rnd);
  const careers = [];
  let col = SL.newCollection();
  // 1) 60秒モード：ポジション×方針×縛り
  let i = 0;
  for (const ch of CHALLENGES) for (const pos of POSES) for (const pol of POLICIES) {
    const s = SL.newGame(`テスト ${i}`, pos, { mode: 'quick', challenge: ch || undefined });
    careers.push({ kind: 'quick', sum: autoLife(s, pol), s });
    i++;
  }
  // 2) じっくりモード
  for (let k = 0; k < 24; k++) {
    const s = SL.newGame(`じっくり ${k}`, POSES[k % 4], { challenge: k % 6 === 5 ? 'loyal' : undefined });
    careers.push({ kind: 'manual', sum: manualLife(s, rnd), s });
  }
  // 3) 次の世代（3代）
  let s = SL.newGame('一族 初代', 'MF', { mode: 'quick' });
  for (let g = 0; g < 3; g++) {
    const sum = autoLife(s, 'stable'); careers.push({ kind: 'gen', sum, s });
    s = SL.nextGeneration(s, SL.childName(s.p.name), 'MF');
  }
  // 4) コレクション
  for (const c of careers) col = SL.addToCollection(col, c.sum).col;
  // 5) ルーレットとPK（ミニゲームの規則）
  const p = { money: 100000 };
  let rlBet = 0, rlBack = 0;
  for (let k = 0; k < 3000; k++) { const r = SL.spinRoulette(p, [{ k: 'red', a: 100 }, { k: 'n17', a: 10 }, { k: 'd2', a: 20 }]); rlBet += r.total; rlBack += r.back; p.money = 100000; }
  let pkGoals = 0;
  for (let k = 0; k < 3000; k++) if (SL.pkResult({ dir: ['L', 'C', 'R'][k % 3], high: k % 2 === 0, power: .5 }, SL.pkDive()).goal) pkGoals++;

  // 統計
  const sums = careers.map((c) => c.sum);
  const pct = (arr, q) => { const a = arr.slice().sort((x, y) => x - y); return a[Math.floor((a.length - 1) * q)]; };
  const dist = (key) => { const v = sums.map((x) => x[key]); return [pct(v, .1), pct(v, .5), pct(v, .9)]; };
  const letters = {}; for (const x of sums) letters[x.letter] = (letters[x.letter] || 0) + 1;
  const chal = {}; for (const x of sums) if (x.challenge) { chal[x.challenge.id] = chal[x.challenge.id] || [0, 0]; chal[x.challenge.id][1]++; if (x.challenge.cleared) chal[x.challenge.id][0]++; }
  const stats = {
    careers: sums.length,
    score: dist('score'), goals: dist('goals'), apps: dist('apps'), caps: dist('caps'), titles: [pct(sums.map((x) => x.titles.length), .1), pct(sums.map((x) => x.titles.length), .5), pct(sums.map((x) => x.titles.length), .9)],
    letters, challenges: chal,
    distinctTitles: Object.keys(col.titles).length, achievements: Object.keys(col.ach).length,
    rouletteReturn: Math.round(rlBack / rlBet * 1000) / 1000, pkGoalRate: Math.round(pkGoals / 3000 * 1000) / 1000,
  };
  // 指紋：各選手の要約（時刻を含まない）と、最後の状態の要所
  const fp = careers.map((c) => JSON.stringify([c.kind, c.sum.score, c.sum.letter, c.sum.titles, c.sum.goals, c.sum.assists, c.sum.apps, c.sum.cs, c.sum.caps, c.sum.clubs, c.sum.earned, c.sum.wc, c.sum.trophies, c.sum.awards, c.s.p.money, c.s.log.length, c.s.papers.length])).join('\n');
  return { stats, fingerprint: hash(fp) };
}

const now = run();
console.log('rules: careers', now.stats.careers, 'score p10/50/90', now.stats.score.join('/'), 'letters', JSON.stringify(now.stats.letters), 'fingerprint', now.fingerprint);
if (process.argv.includes('--update')) {
  writeJSON(BASELINE, { note: 'node tests/soccer/rules.test.js --update で作り直す。ルールを意図して変えたときだけ', ...now });
  console.log('rules: baseline updated');
} else {
  const base = readJSON(BASELINE);
  check(now.fingerprint === base.fingerprint, `指紋が記録と同じ（記録 ${base.fingerprint} / 今 ${now.fingerprint}）`);
  check(JSON.stringify(now.stats) === JSON.stringify(base.stats), '統計が記録と同じ');
  if (JSON.stringify(now.stats) !== JSON.stringify(base.stats)) {
    for (const k of Object.keys(base.stats)) if (JSON.stringify(base.stats[k]) !== JSON.stringify(now.stats[k])) console.log(`    ${k}: 記録 ${JSON.stringify(base.stats[k])} → 今 ${JSON.stringify(now.stats[k])}`);
  }
}
process.exitCode = failed() ? 1 : 0;
