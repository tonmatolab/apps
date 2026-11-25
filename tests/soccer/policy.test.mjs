// オンライン：移籍方針（オフに選ばなかったときの自動の決め方）
//   node tests/soccer/policy.test.mjs
import * as G from '../../soccer-online-api/src/sim.js';
const SL = G.SL;

let failures = 0;
const check = (c, m) => { if (!c) { failures++; console.log('  ✗ ' + m); } else if (process.env.VERBOSE) console.log('  ✓ ' + m); };

const w = G.newWorldState();
const npcs = SL.newNpcWorld(w.clubs, 1);
const byStr = (lg) => w.clubs.filter((c) => c.lg === lg).sort((a, b) => b.str - a.str);
const strong = byStr(1)[0], weak = byStr(2).at(-1), euro = byStr(0)[0];
const stat = (v) => ({ spd: v, sht: v, pas: v, drb: v, def: v, phy: v, gk: 10 });
// 選手をつくる。ovr：能力、club：今のクラブ、offers：移籍のオファー、opt：契約が切れたか・残留の条件
function member(ovr, club, offers, opt = {}) {
  const m = G.newMember('m' + Math.random(), 'a', 'テスト', 'FW');
  m.pl.stats = stat(ovr); m.pl.club = club.id; m.pl.salary = opt.salary || 1000; m.pl.contract = opt.expiring ? 0 : 2; m.status = 'off';
  if (opt.policy) m.policy = opt.policy; if (opt.sw) m.sw = opt.sw;
  m.offer = { res: { contract: opt.renew ? { club: club.id, salary: opt.renew, years: 2 } : null, transfers: offers, expiring: !!opt.expiring, released: !!opt.expiring && !opt.renew }, forced: false, notes: [] };
  return m;
}
const offer = (club, salary) => ({ club: club.id, salary, years: 2, fee: 0 });

// ----- 契約が残っているとき -----
{
  // 強いクラブで先発（能力が高い）→ 控えではないので残る（既定は「控えのときだけ」）
  const ace = member(95, strong, [offer(weak, 5000)]);
  check(G.planAuto(ace, w, [ace], npcs).kind === 'stay', '先発に入っている人は、契約中なら残る（既定）');
  // 強いクラブで控え → 出番のある弱いクラブへ（既定のおまかせ・出番重視とも）
  const sub = member(55, strong, [offer(weak, 900)]);
  check(G.planAuto(sub, w, [sub], npcs).kind === 'move', `控えの人は、おまかせで出番のあるクラブへ移る`);
  sub.policy = 'minutes';
  const p = G.planAuto(sub, w, [sub], npcs);
  check(p.kind === 'move' && p.offer.club === weak.id, '出番重視：先発できるクラブへ');
  sub.policy = 'stay';
  check(G.planAuto(sub, w, [sub], npcs).kind === 'stay', '残留優先：控えでも残る');
  sub.policy = 'auto'; sub.sw = 'never';
  check(G.planAuto(sub, w, [sub], npcs).kind === 'stay', '「契約中も移る：しない」なら残る');
  // 年俸重視・契約中も移る：1割以上高ければ移る
  const rich = member(95, strong, [offer(weak, 1050)], { policy: 'money', sw: 'always' });
  check(G.planAuto(rich, w, [rich], npcs).kind === 'stay', '年俸重視：少しだけ高い（+5%）なら残る');
  rich.offer.res.transfers = [offer(weak, 1300)];
  check(G.planAuto(rich, w, [rich], npcs).kind === 'move', '年俸重視：1割以上高ければ移る');
  // 上を目指す：上のリーグ
  const up = member(80, weak, [offer(strong, 800), offer(euro, 700)], { policy: 'top', sw: 'always' });
  const pu = G.planAuto(up, w, [up], npcs);
  check(pu.kind === 'move' && pu.offer.club === euro.id, '上を目指す：いちばん上のリーグへ（年俸が下がっても）');
  // 満員のクラブには移らない
  const full = [];
  for (let i = 0; i < 4; i++) { const x = G.newMember('f' + i, 'f', 'FW' + i, 'FW'); x.pl.club = weak.id; x.status = 'active'; full.push(x); }
  const sub2 = member(55, strong, [offer(weak, 900)]);
  check(G.planAuto(sub2, w, [sub2, ...full], npcs).kind === 'stay', 'FWが満員のクラブには移らない');
}

// ----- 契約が切れたとき -----
{
  const a = member(70, strong, [offer(weak, 3000)], { expiring: true, renew: 1200, policy: 'money' });
  const pa = G.planAuto(a, w, [a], npcs);
  check(pa.kind === 'move' && pa.offer.salary === 3000, '契約切れ・年俸重視：高いほうへ');
  a.policy = 'stay';
  check(G.planAuto(a, w, [a], npcs).kind === 'stay', '契約切れ・残留優先：残留の条件があれば残る');
  const b = member(70, strong, [], { expiring: true });
  check(G.planAuto(b, w, [b], npcs).kind === 'retire', 'どこからも声がかからなければ引退');
}

// ----- オフの終わりにまとめて決まる（速報に方針が出る） -----
{
  const sub = member(55, strong, [offer(weak, 900)], { policy: 'minutes' });
  const ace = member(95, strong, [offer(weak, 5000)]);
  w.news = [];
  G.finishOffseason(w, [sub, ace], Date.now(), npcs);
  check(sub.pl.club === weak.id && sub.status === 'active' && ace.pl.club === strong.id && ace.status === 'active', 'オフの終わりに、控えの人だけ移籍して新シーズンへ');
  check(w.news.some((n) => n.t.includes('移籍方針') && n.t.includes(weak.name)), '速報に「移籍方針で移籍」と出る');
}

console.log(`policy: ${failures ? failures + ' failed' : 'all passed'}`);
process.exitCode = failures ? 1 : 0;
