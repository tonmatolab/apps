// ===== サッカー人生：NPCの1年（成長・衰え・移籍・引退・新人・レジェンド） =====
// シーズンの区切りに1回だけまとめて処理する（一人用は ageUp、オンラインはシーズン終了時）。
// 1クラブ22人・ポジションの枠（GK3・DF7・MF7・FW5）は崩さない：引退した人の代わりに同じポジションの新人が入り、
// 移籍は同じポジションの選手どうしの入れ替えにする。core-awards.js のあとに読み込む。
'use strict';
(function (SL) {
  const { rnd, ri, chance, clamp, gauss, pick } = SL._;
  const { POS, GROW, ovr } = SL;
  const K = () => SL.NPC_STAT_KEYS;

  // ----- 成長・衰え：総合力を target まで1ずつ動かす（ポジションで使う能力を、型に合わせて選ぶ） -----
  function shiftOvr(p, delta, gt) {
    const keys = Object.keys(POS[p.pos].w).concat(p.pos === 'GK' ? ['gk'] : []);
    const target = ovr(p) + delta;
    for (let i = 0; i < 60 && ovr(p) !== target; i++) {
      const up = ovr(p) < target;
      // 伸びやすい／衰えやすい能力ほど選ばれやすい
      const w = keys.map((k) => (up ? gt.mul(k) : 1 / gt.dec(k)) * (POS[p.pos].w[k] || .5) * (k === 'gk' ? 3 : 1));
      let r = rnd() * w.reduce((a, b) => a + b, 0), k = keys[0];
      for (let j = 0; j < keys.length; j++) { r -= w[j]; if (r <= 0) { k = keys[j]; break; } }
      p.stats[k] = clamp(p.stats[k] + (up ? 1 : -1), 10, 99);
    }
  }
  function growNpc(p, apps) {
    const gt = SL.gtypeOf(p), peak = GROW[p.grow] ? GROW[p.grow].peak : 28, o = ovr(p);
    if (p.age < peak) {
      const room = Math.max(0, p.pot + (gt.cap || 0) - o);
      const d = Math.min(room, ri(1, 3) + (apps >= 12 ? 1 : 0) + (p.age <= 21 ? 1 : 0) + (p.gtype === 'genius' ? 1 : 0));
      if (d > 0) shiftOvr(p, d, gt);
    } else if (p.age > peak + 1) {
      const over = p.age - peak;
      let d = ri(1, 2) + (over >= 4 ? 1 : 0) + (over >= 7 ? 1 : 0) - (apps >= 12 ? 1 : 0);
      if (p.gtype === 'steady') d = Math.round(d * .6);
      if (d > 0) shiftOvr(p, -d, gt);
    }
    p.style = SL.styleOf(p);
  }

  // ----- 通算の成績（NPCの今季の成績を足す）とキャリア -----
  function addCareer(p, a, year) {
    const c = p.car || (p.car = { apps: 0, goals: 0, assists: 0, cs: 0, saves: 0, wins: 0 });
    if (a) { c.apps += a[0]; c.goals += a[3]; c.assists += a[4]; c.cs += a[9]; c.saves += a[8]; c.wins += a[6] + a[7]; }
    if (p.from == null) p.from = year;
    p.best = Math.max(p.best || 0, ovr(p));
    if (!p.cl) p.cl = [p.club];
    else if (p.cl[p.cl.length - 1] !== p.club) p.cl.push(p.club);
  }
  function legendScore(p) {
    const c = p.car || {};
    return Math.round((c.goals || 0) * 10 + (c.assists || 0) * 8 + (c.cs || 0) * 8 + (c.apps || 0) * 2 + (c.wins || 0) * .4 + (p.aw ? p.aw.length : 0) * 40 + Math.max(0, (p.best || 0) - 70) * 15);
  }
  // 引退した人を、記録に残す形に（小さく）
  function legendRow(p, clubs, year) {
    const c = p.car || {};
    return { id: p.id, name: p.name, nat: p.nat, pos: p.pos, years: `${p.from || year}-${year}`, age: p.age, clubs: (p.cl || [p.club]).map((id) => (clubs[id] ? clubs[id].short || clubs[id].name : '?')),
      apps: c.apps || 0, goals: c.goals || 0, assists: c.assists || 0, cs: c.cs || 0, best: p.best || ovr(p), awards: (p.aw || []).slice(-8), score: legendScore(p) };
  }
  const notable = (p) => (p.aw && p.aw.length >= 5) || (p.best || 0) >= 86 || (p.car && (p.car.goals >= 150 || p.car.apps >= 450));

  // ----- 新人（引退した人の代わり。同じクラブ・同じポジション） -----
  function freeNumber(npcs, club, taken = new Set()) {
    const used = new Set(npcs.filter((x) => x.club === club).map((x) => x.no).concat([...taken]));
    for (let n = 13; n < 99; n++) if (!used.has(n) && n !== 21 && n !== 31) return n;
    return 99;
  }
  function rookie(npcs, club, pos, year, nextId, used) {
    const r = SL._.worldRng(SL._.hashStr(`rookie:${year}:${nextId}:${club.id}`));
    const home = club.nat || (club.lg === 0 ? 'イングランド' : '日本');
    const nat = r() < (club.lg === 0 ? .45 : .86) ? home : r.pick(club.lg === 0 ? SL._.ABROAD.EU : SL._.ABROAD.JP);
    let name = SL._.npcName(nat, r);
    for (let t = 0; (used.has(name) || SL._.awkwardName(name)) && t < 60; t++) name = SL._.npcName(nat, r);
    if (used.has(name)) name = `${name}${year % 100}`;
    used.add(name);
    const target = clamp(Math.round(club.str - 15 + (club.youth || 3) + r.gauss() * 3), 38, 82);
    const p = SL._.makeNpc('n' + String(nextId).padStart(4, '0'), name, nat, pos, target, r.ri(17, 19), r);
    // 才能はクラブの強さが基準（育成が得意なクラブほど高い）。強さを超える選手は一部だけ
    p.pot = clamp(club.str + r.ri(-9, 6) + (club.youth || 3), target + 3, 95);
    p.club = club.id; p.no = freeNumber(npcs, club.id); p.from = year + 1;
    return p;
  }

  // ----- NPCの1年 -----
  // npcs：名簿（その場で書き換える）、clubs：クラブ、stats：今季の成績（id → NPC_STAT_KEYS の配列）、year：終わったシーズンの年
  // legends：レジェンドの一覧（その場で足す）。返り値：{ retired, moves, rookies, legends（今回新しく入った人） }
  function npcOffseason(npcs, clubs, stats, year, legends = [], humans = []) {
    const out = { retired: [], moves: [], rookies: 0, legends: [] };
    const used = new Set(npcs.map((p) => p.name).concat(legends.map((l) => l.name)));
    let nextId = Math.max(0, ...npcs.map((p) => Number(String(p.id).slice(1)) || 0), ...legends.map((l) => Number(String(l.id || 'n0').slice(1)) || 0)) + 1;
    // 1) 今季の成績を通算に足し、年をとって成長・衰え
    for (const p of npcs) {
      const a = stats && stats[p.id];
      addCareer(p, a, year);
      p.age++;
      growNpc(p, a ? a[0] : 0);
      p.best = Math.max(p.best || 0, ovr(p));
    }
    // 2) 引退 → 同じクラブ・同じポジションの新人が入る
    for (let i = 0; i < npcs.length; i++) {
      const p = npcs[i], c = clubs[p.club], o = ovr(p), a = stats && stats[p.id];
      let r = p.age >= 38 ? 1 : p.age >= 34 ? .15 + (p.age - 34) * .15 : 0;
      if (p.age >= 29 && c && o < c.str - 14) r += .35;
      if (p.age >= 31 && (!a || a[0] < 2)) r += .2;
      if (!chance(r)) continue;
      const row = legendRow(p, clubs, year);
      out.retired.push({ name: p.name, age: p.age, club: c ? c.name : '', pos: p.pos, best: row.best, legend: notable(p) });
      if (notable(p)) { legends.push(row); out.legends.push(row); }
      npcs[i] = rookie(npcs, c, p.pos, year, nextId++, used);
      npcs[i].no = p.no; // 背番号は引き継ぐ
      out.rookies++;
    }
    legends.sort((x, y) => y.score - x.score); if (legends.length > 100) legends.length = 100;
    // 3) 移籍：今のクラブより明らかに強い選手は、より強いクラブへ（同じポジションの一番弱い選手と入れ替え）
    const byClub = new Map(clubs.map((c) => [c.id, []]));
    for (const p of npcs) if (byClub.has(p.club)) byClub.get(p.club).push(p);
    const cand = npcs.filter((p) => { const c = clubs[p.club]; return c && p.age <= 31 && ovr(p) >= c.str + 4; }).sort(() => rnd() - .5);
    for (const p of cand) {
      if (out.moves.length >= 24 || !chance(.35)) continue;
      const from = clubs[p.club], o = ovr(p);
      const dests = clubs.filter((c) => c.id !== from.id && c.str >= from.str + 2 && c.str <= o + 2 && (c.lg !== 0 || o >= 76))
        .sort((x, y) => Math.abs(x.str - o) - Math.abs(y.str - o)).slice(0, 3);
      if (!dests.length) continue;
      const to = pick(dests);
      const swap = byClub.get(to.id).filter((x) => x.pos === p.pos && ovr(x) < o).sort((x, y) => ovr(x) - ovr(y))[0];
      if (!swap) continue;
      [p.club, swap.club] = [to.id, from.id];
      [p.no, swap.no] = [swap.no, p.no];
      byClub.set(from.id, byClub.get(from.id).filter((x) => x !== p).concat([swap]));
      byClub.set(to.id, byClub.get(to.id).filter((x) => x !== swap).concat([p]));
      out.moves.push({ name: p.name, from: from.name, to: to.name, ovr: o, swap: swap.name });
    }
    for (const p of npcs) { if (!p.cl) p.cl = [p.club]; else if (p.cl[p.cl.length - 1] !== p.club) p.cl.push(p.club); }
    return out;
  }

  // 画面用：オフの主な出来事（数行）
  function offseasonNotes(rep) {
    const notes = [];
    const big = rep.moves.slice().sort((a, b) => b.ovr - a.ovr).slice(0, 3);
    if (big.length) notes.push(`🔁 この冬の主な移籍：${big.map((m) => `${m.name}（${m.from}→${m.to}）`).join('、')}`);
    const leg = rep.retired.filter((r) => r.legend).slice(0, 3);
    if (leg.length) notes.push(`👋 引退：${leg.map((r) => `${r.name}（${r.age}歳）`).join('、')}${rep.retired.length > leg.length ? ` ほか${rep.retired.length - leg.length}人` : ''}`);
    else if (rep.retired.length) notes.push(`👋 ${rep.retired.length}人のNPCが引退し、${rep.rookies}人の新人が入団した`);
    return notes;
  }

  Object.assign(SL, { npcOffseason, offseasonNotes, legendScore });
  Object.assign(SL._, { growNpc, freeNumber });
})(typeof SL !== 'undefined' ? SL : require('./core.js'));
