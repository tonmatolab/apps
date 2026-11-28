// オンライン：時刻で決まる日程（オフは 8〜11時・20〜23時。2026/11/29 に切りかえ、そのときのオフだけ 2〜11時）
//   node tests/soccer/clock.test.mjs
import * as G from '../../soccer-online-api/src/sim.js';

let failures = 0;
const check = (c, m) => { if (!c) { failures++; console.log('  ✗ ' + m); } else if (process.env.VERBOSE) console.log('  ✓ ' + m); };
const at = (d, h, m = 0) => Date.UTC(2026, 10, d, h - 9, m); // 2026/11/d h:m 日本時間
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 切りかえ前：前の日程（5時・17時に開幕）
check(same(G.clockTarget(at(28, 23, 40)), { phase: 'season', week: 13 }), '11/28 23:40 は前の日程で第13節まで');
check(G.phaseEndAt(at(29, 1, 59), 'season') === at(29, 2), '今のシーズンは 11/29 2時に終わる');
// 切りかえのオフ：2時〜11時（残りが6節分より多い間は、オフの最初のまま待つ）
check(same(G.clockTarget(at(29, 2)), { phase: 'off', left: 18 }), '2時からオフ');
check(G.clockTarget(at(29, 5)).phase === 'off' && G.clockTarget(at(29, 8)).left === 6 && G.clockTarget(at(29, 10, 30)).left === 1, '5時もオフ・8時から残り6節分を数える');
check(G.phaseEndAt(at(29, 3), 'off') === at(29, 11), '切りかえのオフは 11時まで');
check(same(G.clockTarget(at(29, 11)), { phase: 'season', week: 0 }), '11時に開幕');
// 新しい日程
check(G.phaseEndAt(at(29, 15), 'season') === at(29, 20), '11時開幕のシーズンは 20時に終わる');
check(same(G.clockTarget(at(29, 20)), { phase: 'off', left: 6 }) && G.phaseEndAt(at(29, 21), 'off') === at(29, 23), 'オフは 20〜23時');
check(same(G.clockTarget(at(29, 23)), { phase: 'season', week: 0 }) && G.phaseEndAt(at(30, 2), 'season') === at(30, 8), '23時開幕・翌8時に終わる');
check(same(G.clockTarget(at(30, 8)), { phase: 'off', left: 6 }) && G.phaseEndAt(at(30, 9), 'off') === at(30, 11), 'オフは 8〜11時');
for (let d = 30; d <= 37; d++) { // 何日たっても同じ時間
  check(G.clockTarget(at(d, 7, 59)).phase === 'season' && G.clockTarget(at(d, 8)).phase === 'off' && G.clockTarget(at(d, 11)).phase === 'season'
    && G.clockTarget(at(d, 19, 59)).phase === 'season' && G.clockTarget(at(d, 20)).phase === 'off' && G.clockTarget(at(d, 23)).phase === 'season', `${d}日目：オフは 8〜11時・20〜23時`);
}
// 画面の右上：次のオフ
check(same(G.nextOffWindow(at(29, 1), 'season'), { start: at(29, 2), end: at(29, 11), now: false }), '今夜：次のオフは 2:00〜11:00');
check(same(G.nextOffWindow(at(29, 12), 'season'), { start: at(29, 20), end: at(29, 23), now: false }), '昼：次のオフは 20:00〜23:00');
check(same(G.nextOffWindow(at(30, 0), 'season'), { start: at(30, 8), end: at(30, 11), now: false }), '夜中：次のオフは 8:00〜11:00');
check(same(G.nextOffWindow(at(29, 21), 'off'), { start: null, end: at(29, 23), now: true }), 'オフ中：契約は 23:00 まで');

console.log(`clock: ${failures ? failures + ' failed' : 'all passed'}`);
process.exitCode = failures ? 1 : 0;
