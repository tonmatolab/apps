// オンライン：ポジションの偏り対策（1クラブのFWの上限・空き・混み具合・入団先の候補）
//   node tests/soccer/positions.test.mjs
import * as G from '../../soccer-online-api/src/sim.js';

let failures = 0;
const check = (c, m) => { if (!c) { failures++; console.log('  ✗ ' + m); } else if (process.env.VERBOSE) console.log('  ✓ ' + m); };

const w = G.newWorldState();
const dom = w.clubs.filter((c) => c.lg > 0);
let n = 0;
const add = (members, pos, club) => { const m = G.newMember('m' + n, 'a' + n, '選手' + n++, pos); m.pl.club = club; m.status = 'active'; members.push(m); return m; };

// ----- 1クラブのFWの上限 -----
{
  const ms = [];
  for (let i = 0; i < 4; i++) add(ms, 'FW', dom[0].id);
  check(G.clubFull(ms, dom[0].id, 'FW') && !G.clubFull(ms, dom[0].id, 'DF'), 'FWが4人いるクラブには、FWは入れないがDFは入れる');
  for (let i = 0; i < 3; i++) add(ms, 'GK', dom[1].id);
  check(G.clubFull(ms, dom[1].id, 'GK') && !G.clubFull(ms, dom[1].id, 'MF'), 'GKは3人まで（今までどおり）');
  for (let i = 0; i < 10; i++) add(ms, 'MF', dom[2].id);
  check(G.clubFull(ms, dom[2].id, 'DF'), '1クラブ10人で満員（今までどおり）');
  const pre = add(ms, 'FW', dom[3].id); // 前からいる人（上限を超えていても、残留はできる＝clubFull の except）
  for (let i = 0; i < 4; i++) add(ms, 'FW', dom[3].id);
  check(G.clubFull(ms, dom[3].id, 'FW', pre), '上限を超えているクラブ（FW5人）は、ほかのFWからは満員');
}

// ----- 空き・混み具合・狙い目 -----
{
  const ms = [];
  // 国内20クラブすべてにFW4人 → FWは満員。DFは誰もいない → 狙い目
  for (const c of dom) for (let i = 0; i < 4; i++) add(ms, 'FW', c.id);
  const P = G.positionInfo(w, ms);
  check(P.FW.open === 0 && P.FW.label === '満員', `FWが全部埋まると満員（空き${P.FW.open}・${P.FW.label}）`);
  check(P.DF.open === 20 * 6 && P.DF.label === '狙い目' && P.DF.bonus === G.POP_BONUS, `DFは空き${P.DF.open}・${P.DF.label}・ボーナス${P.DF.bonus}`);
  check(P.GK.open === 20 * 3, `GKの空きはGKの上限まで（${P.GK.open}）`);
  // 満員のポジションでは入団先の候補が出ない。空いているポジションは出る
  const fw = G.newMember('x1', 'x1', 'あたらしいFW', 'FW'), df = G.newMember('x2', 'x2', 'あたらしいDF', 'DF');
  check(G.draftOffers(fw, w, ms).length === 0, 'FWが満員なら、FWの新人には候補が出ない（登録の時点で止める）');
  check(G.draftOffers(df, w, ms).length >= 1, 'DFの新人には候補が出る');
}

// ----- オファーのリーグが満員でも、空きのある国内のクラブを候補に出す -----
{
  const ms = [];
  // 1部の10クラブを満員に（2部は空き）
  for (const c of dom.filter((c) => c.lg === 1)) for (let i = 0; i < 10; i++) add(ms, i < 3 ? 'GK' : 'MF', c.id);
  let ok = true;
  for (let i = 0; i < 30; i++) {
    const m = G.newMember('y' + i, 'y' + i, '候補' + i, 'MF');
    const offers = G.draftOffers(m, w, ms);
    if (!offers.length || offers.some((o) => G.clubFull(ms, o.club, 'MF') || w.clubs[o.club].lg !== 2)) ok = false;
  }
  check(ok, '1部が満員なら、空いている2部のクラブが候補になる（30人とも候補がある）');
  // 1部・2部とも満員 → 候補なし
  for (const c of dom.filter((c) => c.lg === 2)) for (let i = 0; i < 10; i++) add(ms, i < 3 ? 'GK' : 'MF', c.id);
  check(G.draftOffers(G.newMember('z', 'z', '満員', 'DF'), w, ms).length === 0 && G.positionInfo(w, ms).DF.open === 0, '国内がすべて満員なら候補なし・空き0');
}

console.log(`positions: ${failures ? failures + ' failed' : 'all passed'}`);
process.exitCode = failures ? 1 : 0;
