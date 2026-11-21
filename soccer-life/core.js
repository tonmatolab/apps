// ===== サッカー人生：ゲームのルール =====
// 画面（DOM）には触らない純粋なロジックだけを置く。セーブデータ（state）はそのまま JSON にできる形。
// あとでオンライン化するときは、このファイルをサーバー側でも読み込んで同じルールで試合を回せる。
'use strict';

const SL = (() => {
  // ----- 乱数（サーバーで回すときは setRng でシード付き乱数に差し替える） -----
  let R = Math.random;
  const setRng = (f) => { R = f; };
  const rnd = () => R();
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const chance = (p) => rnd() < p;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const poisson = (l) => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; };
  const sig = (x) => 1 / (1 + Math.exp(-x));

  // ----- 能力 -----
  const STATS = { spd: 'スピード', sht: 'シュート', pas: 'パス', drb: 'ドリブル', def: '守備', phy: 'フィジカル', gk: 'セービング' };
  const POS = {
    FW: { name: 'フォワード', w: { sht: .36, spd: .2, drb: .2, phy: .14, pas: .1 }, goal: .34, assist: .16, desc: 'ゴールを奪うストライカー。得点王を狙え' },
    MF: { name: 'ミッドフィルダー', w: { pas: .32, drb: .2, spd: .12, def: .14, sht: .12, phy: .1 }, goal: .14, assist: .32, desc: '試合を組み立てる司令塔。アシストで魅せる' },
    DF: { name: 'ディフェンダー', w: { def: .4, phy: .25, spd: .15, pas: .14, sht: .06 }, goal: .05, assist: .07, desc: 'ゴール前の壁。無失点で評価が上がる' },
    GK: { name: 'ゴールキーパー', w: { gk: .7, phy: .15, pas: .1, def: .05 }, goal: 0, assist: .01, desc: '最後の砦。ビッグセーブで勝利を呼ぶ' },
  };
  const mainStats = (pos) => Object.keys(POS[pos].w).filter((k) => POS[pos].w[k] >= .12);
  const ovr = (p) => Math.round(Object.entries(POS[p.pos].w).reduce((s, [k, w]) => s + p.stats[k] * w, 0));

  const GROW = {
    early: { name: '早熟型', peak: 25 },
    normal: { name: '普通型', peak: 28 },
    late: { name: '晩成型', peak: 31 },
  };

  // ----- 練習メニュー -----
  const TRAINING = {
    sht: { name: 'シュート練習', icon: '🎯', stats: ['sht'] },
    spd: { name: 'ダッシュ', icon: '💨', stats: ['spd'] },
    pas: { name: 'パス練習', icon: '🔁', stats: ['pas'] },
    drb: { name: 'ドリブル練習', icon: '🌀', stats: ['drb'] },
    def: { name: '守備練習', icon: '🛡️', stats: ['def'] },
    phy: { name: '筋トレ', icon: '💪', stats: ['phy'] },
    gk: { name: 'セービング練習', icon: '🧤', stats: ['gk'], gkOnly: true },
    hard: { name: '居残り猛練習', icon: '🔥', stats: null, desc: '全部伸びるが疲れる・ケガしやすい' },
    rest: { name: '休養', icon: '😴', stats: [], desc: '疲れが取れて調子が上がりやすい' },
  };

  // ----- リーグとクラブ（すべて架空） -----
  const LEAGUES = [
    { id: 0, name: '欧州プレミアリーグ', short: '欧州', npcGoals: [11, 18], npcAssists: [7, 12] },
    { id: 1, name: '国内1部リーグ', short: '1部', npcGoals: [9, 15], npcAssists: [6, 10] },
    { id: 2, name: '国内2部リーグ', short: '2部', npcGoals: [8, 14], npcAssists: [5, 9] },
  ];
  const CLUB_SEED = [
    // 欧州
    ['ロンドン・ロイヤルズ', 'ロンドン', 0, 87, '#c8102e'], ['マドリード・コロナ', 'マドリード', 0, 88, '#f2f2f2'],
    ['ミラノ・ドゥオーモ', 'ミラノ', 0, 84, '#1b3f8b'], ['ミュンヘン・アドラー', 'ミュンヘン', 0, 86, '#d4002a'],
    ['パリ・ルミエール', 'パリ', 0, 83, '#0a2a5c'], ['バルセロナ・モザイク', 'バルセロナ', 0, 85, '#a50044'],
    ['マンチェスター・スチール', 'マンチェスター', 0, 82, '#6cabdd'], ['アムステルダム・カナルズ', 'アムステルダム', 0, 78, '#ff6a13'],
    ['リスボン・ナビガドーレス', 'リスボン', 0, 77, '#00843d'], ['ドルトムント・ゲルブ', 'ドルトムント', 0, 80, '#fde100'],
    // 国内1部
    ['東京ブルーウイングス', '東京', 1, 71, '#1e5bc6'], ['大阪ファイアーズ', '大阪', 1, 70, '#e8432f'],
    ['横浜オーシャンズ', '横浜', 1, 68, '#0b7fb5'], ['名古屋シャチホコFC', '名古屋', 1, 67, '#d69a00'],
    ['神戸ポートスターズ', '神戸', 1, 66, '#5a2d82'], ['広島レッドウェーブ', '広島', 1, 64, '#b3122e'],
    ['札幌スノーベアーズ', '札幌', 1, 63, '#4c4c4c'], ['福岡ハカタSC', '福岡', 1, 62, '#0e3a75'],
    ['仙台ダテFC', '仙台', 1, 60, '#f0c400'], ['新潟スワンズ', '新潟', 1, 59, '#f07a1a'],
    // 国内2部
    ['静岡ティーグリーン', '静岡', 2, 58, '#2f9e44'], ['京都ミヤコFC', '京都', 2, 57, '#7b2c8f'],
    ['千葉ポートFC', '千葉', 2, 56, '#ffcc00'], ['熊本ボルケーノ', '熊本', 2, 54, '#d6332b'],
    ['金沢ゴールドリーフ', '金沢', 2, 53, '#c9a227'], ['岡山ピーチーズ', '岡山', 2, 52, '#e96b8a'],
    ['長野アルプス', '長野', 2, 51, '#3d7a5a'], ['愛媛オレンジーズ', '愛媛', 2, 50, '#f28c28'],
    ['沖縄シーサーズ', '沖縄', 2, 48, '#1aa3c4'], ['群馬ホットスプリングス', '群馬', 2, 47, '#a0522d'],
  ];

  const FIRST = ['蓮', '大翔', '陽翔', '湊', '颯太', '悠真', '翼', '海斗', '陸', '律', '葵', 'ひなた', '凛', '光', '晴', '空', '奏', '瑛太', '樹', '純'];
  const SURNAMES = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '中村', '小林', '加藤', '吉田', '山口', '松本', '井上', '木村', '清水', '黒川', '神崎', '速水', '真田', '桐生'];
  const NATIONS = ['ブラジル', 'アルゼンチン', 'フランス', 'スペイン', 'ドイツ', 'イングランド', 'イタリア', 'オランダ', 'ポルトガル', 'ベルギー', 'クロアチア', 'ウルグアイ', 'メキシコ', '韓国', 'アメリカ', 'セネガル', 'モロッコ', 'ナイジェリア', 'オーストラリア', 'カナダ'];
  const NATION_STR = { ブラジル: 86, アルゼンチン: 86, フランス: 87, スペイン: 85, ドイツ: 84, イングランド: 85, イタリア: 82, オランダ: 82, ポルトガル: 83, ベルギー: 80, クロアチア: 79, ウルグアイ: 78, メキシコ: 74, 韓国: 73, アメリカ: 74, セネガル: 75, モロッコ: 77, ナイジェリア: 74, オーストラリア: 71, カナダ: 72 };

  const SEASON_WEEKS = 18;
  const START_YEAR = 2027;
  const isWorldCupYear = (y) => y % 4 === 2;

  // ===== 新しいゲーム =====
  function newWorld() {
    return CLUB_SEED.map(([name, city, lg, str, color], id) => ({ id, name, city, lg, str, color }));
  }

  function newPlayer(name, pos, bonus = 0, age = 18) {
    const stats = {};
    const main = mainStats(pos);
    const early = (age - 18) * 2; // 早くプロ入りした子は少しだけ育っている
    for (const k of Object.keys(STATS)) {
      if (k === 'gk') stats.gk = pos === 'GK' ? ri(48, 56) + early : ri(5, 15);
      else if (main.includes(k)) stats[k] = ri(46, 56) + Math.round(bonus / 4) + early;
      else stats[k] = ri(26, 42);
    }
    const gr = pick(['early', 'normal', 'normal', 'normal', 'late']);
    return {
      name, pos, age, stats, exp: {},
      pot: clamp(ri(66, 86) + bonus, 60, 99), grow: gr, growKnown: false,
      cond: 0, fatigue: 0, injury: 0, fame: 5 + bonus, money: 0,
      club: null, salary: 0, contract: 0, number: 30,
      married: false, dating: false, kids: 0, kidsBorn: [],
    };
  }

  // ----- 物語の記録（選手名鑑や新聞の材料になる） -----
  function addLog(s, k, t) { s.log.push({ y: s.year, age: s.p.age, k, t }); }
  // 新聞の号外。画面側が絵にする
  function addPaper(s, kind, head, sub, lead) { s.papers.push({ y: s.year, age: s.p.age, kind, head, sub, lead, seen: false }); }
  const lastName = (n) => { const m = String(n).split(/[\s　]+/); return m.length > 1 ? m[0] : String(n); };

  // ----- ライバル（同期・同じポジションの天才） -----
  function newRival(s) {
    const lg1 = s.clubs.filter((c) => c.lg === 1).sort((a, b) => b.str - a.str);
    return {
      name: `${pick(SURNAMES)} ${pick(FIRST)}`, pos: s.p.pos, age: s.p.age, ovr: ovr(s.p) + ri(1, 5), pot: ri(76, 90),
      peak: pick([25, 27, 28, 28, 30]), club: pick(lg1.slice(2, 7)).id, totals: { apps: 0, goals: 0, assists: 0, cs: 0 },
      awards: [], h2h: { w: 0, d: 0, l: 0 }, hist: [], retired: false, retiredYear: null,
    };
  }

  // 古いセーブデータに新しい項目を足す
  function migrate(s) {
    s.log = s.log || []; s.papers = s.papers || []; s.mode = s.mode || 'normal';
    s.family = s.family || { combo: 0, jointApps: 0, jointGoals: 0 };
    s.p.kidsBorn = s.p.kidsBorn || [];
    if (!s.rival) { s.rival = newRival(s); if (s.p.club != null && s.rival.club === s.p.club) s.rival.club = (s.rival.club + 1) % 10 + 10; }
    return s;
  }

  // 新人の入団先候補：強いクラブほど試合に出にくい
  function rookieOffers(s) {
    const o = ovr(s.p);
    const lg1 = s.clubs.filter((c) => c.lg === 1).sort((a, b) => a.str - b.str);
    const lg2 = s.clubs.filter((c) => c.lg === 2).sort((a, b) => a.str - b.str);
    const big = pick(lg1.slice(-4)), mid = pick(lg1.slice(0, 4)), small = pick(lg2.slice(0, 5));
    return [big, mid, small].map((c) => ({ club: c.id, salary: wageFor(c, o, s.p.fame), years: 3, rookie: true }));
  }

  function newGame(name, pos, opt = {}) {
    const s = {
      v: 1, year: opt.year || START_YEAR, week: 0, gen: opt.gen || 1,
      lineage: opt.lineage || [], clubs: opt.clubs || newWorld(),
      p: newPlayer(name, pos, opt.bonus || 0, opt.age || 18),
      phase: 'draft', history: [], news: [], totals: emptyTotals(),
      trophies: [], awards: [], caps: 0, natGoals: 0, wc: [],
      training: pos === 'GK' ? 'gk' : mainStats(pos)[0],
      mode: opt.mode || 'normal', log: [], papers: [], family: { combo: 0, jointApps: 0, jointGoals: 0 },
      parent: opt.parent || null,
    };
    s.rival = newRival(s);
    s.draft = rookieOffers(s);
    // 親と同じチームで育った子は、そのクラブからの昇格オファーが一番上に来る
    if (opt.homeClub != null) {
      const c = s.clubs[opt.homeClub];
      s.draft = [{ club: c.id, salary: wageFor(c, ovr(s.p), s.p.fame), years: 3, rookie: true, home: true }].concat(s.draft.filter((o) => o.club !== c.id).slice(0, 2));
    }
    return s;
  }

  function emptyTotals() { return { apps: 0, starts: 0, goals: 0, assists: 0, cs: 0, rating: 0, mins: 0 }; }
  const clubOf = (s, id = s.p.club) => s.clubs[id];
  const leagueClubs = (s, lg) => s.clubs.filter((c) => c.lg === lg);

  function wageFor(c, o, fame) {
    // 単位：万円／年
    const base = c.lg === 0 ? 4000 + (o - 70) * 600 : c.lg === 1 ? 600 + (o - 50) * 90 : 240 + (o - 45) * 25;
    return Math.max(c.lg === 2 ? 180 : c.lg === 1 ? 420 : 3000, Math.round((base + fame * (c.lg === 0 ? 60 : 12)) / 10) * 10);
  }

  function assignNumber(s) {
    const c = clubOf(s), o = ovr(s.p);
    const ace = { FW: 9, MF: 10, DF: 4, GK: 1 }[s.p.pos];
    s.p.number = o >= c.str + 4 ? ace : o >= c.str - 2 ? pick({ FW: [11, 18, 19], MF: [7, 8, 14], DF: [2, 3, 5], GK: [12, 21] }[s.p.pos]) : ri(22, 39);
  }

  function joinClub(s, offer) {
    const first = s.p.club == null;
    s.p.club = offer.club; s.p.salary = offer.salary; s.p.contract = offer.years;
    assignNumber(s);
    if (first) {
      const c = s.clubs[offer.club];
      addLog(s, 'join', `${s.year}年、${s.p.age}歳で${c.name}に入団。`);
      // ライバルは別のクラブへ
      if (s.rival && s.rival.club === offer.club) s.rival.club = s.clubs.filter((x) => x.lg === 1 && x.id !== offer.club).sort((a, b) => b.str - a.str)[3].id;
      if (s.rival) addLog(s, 'rival', `同期の${s.rival.name}は${s.clubs[s.rival.club].name}に入団し、「同世代最高の才能」と呼ばれた。`);
    }
  }

  // ===== シーズン =====
  function roundRobin(ids) {
    const t = ids.slice(); const n = t.length; const rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const m = [];
      for (let i = 0; i < n / 2; i++) {
        const a = t[i], b = t[n - 1 - i];
        m.push(r % 2 === 0 ? [a, b] : [b, a]);
      }
      rounds.push(m);
      t.splice(1, 0, t.pop());
    }
    return rounds.concat(rounds.map((m) => m.map(([a, b]) => [b, a])));
  }

  function startSeason(s) {
    s.week = 0; s.phase = 'season';
    s.schedule = {}; s.table = {};
    for (const lg of LEAGUES) {
      const ids = leagueClubs(s, lg.id).map((c) => c.id).sort(() => rnd() - .5);
      s.schedule[lg.id] = roundRobin(ids);
    }
    for (const c of s.clubs) s.table[c.id] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, form: [] };
    s.season = { ...emptyTotals(), ratings: [], year: s.year, club: s.p.club, lg: clubOf(s).lg, age: s.p.age, best: null };
    s.news = [];
  }

  function standings(s, lg) {
    return leagueClubs(s, lg).map((c) => ({ c, t: s.table[c.id] }))
      .sort((a, b) => b.t.p - a.t.p || (b.t.gf - b.t.ga) - (a.t.gf - a.t.ga) || b.t.gf - a.t.gf || b.c.str - a.c.str);
  }
  const rankOf = (s, id) => standings(s, s.clubs[id].lg).findIndex((x) => x.c.id === id) + 1;

  function record(s, h, a, gh, ga) {
    const th = s.table[h], ta = s.table[a];
    th.gf += gh; th.ga += ga; ta.gf += ga; ta.ga += gh;
    if (gh > ga) { th.w++; th.p += 3; ta.l++; th.form.push('W'); ta.form.push('L'); }
    else if (gh < ga) { ta.w++; ta.p += 3; th.l++; th.form.push('L'); ta.form.push('W'); }
    else { th.d++; ta.d++; th.p++; ta.p++; th.form.push('D'); ta.form.push('D'); }
  }

  const lambda = (us, them, home) => 1.35 * Math.exp((us - them) / 18) + (home ? .18 : 0);

  // 1週間：練習 → 試合 → 出来事
  function playWeek(s) {
    const p = s.p; const out = { week: s.week + 1, growth: {}, notes: [] };
    const before = { ...p.stats }; const o0 = ovr(p);

    // --- 練習 ---
    const tr = TRAINING[s.training] || TRAINING.rest;
    const injured = p.injury > 0;
    if (injured) {
      out.notes.push(`ケガのリハビリ中（あと${p.injury}週）`);
      p.fatigue = Math.max(0, p.fatigue - 20);
    } else if (s.training === 'rest') {
      p.fatigue = Math.max(0, p.fatigue - 32);
      if (chance(.45)) p.cond = clamp(p.cond + 1, -2, 2);
    } else if (s.training === 'hard') {
      for (const k of mainStats(p.pos)) train(p, k, .5);
      p.fatigue = clamp(p.fatigue + 24, 0, 100);
      if (chance(.04 + p.fatigue / 900)) injure(s, out, ri(1, 3), '猛練習中に足を痛めた');
    } else {
      for (const k of tr.stats) train(p, k, 1.7);
      p.fatigue = clamp(p.fatigue + 9, 0, 100);
    }

    // --- 試合 ---
    const lg = clubOf(s).lg;
    let mine = null;
    for (const L of LEAGUES) {
      for (const [h, a] of s.schedule[L.id][s.week]) {
        if (L.id === lg && (h === p.club || a === p.club)) { mine = [h, a]; continue; }
        const ch = s.clubs[h], ca = s.clubs[a];
        record(s, h, a, poisson(lambda(ch.str + gauss() * 3, ca.str + gauss() * 3, true)), poisson(lambda(ca.str + gauss() * 3, ch.str + gauss() * 3, false)));
      }
    }
    out.match = playMatch(s, mine[0], mine[1]);
    record(s, mine[0], mine[1], out.match.gh, out.match.ga);
    if (out.match.notes) { out.notes.push(...out.match.notes); out.injured = out.match.injured; }

    // 試合経験でも少し伸びる
    if (out.match.mins > 0) for (const k of mainStats(p.pos)) train(p, k, .14 * out.match.mins / 90);

    // --- 衰え（ピークを過ぎると毎週少しずつ） ---
    const over = p.age - GROW[p.grow].peak;
    if (over > 0) {
      for (const k of Object.keys(p.stats)) {
        const rate = (k === 'spd' || k === 'phy') ? .06 : k === 'gk' ? .032 : .024;
        decay(p, k, rate * Math.min(over, 7));
      }
    }

    // --- 疲労・調子 ---
    p.fatigue = Math.max(0, p.fatigue - 6);
    if (p.injury > 0 && injured) p.injury--;
    if (out.match.rating) {
      if (out.match.rating >= 7.5 && chance(.6)) p.cond = clamp(p.cond + 1, -2, 2);
      if (out.match.rating < 5.5 && chance(.5)) p.cond = clamp(p.cond - 1, -2, 2);
    }
    if (chance(.18)) p.cond = clamp(p.cond + (chance(.5) ? 1 : -1), -2, 2);

    for (const k of Object.keys(p.stats)) if (p.stats[k] !== before[k]) out.growth[k] = p.stats[k] - before[k];
    out.ovrDiff = ovr(p) - o0;

    s.week++;
    // --- 出来事 ---
    out.event = rollEvent(s);
    if (s.week >= SEASON_WEEKS) s.phase = 'seasonEnd';
    return out;
  }

  function train(p, k, amt) {
    const main = POS[p.pos].w[k] >= .12;
    const cap = Math.min(99, p.pot + (main ? 6 : -10));
    const over = p.age - GROW[p.grow].peak;
    const ageF = over <= 0 ? (p.age <= 21 ? 1.15 : 1) : Math.max(.15, .55 - over * .1);
    const head = clamp((cap - p.stats[k]) / (cap - 30), 0, 1.2);
    const condF = 1 + p.cond * .08;
    const fatF = p.fatigue > 65 ? .6 : 1;
    p.exp[k] = (p.exp[k] || 0) + amt * head * ageF * condF * fatF * (.7 + rnd() * .6);
    while (p.exp[k] >= 1 && p.stats[k] < 99) { p.exp[k] -= 1; p.stats[k]++; }
  }
  function decay(p, k, amt) {
    p.exp[k] = (p.exp[k] || 0) - amt * (.6 + rnd() * .8);
    while (p.exp[k] <= -1 && p.stats[k] > 1) { p.exp[k] += 1; p.stats[k]--; }
  }
  function injure(s, out, weeks, why) {
    s.p.injury = Math.max(s.p.injury, weeks);
    (out.notes || (out.notes = [])).push(`🚑 ${why}…全治${weeks}週`);
    if (weeks >= 4) addLog(s, 'injury', `${s.year}年、${why}。全治${weeks}週の離脱を経験したが、そこから復帰した。`);
    out.injured = weeks;
  }

  // 先発の確率：チームの中での実力（若手は少しだけ我慢して使ってもらえる）・調子・疲れ
  function startChance(p, c, now = false) {
    let diff = ovr(p) - (c.str - 4) + (p.age <= 20 ? 2 : 0);
    if (now) diff += p.cond * 1.5 - (p.fatigue > 60 ? (p.fatigue - 60) / 6 : 0);
    return sig(diff / 3);
  }

  function playMatch(s, h, a) {
    const p = s.p; const me = p.club; const home = h === me; const opp = home ? a : h;
    const c = clubOf(s), co = s.clubs[opp]; const o = ovr(p);
    const m = { home, opp, oppName: co.name, h, a, mins: 0, goals: 0, assists: 0, role: 'out', events: [] };

    // 出場判定：チームの中での実力・調子・疲れ
    if (p.injury > 0) m.role = 'injured';
    else {
      if (chance(startChance(p, c, true))) { m.role = 'start'; m.mins = chance(.82) ? 90 : ri(60, 85); }
      else if (p.pos !== 'GK' && chance(.55)) { m.role = 'sub'; m.mins = ri(10, 35); }
      else m.role = 'bench';
    }

    const boost = m.role === 'start' ? (o - c.str) * .35 + p.cond * .6 : m.role === 'sub' ? (o - c.str) * .08 : 0;
    const us = c.str + boost + gauss() * 3, them = co.str + gauss() * 3;
    const gUs = poisson(lambda(us, them, home)), gThem = poisson(lambda(them, us, !home));
    m.gh = home ? gUs : gThem; m.ga = home ? gThem : gUs; m.gf = gUs; m.gc = gThem;

    // ゴールの時間と、自分の関わり
    const P = POS[p.pos];
    const onPitch = (min) => m.role === 'start' ? min <= m.mins : m.role === 'sub' ? min > 90 - m.mins : false;
    const gShare = P.goal * clamp(1 + (p.stats.sht - 62) / 40, .35, 1.7);
    const aShare = P.assist * clamp(1 + ((p.stats.pas + p.stats.drb) / 2 - 58) / 40, .6, 2);
    const mins = [];
    for (let i = 0; i < gUs; i++) mins.push([ri(1, 90), 'us']);
    for (let i = 0; i < gThem; i++) mins.push([ri(1, 90), 'them']);
    mins.sort((x, y) => x[0] - y[0]);
    // ライバルとの対戦
    const rv = s.rival;
    if (rv && !rv.retired && rv.club === opp) {
      m.rival = { name: rv.name, played: chance(sig((rv.ovr - (co.str - 4)) / 3) * .95 + .05), goals: 0 };
    }
    // 子どもが同じチームにいる
    const kid = s.childPro && s.childPro.club === me && m.mins > 0 && chance(clamp(.3 + (s.childPro.age - 16) * .12, .3, .85)) ? s.childPro : null;
    if (kid) { m.kid = { name: kid.name, goals: 0 }; s.family.jointApps++; }
    const kidShare = kid ? ({ FW: .26, MF: .14, DF: .05, GK: 0 }[kid.pos]) * clamp(1 + (kid.ovr - 60) / 40, .5, 1.6) : 0;
    for (const [min, side] of mins) {
      const e = { min, side, who: null };
      if (side === 'us' && onPitch(min)) {
        if (chance(gShare)) { e.who = 'goal'; m.goals++; e.how = goalHow(p); }
        else if (kid && chance(kidShare)) {
          e.kid = 'goal'; m.kid.goals++; s.family.jointGoals++;
          if (chance(Math.min(.6, aShare * 2))) { e.who = 'assist'; m.assists++; e.how = '親から子へのホットライン'; e.combo = true; s.family.combo++; m.combo = true; }
        }
        else if (chance(aShare)) { e.who = 'assist'; m.assists++; e.how = assistHow(p); }
      } else if (side === 'us' && kid && chance(kidShare)) { e.kid = 'goal'; m.kid.goals++; s.family.jointGoals++; }
      if (side === 'them' && onPitch(min) && p.pos === 'GK' && chance(.25)) e.who = 'concede';
      if (side === 'them' && m.rival && m.rival.played && chance({ FW: .38, MF: .18, DF: .06, GK: 0 }[rv.pos])) { e.rival = true; m.rival.goals++; }
      m.events.push(e);
    }
    // GK・DFの見せ場
    if (m.role === 'start' && (p.pos === 'GK' || p.pos === 'DF')) {
      const saves = p.pos === 'GK' ? ri(1, 3) + Math.max(0, Math.round((co.str - c.str) / 8)) : ri(0, 2);
      m.saves = saves;
      if (p.pos === 'GK' && chance(clamp((p.stats.gk - 55) / 80, .05, .5))) m.events.push({ min: ri(5, 89), side: 'save', who: 'save', how: pick(['PKストップ！', '至近距離のシュートを片手で弾き出す', '1対1を完璧に止める']) });
      if (p.pos === 'DF' && chance(clamp((p.stats.def - 55) / 70, .05, .5))) m.events.push({ min: ri(5, 89), side: 'save', who: 'save', how: pick(['ゴールライン上でクリア！', '相手エースを完封', '決定機をスライディングで阻止']) });
      m.events.sort((x, y) => x.min - y.min);
    }

    // 評価点
    if (m.mins > 0) {
      const res = gUs > gThem ? .35 : gUs < gThem ? -.35 : 0;
      let r = 6.0 + m.goals * .95 + m.assists * .6 + res + (o - c.str) * .03 + p.cond * .15 + gauss() * .45;
      if (p.pos === 'GK' || p.pos === 'DF') r += gThem === 0 ? .75 : -gThem * .2;
      if (p.pos === 'GK') r += (m.saves || 0) * .1;
      if (p.pos === 'FW' && !m.goals) r -= .25;
      if (m.events.some((e) => e.who === 'save')) r += .5;
      if (m.role === 'sub') r = 6 + (r - 6) * .7;
      m.rating = Math.round(clamp(r, 4, 10) * 10) / 10;
      m.cs = gThem === 0 && m.role === 'start' && (p.pos === 'GK' || p.pos === 'DF');
      m.motm = m.rating >= 8;
      if (m.role === 'start') p.fatigue = clamp(p.fatigue + 10, 0, 100);
      if (chance(.012 + (p.fatigue > 70 ? .03 : 0))) injure(s, m, ri(1, 5), '試合中に接触プレーで負傷');
    }

    // 成績
    const S = s.season;
    if (m.mins > 0) {
      const wk = `第${s.week + 1}節の${co.name}戦`;
      if (s.totals.apps + S.apps === 0) addLog(s, 'debut', `${s.year}年、${wk}でプロデビュー。`);
      if (m.goals && s.totals.goals + S.goals === 0) addLog(s, 'firstgoal', `プロ初ゴールは${s.p.age}歳、${wk}。`);
      if (m.goals >= 3) s.family.hats = (s.family.hats || 0) + 1;
      if (m.goals >= 3 && [1, 5, 10, 20].includes(s.family.hats)) {
        addLog(s, 'hat', s.family.hats === 1 ? `${s.year}年、${wk}でプロ初のハットトリックを達成。` : `${s.year}年、${wk}で通算${s.family.hats}度目のハットトリック。`);
        addPaper(s, 'hat', `${lastName(p.name)}ハット!!`, `${co.city}戦で圧巻の${m.goals}発`, `${p.name}が${co.name}戦で${m.goals}得点。スタジアムは総立ちとなった。`);
      }
      if (m.combo && s.family.combo === 1) {
        addLog(s, 'family', `${s.year}年、${co.name}戦で子の${kid.name}のゴールをアシスト。史上まれな「親子弾」として話題になった。`);
        addPaper(s, 'combo', '親子弾!!', `${lastName(p.name)}親子 夢のホットライン`, `${p.name}のパスから、子の${kid.name}がゴール。親子でつないだ1点に、スタジアムが涙した。`);
        s.awards.push(`${s.year} 親子ゴール`);
      }
      if (m.rival && m.rival.played) {
        const r = gUs > gThem ? 'w' : gUs < gThem ? 'l' : 'd';
        rv.h2h[r]++;
      }
      S.apps++; if (m.role === 'start') S.starts++;
      S.goals += m.goals; S.assists += m.assists; S.mins += m.mins; if (m.cs) S.cs++;
      S.ratings.push(m.rating);
      if (!S.best || m.rating > S.best.rating) S.best = { rating: m.rating, opp: co.name, gf: gUs, gc: gThem, goals: m.goals, assists: m.assists, week: s.week + 1 };
      p.fame = clamp(p.fame + m.goals * .6 + m.assists * .3 + (m.rating >= 8 ? 1 : 0) + (c.lg === 0 ? .2 : 0), 0, 100);
    }
    return m;
  }

  function goalHow(p) {
    const k = Object.entries({ sht: p.stats.sht, drb: p.stats.drb, spd: p.stats.spd, phy: p.stats.phy }).sort((a, b) => b[1] - a[1])[0][0];
    return pick({
      sht: ['豪快なミドルシュート', '狙いすましたコントロールショット', 'ゴール左隅に突き刺す', '直接フリーキックを沈める'],
      drb: ['3人抜きからの技ありゴール', '切り返しでDFを外してゴール', '華麗なループシュート'],
      spd: ['裏へ抜け出してGKとの1対1を制す', 'カウンターで独走してゴール', '一瞬の加速で抜け出してゴール'],
      phy: ['打点の高いヘディング', 'DFを背負いながら反転シュート', 'こぼれ球を押し込む'],
    }[k]);
  }
  function assistHow(p) { return pick(['スルーパスでアシスト', '完璧なクロスでアシスト', 'ノールックパスでアシスト', 'ドリブル突破から折り返してアシスト', 'CKからアシスト']); }

  // ===== 出来事 =====
  // choices があるものは画面で選ばせる。fx は結果の文章を返す
  const EVENTS = [
    { id: 'coach', w: 6, text: '監督「最近の練習、いいぞ。見ているからな」', fx: (s) => { s.p.cond = clamp(s.p.cond + 1, -2, 2); return '調子が上がった！'; } },
    { id: 'letter', w: 5, if: (s) => s.p.fame >= 15, text: '小学生のファンから手紙が届いた。「いつか同じピッチに立ちたいです」', fx: (s) => { s.p.cond = clamp(s.p.cond + 1, -2, 2); return 'やる気が湧いてきた！'; } },
    { id: 'slump', w: 4, text: '練習でシュートがまったく入らない…スランプかもしれない', fx: (s) => { s.p.cond = clamp(s.p.cond - 1, -2, 2); return '調子が下がった…'; } },
    { id: 'senpai', w: 5, text: 'チームの先輩に「今夜、焼肉行くぞ！」と誘われた',
      choices: [
        { label: 'ついていく', fx: (s) => { s.p.money -= 3; s.p.fatigue = clamp(s.p.fatigue + 8, 0, 100); s.p.cond = clamp(s.p.cond + 1, -2, 2); return 'チームに溶け込めた。少し寝不足…'; } },
        { label: '断って自主練', fx: (s) => { trainAll(s.p, .5); return 'こっそり練習して少し成長した'; } },
      ] },
    { id: 'cm', w: 4, if: (s) => s.p.fame >= 30, text: 'スポーツドリンクのCM出演オファーが来た！',
      choices: [
        { label: '出演する', fx: (s) => { const g = Math.round(s.p.fame * 8); s.p.money += g; if (!s.log.some((l) => l.k === 'cm')) addLog(s, 'cm', `${s.year}年にはスポーツドリンクのCMに出演し、お茶の間でも知られる存在になった。`); s.p.fame = clamp(s.p.fame + 3, 0, 100); s.p.fatigue = clamp(s.p.fatigue + 15, 0, 100); return `ギャラ${g}万円！知名度アップ。撮影で疲れた…`; } },
        { label: 'サッカーに集中', fx: (s) => { s.p.cond = clamp(s.p.cond + 1, -2, 2); return '集中して練習できた'; } },
      ] },
    { id: 'sns', w: 3, if: (s) => s.p.fame >= 20, text: '試合後のコメントが切り取られてSNSで炎上している…',
      choices: [
        { label: 'すぐに謝罪する', fx: (s) => { s.p.fame = clamp(s.p.fame - 1, 0, 100); return '誠実な対応で騒ぎはすぐ収まった'; } },
        { label: '気にせず練習', fx: (s) => (s.log.some((l) => l.k === 'sns') || addLog(s, 'sns', `${s.year}年、試合後のコメントがSNSで炎上したが、本人は「プレーで返す」とだけ語った。`), chance(.5)) ? (s.p.cond = clamp(s.p.cond - 2, -2, 2), '騒ぎが大きくなり調子を落とした…') : (s.p.fame = clamp(s.p.fame + 2, 0, 100), '結果で黙らせた！むしろ人気が上がった') },
      ] },
    { id: 'legend', w: 3, text: '引退したレジェンドOBがグラウンドに来て、個人指導してくれた',
      fx: (s) => { const k = pick(mainStats(s.p.pos)); s.p.stats[k] = Math.min(99, s.p.stats[k] + 2); return `${STATS[k]}が2上がった！`; } },
    { id: 'date', w: 4, if: (s) => !s.p.dating && !s.p.married && s.p.age >= 19 && s.p.age <= 33, text: '友人の紹介で、気の合う人と出会った',
      choices: [
        { label: '食事に誘う', fx: (s) => { s.p.dating = true; s.p.cond = clamp(s.p.cond + 1, -2, 2); return '交際がスタートした！'; } },
        { label: '今はサッカーだけ', fx: (s) => { trainAll(s.p, .4); return '練習に打ち込んだ'; } },
      ] },
    { id: 'marry', w: 4, if: (s) => s.p.dating && !s.p.married, text: '交際中の相手と、将来の話になった',
      choices: [
        { label: 'プロポーズする', fx: (s) => { s.p.married = true; s.p.cond = 2; s.news.push('💍 結婚'); addLog(s, 'marry', `${s.year}年、${s.p.age}歳で結婚。`); return '結婚した！おめでとう！'; } },
        { label: 'まだ早い', fx: () => 'もう少し先にしよう' },
      ] },
    { id: 'baby', w: 4, if: (s) => s.p.married && s.p.kids < 3 && !s.p.kidsBorn.some((k) => k.year === s.year), text: '👶 子どもが生まれた！',
      fx: (s) => {
        let name = childName(s.p.name);
        for (let i = 0; i < 12 && (name === s.p.name || s.p.kidsBorn.some((k) => k.name === name)); i++) name = childName(s.p.name);
        s.p.kids++; s.p.kidsBorn.push({ year: s.year, name }); s.p.cond = 2; s.news.push(`👶 ${name} 誕生`);
        addLog(s, 'baby', `${s.year}年、第${s.p.kids}子の${name}が誕生。`);
        return `「${name}」と名付けた。この子が16歳になるまで現役なら、同じピッチに立てるかも…？`;
      } },
    { id: 'tweak', w: 3, text: '練習中に足首をひねった…', fx: (s) => { s.p.injury = Math.max(s.p.injury, ri(1, 2)); return `全治${s.p.injury}週`; } },
    { id: 'jersey', w: 3, if: (s) => s.p.fame >= 40, text: 'あなたの背番号のユニフォームがグッズ売上1位に！', fx: (s) => { s.p.fame = clamp(s.p.fame + 2, 0, 100); s.p.money += 100; return '知名度アップ！ボーナス100万円'; } },
    { id: 'grow', w: 6, if: (s) => !s.p.growKnown && s.p.age >= 21, text: 'トレーナー「君の体の成長カーブが分かってきたよ」',
      fx: (s) => { s.p.growKnown = true; const g = GROW[s.p.grow]; return `あなたは「${g.name}」！ピークは${g.peak}歳ごろ`; } },
  ];
  function trainAll(p, amt) { for (const k of mainStats(p.pos)) train(p, k, amt); }

  function rollEvent(s) {
    if (!chance(.2)) return null;
    const pool = EVENTS.filter((e) => !e.if || e.if(s));
    const tot = pool.reduce((a, e) => a + e.w, 0);
    let r = rnd() * tot;
    for (const e of pool) { r -= e.w; if (r <= 0) return e.id; }
    return null;
  }
  const eventById = (id) => EVENTS.find((e) => e.id === id);
  function resolveEvent(s, id, ci) {
    const e = eventById(id);
    const fx = e.choices ? e.choices[ci].fx : e.fx;
    return fx(s);
  }

  // ===== シーズン終了 =====
  const avg = (a) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 100) / 100 : 0;

  function endSeason(s) {
    const p = s.p, S = s.season, c = clubOf(s), L = LEAGUES[c.lg];
    const rank = rankOf(s, c.id);
    const tbl = standings(s, c.lg);
    const avgR = avg(S.ratings);
    const awards = [];
    const npcG = ri(...L.npcGoals), npcA = ri(...L.npcAssists);
    if (rank === 1 && S.apps >= 5) awards.push(`${L.short}リーグ優勝`);
    if (S.goals > npcG) awards.push(`${L.short}得点王`);
    if (S.assists > npcA) awards.push(`${L.short}アシスト王`);
    if (S.apps >= 14 && avgR >= 7.25 && (rank <= 3 || S.goals > npcG)) awards.push(`${L.short}MVP`);
    if (S.apps >= 12 && avgR >= 6.85) awards.push(`${L.short}ベストイレブン`);
    if (c.lg !== 0 && s.history.length === 0 && S.apps >= 8 && avgR >= 6.5) awards.push('新人王');
    if (c.lg === 0 && S.apps >= 15 && avgR >= 7.6 && (S.goals + S.assists >= 18 || S.cs >= 9)) awards.push('世界年間最優秀選手');

    // 昇格・降格
    const moves = [];
    const up = (from) => standings(s, from).slice(0, 2).map((x) => x.c), down = (from) => standings(s, from).slice(-2).map((x) => x.c);
    const r1 = down(1), p2 = up(2);
    r1.forEach((x) => { x.lg = 2; moves.push(`${x.name} が2部へ降格`); });
    p2.forEach((x) => { x.lg = 1; moves.push(`${x.name} が1部へ昇格`); });
    const promoted = p2.includes(c), relegated = r1.includes(c);
    if (promoted && S.apps >= 5) awards.push('1部昇格');
    // クラブ力の変動（2部→1部の昇格組は補強で少し強くなる）
    for (const x of s.clubs) {
      const base = CLUB_SEED[x.id][3];
      x.str = clamp(Math.round(x.str + (base - x.str) * .3 + gauss() * 1.5 + (p2.includes(x) ? 3 : 0) - (r1.includes(x) ? 2 : 0)), 44, 90);
    }

    const real = awards.filter(Boolean);
    const salary = p.salary;
    p.money += salary;
    p.fame = clamp(p.fame + real.length * 4 + (avgR >= 7 ? 3 : 0), 0, 100);
    p.contract--;

    const row = { year: s.year, age: p.age, club: c.name, clubId: c.id, lg: L.short, number: p.number, apps: S.apps, starts: S.starts, goals: S.goals, assists: S.assists, cs: S.cs, rating: avgR, rank, awards: real, ovr: ovr(p), salary };
    s.history.push(row);
    const T = s.totals;
    T.apps += S.apps; T.starts += S.starts; T.goals += S.goals; T.assists += S.assists; T.cs += S.cs; T.mins += S.mins;
    T.rating += S.ratings.reduce((a, b) => a + b, 0);
    for (const a of real) (a.includes('優勝') || a.includes('昇格') ? s.trophies : s.awards).push(`${s.year} ${a}`);
    if (real.length) addLog(s, 'award', `${s.year}年、${c.name}で${real.join('・')}。`);
    // 号外はシーズンでいちばん大きいニュースだけ
    const ln = lastName(p.name);
    const top = ['世界年間最優秀選手', '欧州リーグ優勝', '得点王', 'MVP', 'リーグ優勝'].find((k) => real.some((a) => a.includes(k)));
    if (top === '世界年間最優秀選手') addPaper(s, 'world', `${ln} 世界一`, '年間最優秀選手に選出', `${p.name}が世界年間最優秀選手に。日本人選手として歴史的な快挙となった。`);
    else if (top === '欧州リーグ優勝') addPaper(s, 'title', `${ln} 欧州制覇`, `${c.name}で頂点に`, `${p.name}所属の${c.name}が欧州リーグを制した。`);
    else if (top === '得点王') addPaper(s, 'scorer', `${ln}得点王`, `${S.goals}発でキング襲名`, `${p.name}が${S.goals}得点で${L.short}リーグ得点王に輝いた。`);
    else if (top === 'MVP') addPaper(s, 'mvp', `${ln} MVP`, `平均評価${avgR.toFixed(2)}の圧巻`, `${p.name}が${L.short}リーグのMVPに選ばれた。`);
    else if (top === 'リーグ優勝') addPaper(s, 'title', `${c.city} V!!`, `${ln}歓喜の頂点`, `${c.name}が${L.short}リーグ優勝。${p.name}も${S.apps}試合に出場し栄冠に貢献した。`);
    const rivalRow = rivalSeason(s);
    s.phase = 'off';
    return { row, table: tbl.map((x) => ({ id: x.c.id, name: x.c.name, ...x.t })), awards: real, moves, promoted, relegated, npcG, npcA, best: S.best, rival: rivalRow };
  }

  // ライバルの1年（ざっくり計算）
  function rivalSeason(s) {
    const rv = s.rival; if (!rv || rv.retired) return null;
    const c = s.clubs[rv.club], L = LEAGUES[c.lg];
    const sp = sig((rv.ovr - (c.str - 4)) / 3);
    const apps = Math.round(SEASON_WEEKS * clamp(sp * .9 + .08 + gauss() * .05, .05, 1));
    const f = clamp(1 + (rv.ovr - c.str) / 25, .4, 2);
    const goals = poisson(apps * POS[rv.pos].goal * 1.3 * f), assists = poisson(apps * POS[rv.pos].assist * .7 * f);
    const cs = rv.pos === 'GK' || rv.pos === 'DF' ? poisson(apps * .28) : 0;
    const awards = [];
    if (goals > ri(...L.npcGoals)) awards.push(`${L.short}得点王`);
    if (apps >= 12 && rv.ovr >= c.str + 3 && chance(.5)) awards.push(`${L.short}ベストイレブン`);
    rv.totals.apps += apps; rv.totals.goals += goals; rv.totals.assists += assists; rv.totals.cs += cs;
    const row = { year: s.year, age: rv.age, club: c.name, lg: L.short, apps, goals, assists, cs, ovr: rv.ovr, awards };
    rv.hist.push(row); rv.awards.push(...awards.map((a) => `${s.year} ${a}`));
    return row;
  }

  function rivalAge(s) {
    const rv = s.rival; if (!rv || rv.retired) return null;
    rv.age++;
    if (rv.age <= rv.peak) rv.ovr = Math.min(rv.pot, rv.ovr + ri(1, 4)); else if (rv.age > rv.peak + 1) rv.ovr -= ri(1, 3);
    const c = s.clubs[rv.club];
    if ((rv.age >= 34 && rv.ovr < 64) || rv.age >= 38 || (rv.age >= 32 && chance(.06))) {
      rv.retired = true; rv.retiredYear = s.year;
      addLog(s, 'rival', `${s.year}年、ライバルの${rv.name}が${rv.age}歳で現役を引退。通算${rv.totals.apps}試合${rv.totals.goals}得点。`);
      return `🔥 ライバルの${rv.name}が引退を発表した`;
    }
    if ((rv.ovr >= c.str + 3 && chance(.6)) || rv.ovr < c.str - 7) {
      const cand = s.clubs.filter((x) => x.id !== rv.club && x.id !== s.p.club && (x.lg !== 0 || rv.ovr >= 73) && Math.abs(x.str - (rv.ovr - 1)) <= 5);
      if (cand.length) {
        const to = pick(cand); rv.club = to.id;
        if (to.lg === 0) addLog(s, 'rival', `${s.year}年、ライバルの${rv.name}が欧州の${to.name}へ移籍。`);
        return `🔥 ライバルの${rv.name}が${to.name}へ移籍`;
      }
    }
    return null;
  }

  // ===== 代表 =====
  function nationalYear(s) {
    const p = s.p, o = ovr(p), c = clubOf(s);
    const line = 70 - (c.lg === 0 ? 3 : 0) - (s.history.at(-1)?.awards.length ? 1 : 0);
    const called = o >= line || (o >= line - 3 && chance(.4));
    const out = { called, year: s.year, caps: 0, goals: 0 };
    out.rivalCalled = s.rival && !s.rival.retired && s.rival.ovr >= 70;
    if (!called) return out;
    if (!s.caps) addLog(s, 'nat', `${s.year}年、${p.age}歳で日本代表に初選出。`);
    const n = ri(4, 7);
    for (let i = 0; i < n; i++) {
      out.caps++;
      if (chance(POS[p.pos].goal * 1.1)) out.goals++;
    }
    s.caps += out.caps; s.natGoals += out.goals;
    p.fame = clamp(p.fame + 3, 0, 100);
    if (isWorldCupYear(s.year)) out.wc = worldCup(s);
    return out;
  }

  function worldCup(s) {
    const p = s.p, o = ovr(p);
    const starter = o >= 72 || chance(.4);
    const us = 76 + (starter ? (o - 76) * .25 : 0);
    const pool = NATIONS.slice().sort(() => rnd() - .5);
    const matches = []; let pts = 0; let wcGoals = 0;
    const stages = ['グループ第1戦', 'グループ第2戦', 'グループ第3戦', 'ベスト16', '準々決勝', '準決勝', '決勝'];
    let reached = 'グループリーグ敗退';
    for (let i = 0; i < stages.length; i++) {
      const foe = pool[i]; const fs = NATION_STR[foe] + (i >= 3 ? 1 : -2);
      let a = poisson(lambda(us + gauss() * 3, fs + gauss() * 3, false)), b = poisson(lambda(fs + gauss() * 3, us + gauss() * 3, false));
      let pk = null;
      if (i >= 3 && a === b) { pk = chance(.5 + (p.pos === 'GK' && starter ? .1 : 0)); }
      let g = 0;
      if (starter || chance(.5)) for (let k = 0; k < a; k++) if (chance(POS[p.pos].goal * 1.2)) g++;
      wcGoals += g;
      matches.push({ stage: stages[i], foe, a, b, pk, goals: g });
      if (i < 3) {
        pts += a > b ? 3 : a === b ? 1 : 0;
        if (i === 2) { if (pts < 4 && !(pts === 3 && chance(.5))) break; reached = 'ベスト16'; }
      } else {
        const win = a > b || (a === b && pk);
        if (!win) break;
        reached = ['ベスト8', 'ベスト4', '準優勝', '優勝'][i - 3];
        if (i === 6) reached = '優勝';
      }
      if (i === 6) break;
    }
    // 決勝で負けたら準優勝
    const last = matches.at(-1);
    if (last.stage === '決勝' && !(last.a > last.b || (last.a === last.b && last.pk))) reached = '準優勝';
    s.natGoals += wcGoals;
    s.wc.push({ year: s.year, reached, goals: wcGoals, starter });
    addLog(s, 'wc', `${s.year}年のワールドカップに${starter ? '主力として' : '控えとして'}出場し、日本は${reached}${reached === '優勝' ? 'に輝いた' : ''}。${wcGoals ? `大会${wcGoals}得点。` : ''}`);
    const ln = lastName(p.name);
    if (reached === '優勝') addPaper(s, 'wc', '日本 世界一!!', `${ln}${wcGoals ? `${wcGoals}発` : ''} 歴史を変えた`, `ワールドカップ決勝で日本が勝利し、初の世界一に。${p.name}は${wcGoals ? `大会${wcGoals}得点を挙げ` : 'チームを支え'}、歓喜の輪の中心にいた。`);
    else if (reached === 'グループリーグ敗退' && wcGoals >= 2) addPaper(s, 'wc', `${ln} W杯${wcGoals}発`, '日本は1次リーグで涙', `ワールドカップで日本はグループリーグ敗退。それでも${p.name}は${wcGoals}得点を挙げ、意地を見せた。`);
    else if (['ベスト8', 'ベスト4', '準優勝'].includes(reached) || wcGoals >= 2) addPaper(s, 'wc', `日本${reached}!!`, wcGoals ? `${ln} W杯${wcGoals}発` : `${ln} 世界と渡り合う`, `ワールドカップで日本は${reached}。${p.name}は${wcGoals ? `${wcGoals}得点を挙げる活躍` : '献身的なプレー'}を見せた。`);
    if (reached === '優勝') s.trophies.push(`${s.year} ワールドカップ優勝`);
    if (wcGoals >= 4) s.awards.push(`${s.year} ワールドカップ得点王`);
    p.fame = clamp(p.fame + { 'グループリーグ敗退': 0, 'ベスト16': 3, 'ベスト8': 6, 'ベスト4': 10, '準優勝': 14, '優勝': 25 }[reached] + wcGoals * 2, 0, 100);
    return { matches, reached, goals: wcGoals, starter };
  }

  // ===== オフシーズン：年齢・契約・移籍 =====
  function ageUp(s) {
    const p = s.p; p.age++; s.year++;
    p.cond = 0; p.fatigue = 0; p.injury = 0;
    // オフのキャンプ：若いうちはひと伸び
    const notes = [];
    if (p.age <= GROW[p.grow].peak) { const k = pick(mainStats(p.pos)); const d = ri(1, 3); p.stats[k] = Math.min(99, p.stats[k] + d); notes.push(`オフのキャンプで${STATS[k]}+${d}`); }
    else if (p.age - GROW[p.grow].peak >= 3) notes.push('体の衰えを感じるようになってきた…');
    const rn = rivalAge(s); if (rn) notes.push(rn);
    // 子どもが16歳になったら、親のクラブに入団（現役のうちだけ）
    if (s.childPro) {
      s.childPro.age++; s.childPro.ovr = Math.min(86, s.childPro.ovr + ri(2, 4));
      if (s.childPro.club === p.club) notes.push(`👨‍👧 ${s.childPro.name}（${s.childPro.age}歳）も成長中。総合力 ${s.childPro.ovr}`);
    } else {
      const k = p.kidsBorn[0];
      if (k && s.year - k.year >= 16) {
        const c = clubOf(s);
        s.childPro = { name: k.name, pos: chance(.6) ? p.pos : pick(['FW', 'MF', 'DF', 'GK']), age: s.year - k.year, club: c.id, ovr: 46 + ri(0, 6) + Math.round(p.fame / 20) };
        notes.push(`👨‍👧 ${k.name}（${s.childPro.age}歳）が${c.name}に入団！親子でチームメイトに`);
        addLog(s, 'family', `${s.year}年、子の${k.name}が${s.childPro.age}歳で${c.name}に入団し、親子でチームメイトとなった。`);
        addPaper(s, 'family', `${lastName(p.name)}親子 同じピッチへ`, `${k.name} ${s.childPro.age}歳でプロ入り`, `${p.name}の子・${k.name}が${c.name}に入団。親子が同じユニフォームを着るという夢が実現した。`);
      }
    }
    return notes;
  }

  // 契約更新・移籍のオファー。contract が null なら戦力外
  function offers(s) {
    const p = s.p, o = ovr(p), c = clubOf(s), last = s.history.at(-1);
    const res = { contract: null, transfers: [], released: false, expiring: p.contract <= 0 };
    if (p.contract <= 0) {
      const wanted = o >= c.str - 9 && (last.apps >= 4 || p.age <= 23) && p.age < 39;
      if (wanted) {
        const perf = last.rating >= 7 ? 1.15 : last.rating >= 6.4 ? 1 : .85;
        res.contract = { club: c.id, salary: Math.round(wageFor(c, o, p.fame) * perf / 10) * 10, years: p.age >= 32 ? 1 : ri(1, 3) };
      } else res.released = true;
    }
    // 移籍：自分の実力に近いクラブから
    const others = s.clubs.filter((x) => x.id !== c.id);
    const fits = others.filter((x) => {
      if (x.lg === 0) return o >= x.str - 12 && p.fame >= 25 && p.age <= 31 && (last.rating >= 6.7 || o >= x.str - 6);
      return o >= x.str - 8 && o <= x.str + 18;
    }).sort(() => rnd() - .5);
    const nOff = res.released ? ri(0, 2) : chance(.35 + (last.rating >= 7 ? .35 : 0)) ? ri(1, 3) : 0;
    // 欧州からの声がかかるなら優先
    fits.sort((a, b) => (b.lg === 0) - (a.lg === 0) || 0);
    for (const x of fits.slice(0, nOff)) {
      const sal = Math.round(wageFor(x, o, p.fame) * (.95 + rnd() * .3) / 10) * 10;
      res.transfers.push({ club: x.id, salary: sal, years: p.age >= 32 ? 1 : ri(2, 4) });
    }
    // 戦力外でどこからも声がかからない → 2部の弱いクラブがテスト入団を打診（35歳まで）
    if (res.released && !res.transfers.length && p.age <= 35) {
      const weak = s.clubs.filter((x) => x.lg === 2 && x.id !== c.id).sort((a, b) => a.str - b.str)[ri(0, 2)];
      if (o >= weak.str - 12) res.transfers.push({ club: weak.id, salary: 180, years: 1, trial: true });
    }
    return res;
  }

  function accept(s, offer) {
    const prev = s.p.club;
    joinClub(s, offer);
    if (prev !== offer.club) {
      const c = s.clubs[offer.club], pc = s.clubs[prev];
      s.news.push(`✈️ ${c.name} へ移籍`);
      if (c.lg === 0 && pc.lg !== 0) {
        addLog(s, 'europe', `${s.year}年、${pc.name}から欧州の${c.name}へ移籍。年俸は${offer.salary}万円と報じられた。`);
        addPaper(s, 'europe', `${lastName(s.p.name)} 欧州へ`, `${c.name}と${offer.years}年契約`, `${s.p.name}が${c.name}への移籍を決断。${s.p.age}歳、本場での挑戦が始まる。`);
      } else addLog(s, 'move', `${s.year}年、${pc.name}から${c.name}へ移籍${offer.trial ? '（テスト入団）' : ''}。`);
    }
  }

  const mustRetire = (s, off) => s.p.age >= 40 || (off.released && !off.transfers.length);
  const canRetire = (s) => s.p.age >= 30;

  // ===== 引退試合 =====
  // 最後の見せ場を3つから選び、画面のタイミングゲームで成否が決まる
  const LAST_SCENES = {
    FW: [['最後のPK', 'sht', 'PKを冷静に沈め、ラストゴールを決めた'], ['独走からの1対1', 'spd', 'GKをかわして無人のゴールへ流し込んだ'], ['ゴール前のヘディング', 'phy', 'ヘディングでネットを揺らした']],
    MF: [['直接フリーキック', 'sht', 'FKが美しい弧を描いてゴールに吸い込まれた'], ['ラストパス', 'pas', '最後のスルーパスで仲間のゴールを導いた'], ['ドリブル突破', 'drb', '3人を抜き去り、スタジアムを沸かせた']],
    DF: [['CKからのヘディング', 'phy', 'ヘディングで劇的なゴールを決めた'], ['ラストプレーのタックル', 'def', '完璧なスライディングで最後のピンチを防いだ'], ['ロングフィード', 'pas', 'ロングフィードで決勝点の起点となった']],
    GK: [['相手エースのPK', 'gk', 'PKを完璧に読み切って止めた'], ['ロスタイムの1対1', 'gk', '1対1を体で止め、チームを救った'], ['最後のゴールキック', 'pas', 'ゴールキックが風に乗ってそのままゴールイン、という伝説を残した']],
  };
  function lastMatchInfo(s) {
    const rv = s.rival;
    const vs = rv ? `ライバル${rv.name}率いる選抜チーム` : 'オールスター選抜';
    const scenes = LAST_SCENES[s.p.pos].map(([name, k, ok], i) => ({ i, name, stat: STATS[k], val: s.p.stats[k], zone: clamp(.1 + s.p.stats[k] / 99 * .2, .1, .3), ok }));
    return { vs, scenes };
  }
  function playLastMatch(s, idx, hit) {
    const info = lastMatchInfo(s), sc = info.scenes[idx];
    const text = hit ? sc.ok : 'ボールはわずかに外れたが、スタジアムの拍手は鳴りやまなかった';
    s.lastMatch = { scene: sc.name, hit, text, vs: info.vs };
    addLog(s, 'last', `引退試合は${info.vs}と対戦。${sc.name}の場面で、${text}。`);
    return s.lastMatch;
  }

  // ===== 引退 =====
  function careerScore(s) {
    const T = s.totals;
    const wcBest = Math.max(0, ...s.wc.map((w) => ({ 'グループリーグ敗退': 0, 'ベスト16': 40, 'ベスト8': 90, 'ベスト4': 160, '準優勝': 250, '優勝': 500 }[w.reached])));
    const csW = s.p.pos === 'GK' ? 14 : s.p.pos === 'DF' ? 11 : 4;
    const posW = s.p.pos === 'GK' || s.p.pos === 'DF' ? 4 : 2;
    return Math.round(T.goals * 10 + T.assists * 8 + T.cs * csW + T.apps * posW + s.caps * 6 + s.natGoals * 15 +
      s.awards.length * 40 + s.trophies.length * 60 + s.history.filter((h) => h.lg === '欧州').length * 30 + wcBest +
      s.awards.filter((a) => a.includes('世界年間')).length * 300 + (s.lastMatch?.hit ? 50 : 0) + (s.family?.combo || 0) * 40);
  }
  const familyTitle = (gen) => gen >= 7 ? 'サッカー王朝' : gen >= 5 ? 'サッカー名門' : gen >= 3 ? 'サッカー一家' : '';

  function legendTitle(s) {
    const T = s.totals, h = s.history; const pos = s.p.pos;
    const has = (w) => s.awards.concat(s.trophies).some((a) => a.includes(w));
    const eu = h.filter((x) => x.lg === '欧州').length;
    if (has('ワールドカップ優勝')) return { t: 'ワールドカップの英雄', d: '国中が、あの夏を忘れない。' };
    if (has('世界年間最優秀選手')) return { t: '世界の頂点', d: '世界でいちばんうまい選手と呼ばれた。' };
    if (s.family?.combo >= 1) return { t: '親子鷹', d: '親と子、2代で同じピッチを駆けた。' };
    if (pos === 'FW' && T.goals >= 200) return { t: '伝説のストライカー', d: 'ゴールの数だけ、歓声があった。' };
    if (T.assists >= 120) return { t: '魔法の司令塔', d: 'そのパスは、未来が見えていた。' };
    if (eu >= 6 && h.some((x) => x.lg === '欧州' && x.awards.length)) return { t: '欧州を制した日本人', d: '海を渡り、本場の頂点に立った。' };
    if (s.trophies.filter((x) => x.includes('優勝')).length >= 3) return { t: '常勝の象徴', d: 'その選手がいるチームは、いつも勝った。' };
    if (pos === 'GK' && T.cs >= 110) return { t: '絶対的守護神', d: 'ゴールマウスに鍵をかけた。' };
    if (pos === 'DF' && T.cs >= 100) return { t: '鉄壁の番人', d: '誰もその壁を越えられなかった。' };
    if (s.caps >= 70) return { t: '代表の顔', d: '日の丸を背負い続けた。' };
    if (T.apps >= 420) return { t: '鉄人', d: 'ケガに負けず、ピッチに立ち続けた。' };
    if (eu >= 6) return { t: '欧州の戦士', d: '海を渡り、本場で長く戦い抜いた。' };
    if (eu >= 1) return { t: '海外組', d: '一度は世界の舞台に立った。' };
    if (h.some((x) => x.awards.length >= 2) && h.length <= 8) return { t: '一瞬の閃光', d: '短くても、確かに輝いた季節があった。' };
    if (T.apps < 60) return { t: 'ベンチの番人', d: '出番は少なかった。でも誰よりも声を出した。' };
    if (h.every((x) => x.lg === '2部')) return { t: '2部の星', d: '地元の人たちに愛された。' };
    return { t: 'いぶし銀', d: '派手さはなくても、監督に信頼され続けた。' };
  }

  function rankLetter(score) {
    return score >= 6500 ? 'SS' : score >= 4800 ? 'S' : score >= 3800 ? 'A' : score >= 2800 ? 'B' : score >= 1800 ? 'C' : 'D';
  }

  function retire(s) {
    s.phase = 'retired';
    const T = s.totals;
    const score = careerScore(s);
    const lt = legendTitle(s);
    const earned = s.history.reduce((a, h) => a + h.salary, 0);
    const sum = {
      name: s.p.name, pos: s.p.pos, gen: s.gen, years: s.history.length, retireAge: s.p.age, startYear: s.history[0]?.year, endYear: s.history.at(-1)?.year,
      apps: T.apps, goals: T.goals, assists: T.assists, cs: T.cs, avg: T.apps ? Math.round(T.rating / T.apps * 100) / 100 : 0,
      caps: s.caps, natGoals: s.natGoals, wc: s.wc.slice(), trophies: s.trophies.slice(), awards: s.awards.slice(),
      clubs: [...new Set(s.history.map((h) => h.club))], earned, money: s.p.money, title: lt.t, titleDesc: lt.d, score, letter: rankLetter(score), kids: s.p.kids,
      mode: s.mode, lastMatch: s.lastMatch || null, family: { ...s.family }, child: s.childPro ? { name: s.childPro.name, age: s.childPro.age, club: s.clubs[s.childPro.club].name, pos: s.childPro.pos } : null,
      kidNames: s.p.kidsBorn.map((k) => k.name), parent: s.parent,
      rival: s.rival ? { name: s.rival.name, apps: s.rival.totals.apps, goals: s.rival.totals.goals, awards: s.rival.awards.length, h2h: { ...s.rival.h2h }, retired: s.rival.retired } : null,
    };
    s.summary = sum;
    const ln = lastName(sum.name);
    const big = sum.pos === 'GK' || sum.pos === 'DF' ? `${sum.apps}試合 無失点${sum.cs}` : `${sum.apps}試合${sum.goals}得点`;
    addPaper(s, 'retire', `${ln} 引退`, `${big} ${sum.retireAge}歳の決断`, `${sum.name}が${sum.retireAge}歳で現役引退を発表。「${lt.t}」と呼ばれた${sum.years}年間のプロ生活に幕を下ろした。`);
    return sum;
  }

  // 次の世代：親の実績が大きいほど才能を受け継ぐ
  // 親が現役のうちにプロ入りした子は、その年齢・そのクラブから続きを始める
  function nextGeneration(s, name, pos) {
    const sum = s.summary || retire(s);
    const bonus = inheritBonus(sum);
    const lineage = s.lineage.concat([{ gen: s.gen, name: sum.name, pos: sum.pos, title: sum.title, score: sum.score, letter: sum.letter, goals: sum.goals, assists: sum.assists, cs: sum.cs, apps: sum.apps, caps: sum.caps,
      years: `${sum.startYear}-${sum.endYear}`, clubs: sum.clubs, combo: sum.family.combo, jointApps: sum.family.jointApps, wc: sum.wc.some((w) => w.reached === '優勝'), child: name }]);
    const opt = { gen: s.gen + 1, lineage, bonus, clubs: s.clubs, mode: s.mode, parent: { name: sum.name, title: sum.title, combo: sum.family.combo, jointApps: sum.family.jointApps } };
    const kid = s.p.kidsBorn[0];
    if (s.childPro) Object.assign(opt, { year: s.year, age: Math.min(s.childPro.age, 30), homeClub: s.childPro.club });
    else if (kid) opt.year = Math.max(s.year, kid.year + 18);
    else opt.year = s.year + ri(6, 12);
    const ns = newGame(name, pos, opt);
    ns.inherit = bonus;
    return ns;
  }

  function inheritBonus(sum) { return clamp(Math.round(sum.score / 1300), 0, 6) + (sum.kids ? 1 : 0); }

  // ===== おまかせ（60秒モード） =====
  const POLICY = {
    challenge: { name: '挑戦派', desc: '強いクラブ・海外へ。出番が少なくても上を目指す' },
    stable: { name: '安定派', desc: '試合に出られるクラブで、長くコツコツ' },
    money: { name: 'お金派', desc: 'いちばん高い年俸を出すクラブへ' },
  };
  function autoTrain(s) {
    if (s.p.injury || s.p.fatigue > 60) return 'rest';
    const m = s.p.pos === 'GK' ? ['gk', 'gk', 'phy', 'pas'] : mainStats(s.p.pos);
    return m[s.week % m.length];
  }
  function pickOffer(s, opts, policy) {
    const sc = (o) => {
      const c = s.clubs[o.club], st = startChance(s.p, c);
      if (policy === 'challenge') return (st >= .35 ? 100 : 0) + c.str + st * 10;
      if (policy === 'money') return (st >= .15 ? 100000 : 0) + o.salary;
      return st * 100 + o.salary / 2000 + (o.keep ? 3 : 0);
    };
    return opts.slice().sort((a, b) => sc(b) - sc(a))[0] || null;
  }
  function autoDraft(s, policy) {
    s.draft.forEach((o) => { o.keep = !!o.home; });
    joinClub(s, pickOffer(s, s.draft, policy)); delete s.draft;
    startSeason(s);
  }
  // 1年分を一気に進める。引退するなら retire: true を返す（引退試合と retire は呼び出し側）
  function autoYear(s, policy) {
    const out = { year: s.year, age: s.p.age, club: clubOf(s).name, events: [] };
    while (s.phase === 'season') {
      s.training = autoTrain(s);
      const w = playWeek(s);
      if (w.event) {
        const e = eventById(w.event);
        const ci = e.choices ? (e.id === 'cm' && policy === 'money' ? 0 : e.id === 'date' || e.id === 'marry' ? 0 : chance(.6) ? 0 : 1) : 0;
        out.events.push(resolveEvent(s, w.event, ci));
      }
    }
    out.review = endSeason(s); out.nat = nationalYear(s); out.notes = ageUp(s);
    const off = offers(s), c = clubOf(s);
    const tired = s.p.age >= 38 || (s.p.age >= 34 && startChance(s.p, c) < .25 && policy !== 'money');
    if (mustRetire(s, off) || (canRetire(s) && tired)) { out.retire = true; return out; }
    const opts = off.transfers.slice();
    if (off.contract) opts.push({ ...off.contract, keep: true });
    if (!off.expiring && !off.released) opts.push({ club: c.id, salary: s.p.salary, years: s.p.contract, keep: true, stayOnly: true });
    const best = pickOffer(s, opts, policy);
    if (!best) { out.retire = true; return out; }
    if (!best.stayOnly) accept(s, best);
    startSeason(s);
    return out;
  }
  function autoLastMatch(s) {
    const info = lastMatchInfo(s);
    const sc = info.scenes.slice().sort((a, b) => b.val - a.val)[0];
    return playLastMatch(s, sc.i, chance(sc.zone * 2.4));
  }

  function surname(n) { const m = String(n).split(/[\s　]+/); return m.length > 1 ? m[0] : ''; }
  function childName(n) { const l = surname(n); return (l ? l + ' ' : '') + pick(FIRST); }

  return {
    setRng, STATS, POS, GROW, TRAINING, LEAGUES, SEASON_WEEKS, START_YEAR, isWorldCupYear,
    mainStats, ovr, startChance, newGame, joinClub, startSeason, standings, rankOf, playWeek, eventById, resolveEvent,
    endSeason, nationalYear, ageUp, offers, accept, mustRetire, canRetire, retire, careerScore, nextGeneration, childName, clubOf, avg,
    migrate, inheritBonus, lastMatchInfo, playLastMatch, familyTitle, POLICY, autoDraft, autoYear, autoLastMatch, lastName,
    // オンライン版のサーバーが同じルールで試合を回すための部品
    _: { train, decay, newWorld, lambda, poisson, gauss, ri, chance, pick, clamp, sig, roundRobin, wageFor, rookieOffers, newPlayer, assignNumber, goalHow, assistHow, CLUB_SEED, rankLetter, legendTitle },
  };
})();

if (typeof module !== 'undefined') module.exports = SL;
