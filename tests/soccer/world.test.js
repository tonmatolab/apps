// 世界（クラブ・NPC選手・名簿）のテスト
//   node tests/soccer/world.test.js
'use strict';
const { check, failed } = require('./lib');
const SL = require('./sl');

// ----- クラブ -----
const clubs = SL._.newWorld();
check(clubs.length === 30 && clubs.every((c, i) => c.id === i), 'クラブは30（ID 0〜29）');
for (const lg of [0, 1, 2]) check(clubs.filter((c) => c.lg === lg).length === 10, `${SL.LEAGUES[lg].name}は10クラブ`);
check(SL.LEAGUES.map((L) => L.name).join() === '欧州リーグ,国内1部,国内2部', 'リーグ名');
for (const k of ['name', 'short', 'mark']) check(new Set(clubs.map((c) => c[k])).size === 30, `クラブの${k}が重複しない`);
check(clubs.every((c) => c.mark.length <= 3), 'エンブレムの文字は3文字まで');
check(clubs.every((c) => Object.keys(SL.CLUB_TRAITS).every((k) => Number.isFinite(c[k]))), 'どのクラブにも特徴8項目がある');
check(clubs.every((c) => ['depth', 'youth', 'money', 'pop', 'recruit'].every((k) => c[k] >= 1 && c[k] <= 5)), '選手層などは1〜5');
const strs = (lg) => clubs.filter((c) => c.lg === lg).map((c) => c.str);
check(Math.max(...strs(1)) >= Math.min(...strs(0)) - 3, `国内1部の上位は欧州の下位と競える（1部最強 ${Math.max(...strs(1))} / 欧州最弱 ${Math.min(...strs(0))}）`);
check(Math.min(...strs(0)) > Math.max(...strs(2)) && Math.min(...strs(1)) > Math.min(...strs(2)), '欧州 > 2部、1部 > 2部の最弱');

// ----- NPC -----
const npcs = SL.newNpcWorld(clubs, 7);
check(npcs.length === 660, `NPCは660人（${npcs.length}）`);
check(new Set(npcs.map((p) => p.id)).size === 660 && npcs.every((p) => /^n\d{4}$/.test(p.id)), 'IDが一意');
check(new Set(npcs.map((p) => p.name)).size === 660, '名前が重複しない');
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
  if (c.lg > 0) check(jp >= 15, `${c.short}: 国内クラブの選手は大半が日本国籍（${jp}人）`);
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
  check(Array.isArray(s.npcs) && s.npcs.length === 660, '新しいゲームにNPCがいる');
  check(SL.upgradeWorld(JSON.parse(JSON.stringify(s))).npcs.length === 660, 'NPCのいる世界をもう一度移行しても変わらない');
  const v = SL.npcView(s.npcs[0]);
  check(v.name && v.ovr > 0 && v.style && !('stats' in v), '画面用の形には能力の細かい値を出さない');
}

console.log(`world: ${failed() ? failed() + ' failed' : 'all passed'}`);
process.exitCode = failed() ? 1 : 0;
