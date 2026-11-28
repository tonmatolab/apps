// オンライン：連続ログインボーナス（続けて来るほど増える・休んでも1日目の額はもらえる）と称号「皆勤賞」
//   node tests/soccer/login.test.mjs
import * as G from '../../soccer-online-api/src/sim.js';
const SL = G.SL;

let failures = 0;
const check = (c, m) => { if (!c) { failures++; console.log('  ✗ ' + m); } else if (process.env.VERBOSE) console.log('  ✓ ' + m); };

const w = G.newWorldState();
const D = 864e5, t0 = Date.UTC(2026, 10, 28, 3); // 日本時間 11/28 12:00
const m = G.newMember('m1', 'a1', '皆勤', 'MF'); m.status = 'active'; m.pl.club = 20;

// 1日目〜7日目、8日目
const got = [];
for (let d = 0; d < 8; d++) {
  const money = m.pl.money, r = G.loginReward(m, t0 + d * D);
  got.push(r.amount);
  check(m.pl.money === money + r.amount, `${d + 1}日目：所持金が増える`);
  check(r.streak === d + 1 && r.next === G.loginAmount(d + 2), `${d + 1}日目：連続${r.streak}日・明日の額`);
}
check(JSON.stringify(got) === JSON.stringify([20, 30, 40, 50, 60, 70, 80, 80]), '20万→30万→…→7日目から80万：' + got.join(','));
// 同じ日に2回はもらえない（日本時間0時で切り替わる）
check(G.loginReward(m, t0 + 7 * D + 3600000) === null, '同じ日に2回はもらえない');
const lv = G.loginView(m, t0 + 7 * D);
check(lv.got && lv.streak === 8 && lv.next === 80, '画面用：今日は受け取り済み・8日連続・明日80万');
check(G.loginView(m, t0 + 9 * D).streak === 0, '2日空くと連続は切れて見える');
// 1日休むと1日目に戻る（前と同じ20万はもらえる）
const r = G.loginReward(m, t0 + 9 * D);
check(r.streak === 1 && r.amount === 20, '休んだら1日目（20万）から');
check(m.loginBest === 8, '一番長かった連続は残る');
// 日付の切り替わり：日本時間 23:59 と 翌 0:01 は別の日・連続
{
  const x = G.newMember('m2', 'a2', 'よふかし', 'DF'); x.status = 'active'; x.pl.club = 21;
  const late = Date.UTC(2026, 10, 28, 14, 59), early = Date.UTC(2026, 10, 28, 15, 1);
  G.loginReward(x, late);
  const r2 = G.loginReward(x, early);
  check(r2 && r2.streak === 2, '日本時間0時をまたげば翌日として連続');
}
// 契約を選ぶ前・引退した人はもらえない
{
  const x = G.newMember('m3', 'a3', 'まだ', 'FW');
  check(G.loginReward(x, t0) === null, '契約を選ぶ前はもらえない');
}
// 称号「皆勤賞」：7日続けると現役のうちから図鑑の候補に入る
{
  check(SL.onlineTitles({ ...G.onlineContext(m, w, new Set()) }).includes('ol_streak7'), '7日続けたら「皆勤賞」');
  const y = G.newMember('m4', 'a4', '三日坊主', 'GK'); y.status = 'active'; y.pl.club = 22;
  for (let d = 0; d < 3; d++) G.loginReward(y, t0 + d * D);
  check(!SL.onlineTitles(G.onlineContext(y, w, new Set())).includes('ol_streak7'), '3日だけでは「皆勤賞」にならない');
  check(SL.titleInfo('ol_streak7') && SL.titleInfo('ol_streak7').name === '皆勤賞', '称号の情報がある');
}
// 次の世代も連続は続く
{
  const old = G.newMember('m5', 'a5', '親', 'MF'); old.status = 'active'; old.pl.club = 23;
  for (let d = 0; d < 3; d++) G.loginReward(old, t0 + d * D);
  old.status = 'retired'; old.summary = { name: '親', pos: 'MF', title: '', letter: 'C', score: 1000, apps: 10, goals: 1, cs: 0, startYear: 2030, endYear: 2040 };
  const kid = G.nextGeneration(old, 'k5', '子', 'MF', w, []);
  kid.status = 'active'; kid.pl.club = 23;
  const r3 = G.loginReward(kid, t0 + 3 * D);
  check(r3 && r3.streak === 4, '次の世代になっても連続ログインは続く');
}

console.log(`login: ${failures ? failures + ' failed' : 'all passed'}`);
process.exitCode = failures ? 1 : 0;
