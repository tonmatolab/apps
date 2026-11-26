// 冬の移籍期間（第8〜10節）のテスト
//   node tests/soccer/winter.test.js
'use strict';
const { seeded, check, failed } = require('./lib');
const SL = require('./sl');

SL.setRng(seeded(4242));
const fresh = (pos = 'FW', opt = {}) => { const s = SL.newGame('冬 太郎', pos, opt); SL.autoDraft(s, 'stable'); return s; };
// 第7節まで進める（オファーは出さない状態で）
const toWeek7 = (s) => { while (s.week < SL.WINTER.open - 1) SL.playWeek(s); s.winterDone = s.year; SL.playWeek(s); return s; };

check(SL.WINTER.open === 7 && SL.WINTER.close === 10, '第7節が終わったら届き、第10節が終わるまで（第8〜10節のあいだ）');

// 控えで出番が少ない → 試合に出られるクラブから
{
  const s = toWeek7(fresh('GK'));
  s.season.starts = 0; s.season.apps = 0;
  const wo = SL.winterOffers(s, { always: true });
  check(wo && wo.kind === 'bench' && wo.list.length >= 1, `控えの人にはオファーが届く（${wo && wo.list.length}件）`);
  check(wo && wo.list.every((o) => SL.startChance(s.p, s.clubs[o.club]) >= .5 && s.clubs[o.club].str <= SL.clubOf(s).str && o.winter), '試合に出られるクラブから');
}
// 前半戦で大活躍 → 上のリーグ・欧州から
{
  const s = toWeek7(fresh('FW'));
  s.season.apps = 7; s.season.starts = 7; s.season.goals = 9; s.season.ratings = [7.8, 7.6, 7.9, 8.1, 7.4, 7.7, 7.5];
  s.p.fame = 40;
  const wo = SL.winterOffers(s, { always: true }), c = SL.clubOf(s);
  check(wo && wo.kind === 'star', '活躍した人にはオファーが届く');
  check(wo && wo.list.every((o) => SL.LG_LEVEL[s.clubs[o.club].lg] > SL.LG_LEVEL[c.lg] || s.clubs[o.club].str >= c.str + 4), '上のリーグか、明らかに強いクラブから');
}
// ふつうの人（先発しているが活躍は普通）には届かない
{
  const s = toWeek7(fresh('MF'));
  s.season.apps = 7; s.season.starts = 6; s.season.goals = 1; s.season.assists = 1; s.season.ratings = [6.4, 6.6, 6.5, 6.3, 6.7, 6.5];
  check(SL.winterOffers(s, { always: true }) === null, 'ふつうに出ている人には届かない');
}
// 縛り「一筋」は移籍できない・「国内一筋」は欧州から来ない
{
  const s = toWeek7(fresh('FW', { challenge: 'loyal' }));
  s.season.starts = 0;
  check(SL.winterOffers(s, { always: true }) === null, '縛り「一筋」にはオファーなし');
  const d = toWeek7(fresh('FW', { challenge: 'domestic' }));
  d.season.apps = 7; d.season.starts = 7; d.season.goals = 10; d.season.ratings = [8, 8, 8, 8, 8, 8, 8]; d.p.fame = 60;
  const wo = SL.winterOffers(d, { always: true });
  check(!wo || wo.list.every((o) => !SL.isEU(d.clubs[o.club].lg)), '縛り「国内一筋」には欧州から来ない');
}
// 受ける → すぐ移籍・オファーは消える。第10節が終わったら締め切り
{
  const s = toWeek7(fresh('GK'));
  s.season.starts = 0; s.season.apps = 0;
  s.winter = SL.winterOffers(s, { always: true });
  const to = s.winter.list[0].club;
  check(SL.acceptWinter(s, 0) && s.p.club === to && !s.winter && s.log.some((l) => l.k === 'winter'), '受けるとシーズンの途中で移籍する');
  const w = SL.playWeek(s);
  check(w && w.match && s.week === SL.WINTER.open + 1, '移籍したあとも試合が進む（新しいクラブのリーグで）');
  const t = toWeek7(fresh('GK'));
  t.season.starts = 0; t.winter = SL.winterOffers(t, { always: true });
  let closed = false;
  while (t.week < SL.WINTER.close) { const r = SL.playWeek(t); if (r.winterClosed) closed = true; }
  check(closed && !t.winter, '第10節が終わったら、選ばなかったオファーは消える（残留）');
  // 1シーズンに1回だけ
  let n = 0; const u = fresh('GK');
  while (u.phase === 'season') { const r = SL.playWeek(u); if (r.winter) n++; }
  check(n <= 1, '1シーズンに1回まで');
}

console.log(`winter: ${failed() ? failed() + ' failed' : 'all passed'}`);
process.exitCode = failed() ? 1 : 0;
