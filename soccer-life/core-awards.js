// ===== サッカー人生：個人ランキングと個人賞 =====
// NPCと本物のプレイヤーを同じ表に並べて、ランキングと賞を決める（一人用・オンライン共通）。
// 試合で実際に記録した成績（core-match.js）だけを使う。core-match.js のあとに読み込む。
'use strict';
(function (SL) {
  const { LEAGUES } = SL;
  const NPC_KEYS = () => SL.NPC_STAT_KEYS;
  const MIN_RATE_APPS = 9;   // 平均評価のランキングに載る出場数（シーズンの半分）
  const AWARD_APPS = 12;     // MVP・ポジション別最優秀の出場数
  const XI_APPS = 10;        // ベストイレブンの出場数

  // ランキングの種類。pos：対象のポジション（なければ全員）
  const CATS = {
    goals: { name: '得点', icon: '⚽', v: (e) => e.goals },
    assists: { name: 'アシスト', icon: '👟', v: (e) => e.assists },
    rating: { name: '平均評価', icon: '⭐', v: (e) => (e.apps >= MIN_RATE_APPS ? e.rating : null), dec: 2 },
    defense: { name: 'ボール奪取', icon: '🛡️', v: (e) => e.tackles + e.inters, pos: ['DF', 'MF'], note: 'タックル＋インターセプト' },
    saves: { name: 'セーブ', icon: '🧤', v: (e) => e.saves, pos: ['GK'] },
    cs: { name: '無失点', icon: '🧱', v: (e) => e.cs, pos: ['GK'] },
  };

  // ----- 表の1行（NPCも本物のプレイヤーも同じ形） -----
  // key：一意の名前（NPCは n0001 など、本物は u:〜）、type：'npc' | 'user'
  function npcEntries(npcs, stats, clubs) {
    const keys = NPC_KEYS(), out = [];
    for (const p of npcs) {
      const a = stats[p.id]; if (!a || !a[0]) continue;
      const o = {}; keys.forEach((k, i) => { o[k] = a[i]; });
      const c = clubs[p.club];
      out.push({ key: p.id, name: p.name, type: 'npc', pos: p.pos, age: p.age, club: p.club, clubName: c ? c.name : '', lg: c ? c.lg : null,
        apps: o.apps, starts: o.starts, mins: o.mins, goals: o.goals, assists: o.assists, shots: o.shots, tackles: o.tackles, inters: o.inters,
        saves: o.saves, cs: o.cs, yellow: o.yellow, red: o.red, rating: o.apps ? Math.round(o.rating10 / o.apps) / 10 : 0, ref: p });
    }
    return out;
  }
  // 本物のプレイヤー（今季の成績 S）。extra：{ key, me, rookie, ... }
  function userEntry(p, S, clubs, extra = {}) {
    const c = clubs[p.club], r = S.ratings || [];
    return { key: extra.key || 'me', name: p.name, type: 'user', pos: p.pos, age: p.age, club: p.club, clubName: c ? c.name : '', lg: c ? c.lg : null,
      apps: S.apps || 0, starts: S.starts || 0, mins: S.mins || 0, goals: S.goals || 0, assists: S.assists || 0, shots: S.shots || 0, tackles: S.tackles || 0,
      inters: S.inters || 0, saves: S.saves || 0, cs: S.cs || 0, yellow: S.yellow || 0, red: S.red || 0,
      rating: r.length ? Math.round(r.reduce((a, b) => a + b, 0) / r.length * 100) / 100 : 0, ...extra };
  }

  // ----- ランキング -----
  // opt：{ lg（null なら全リーグ）, who: 'all'|'npc'|'user', n, meKey }
  function ranking(entries, cat, opt = {}) {
    const C = CATS[cat]; if (!C) return { top: [], mine: null, total: 0 };
    const list = entries.filter((e) => (opt.lg == null || e.lg === opt.lg) && (!C.pos || C.pos.includes(e.pos))
      && (!opt.who || opt.who === 'all' || e.type === opt.who)).map((e) => ({ e, v: C.v(e) })).filter((x) => x.v != null && x.v > 0)
      .sort((a, b) => b.v - a.v || b.e.rating - a.e.rating || a.e.apps - b.e.apps || (a.e.name < b.e.name ? -1 : 1));
    let rank = 0, prev = null;
    const rows = list.map((x, i) => { if (x.v !== prev) { rank = i + 1; prev = x.v; } return { rank, key: x.e.key, name: x.e.name, type: x.e.type, pos: x.e.pos, club: x.e.clubName, lg: x.e.lg, apps: x.e.apps, v: x.v, me: !!x.e.me || (!!opt.meKey && x.e.key === opt.meKey) }; });
    const n = opt.n || 10;
    const mine = rows.find((r) => r.me) || null;
    return { top: rows.slice(0, n), mine, total: rows.length };
  }

  // ----- 個人賞（シーズン終了時） -----
  // standing(lg)：そのリーグのクラブIDを順位順に並べた配列
  // 返り値：{ byLg: { [lg]: { scorer:[], assist:[], mvp, best:{FW,MF,DF,GK}, xi:[], rookie } }, world, won: Map(key → [賞の名前]) }
  function seasonAwards(entries, standing) {
    const byLg = {}, won = new Map();
    const give = (e, name) => { if (!e) return; if (!won.has(e.key)) won.set(e.key, []); won.get(e.key).push(name); };
    const rateOrder = (a, b) => b.rating - a.rating || (b.goals + b.assists) - (a.goals + a.assists) || b.apps - a.apps || (a.name < b.name ? -1 : 1);
    let world = null, worldScore = -Infinity;
    for (const L of LEAGUES) {
      const E = entries.filter((e) => e.lg === L.id && e.apps > 0);
      const order = standing(L.id), rankOf = (cid) => order.indexOf(cid) + 1;
      const A = { scorer: [], assist: [], mvp: null, best: {}, xi: [], rookie: null };
      // 得点王・アシスト王（同点なら全員）
      for (const [k, key] of [['goals', 'scorer'], ['assists', 'assist']]) {
        const top = Math.max(0, ...E.map((e) => e[k]));
        if (top > 0) A[key] = E.filter((e) => e[k] === top);
      }
      A.scorer.forEach((e) => give(e, `${L.short}得点王`));
      A.assist.forEach((e) => give(e, `${L.short}アシスト王`));
      // MVP：出場12試合以上で、平均評価＋チームの順位
      const mvpScore = (e) => e.rating + ({ 1: .25, 2: .12, 3: .06 }[rankOf(e.club)] || 0) + (e.goals + e.assists) * .006 + e.apps * .004;
      const cands = E.filter((e) => e.apps >= AWARD_APPS);
      A.mvp = cands.slice().sort((a, b) => mvpScore(b) - mvpScore(a) || rateOrder(a, b))[0] || null;
      give(A.mvp, `${L.short}MVP`);
      // ポジション別最優秀
      for (const pos of ['FW', 'MF', 'DF', 'GK']) {
        A.best[pos] = cands.filter((e) => e.pos === pos).sort(rateOrder)[0] || null;
        give(A.best[pos], `${L.short}最優秀${pos}`);
      }
      // ベストイレブン（4-4-2）
      for (const [pos, n] of [['GK', 1], ['DF', 4], ['MF', 4], ['FW', 2]]) {
        const xs = E.filter((e) => e.apps >= XI_APPS && e.pos === pos).sort(rateOrder).slice(0, n);
        A.xi.push(...xs); xs.forEach((e) => give(e, `${L.short}ベストイレブン`));
      }
      // 新人王（国内リーグ）：本物のプレイヤーは1年目、NPCは19歳以下
      if (L.id !== 0) {
        A.rookie = E.filter((e) => e.apps >= 8 && (e.type === 'user' ? e.rookie : e.age <= 19)).sort(rateOrder)[0] || null;
        give(A.rookie, '新人王');
      }
      // 世界年間最優秀選手の候補：各リーグのMVP（欧州が有利）
      if (A.mvp) { const ws = mvpScore(A.mvp) + ({ 0: .35, 1: 0, 2: -.45 }[L.id]); if (ws > worldScore) { worldScore = ws; world = A.mvp; } }
      byLg[L.id] = A;
    }
    give(world, '世界年間最優秀選手');
    return { byLg, world, won };
  }

  // 歴代の記録に残す形（名前と数字だけ。小さく保つ）
  function awardsRecord(year, aw, champions) {
    const nm = (e) => (e ? { name: e.name, type: e.type, club: e.clubName, pos: e.pos } : null);
    const out = { year, lg: {}, world: nm(aw.world) };
    for (const [lg, A] of Object.entries(aw.byLg)) {
      out.lg[lg] = {
        champion: champions ? champions[lg] : null,
        scorer: A.scorer.map((e) => ({ ...nm(e), v: e.goals })), assist: A.assist.map((e) => ({ ...nm(e), v: e.assists })),
        mvp: nm(A.mvp), best: Object.fromEntries(Object.entries(A.best).map(([k, e]) => [k, nm(e)])), xi: A.xi.map((e) => ({ name: e.name, pos: e.pos, type: e.type })), rookie: nm(A.rookie),
      };
    }
    return out;
  }
  // NPCの受賞を本人のデータに残す（あとで歴代記録・レジェンドに使う）
  function stampNpcAwards(npcs, won, year) {
    const byId = new Map(npcs.map((p) => [p.id, p]));
    for (const [key, list] of won) { const p = byId.get(key); if (!p) continue; p.aw = (p.aw || []).concat(list.map((a) => `${year} ${a}`)).slice(-30); }
  }

  Object.assign(SL, { RANK_CATS: CATS, MIN_RATE_APPS, npcEntries, userEntry, ranking, seasonAwards, awardsRecord, stampNpcAwards });
})(typeof SL !== 'undefined' ? SL : require('./core.js'));
