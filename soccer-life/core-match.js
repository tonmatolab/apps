// ===== サッカー人生：試合のシミュレーション =====
// 両クラブの名簿（NPC＋本物のプレイヤー）から先発11人と控え7人を選び、90分を1分ずつ進める。
// チャンス → シュート → 枠内 → セーブ／ゴール、アシスト、パス、タックル、インターセプト、クリア、警告・退場、交代、試合中のPK を記録する。
// 一人用・オンラインの両方で使う。core.js・core-world.js のあとに読み込む。ゲームの乱数（SL の rnd）を使う。
'use strict';
(function (SL) {
  const { rnd, ri, chance, clamp, gauss, lambda } = SL._;
  const { ovr } = SL;

  const FORMATION = { GK: 1, DF: 4, MF: 4, FW: 2 }; // 4-4-2
  const BENCH = 7, SUBS = 3;
  const CONV = .105;   // チャンス1回あたりの得点の割合（平均）
  const PK_RATE = .008; // チャンスのうちPKになる割合（1試合に0.25回くらい）
  const OPEN = .93;     // 流れの中のゴールの補正（PKのぶんを引いて、平均の得点を以前とそろえる）
  const TK_RATE = 16 / 90, YC_RATE = .075; // タックル（1チーム1試合16回）と、そのうち警告になる割合
  // ポジションごとの重み：シュート・アシスト・タックル・インターセプト・クリア・パスの本数
  const W = {
    shot: { FW: 4, MF: 1.5, DF: .4, GK: 0 },
    assist: { FW: 1.6, MF: 3, DF: .8, GK: .05 },
    tackle: { FW: .6, MF: 2.5, DF: 3, GK: 0 },
    inter: { FW: .3, MF: 2, DF: 3, GK: .2 },
    clear: { FW: .3, MF: 1, DF: 5, GK: .6 },
    pass: { FW: 24, MF: 52, DF: 42, GK: 22 },
  };
  const ex = (v, d) => Math.exp(v / d);
  function pickW(list, wf) {
    let sum = 0;
    for (let i = 0; i < list.length; i++) { const w = wf(list[i]); if (w > 0) sum += w; }
    if (sum <= 0) return null;
    let r = rnd() * sum;
    for (let i = 0; i < list.length; i++) { const w = wf(list[i]); if (w > 0) { r -= w; if (r <= 0) return list[i]; } }
    return list[list.length - 1];
  }
  const cond = (sl) => (sl.human ? (sl.p.cond || 0) : 0);

  // 選手ごとに試合中は変わらない値（総合力・シュートなどの重み）。能力が同じあいだは使い回す
  const CACHE = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function info(p) {
    const st = p.stats, sig = st.spd + st.sht * 3 + st.pas * 5 + st.drb * 7 + st.def * 11 + st.phy * 13 + st.gk * 17 + p.pos.charCodeAt(0);
    let o = CACHE && CACHE.get(p);
    if (o && o.sig === sig) return o;
    const pos = p.pos, sk = SL.skillsOf ? SL.skillsOf(p) : [], has = (k) => sk.includes(k);
    // 特殊能力の効き目（core-world.js の SKILLS）
    const shotMul = (has('longshot') ? 1.3 : 1) * (has('dribble') ? 1.15 : 1) * (has('aerial') && pos === 'FW' ? 1.1 : 1);
    const astMul = (has('through') ? 1.35 : 1) * (has('dribble') ? 1.1 : 1);
    o = { sig, ovr: ovr(p), skills: sk, fin: has('finisher') ? 1.15 : 1, pkSkill: has('pk'), leader: has('leader'), bigsave: has('bigsave'),
      wShot0: W.shot[pos] * shotMul, wAst: W.assist[pos] * ex((st.pas + st.drb) / 2 - 60, 30) * astMul,
      wTk: W.tackle[pos] * ex(st.def - 60, 30), wInt: W.inter[pos] * ex((st.def + st.pas) / 2 - 60, 30), wClr: W.clear[pos] * ex(st.def - 60, 30) * (has('aerial') && pos === 'DF' ? 1.3 : 1) };
    if (CACHE) CACHE.set(p, o);
    return o;
  }

  // ----- 先発と控え -----
  // pool：{ p（選手データ）, human, me, kid } の配列。ケガ人は入れない
  const ORDER = ['GK', 'DF', 'MF', 'FW'];
  function pickLineup(pool) {
    const cand = new Array(pool.length);
    for (let i = 0; i < pool.length; i++) {
      const x = pool[i], p = x.p, inf = info(p);
      const sel = inf.ovr + (x.human ? 3 + (p.cond || 0) * 1.5 - (p.fatigue > 60 ? (p.fatigue - 60) / 6 : 0) : 0) + (p.age <= 20 ? 1 : 0) + (rnd() + rnd() + rnd() - 1.5) * 4;
      cand[i] = { p, human: !!x.human, me: !!x.me, kid: !!x.kid, m: x.m, inf, sel, slot: null };
    }
    cand.sort((a, b) => b.sel - a.sel);
    const starters = [], cnt = { GK: 0, DF: 0, MF: 0, FW: 0 };
    for (const x of cand) if (cnt[x.p.pos] < FORMATION[x.p.pos]) { x.slot = x.p.pos; cnt[x.p.pos]++; starters.push(x); }
    // 足りないポジションはほかのフィールドプレイヤーで埋める
    for (const pos of ORDER) {
      while (cnt[pos] < FORMATION[pos]) {
        const x = cand.find((y) => !y.slot && (pos === 'GK' || y.p.pos !== 'GK')) || cand.find((y) => !y.slot);
        if (!x) break;
        x.slot = pos; cnt[pos]++; starters.push(x);
      }
    }
    const bench = [];
    const gk = cand.find((y) => !y.slot && y.p.pos === 'GK');
    if (gk) { gk.bench = true; bench.push(gk); }
    for (const x of cand) if (bench.length < BENCH && !x.slot && !x.bench && x.p.pos !== 'GK') { x.bench = true; bench.push(x); }
    return { starters, bench };
  }

  function newLine() { return { g: 0, a: 0, sh: 0, sot: 0, pa: 0, pok: 0, tk: 0, it: 0, cl: 0, sv: 0, gc: 0, yc: 0, rc: 0 }; }

  // ----- 1試合 -----
  // sides：[ホーム, アウェイ]。それぞれ { club, pool }。opt.neutral：中立地（ホームの利なし）
  // opt.deferPk：自分（me）がPKを蹴るときは結果を決めずに残す（一人用で自分で蹴るため）
  function simMatch(sides, opt = {}) {
    const S = sides.map((sd, i) => {
      const { starters, bench } = pickLineup(sd.pool);
      const slots = starters.concat(bench);
      let lineSum = 0;
      for (const x of slots) {
        const st = x.p.stats, c = cond(x), inf = x.inf;
        x.start = !!x.slot && !x.bench; x.on = x.start ? 0 : null; x.off = null; x.line = newLine(); x.side = i; x.mins = 0;
        x.sk = st.sht + c * 1.5;
        x.wShot = inf.wShot0 * ex(x.sk - 60, 30); x.wAst = inf.wAst; x.wTk = inf.wTk; x.wInt = inf.wInt; x.wClr = inf.wClr;
        if (x.start) lineSum += inf.ovr + c * .5;
      }
      let ref = sd.club.str;
      if (sd.ref != null) ref = sd.ref;
      else {
        const npcTop = []; for (const x of sd.pool) if (!x.human) npcTop.push(info(x.p).ovr);
        npcTop.sort((p, q) => q - p); const top = npcTop.slice(0, 11);
        if (top.length) ref = top.reduce((p, q) => p + q, 0) / top.length;
      }
      const eff = sd.club.str + clamp(lineSum / Math.max(1, starters.length) - ref, -10, 10) * .8 + (starters.some((x) => x.inf.leader) ? .8 : 0);
      const atk = eff + ((sd.club.atk != null ? sd.club.atk : sd.club.str) - sd.club.str);
      const dfn = eff + ((sd.club.dfn != null ? sd.club.dfn : sd.club.str) - sd.club.str);
      return { club: sd.club, slots, cur: starters.slice(), eff, atk, dfn, mult: 1, subsLeft: SUBS };
    });
    const lam = [lambda(S[0].atk + gauss() * 3, S[1].dfn + gauss() * 3, !opt.neutral), lambda(S[1].atk + gauss() * 3, S[0].dfn + gauss() * 3, false)];
    const rate = lam.map((l) => l / CONV / 90);
    const events = [];
    const gkOf = (sd) => sd.cur.find((x) => x.slot === 'GK') || sd.cur[0];
    const shooterRef = S.map((sd) => { let t = 0, v = 0; for (const x of sd.cur) if (x.slot !== 'GK') { const w = W.shot[x.p.pos]; t += w; v += w * x.sk; } return t ? v / t : 60; });
    // 交代の予定（55〜88分に最大3回）
    const subAt = S.map(() => Array.from({ length: SUBS }, () => (chance(.9) ? ri(55, 88) : 0)).filter(Boolean).sort((p, q) => p - q));
    const leave = (sd, x) => { const i = sd.cur.indexOf(x); if (i >= 0) sd.cur.splice(i, 1); };

    function sendOff(x, min) { x.off = min; const sd = S[x.side]; leave(sd, x); sd.mult *= .72; S[1 - x.side].mult *= 1.18; }
    function doSub(sd, min) {
      if (sd.subsLeft <= 0) return;
      const on = sd.cur.filter((x) => x.slot !== 'GK');
      const bench = sd.slots.filter((x) => !x.start && x.on == null);
      if (!on.length || !bench.length) return;
      const out = pickW(on, (x) => 1 + (x.human ? (x.p.fatigue || 0) / 40 : rnd()) + (x.line.yc ? .8 : 0) + (x.p.age >= 32 ? .4 : 0));
      const same = bench.filter((x) => x.p.pos === out.slot);
      const inn = (same.length ? same : bench).sort((p, q) => q.sel - p.sel)[0];
      out.off = min - 1; inn.on = min - 1; inn.slot = out.slot; sd.subsLeft--;
      leave(sd, out); sd.cur.push(inn);
      events.push({ min, side: out.side, t: 'sub', a: inn, b: out });
    }
    function chanceFor(si, min) {
      const sd = S[si], op = S[1 - si], on = sd.cur;
      if (!on.length) return;
      const gk = gkOf(op);
      const gkv = gk ? (gk.slot === 'GK' && gk.p.pos === 'GK' ? gk.p.stats.gk : Math.min(gk.p.stats.gk, 40)) + cond(gk) * 1.5 : 30;
      if (chance(PK_RATE)) {
        let taker = null;
        const tk = (x) => x.sk + (x.human ? 2 : 0) + (x.inf.pkSkill ? 15 : 0);
        for (const x of on) if (x.slot !== 'GK' && (!taker || tk(x) > tk(taker))) taker = x;
        taker = taker || on[0];
        const p = clamp(.76 + (taker.p.stats.sht - gkv) / 150 + (taker.inf.pkSkill ? .06 : 0), .6, .93);
        taker.line.sh++;
        const e = { min, side: si, t: 'pk', a: taker, gk, p };
        if (opt.deferPk && taker.me) e.pending = true;
        else { e.res = chance(p); if (e.res) taker.line.sot++; }
        events.push(e);
        return;
      }
      const shooter = pickW(on, (x) => x.wShot);
      if (!shooter) return;
      const sk = shooter.sk;
      shooter.line.sh++;
      const q = CONV * OPEN * ex((sk - shooterRef[si]) - (gkv - op.eff), 55);
      const pOT = clamp(.36 + (sk - shooterRef[si]) / 300, .27, .46);
      if (!chance(pOT)) {
        if (chance(.35)) { const d = pickW(op.cur, (x) => x.wClr); if (d) d.line.cl++; }
        return;
      }
      shooter.line.sot++;
      if (chance(clamp(q / pOT * shooter.inf.fin * (gk && gk.inf.bigsave ? .9 : 1), .05, .9))) {
        const e = { min, side: si, t: 'goal', a: shooter, how: SL._.goalHow(shooter.p) };
        if (chance(.72)) { const as = pickW(on, (x) => (x === shooter ? 0 : x.wAst)); if (as) { e.b = as; as.line.a++; } }
        shooter.line.g++;
        events.push(e);
      } else if (gk) {
        gk.line.sv++;
        if (sk >= gkv - 4 && chance(gk.inf.bigsave ? .5 : .35)) events.push({ min, side: 1 - si, t: 'save', a: gk, b: shooter });
      }
    }
    function tackle(si, min) {
      const t = pickW(S[si].cur, (x) => (x.slot === 'GK' ? 0 : x.wTk));
      if (!t) return;
      t.line.tk++;
      if (chance(YC_RATE)) {
        t.line.yc++;
        if (t.line.yc >= 2) { t.line.rc++; sendOff(t, min); events.push({ min, side: si, t: 'rc', a: t, second: true }); }
        else events.push({ min, side: si, t: 'yc', a: t });
      } else if (chance(.0015)) { t.line.rc++; sendOff(t, min); events.push({ min, side: si, t: 'rc', a: t }); }
    }
    for (let min = 1; min <= 90; min++) {
      for (let si = 0; si < 2; si++) while (subAt[si].length && subAt[si][0] === min) { subAt[si].shift(); doSub(S[si], min); }
      for (let si = 0; si < 2; si++) if (rnd() < rate[si] * S[si].mult) chanceFor(si, min);
      for (let si = 0; si < 2; si++) if (rnd() < TK_RATE) tackle(si, min);
    }
    // 出場時間・パス・インターセプト・クリア（試合の流れには影響しない数。出場時間に比例して割り振る）
    for (const [si, sd] of S.entries()) {
      const played = sd.slots.filter((x) => x.on != null);
      for (const x of played) {
        x.mins = (x.off == null ? 90 : x.off) - x.on;
        const n = Math.round(W.pass[x.p.pos] * x.mins / 90 * (.8 + rnd() * .4));
        const r = clamp(.66 + (x.p.stats.pas - 50) * .004 + (sd.eff - S[1 - si].eff) * .004 + cond(x) * .01, .55, .94);
        x.line.pa = n; x.line.pok = Math.round(n * r);
      }
      const ints = Math.round(9 + rnd() * 4), clears = Math.round(10 + rnd() * 6);
      for (let i = 0; i < ints; i++) { const x = pickW(played, (y) => y.wInt * y.mins); if (x) x.line.it++; }
      for (let i = 0; i < clears; i++) { const x = pickW(played, (y) => y.wClr * y.mins); if (x) x.line.cl++; }
    }
    events.sort((p, q) => p.min - q.min);
    return { S, events, lam };
  }

  // ----- 試合を締める：PKの結果を確定させ、スコア・失点・評価点を出す -----
  function finishMatch(raw, pkGoal = null) {
    const { S, events } = raw;
    for (const e of events) if (e.t === 'pk' && e.pending) { e.res = pkGoal == null ? chance(e.p) : !!pkGoal; e.pending = false; if (e.res) e.a.line.sot++; }
    for (const e of events) if (e.t === 'pk') { if (e.res) e.a.line.g++; else if (e.gk) { e.gk.line.sv++; e.stop = true; } }
    const goals = [0, 0], ht = [0, 0];
    for (const e of events) if (e.t === 'goal' || (e.t === 'pk' && e.res)) { goals[e.side]++; if (e.min <= 45) ht[e.side]++; }
    // 出場中の失点（GK・DFの評価と無失点に使う）
    for (const e of events) if (e.t === 'goal' || (e.t === 'pk' && e.res)) {
      for (const x of S[1 - e.side].slots) if (x.on != null && x.on < e.min && (x.off == null || x.off >= e.min)) x.line.gc++;
    }
    let best = null;
    for (const [si, sd] of S.entries()) {
      const gf = goals[si], gc = goals[1 - si];
      for (const x of sd.slots) {
        if (x.on == null) continue;
        const L = x.line, pos = x.slot === 'GK' ? 'GK' : x.p.pos;
        let r = 6.1 + L.g * .9 + L.a * .55 + (L.sot - L.g) * .08 + (L.pa ? (L.pok / L.pa - .74) * 1 : 0)
          + L.tk * .1 + L.it * .09 + L.cl * .04 + (gf > gc ? .3 : gf < gc ? -.3 : 0) - L.yc * .3 - L.rc * 1.2 + cond(x) * .1 + gauss() * .3;
        if (pos === 'GK') r += L.sv * .2 - L.gc * .3 + (x.start && gc === 0 ? .55 : 0) + .05;
        if (pos === 'DF') r += -L.gc * .17 + (x.start && gc === 0 ? .5 : 0) + .25;
        if (pos === 'MF') r += .02;
        if (pos === 'FW') r += L.g ? 0 : -.08;
        if (!x.start) r = 6 + (r - 6) * .7;
        x.rating = Math.round(clamp(r, 3.5, 10) * 10) / 10;
        x.cs = x.start && gc === 0 && (pos === 'GK' || pos === 'DF') && x.mins >= 60;
        if (!best || x.rating > best.rating || (x.rating === best.rating && gf > gc)) best = x;
      }
    }
    if (best) best.motm = true;
    return { gh: goals[0], ga: goals[1], ht, best };
  }

  // 画面に出す試合の流れ（名前つき）。side は「その人から見て」us / them
  // meSlot：オンラインでは、見る人ごとに「自分」が違う（省略すると x.me）
  function matchLog(raw, viewSide, meSlot = null) {
    const nm = (x) => (x ? x.p.name : null), isMe = (x) => !!x && (meSlot ? x === meSlot : !!x.me);
    return raw.events.map((e) => {
      const us = e.side === viewSide ? 'us' : 'them';
      switch (e.t) {
        case 'goal': return { min: e.min, side: us, t: 'goal', who: nm(e.a), as: nm(e.b), how: e.how, me: isMe(e.a), meA: isMe(e.b), kid: !!e.a.kid, human: !!(e.a.human || (e.b && e.b.human)) };
        case 'pk': return { min: e.min, side: us, t: e.res ? 'pk' : 'pkmiss', who: nm(e.a), gk: nm(e.gk), me: isMe(e.a), meGk: isMe(e.gk), human: !!e.a.human };
        case 'save': return { min: e.min, side: us, t: 'save', who: nm(e.a), vs: nm(e.b), me: isMe(e.a) };
        case 'yc': case 'rc': return { min: e.min, side: us, t: e.t, who: nm(e.a), me: isMe(e.a), second: !!e.second };
        case 'sub': return { min: e.min, side: us, t: 'sub', who: nm(e.a), out: nm(e.b), me: isMe(e.a), meOut: isMe(e.b) };
        default: return null;
      }
    }).filter(Boolean);
  }

  // NPCの今季の成績（リーグ戦だけ）。[出場, 先発, 分, 得点, アシスト, シュート, タックル, インターセプト, セーブ, 無失点, 警告, 退場, 評価点の合計×10]
  const NPC_STAT_KEYS = ['apps', 'starts', 'mins', 'goals', 'assists', 'shots', 'tackles', 'inters', 'saves', 'cs', 'yellow', 'red', 'rating10'];
  function addNpcStats(store, raw) {
    for (const sd of raw.S) for (const x of sd.slots) {
      if (x.human || x.on == null || !x.p.id) continue;
      const a = store[x.p.id] || (store[x.p.id] = NPC_STAT_KEYS.map(() => 0)), L = x.line;
      a[0]++; if (x.start) a[1]++; a[2] += x.mins; a[3] += L.g; a[4] += L.a; a[5] += L.sh; a[6] += L.tk; a[7] += L.it; a[8] += L.sv; if (x.cs) a[9]++; a[10] += L.yc; a[11] += L.rc; a[12] += Math.round(x.rating * 10);
    }
  }
  // 本物のプレイヤーの成績の項目（シーズン・通算に足す）
  const LINE_KEYS = { shots: 'sh', onTarget: 'sot', passes: 'pa', passOk: 'pok', tackles: 'tk', inters: 'it', clears: 'cl', saves: 'sv', yellow: 'yc', red: 'rc' };
  function addLine(T, L) { for (const [k, v] of Object.entries(LINE_KEYS)) T[k] = (T[k] || 0) + (L[v] || 0); }

  Object.assign(SL, { NPC_STAT_KEYS, LINE_KEYS, simMatch, finishMatch, matchLog, addNpcStats, addLine, pickLineup });
})(typeof SL !== 'undefined' ? SL : require('./core.js'));
