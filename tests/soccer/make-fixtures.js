// v1（今の版）のセーブデータの見本を作る。移行テストで「昔のデータが読めるか」を確かめるのに使う。
//   node tests/soccer/make-fixtures.js
// 一度作ったら基本は作り直さない（作り直すと「昔のデータ」ではなくなる）。
'use strict';
const fs = require('fs');
const path = require('path');
const { seeded } = require('./lib');
const SL = require('./sl');

const DIR = path.join(__dirname, 'fixtures');
fs.mkdirSync(DIR, { recursive: true });
SL.setRng(seeded(777));
const out = {};
const clone = (s) => JSON.parse(JSON.stringify(s));

// 1) 入団前
let s = SL.newGame('見本 太郎', 'FW');
out['v1-draft'] = clone(s);
// 2) シーズン途中（第5節）
SL.joinClub(s, s.draft[2]); delete s.draft; SL.startSeason(s);
for (let i = 0; i < 5; i++) { const w = SL.playWeek(s); if (w.event) SL.resolveEvent(s, w.event, 0); }
out['v1-season'] = clone(s);
// 3) シーズン終了直後（オフの計算前）
while (s.phase === 'season') { const w = SL.playWeek(s); if (w.event) SL.resolveEvent(s, w.event, 0); }
out['v1-seasonEnd'] = clone(s);
// 4) オフ（画面の offseason() と同じ形の s.off を持つ）
const review = SL.endSeason(s), nat = SL.nationalYear(s), notes = SL.ageUp(s), off = SL.offers(s);
s.off = { review, nat, notes, off, step: 1 };
out['v1-off'] = clone(s);
// 5) 数年進めて、引退試合の直前
delete s.off; SL.startSeason(s);
for (let y = 0; y < 14; y++) {
  while (s.phase === 'season') { const w = SL.playWeek(s); if (w.event) SL.resolveEvent(s, w.event, 0); }
  SL.endSeason(s); SL.nationalYear(s); SL.ageUp(s);
  const o = SL.offers(s); if (o.contract) SL.accept(s, o.contract); else if (o.transfers[0]) SL.accept(s, o.transfers[0]);
  SL.startSeason(s);
}
s.phase = 'retiring';
out['v1-retiring'] = clone(s);
// 6) 引退済み（称号図鑑にも記録済み）
SL.playLastMatch(s, 0, true); SL.retire(s); s.summary.colAdded = { t: [], a: [] };
out['v1-retired'] = clone(s);
// 7) 次の世代（子どもが親のクラブから続きを始める形）
s.childPro = { name: '見本 湊', pos: 'MF', age: 17, club: s.p.club != null ? s.p.club : 12, ovr: 52 };
const g2 = SL.nextGeneration(s, '見本 湊', 'MF');
out['v1-gen2'] = clone(g2);
// 8) 60秒モードの途中・縛りあり
const q = SL.newGame('早送り 花子', 'GK', { mode: 'quick', challenge: 'keeper' });
q.policy = 'stable'; SL.autoDraft(q, 'stable'); SL.autoYear(q, 'stable'); SL.autoYear(q, 'stable');
out['v1-quick'] = clone(q);
// 9) 古い形のデータ（初期の版：記録・新聞・ライバル・才能の見立てなどがない）
const old = clone(out['v1-season']);
for (const k of ['log', 'papers', 'records', 'rival', 'family', 'mode', 'cup', 'challenge']) delete old[k];
for (const k of ['potLo', 'potHi', 'kidsBorn', 'trainMul', 'clinic', 'scoutY']) delete old.p[k];
out['v1-legacy'] = old;

for (const [name, data] of Object.entries(out)) fs.writeFileSync(path.join(DIR, name + '.json'), JSON.stringify(data));
console.log('fixtures:', Object.keys(out).map((k) => `${k}(${(JSON.stringify(out[k]).length / 1024).toFixed(1)}KB)`).join(' '));
