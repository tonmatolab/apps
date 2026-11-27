// オンライン：称号図鑑（アカウントごと・世代をまたいで集まる）とオンライン専用の称号
//   node tests/soccer/olcol.test.mjs
import * as G from '../../soccer-online-api/src/sim.js';
const SL = G.SL;

let failures = 0;
const check = (c, m) => { if (!c) { failures++; console.log('  ✗ ' + m); } else if (process.env.VERBOSE) console.log('  ✓ ' + m); };

const w = G.newWorldState();
const row = (year, clubId, lg, apps = 20) => ({ year, age: 20, club: w.clubs[clubId].name, clubId, lg, number: 9, apps, starts: apps, goals: 5, assists: 2, cs: 0, rating: 6.8, rank: 3, awards: [], ovr: 70, salary: 500 });
// 引退した選手をつくる（history をそのまま使う）
function retired(history, opt = {}) {
  const m = opt.m || G.newMember('m' + Math.random(), 'acc1', opt.name || '図鑑 太郎', 'FW');
  m.history = history; m.status = 'off'; m.pl.club = history.at(-1).clubId; m.pl.age = 34;
  for (const h of history) { m.totals.apps += h.apps; m.totals.goals += h.goals; m.totals.assists += h.assists; }
  Object.assign(m, opt.extra || {});
  G.retire(m, w);
  return m;
}

// 図鑑の定義：オンライン専用の称号はレア度と説明がある。オンラインで取れない称号は図鑑に出さない
{
  check(SL.ONLINE_TITLES.length >= 10 && SL.ONLINE_TITLES.every((t) => SL.titleInfo(t[0]) && SL.titleInfo(t[0]).online), 'オンライン専用の称号は titleInfo で引ける');
  const list = SL.onlineTitleList().map((t) => t[0]);
  check(!list.includes('wcw') && !list.includes('rv') && !list.includes('star') && !list.includes('ch_loyal'), 'W杯・ライバル・スターの器・縛りの称号はオンラインの図鑑に出さない');
  check(list.includes('g100') && list.includes('ol_motw') && list.includes('fam_c70'), '共通の称号とオンライン専用の称号が並ぶ');
  check(new Set(list).size === list.length, '図鑑の称号IDに重なりがない');
  check(SL.rarityOf('fam_c70').id === 'LR' && SL.rarityOf('ol_motw').id === 'R', 'レア度：全クラブ制覇はLR・週間MVPはR');
  check(!SL.TITLES.some((t) => t[0].startsWith('ol_') || t[0].startsWith('fam_')), '一人用の称号一覧は変わらない');
}

// 1人目：4部でデビュー → 欧州1部へ（下剋上）・週間MVP・冬の移籍
let m1;
{
  m1 = retired([row(2027, 40, '4部'), row(2028, 30, '3部'), row(2029, 20, '2部'), row(2030, 10, '1部'), row(2031, 0, '欧州')], { extra: { motw: 2, winterN: 1 } });
  const t = m1.summary.titles;
  check(t.includes('ol_climb') && t.includes('ol_dom4') && t.includes('ol_motw') && t.includes('ol_winter'), `オンライン専用の称号が引退時に付く（${t.filter((x) => x.startsWith('ol_')).join(',')}）`);
  check(!t.includes('ol_motw10') && !t.includes('ol_eu3') && !t.includes('fam_c10'), '条件を満たさないものは付かない');
  check(m1.col.lives === 1 && Object.keys(m1.col.clubs).length === 5 && m1.col.t.ol_climb && m1.col.t.ol_climb[1] === 1, '図鑑に人生・クラブ・称号が記録される');
  check(m1.col.last && m1.col.last.titles.includes('ol_climb'), 'この引退で新しく手に入れた称号がわかる');
  const before = JSON.stringify(m1.col); G.recordLife(m1, w);
  check(JSON.stringify(m1.col) === before, '同じ人生は2回記録しない');
}
// 2人目（次の世代）：図鑑を受け継ぎ、一族で10クラブ
{
  const m2 = G.nextGeneration(m1, 'm2', '図鑑 次郎', 'MF', w, []);
  check(m2.col === m1.col && m2.gen === 2, '次の世代は図鑑を受け継ぐ');
  retired([row(2040, 41, '4部'), row(2041, 31, '3部'), row(2042, 21, '2部'), row(2043, 11, '1部'), row(2044, 1, '欧州', 30)], { m: m2, name: '図鑑 次郎' });
  const t = m2.summary.titles;
  check(t.includes('fam_c10') && !t.includes('fam_c30'), '一族（2世代）で10クラブ → 「10のエンブレム」');
  check(m2.col.lives === 2 && m2.col.t.ol_climb[0] === 2 && m2.col.t.ol_climb[1] === 1, '同じ称号は回数が増え、最初に取った世代が残る');
  check(m2.col.t.fam_c10[1] === 2 && m2.col.last.titles.includes('fam_c10') && !m2.col.last.titles.includes('ol_climb'), '新しく手に入れたものだけが「NEW」');
}
// 育成枠から欧州1部・1クラブ100試合
{
  const m = retired([row(2027, 60, '欧州3部', 35), row(2028, 60, '欧州3部', 35), row(2029, 60, '欧州3部', 35), row(2030, 50, '欧州2部'), row(2031, 2, '欧州')], { extra: { youthStart: true } });
  const t = m.summary.titles;
  check(t.includes('ol_youth') && t.includes('ol_eu3') && t.includes('ol_legend'), `育成枠の星・欧州を渡り歩く・クラブの象徴（${t.filter((x) => x.startsWith('ol_')).join(',')}）`);
}
// 前からいるデータ：図鑑がなければ作る。引退したままの人はその人生を記録する
{
  const m = G.newMember('old', 'acc9', '古株', 'DF');
  delete m.col;
  G.migrateMember(m, w);
  check(m.col && m.col.lives === 0, '図鑑のない現役の人には空の図鑑');
  const r = retired([row(2027, 12, '1部')]);
  delete r.col; delete r.summary.colDone;
  G.migrateMember(r, w);
  check(r.col.lives === 1 && r.col.t.p50 == null, '引退したままの人は、その人生が図鑑に入る');
}

// 現役のうちに達成した称号（引退前でも図鑑で見られる）
{
  const m = G.newMember('live', 'acc7', '現役 三郎', 'FW');
  m.status = 'active'; m.pl.club = 40; m.pl.age = 24;
  check(G.liveTitles({ ...m, history: [], season: { apps: 0 } }, w).length === 0, 'まだ試合に出ていなければ何もない');
  m.history = [row(2027, 40, '4部'), row(2028, 30, '3部')];
  for (const h of m.history) { m.totals.apps += h.apps; m.totals.goals += h.goals; }
  m.season.apps = 5; m.season.goals = 3; m.motw = 1; m.pl.club = 0; // シーズンの途中で欧州1部（下剋上）
  const live = G.liveTitles(m, w);
  check(live.includes('g1') && live.includes('ol_motw') && live.includes('ol_climb'), `現役でも条件を満たした称号がわかる（${live.join(',')}）`);
  check(!live.includes('short') && !live.some((id) => SL.ONLINE_HIDE.has(id)), '引退して決まる称号・オンラインで取れない称号は入らない');
  check(m.col.lives === 0 && !Object.keys(m.col.t).length, '達成中は図鑑には記録しない（引退で記録）');
  m.status = 'draft';
  check(G.liveTitles(m, w).length === 0, '入団先を選んでいる間は出さない');
}

console.log(`olcol: ${failures ? failures + ' failed' : 'all passed'}`);
process.exitCode = failures ? 1 : 0;
