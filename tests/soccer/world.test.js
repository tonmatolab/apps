// 世界（クラブ・NPC選手・名簿）のテスト
//   node tests/soccer/world.test.js
'use strict';
const { check, failed } = require('./lib');
const SL = require('./sl');

// ----- クラブ -----
const clubs = SL._.newWorld();
check(clubs.length === 50 && clubs.every((c, i) => c.id === i), 'クラブは50（ID 0〜49）');
for (const lg of [0, 1, 2, 3, 4]) check(clubs.filter((c) => c.lg === lg).length === 10, `${SL.LEAGUES[lg].name}は10クラブ`);
check(SL.LEAGUES.map((L) => L.name).join() === '欧州リーグ,国内1部,国内2部,国内3部,国内4部', 'リーグ名');
check(Math.min(...clubs.filter((c) => c.lg === 2).map((c) => c.str)) > Math.max(...clubs.filter((c) => c.lg === 3).map((c) => c.str)) && Math.min(...clubs.filter((c) => c.lg === 3).map((c) => c.str)) > Math.max(...clubs.filter((c) => c.lg === 4).map((c) => c.str)) - 1, '2部 > 3部 > 4部（強さ）');
for (const k of ['name', 'short', 'mark']) check(new Set(clubs.map((c) => c[k])).size === 50, `クラブの${k}が重複しない`);
check(clubs.every((c) => c.mark.length <= 3), 'エンブレムの文字は3文字まで');
check(clubs.every((c) => Object.keys(SL.CLUB_TRAITS).every((k) => Number.isFinite(c[k]))), 'どのクラブにも特徴8項目がある');
check(clubs.every((c) => ['depth', 'youth', 'money', 'pop', 'recruit'].every((k) => c[k] >= 1 && c[k] <= 5)), '選手層などは1〜5');
const strs = (lg) => clubs.filter((c) => c.lg === lg).map((c) => c.str);
check(Math.max(...strs(1)) >= Math.min(...strs(0)) - 3, `国内1部の上位は欧州の下位と競える（1部最強 ${Math.max(...strs(1))} / 欧州最弱 ${Math.min(...strs(0))}）`);
check(Math.min(...strs(0)) > Math.max(...strs(2)) && Math.min(...strs(1)) > Math.min(...strs(2)), '欧州 > 2部、1部 > 2部の最弱');

// ----- NPC -----
const npcs = SL.newNpcWorld(clubs, 7);
check(npcs.length === 1100, `NPCは1100人（${npcs.length}）`);
check(new Set(npcs.map((p) => p.id)).size === 1100 && npcs.every((p) => /^n\d{4}$/.test(p.id)), 'IDが一意');
check(new Set(npcs.map((p) => p.name)).size === 1100, '名前が重複しない');
check(npcs.every((p) => p.type === 'npc'), 'NPCは type: npc');
check(npcs.filter((p) => p.fam).length === SL.FAMOUS_COUNT && SL.FAMOUS_COUNT === 100, '有名選手モデルの100人が1回ずつ登場する');
for (const c of clubs) {
  const l = npcs.filter((p) => p.club === c.id);
  const q = {}; l.forEach((p) => { q[p.pos] = (q[p.pos] || 0) + 1; });
  check(l.length === 22 && JSON.stringify(q) === JSON.stringify({ ...q, ...SL.SQUAD_QUOTA }) && Object.keys(q).length === 4, `${c.short}: 22人で GK3・DF7・MF7・FW5（${JSON.stringify(q)}）`);
  check(new Set(l.map((p) => p.no)).size === 22, `${c.short}: 背番号が重複しない`);
  const top = l.map(SL.ovr).sort((a, b) => b - a).slice(0, 11), avg = top.reduce((a, b) => a + b, 0) / 11;
  check(Math.abs(avg - c.str) <= 4.5, `${c.short}: 上位11人の平均（${avg.toFixed(1)}）がクラブの強さ ${c.str} に近い`);
  const jp = l.filter((p) => p.nat === '日本').length;
  if (c.lg > 0) check(jp >= 13, `${c.short}: 国内クラブの選手は大半が日本国籍（${jp}人）`);
}
check(npcs.every((p) => Object.values(p.stats).every((v) => Number.isInteger(v) && v >= 1 && v <= 99) && p.pot >= SL.ovr(p) && p.age >= 18 && p.age <= 35), '能力・才能・年齢が範囲内');
check(npcs.every((p) => SL.STYLES[p.style] && SL.STYLES[p.style].pos === p.pos), 'スタイルはポジションに合っている');
check(npcs.every((p) => SL.NAME_POOLS[p.nat] || p.fam), '生成した選手の国籍には名前のプールがある');
check(npcs.every((p) => !p.name.includes('undefined') && p.name.trim() === p.name), '名前の形がおかしくない');
// 決まったシードなら同じ。有名選手の名前・能力・年齢・ポジションはシードが違っても同じ
check(JSON.stringify(SL.newNpcWorld(clubs, 7)) === JSON.stringify(npcs), '同じシードなら同じ世界');
const fam = (arr) => arr.filter((p) => p.fam).map((p) => [p.name, p.pos, p.age, JSON.stringify(p.stats)].join()).sort().join('|');
check(fam(SL.newNpcWorld(clubs, 99)) === fam(npcs), '有名選手の能力・年齢・ポジションはいつも同じ');
check(JSON.stringify(SL.newNpcWorld(clubs, 99)) !== JSON.stringify(npcs), 'シードが違えばほかの選手は変わる');

// ----- 名簿：本物のプレイヤーが入ると、NPCが枠を譲る -----
{
  const none = SL.clubSquad(npcs, 13, []);
  check(none.npcs.length === 22 && none.reserves.length === 0, '本物のプレイヤーがいなければNPC22人');
  const one = SL.clubSquad(npcs, 13, [{ pos: 'FW' }]);
  check(one.npcs.length === 21 && one.reserves.length === 1 && one.reserves[0].pos === 'FW', 'FWが1人入ると、FWのNPCが1人控え組へ');
  const weakFW = npcs.filter((p) => p.club === 13 && p.pos === 'FW').sort((a, b) => SL.ovr(a) - SL.ovr(b))[0];
  check(one.reserves[0] === weakFW, '控え組に回るのは一番弱いNPC');
  const six = SL.clubSquad(npcs, 13, [{ pos: 'GK' }, { pos: 'GK' }, { pos: 'FW' }, { pos: 'FW' }, { pos: 'FW' }, { pos: 'MF' }]);
  check(six.npcs.length + 6 === 22, '6人入っても合計22人');
  check(six.npcs.filter((p) => p.pos === 'GK').length >= 1, 'GKのNPCは最低1人残る');
  const sevenGK = SL.clubSquad(npcs, 13, Array.from({ length: 6 }, () => ({ pos: 'GK' })));
  check(sevenGK.npcs.filter((p) => p.pos === 'GK').length === 1 && sevenGK.npcs.length === 16, 'GKばかりでもNPCのGKは1人残り、合計22人');
  check(npcs.filter((p) => p.club === 13).length === 22, '控え組に回してもデータからは消えない');
}

// ----- 新しいゲーム・次の世代 -----
{
  SL.setRng(require('./lib').seeded(1));
  const s = SL.newGame('テスト 太郎', 'MF');
  check(Array.isArray(s.npcs) && s.npcs.length === 1100, '新しいゲームにNPCがいる');
  check(SL.upgradeWorld(JSON.parse(JSON.stringify(s))).npcs.length === 1100, 'NPCのいる世界をもう一度移行しても変わらない');
  const v = SL.npcView(s.npcs[0]);
  check(v.name && v.ovr > 0 && v.style && !('stats' in v), '画面用の形には能力の細かい値を出さない');
}

// ----- 得意能力・成長の見通し・必殺技・立ち位置 -----
{
  SL.setRng(require('./lib').seeded(5));
  check(JSON.stringify(SL.appealChoices('GK')) === JSON.stringify(['gk', 'phy']) && SL.appealChoices('FW').includes('sht'), '得意能力に選べるのはポジションの主な能力');
  let a = 0, b = 0;
  for (let i = 0; i < 300; i++) { a += SL._.newPlayer('得 ' + i, 'FW', 0, 18, 'sht').stats.sht; b += SL._.newPlayer('普 ' + i, 'FW').stats.sht; }
  check(a / 300 - b / 300 > 5, `得意能力は最初から高い（平均 +${(a / 300 - b / 300).toFixed(1)}）`);
  check(SL._.newPlayer('x', 'FW', 0, 18, 'gk').appeal === null, 'ポジションに合わない得意能力は付かない');
  const grow = (ap) => { let t = 0; for (let i = 0; i < 200; i++) { const p = SL._.newPlayer('伸 ' + i, 'FW', 0, 18, ap); p.gtype = 'steady'; p.stats.sht = 50; const v = p.stats.sht; for (let w = 0; w < 18; w++) SL._.train(p, 'sht', 1.7); t += p.stats.sht - v; } return t / 200; };
  check(grow('sht') > grow('spd') * 1.1, `得意能力は練習で伸びやすい（シュート：得意 +${grow('sht').toFixed(1)} / ほか +${grow('spd').toFixed(1)}）`);
  const p = SL._.newPlayer('見通し', 'MF'); p.grow = 'normal';
  check(SL.growthOutlook(p) === null, '成長の時期が分かるまでは見通しも見えない');
  p.growKnown = true; p.pot = SL.ovr(p) + 20;
  const seq = [18, 24, 27, 29, 33].map((age) => { p.age = age; return SL.growthOutlook(p).now; });
  check(JSON.stringify(seq) === JSON.stringify(['rise', 'rise', 'grow', 'peak', 'down']), `年齢で見通しが変わる（${seq.join('→')}）`);
  check(SL.cleanMove(' 雷鳴<シュート>とても長い名前 ') === '雷鳴シュートとても長' && SL.cleanMove('   ') === null, '必殺技の名前は10文字まで・記号は消す');
  const shooter = { name: '技', pos: 'FW', stats: { spd: 70, sht: 80, pas: 60, drb: 70, def: 40, phy: 70, gk: 10 }, move: '雷鳴シュート' };
  let n = 0; for (let i = 0; i < 200; i++) if (SL._.goalHow(shooter).includes('雷鳴シュート')) n++;
  check(n > 40 && n < 110, `必殺技がゴールの説明にときどき出る（200回中${n}回）`);
  const clubs = SL._.newWorld(), npcs = SL.newNpcWorld(clubs, 1);
  const top = SL.depthOf(npcs, 13, { pos: 'FW', ovr: 90 }), low = SL.depthOf(npcs, 13, { pos: 'FW', ovr: 40 });
  check(top.rank === 1 && top.starter && top.gap === 0, `強ければ1番手のレギュラー（${top.text}）`);
  check(!low.starter && low.gap > 0 && low.rank > 2, `弱ければ控えで、先発まであといくつか分かる（${low.text}）`);
}

// ----- 国内3部・4部：30クラブの古い世界に、20クラブとNPCを足す -----
{
  const old = SL._.newWorld().slice(0, 30);
  const oldNpcs = SL.newNpcWorld(old, 3);
  // シーズン中の古いセーブ（日程と順位表は30クラブぶん）
  const st = { clubs: old, npcs: oldNpcs, phase: 'season', week: 7, table: {}, schedule: {} };
  for (const c of old) st.table[c.id] = { p: 5, w: 1, d: 2, l: 4, gf: 3, ga: 6, form: [] };
  for (const lg of [0, 1, 2]) st.schedule[lg] = SL._.roundRobin(old.filter((c) => c.lg === lg).map((c) => c.id));
  const before = JSON.stringify(oldNpcs);
  const legends = [{ id: 'n0900' }];
  const added = SL.extendClubs(st), addN = SL.extendNpcs(st.npcs, st.clubs, 3, legends);
  check(added.length === 20 && st.clubs.length === 50 && st.clubs.every((c, i) => c.id === i), '古い世界に20クラブが足される（ID 30〜49）');
  check(JSON.stringify(st.npcs.slice(0, 660)) === before, '前からいるNPCは変わらない');
  check(addN.length === 440 && new Set(st.npcs.map((p) => p.id)).size === 1100 && new Set(st.npcs.map((p) => p.name)).size === 1100, `NPCが440人足され、IDも名前も重複しない（${addN.length}人）`);
  check(addN.every((p) => Number(p.id.slice(1)) > 900), '足したNPCの番号は、引退したレジェンドの番号ともぶつからない');
  check(st.clubs.slice(30).every((c) => st.npcs.filter((p) => p.club === c.id).length === 22), '足したクラブも22人');
  check(st.schedule[3] && st.schedule[4] && st.schedule[3].length === 18 && st.table[45] && Array.isArray(st.table[45].form) && st.table[0].p === 5, 'シーズン中なら3部・4部の日程と順位表ができる（前からの順位表はそのまま）');
  check(SL.extendClubs(st).length === 0 && SL.extendNpcs(st.npcs, st.clubs, 3).length === 0, 'もう一度移行しても何も足さない');
  // 昇格・降格：4つの国内リーグのあいだで1クラブずつ。どのリーグも10クラブのまま
  const clubs = SL._.newWorld();
  const order = (lg) => clubs.filter((c) => c.lg === lg).sort((a, b) => b.str - a.str);
  check(SL.MOVES === 1, '入れ替えは1クラブずつ');
  const top4 = order(4).slice(0, 1), bot1 = order(1).slice(-1), stay4 = order(4)[1], stay1 = order(1).at(-2);
  const mv = SL._.leagueMoves(clubs, order);
  check([0, 1, 2, 3, 4].every((lg) => clubs.filter((c) => c.lg === lg).length === 10), 'どのリーグも10クラブのまま');
  check(mv.up.size === 3 && mv.down.size === 3 && top4.every((c) => c.lg === 3) && bot1.every((c) => c.lg === 2), '4部の1位が3部へ、1部の最下位が2部へ（入れ替えは3か所で3クラブずつ）');
  check(stay4.lg === 4 && stay1.lg === 1, '4部の2位・1部の下から2番目はそのまま');
  check(mv.text.some((t) => t.includes('3部へ昇格')) && mv.text.some((t) => t.includes('4部へ降格')), '速報の文');
  // 途中の節から始まった3部・4部は、そのシーズンは入れ替えなし（1部と2部の入れ替えだけ）
  check(JSON.stringify(st.partialLeagues) === '[3,4]', 'シーズンの途中で足したリーグに印が付く');
  const c2 = SL._.newWorld(), o2 = (lg) => c2.filter((c) => c.lg === lg).sort((a, b) => b.str - a.str);
  const mv2 = SL._.leagueMoves(c2, o2, [3, 4]);
  check(mv2.up.size === 1 && mv2.down.size === 1 && [3, 4].every((lg) => c2.filter((c) => c.lg === lg).length === 10) && [...mv2.up].every((c) => c.lg === 1), '途中から始まったリーグが関わる入れ替えはしない');
}

console.log(`world: ${failed() ? failed() + ' failed' : 'all passed'}`);
process.exitCode = failed() ? 1 : 0;
