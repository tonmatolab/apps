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
    GK: { name: 'ゴールキーパー', w: { gk: .7, phy: .15, pas: .1, def: .05 }, goal: .0006, assist: .01, desc: '最後の砦。ビッグセーブで勝利を呼ぶ' },
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
  const START_MONEY = 500; // 選手を作った瞬間に振り込まれるお金（万円）
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
    const pot = clamp(ri(66, 86) + bonus, 60, 99);
    return {
      name, pos, age, stats, exp: {},
      pot, ...potRange(pot), grow: gr, growKnown: false,
      cond: 0, fatigue: 0, injury: 0, fame: 5 + bonus, money: START_MONEY, // プロ契約の支度金
      club: null, salary: 0, contract: 0, number: 30,
      married: false, dating: false, kids: 0, kidsBorn: [],
    };
  }

  // ----- 才能の見立て：本当の才能（pot）を含む幅だけ見せ、年や診断で少しずつ狭まる -----
  function potRange(pot) {
    let lo = pot - ri(0, 12), hi = lo + 12;
    if (hi > 99) { lo -= hi - 99; hi = 99; }
    return { potLo: clamp(lo, 30, pot), potHi: clamp(hi, pot, 99) };
  }
  function narrowPot(p, step) {
    if (p.potLo == null) Object.assign(p, potRange(p.pot));
    p.potLo = Math.min(p.pot, p.potLo + ri(0, step));
    p.potHi = Math.max(p.pot, p.potHi - ri(0, step));
    return p.potLo === p.potHi;
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
    if (s.p.potLo == null) Object.assign(s.p, potRange(s.p.pot));
    s.records = s.records || newRecords();
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

  // ----- 縛りプレイ（最初に1つ選ぶ。達成すると称号） -----
  const CHALLENGES = {
    loyal: { name: '一筋', icon: '🤝', desc: '移籍できない（残留か引退だけ）', goal: '15シーズン以上プレーし、生涯ランクA以上' },
    domestic: { name: '国内一筋', icon: '🗾', desc: '海外のクラブには移籍できない', goal: '生涯ランクS以上' },
    weak: { name: '最弱クラブ再建', icon: '🏚️', desc: '一番弱いクラブに入団。そのクラブで1部優勝するまで移籍できない', goal: 'そのクラブで1部優勝' },
    lowpot: { name: '凡才', icon: '🥔', desc: '才能が低い（上限70）', goal: '生涯ランクA以上' },
    norest: { name: '休養禁止', icon: '🔥', desc: '練習で「休養」を選べない', goal: '通算300試合出場' },
    keeper: { name: 'GKの道', icon: '🧤', desc: 'ポジションはゴールキーパー固定', goal: '日本代表80試合' },
  };
  function challengeCleared(s, score) {
    switch (s.challenge) {
      case 'loyal': return s.history.length >= 15 && score >= 3800;
      case 'domestic': return score >= 4800;
      case 'weak': return !!s.challengeDone;
      case 'lowpot': return score >= 3800;
      case 'norest': return s.totals.apps >= 300;
      case 'keeper': return s.caps >= 80;
      default: return false;
    }
  }

  function newGame(name, pos, opt = {}) {
    if (opt.challenge === 'keeper') pos = 'GK';
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
    s.records = newRecords();
    if (opt.challenge && CHALLENGES[opt.challenge]) {
      s.challenge = opt.challenge;
      if (s.challenge === 'lowpot') { s.p.pot = Math.min(s.p.pot, 70); Object.assign(s.p, potRange(s.p.pot)); }
    }
    s.rival = newRival(s);
    s.draft = rookieOffers(s);
    if (s.challenge === 'weak') {
      const c = s.clubs.slice().sort((a, b) => a.str - b.str)[0];
      s.draft = [{ club: c.id, salary: wageFor(c, ovr(s.p), s.p.fame), years: 3, rookie: true }];
      s.challengeClub = c.id;
    }
    // 親と同じチームで育った子は、そのクラブからの昇格オファーが一番上に来る
    if (opt.homeClub != null && s.challenge !== 'weak') {
      const c = s.clubs[opt.homeClub];
      s.draft = [{ club: c.id, salary: wageFor(c, ovr(s.p), s.p.fame), years: 3, rookie: true, home: true }].concat(s.draft.filter((o) => o.club !== c.id).slice(0, 2));
    }
    return s;
  }

  function newRecords() { return { goalStreak: 0, bestGoalStreak: 0, playStreak: 0, bestPlayStreak: 0, csStreak: 0, bestCsStreak: 0, maxGoalsGame: 0 }; }
  // 1試合ごとに通算の節目と連続記録を見る（リーグ戦だけ）
  function trackRecords(s, m, oppName) {
    const R = s.records || (s.records = newRecords()), p = s.p, ln = lastName(p.name);
    if (m.mins > 0) {
      R.playStreak++;
      R.goalStreak = m.goals ? R.goalStreak + 1 : 0;
      if (p.pos === 'GK' || p.pos === 'DF') R.csStreak = m.role === 'start' ? (m.cs ? R.csStreak + 1 : 0) : R.csStreak;
      R.maxGoalsGame = Math.max(R.maxGoalsGame, m.goals);
    } else R.playStreak = 0;
    const crossed = (prev, now, marks) => marks.filter((t) => prev < t && now >= t);
    for (const t of crossed(R.bestGoalStreak, R.goalStreak, [5, 8, 10])) {
      addLog(s, 'streak', `${s.year}年、${t}試合連続ゴールを記録。`);
      addPaper(s, 'streak', `${ln} ${t}戦連発`, '止まらないゴール量産', `${p.name}が${oppName}戦でもゴールを決め、${t}試合連続得点となった。`);
    }
    for (const t of crossed(R.bestCsStreak, R.csStreak, [5, 8])) addLog(s, 'streak', `${s.year}年、${t}試合連続無失点を記録。`);
    for (const t of crossed(R.bestPlayStreak, R.playStreak, [100])) addLog(s, 'streak', `${s.year}年、${t}試合連続出場を達成。`);
    R.bestGoalStreak = Math.max(R.bestGoalStreak, R.goalStreak);
    R.bestCsStreak = Math.max(R.bestCsStreak, R.csStreak);
    R.bestPlayStreak = Math.max(R.bestPlayStreak, R.playStreak);
    // 通算の節目
    const tg = s.totals.goals + s.season.goals, ta = s.totals.apps + s.season.apps, tas = s.totals.assists + s.season.assists;
    for (const t of crossed(tg - m.goals, tg, [50, 100, 150, 200, 250, 300])) {
      addLog(s, 'milestone', `${s.year}年、${oppName}戦で通算${t}得点に到達。`);
      if (t % 100 === 0) addPaper(s, 'milestone', `${ln} 通算${t}点`, `${p.age}歳で大台到達`, `${p.name}が${oppName}戦でゴールを決め、プロ通算${t}得点を達成した。`);
    }
    if (m.mins > 0) for (const t of crossed(ta - 1, ta, [100, 200, 300, 400, 500])) {
      addLog(s, 'milestone', `${s.year}年、通算${t}試合出場を達成。`);
      if (t >= 300) addPaper(s, 'milestone', `${ln} ${t}試合`, '積み重ねた出場の数', `${p.name}がプロ通算${t}試合出場を達成。${p.age}歳、まだまだ走り続ける。`);
    }
    for (const t of crossed(tas - m.assists, tas, [50, 100, 150])) addLog(s, 'milestone', `${s.year}年、通算${t}アシストに到達。`);
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

  // ===== お金の使い道（単位：万円） =====
  const SHOP = {
    trainer: { name: '専属トレーナー', icon: '🏋️', price: 300, desc: '今シーズンの練習の伸びが1.2倍', season: true },
    clinic: { name: '最新の治療', icon: '🏥', price: 200, desc: '今シーズンはケガが2倍の早さで治る', season: true },
    scout: { name: '才能の診断', icon: '🔬', price: 150, desc: '才能の見立ての幅が狭まる' },
    camp: { name: '海外キャンプ', icon: '✈️', price: 800, desc: '次のオフのキャンプで、得意な能力がさらに+2' },
    house: { name: '家を買う', icon: '🏠', price: 3000, desc: 'ずっと調子が下がりにくくなる' },
    edu: { name: '子どもの教育費', icon: '📚', price: 1500, desc: '次の世代の才能ボーナス+1（2回まで）' },
    donate: { name: '地元クラブへ寄付', icon: '🎁', price: 500, desc: '人気+3。何度でもできる' },
  };
  function shopList(s) {
    const p = s.p, inSeason = s.phase === 'season';
    const why = (id) => {
      const it = SHOP[id];
      if (p.money < it.price) return 'お金が足りない';
      if (it.season && !inSeason) return 'シーズン中だけ';
      if (id === 'trainer' && p.trainMul > 1) return '今シーズンは契約済み';
      if (id === 'clinic' && p.clinic) return '今シーズンは契約済み';
      if (id === 'scout' && p.potLo === p.potHi) return 'もう見抜いている';
      if (id === 'scout' && p.scoutY === s.year) return '今年はもう診断した';
      if (id === 'camp' && p.camp) return '予約済み';
      if (id === 'house' && p.house) return '購入済み';
      if (id === 'edu' && !p.kids) return '子どもがいない';
      if (id === 'edu' && (p.edu || 0) >= 2) return 'これ以上は効果なし';
      return null;
    };
    return Object.entries(SHOP).map(([id, it]) => ({ id, ...it, ng: why(id) }));
  }
  function buy(s, id) {
    const p = s.p, it = SHOP[id];
    if (!it) return { error: 'bad_item' };
    const ng = shopList(s).find((x) => x.id === id).ng;
    if (ng) return { error: ng };
    p.money -= it.price;
    let t = '';
    if (id === 'trainer') { p.trainMul = 1.2; t = '専属トレーナーと契約した。今シーズンは練習の伸びが1.2倍！'; }
    if (id === 'clinic') { p.clinic = true; p.injury = Math.max(0, p.injury - 1); t = '最新の治療を受けられるようになった'; }
    if (id === 'scout') { p.scoutY = s.year; const done = narrowPot(p, 4); t = done ? `才能を完全に見抜いた！あなたの才能は${p.pot}` : `才能の見立てが${p.potLo}〜${p.potHi}に絞れた`; }
    if (id === 'camp') { p.camp = true; t = '次のオフは海外キャンプに行く'; }
    if (id === 'house') { p.house = true; addLog(s, 'house', `${s.year}年、${p.age}歳でマイホームを購入。`); t = '家を買った！生活が落ち着いて調子が下がりにくくなる'; }
    if (id === 'edu') { p.edu = (p.edu || 0) + 1; t = `子どもの教育にお金をかけた（${p.edu}/2）`; }
    if (id === 'donate') {
      p.donated = (p.donated || 0) + 1; p.fame = clamp(p.fame + 3, 0, 100);
      if (p.donated === 1) addLog(s, 'donate', `${s.year}年、地元のクラブに寄付。以後も寄付を続け、地元で愛された。`);
      t = '寄付した。人気+3';
    }
    return { ok: true, text: t };
  }
  // 1週ごとのケガの回復（最新の治療なら2倍）
  function healWeek(p) { p.injury = Math.max(0, p.injury - (p.clinic ? 2 : 1)); }
  // 調子が下がるとき、家があれば半分は踏みとどまる
  function condDown(p, n = 1) { if (p.house && chance(.5)) return; p.cond = clamp(p.cond - n, -2, 2); }

  // ===== カジノ：ルーレット（ヨーロッパ式 0〜36。ゲーム内のお金だけを賭ける） =====
  const RL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  const RL_RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const rlColor = (n) => n === 0 ? 'green' : RL_RED.has(n) ? 'red' : 'black';
  // 賭け方：k は 'red' 'black' 'even' 'odd' 'low' 'high' 'd1' 'd2' 'd3' 'n0'〜'n36'。pay は当たったときに戻る倍率（賭け金込み）
  const RL_BETS = {
    red: { name: '赤', pay: 2, win: (n) => RL_RED.has(n) },
    black: { name: '黒', pay: 2, win: (n) => n > 0 && !RL_RED.has(n) },
    even: { name: '偶数', pay: 2, win: (n) => n > 0 && n % 2 === 0 },
    odd: { name: '奇数', pay: 2, win: (n) => n % 2 === 1 },
    low: { name: '1-18', pay: 2, win: (n) => n >= 1 && n <= 18 },
    high: { name: '19-36', pay: 2, win: (n) => n >= 19 },
    d1: { name: '1st 12', pay: 3, win: (n) => n >= 1 && n <= 12 },
    d2: { name: '2nd 12', pay: 3, win: (n) => n >= 13 && n <= 24 },
    d3: { name: '3rd 12', pay: 3, win: (n) => n >= 25 },
  };
  const ROULETTE = { minBet: 10, maxTotal: 10000, maxBets: 12, order: RL_ORDER };
  function rlBetInfo(k) {
    if (RL_BETS[k]) return RL_BETS[k];
    const m = /^n([0-9]{1,2})$/.exec(k);
    if (m && +m[1] <= 36) { const v = +m[1]; return { name: String(v), pay: 36, win: (n) => n === v }; }
    return null;
  }
  // 賭けを確かめる。おかしければエラー文を返す
  function rlCheck(p, bets) {
    if (!Array.isArray(bets) || !bets.length) return '賭けてください';
    if (bets.length > ROULETTE.maxBets) return `賭けは${ROULETTE.maxBets}か所まで`;
    let total = 0;
    for (const b of bets) {
      const a = Number(b && b.a);
      if (!rlBetInfo(b && b.k) || !Number.isInteger(a) || a < ROULETTE.minBet || a % 10) return '賭け方がおかしい';
      total += a;
    }
    if (total > ROULETTE.maxTotal) return "1回に賭けられるのは1億円まで";
    if (total > p.money) return 'お金が足りない';
    return null;
  }
  function spinRoulette(p, bets) {
    const e = rlCheck(p, bets);
    if (e) return { error: e };
    return resolveRoulette(p, bets, ri(0, 36));
  }
  // 出目 num で賭けを精算する（オンラインの共通の台は、全員に同じ num を使う）
  function resolveRoulette(p, bets, num) {
    let total = 0, back = 0;
    const results = bets.map((b) => {
      const info = rlBetInfo(b.k), a = Number(b.a), win = info.win(num), payout = win ? a * info.pay : 0;
      total += a; back += payout;
      return { k: b.k, name: info.name, a, win, payout };
    });
    p.money += back - total;
    const C = p.casino || (p.casino = { spins: 0, bet: 0, back: 0, best: 0 });
    C.spins++; C.bet += total; C.back += back; C.best = Math.max(C.best, back - total);
    return { num, color: rlColor(num), results, total, back, net: back - total, money: p.money };
  }

  // ===== カップ戦（1部10クラブ＋2部の上位6クラブの勝ち抜き戦。第4・8・12・16節に開催） =====
  const CUP_WEEKS = { 4: '1回戦', 8: '準々決勝', 12: '準決勝', 16: '決勝' };
  function newCup(clubs) {
    const l1 = clubs.filter((c) => c.lg === 1), l2 = clubs.filter((c) => c.lg === 2).sort((a, b) => b.str - a.str).slice(0, 6);
    const alive = l1.concat(l2).map((c) => c.id).sort(() => rnd() - .5);
    return { alive, results: [], winner: null };
  }
  function cupPair(cup) { const out = []; for (let i = 0; i < cup.alive.length; i += 2) out.push([cup.alive[i], cup.alive[i + 1]]); return out; }
  function cupFinish(cup, round, res) {
    cup.results.push({ round, res });
    cup.alive = res.map((r) => r.win);
    if (cup.alive.length === 1) cup.winner = cup.alive[0];
  }
  function playCupRound(s, out) {
    const cup = s.cup, round = CUP_WEEKS[s.week + 1];
    if (!cup || !round || cup.winner != null) return;
    const res = [];
    for (const [h, a] of cupPair(cup)) {
      let gh, ga, mine = null;
      if (h === s.p.club || a === s.p.club) { mine = playMatch(s, h, a, true); gh = mine.gh; ga = mine.ga; }
      else {
        const ch = s.clubs[h], ca = s.clubs[a];
        gh = poisson(lambda(ch.str + gauss() * 3, ca.str + gauss() * 3, true)); ga = poisson(lambda(ca.str + gauss() * 3, ch.str + gauss() * 3, false));
      }
      const gk = mine && s.p.pos === 'GK' && mine.role === 'start' ? (h === s.p.club ? .1 : -.1) : 0;
      const win = gh > ga ? h : ga > gh ? a : (chance(.5 + gk) ? h : a);
      res.push({ h, a, gh, ga, pk: gh === ga, win });
      if (mine) out.cup = { round, m: mine, win: win === s.p.club, pk: gh === ga, final: round === '決勝' };
    }
    cupFinish(cup, round, res);
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
    s.season = { ...emptyTotals(), ratings: [], year: s.year, club: s.p.club, lg: clubOf(s).lg, age: s.p.age, best: null, cup: { apps: 0, goals: 0, assists: 0 } };
    s.news = [];
    s.cup = newCup(s.clubs);
    s.p.trainMul = 1; s.p.clinic = false;
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
    if (s.challenge === 'norest' && s.training === 'rest') s.training = p.pos === 'GK' ? 'gk' : mainStats(p.pos)[0];
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
    playCupRound(s, out);
    if (out.cup && out.cup.m.notes) { out.notes.push(...out.cup.m.notes); out.injured = out.cup.m.injured || out.injured; }
    if (out.cup && out.cup.m.mins > 0) for (const k of mainStats(p.pos)) train(p, k, .14 * out.cup.m.mins / 90);

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
    if (p.injury > 0 && injured) healWeek(p);
    if (out.match.rating) {
      if (out.match.rating >= 7.5 && chance(.6)) p.cond = clamp(p.cond + 1, -2, 2);
      if (out.match.rating < 5.5 && chance(.5)) condDown(p);
    }
    if (chance(.18)) { if (chance(.5)) p.cond = clamp(p.cond + 1, -2, 2); else condDown(p); }

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
    p.exp[k] = (p.exp[k] || 0) + amt * (p.trainMul || 1) * head * ageF * condF * fatF * (.7 + rnd() * .6);
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

  function playMatch(s, h, a, cup = false) {
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
    if (cup) {
      m.cupMatch = true;
      const C = S.cup || (S.cup = { apps: 0, goals: 0, assists: 0 });
      if (m.mins > 0) { C.apps++; C.goals += m.goals; C.assists += m.assists; p.fame = clamp(p.fame + m.goals * .5 + m.assists * .2, 0, 100); }
      return m;
    }
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
    trackRecords(s, m, co.name);
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
    { id: 'scouteye', w: 2, if: (s) => s.p.potLo != null && s.p.potLo < s.p.potHi, text: 'ベテランのスカウトが練習を見に来て、じっとあなたを見ていた',
      fx: (s) => (narrowPot(s.p, 2) ? `「君の才能は${s.p.pot}だね」完全に見抜かれた！` : `才能の見立てが${s.p.potLo}〜${s.p.potHi}に絞れた`) },
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
    if (s.cup && s.cup.winner === c.id && S.cup && S.cup.apps > 0) {
      awards.push(c.lg === 2 && !promoted ? 'カップ優勝（2部から）' : 'カップ優勝');
    }
    if (s.challenge === 'weak' && !s.challengeDone && c.id === s.challengeClub && c.lg === 1 && rank === 1) {
      s.challengeDone = s.year;
      addLog(s, 'challenge', `${s.year}年、最弱と呼ばれた${c.name}を1部優勝に導いた。`);
      addPaper(s, 'title', `${c.city} 奇跡のV`, '最弱クラブが頂点へ', `かつてリーグ最弱だった${c.name}が1部優勝。${p.name}は入団から${s.history.length + 1}年目で悲願を果たした。`);
    }
    // クラブ力の変動（2部→1部の昇格組は補強で少し強くなる）
    for (const x of s.clubs) {
      const base = CLUB_SEED[x.id][3];
      x.str = clamp(Math.round(x.str + (base - x.str) * .3 + gauss() * 1.5 + (p2.includes(x) ? 3 : 0) - (r1.includes(x) ? 2 : 0)), 44, 90);
    }

    const real = awards.filter(Boolean);
    if (real.some((a) => a.startsWith('カップ優勝'))) addPaper(s, 'cup', `${c.city} カップ制覇`, real.includes('カップ優勝（2部から）') ? '2部から大番狂わせ' : '一発勝負を勝ち抜く', `${c.name}がカップ戦を制した。${p.name}も${S.cup.apps}試合に出場し${S.cup.goals ? `${S.cup.goals}得点` : '優勝に貢献'}。`);
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
    if (p.camp) { const k = pick(mainStats(p.pos)); p.stats[k] = Math.min(99, p.stats[k] + 2); p.camp = false; notes.push(`✈️ 海外キャンプで${STATS[k]}+2`); }
    const was = p.potLo === p.potHi;
    if (chance(.5) && narrowPot(p, 1) && !was) { addLog(s, 'pot', `${s.year}年、自分の才能の限界（${p.pot}）を知った。`); notes.push(`🔬 才能を見抜いた！あなたの才能は${p.pot}`); }
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
    // 縛りプレイ：移籍の制限
    if (s.challenge === 'loyal' || (s.challenge === 'weak' && !s.challengeDone)) res.transfers = [];
    if (s.challenge === 'domestic') res.transfers = res.transfers.filter((t) => s.clubs[t.club].lg !== 0);
    // 戦力外でどこからも声がかからない → 2部の弱いクラブがテスト入団を打診（35歳まで）
    if (res.released && !res.transfers.length && p.age <= 35 && s.challenge !== 'loyal') {
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
    sum.challenge = s.challenge ? { id: s.challenge, name: CHALLENGES[s.challenge].name, cleared: challengeCleared(s, score) } : null;
    sum.clubIds = [...new Set(s.history.map((h) => h.clubId))];
    sum.records = { ...(s.records || newRecords()) };
    sum.edu = s.p.edu || 0;
    sum.eu = s.history.filter((h) => h.lg === '欧州').length;
    sum.cupWins = s.trophies.filter((t) => t.includes('カップ優勝')).length;
    sum.worldBest = s.awards.filter((t) => t.includes('世界年間')).length;
    sum.pot = s.p.pot;
    sum.titles = earnedTitles(s, sum);
    s.summary = sum;
    const ln = lastName(sum.name);
    const big = sum.pos === 'GK' || sum.pos === 'DF' ? `${sum.apps}試合 無失点${sum.cs}` : `${sum.apps}試合${sum.goals}得点`;
    addPaper(s, 'retire', `${ln} 引退`, `${big} ${sum.retireAge}歳の決断`, `${sum.name}が${sum.retireAge}歳で現役引退を発表。「${lt.t}」と呼ばれた${sum.years}年間のプロ生活に幕を下ろした。`);
    return sum;
  }

  // 次の世代：親の実績が大きいほど才能を受け継ぐ
  // 親が現役のうちにプロ入りした子は、その年齢・そのクラブから続きを始める
  function nextGeneration(s, name, pos, extra = {}) {
    const sum = s.summary || retire(s);
    const bonus = inheritBonus(sum);
    const lineage = s.lineage.concat([{ gen: s.gen, name: sum.name, pos: sum.pos, title: sum.title, score: sum.score, letter: sum.letter, goals: sum.goals, assists: sum.assists, cs: sum.cs, apps: sum.apps, caps: sum.caps,
      years: `${sum.startYear}-${sum.endYear}`, clubs: sum.clubs, combo: sum.family.combo, jointApps: sum.family.jointApps, wc: sum.wc.some((w) => w.reached === '優勝'), child: name }]);
    const opt = { gen: s.gen + 1, lineage, bonus, clubs: s.clubs, mode: s.mode, parent: { name: sum.name, title: sum.title, combo: sum.family.combo, jointApps: sum.family.jointApps } };
    const kid = s.p.kidsBorn[0];
    if (s.childPro) Object.assign(opt, { year: s.year, age: Math.min(s.childPro.age, 30), homeClub: s.childPro.club });
    else if (kid) opt.year = Math.max(s.year, kid.year + 18);
    else opt.year = s.year + ri(6, 12);
    const ns = newGame(name, pos, Object.assign(opt, extra));
    ns.inherit = bonus;
    return ns;
  }

  function inheritBonus(sum) { return clamp(Math.round(sum.score / 1300), 0, 6) + (sum.kids ? 1 : 0) + Math.min(2, sum.edu || 0); }

  // ===== 称号図鑑（1回の人生で条件を満たしたものすべてが手に入る） =====
  // [id, 称号, ひとこと, 取り方のヒント, 条件]
  const WC_ORDER = ['グループリーグ敗退', 'ベスト16', 'ベスト8', 'ベスト4', '準優勝', '優勝'];
  function titleContext(s, sum) {
    const aw = s.awards.concat(s.trophies), h = s.history, T = s.totals;
    const cnt = (w) => aw.filter((a) => a.includes(w)).length;
    let stay = 0, best = 0, prev = null;
    for (const r of h) { stay = r.clubId === prev ? stay + 1 : 1; prev = r.clubId; best = Math.max(best, stay); }
    const rv = s.rival;
    return {
      pos: s.p.pos, T, seasons: h.length, age: s.p.age, caps: s.caps, natGoals: s.natGoals,
      wc: s.wc.length, wcBest: Math.max(-1, ...s.wc.map((w) => WC_ORDER.indexOf(w.reached))), wcGoals: s.wc.reduce((a, w) => a + w.goals, 0),
      lgTitle: cnt('リーグ優勝'), scorer: aw.filter((a) => a.includes('得点王') && !a.includes('ワールドカップ')).length, wcScorer: cnt('ワールドカップ得点王'),
      assistK: cnt('アシスト王'), mvp: cnt('MVP'), b11: cnt('ベストイレブン'), rookie: cnt('新人王'), world: cnt('世界年間'), promo: cnt('昇格'), euTitle: cnt('欧州リーグ優勝'),
      cup: cnt('カップ優勝'), cupL2: cnt('カップ優勝（2部から）'),
      eu: h.filter((x) => x.lg === '欧州').length, only2: h.length > 0 && h.every((x) => x.lg === '2部'), clubs: new Set(h.map((x) => x.clubId)).size, maxStay: best,
      leaguesScored: new Set(h.filter((x) => x.goals > 0).map((x) => x.lg)).size, peakOvr: Math.max(0, ...h.map((x) => x.ovr)),
      nums: new Set(h.map((x) => x.number)), married: s.p.married, kids: s.p.kids, logc: (k) => s.log.filter((l) => l.k === k).length,
      hats: (s.family && s.family.hats) || 0, combo: (s.family && s.family.combo) || 0, joint: (s.family && s.family.jointApps) || 0,
      rv: rv ? { w: rv.h2h.w, d: rv.h2h.d, l: rv.h2h.l, n: rv.h2h.w + rv.h2h.d + rv.h2h.l, goals: rv.totals.goals, apps: rv.totals.apps } : null,
      last: s.lastMatch, gen: s.gen, earned: sum.earned, score: sum.score, mode: s.mode, R: s.records || newRecords(),
      potKnown: s.p.potLo === s.p.potHi, pot: s.p.pot, grow: s.p.grow, house: s.p.house, edu: s.p.edu || 0, donated: s.p.donated || 0,
      ch: s.challenge && challengeCleared(s, sum.score) ? s.challenge : null,
    };
  }
  const ACE = { FW: 9, MF: 10, DF: 4, GK: 1 };
  const TITLES = [
    ['g1', '初ゴール', 'あの1点から、すべてが始まった。', 'プロで1点決める', (c) => c.T.goals >= 1],
    ['g50', '点取り屋', 'ゴール前で最も頼れる存在。', '通算50得点', (c) => c.T.goals >= 50],
    ['g100', '百発の主', '大台の100ゴール。', '通算100得点', (c) => c.T.goals >= 100],
    ['g150', 'ゴールハンター', '獲物は逃さない。', '通算150得点', (c) => c.T.goals >= 150],
    ['g200', 'ゴールマシン', '点を取るのが仕事だった。', '通算200得点', (c) => c.T.goals >= 200],
    ['g250', '得点の神様', 'その足は神に愛された。', '通算250得点', (c) => c.T.goals >= 250],
    ['g300', '前人未到', '誰も届かなかった300点。', '通算300得点', (c) => c.T.goals >= 300],
    ['a30', 'アシスト職人', '主役を輝かせる名脇役。', '通算30アシスト', (c) => c.T.assists >= 30],
    ['a60', 'チャンスメーカー', 'チャンスはいつもその足から。', '通算60アシスト', (c) => c.T.assists >= 60],
    ['a100', '司令塔', 'ピッチのすべてが見えていた。', '通算100アシスト', (c) => c.T.assists >= 100],
    ['a150', '魔法の足', 'そのパスは魔法だった。', '通算150アシスト', (c) => c.T.assists >= 150],
    ['p50', 'プロの壁を越えて', '50試合。もう新人ではない。', '通算50試合出場', (c) => c.T.apps >= 50],
    ['p100', '百戦錬磨', '100の試合が、選手を作った。', '通算100試合出場', (c) => c.T.apps >= 100],
    ['p200', '主力の証', '200試合、チームの中心にいた。', '通算200試合出場', (c) => c.T.apps >= 200],
    ['p300', '鉄の体', 'ケガに負けず300試合。', '通算300試合出場', (c) => c.T.apps >= 300],
    ['p400', '不屈', '400試合。積み重ねは裏切らない。', '通算400試合出場', (c) => c.T.apps >= 400],
    ['p500', '永遠の現役', '500試合のピッチに立った。', '通算500試合出場', (c) => c.T.apps >= 500],
    ['cs30', '堅守', 'ゴールを守り抜いた30試合。', '通算30試合無失点（GK・DF）', (c) => c.T.cs >= 30],
    ['cs60', '鉄壁', '誰もその壁を越えられない。', '通算60試合無失点', (c) => c.T.cs >= 60],
    ['cs100', 'ゴールに鍵を', '100試合、ゴールを閉ざした。', '通算100試合無失点', (c) => c.T.cs >= 100],
    ['cs150', '絶対的守護神', '最後の砦は崩れなかった。', '通算150試合無失点', (c) => c.T.cs >= 150],
    ['cap1', '日の丸デビュー', '初めて日の丸を背負った日。', '日本代表に選ばれる', (c) => c.caps >= 1],
    ['cap20', '代表常連', '代表のユニフォームが似合ってきた。', '代表20試合', (c) => c.caps >= 20],
    ['cap50', '代表の柱', '代表チームを支え続けた。', '代表50試合', (c) => c.caps >= 50],
    ['cap80', '代表の顔', '日の丸といえばこの選手。', '代表80試合', (c) => c.caps >= 80],
    ['cap100', 'センチュリオン', '代表100試合の偉業。', '代表100試合', (c) => c.caps >= 100],
    ['ng20', '代表のエース', '代表で20ゴール。', '代表20得点', (c) => c.natGoals >= 20],
    ['wc1', 'W杯戦士', '夢の舞台に立った。', 'ワールドカップに出場', (c) => c.wc >= 1],
    ['wc16', '決勝トーナメントへ', 'グループリーグを突破した。', 'W杯ベスト16以上', (c) => c.wcBest >= 1],
    ['wc8', 'ベスト8の壁を破った', '新しい景色を見た。', 'W杯ベスト8以上', (c) => c.wcBest >= 2],
    ['wc4', '世界4強', '世界の4強に名を連ねた。', 'W杯ベスト4以上', (c) => c.wcBest >= 3],
    ['wc2', '世界2位', 'あと一歩、世界一に届かなかった。', 'W杯準優勝以上', (c) => c.wcBest >= 4],
    ['wcw', 'ワールドカップの英雄', '国中が、あの夏を忘れない。', 'W杯優勝', (c) => c.wcBest >= 5],
    ['wcg', 'W杯ゴール', '世界の舞台でネットを揺らした。', 'W杯で1得点', (c) => c.wcGoals >= 1],
    ['wcgk', 'W杯得点王', '世界の得点王。', 'W杯得点王', (c) => c.wcScorer >= 1],
    ['t1', '優勝の味', '一度味わうと忘れられない。', 'リーグ優勝', (c) => c.lgTitle >= 1],
    ['t3', '常勝の象徴', 'その選手がいるチームは勝つ。', 'リーグ優勝3回', (c) => c.lgTitle >= 3],
    ['t5', '王朝の主', '黄金時代を築いた。', 'リーグ優勝5回', (c) => c.lgTitle >= 5],
    ['s1', '得点王', 'リーグで一番ゴールを決めた。', 'リーグ得点王', (c) => c.scorer >= 1],
    ['s3', '得点王の常連', '得点王争いの主役。', '得点王3回', (c) => c.scorer >= 3],
    ['s5', '得点王の中の得点王', '5度の得点王。', '得点王5回', (c) => c.scorer >= 5],
    ['as1', 'アシスト王', 'リーグで一番アシストした。', 'アシスト王', (c) => c.assistK >= 1],
    ['m1', 'MVP', 'リーグで最も輝いた。', 'リーグMVP', (c) => c.mvp >= 1],
    ['m3', 'リーグの顔', '3度のMVP。', 'MVP3回', (c) => c.mvp >= 3],
    ['b5', 'ベストイレブン常連', '毎年のように選ばれた。', 'ベストイレブン5回', (c) => c.b11 >= 5],
    ['b10', 'ベストイレブンの重鎮', '10度のベストイレブン。', 'ベストイレブン10回', (c) => c.b11 >= 10],
    ['rk', '新人王', '鮮烈なデビュー。', '新人王', (c) => c.rookie >= 1],
    ['wb', '世界の頂点', '世界でいちばんうまい選手。', '世界年間最優秀選手', (c) => c.world >= 1],
    ['wb3', '世界の王', '3度、世界の頂点に立った。', '世界年間最優秀選手3回', (c) => c.world >= 3],
    ['eu1', '海外組', '一度は世界の舞台に立った。', '欧州のクラブでプレー', (c) => c.eu >= 1],
    ['eu6', '欧州の戦士', '本場で長く戦い抜いた。', '欧州で6シーズン', (c) => c.eu >= 6],
    ['eut', '欧州制覇', '本場の頂点に立った。', '欧州リーグ優勝', (c) => c.euTitle >= 1],
    ['l2', '2部の星', '地元の人たちに愛された。', '2部だけで8シーズン以上', (c) => c.only2 && c.seasons >= 8],
    ['promo', '昇格請負人', 'チームを上のリーグへ導いた。', '1部昇格を2回経験', (c) => c.promo >= 2],
    ['one', '一筋', 'ひとつのクラブに人生を捧げた。', '1クラブだけで10シーズン以上', (c) => c.clubs === 1 && c.seasons >= 10],
    ['nomad', '渡り鳥', 'いくつものユニフォームを着た。', '6クラブ以上でプレー', (c) => c.clubs >= 6],
    ['lg3', '3リーグで得点', '欧州・1部・2部、どこでも決めた。', '3つのリーグすべてで得点', (c) => c.leaguesScored >= 3],
    ['old', '40歳の現役', '40歳まで走り続けた。', '40歳まで現役', (c) => c.age >= 40],
    ['short', '太く短く', '短くても、濃い時間だった。', '30歳以下で引退し、ランクB以上', (c) => c.age <= 30 && c.score >= 2800],
    ['late', '遅咲き', '待った分だけ、大きく咲いた。', '晩成型で総合力80以上', (c) => c.grow === 'late' && c.peakOvr >= 80],
    ['early', '早熟の天才', '若くして頂点に近づいた。', '早熟型で総合力80以上', (c) => c.grow === 'early' && c.peakOvr >= 80],
    ['ovr85', '怪物', '総合力85の怪物。', '総合力85以上', (c) => c.peakOvr >= 85],
    ['wed', '家族の支え', '家族がいたから戦えた。', '結婚する', (c) => c.married],
    ['kids3', '子だくさん', 'にぎやかな家庭。', '子どもが3人', (c) => c.kids >= 3],
    ['cm', 'CMスター', 'お茶の間の人気者。', 'CMに出演', (c) => c.logc('cm') >= 1],
    ['sns', '炎上上等', '何を言われてもプレーで返した。', 'SNSの炎上を気にせず乗り切る', (c) => c.logc('sns') >= 1],
    ['inj', '不死鳥', '何度ケガをしても戻ってきた。', '長期離脱から3回復帰', (c) => c.logc('injury') >= 3],
    ['noinj', '無事之名馬', '大きなケガなく走り抜いた。', '長期離脱なしで15シーズン', (c) => c.logc('injury') === 0 && c.seasons >= 15],
    ['rich', '億万長者', '生涯年俸10億円。', '生涯年俸10億円以上', (c) => c.earned >= 100000],
    ['house', 'マイホーム', '帰る場所ができた。', '家を買う', (c) => c.house],
    ['donor', '地元の恩人', '地元クラブを支え続けた。', '地元クラブに3回寄付', (c) => c.donated >= 3],
    ['edu', '教育熱心', '子どもの未来に投資した。', '子どもの教育費を2回払う', (c) => c.edu >= 2],
    ['h1', 'ハットトリッカー', '1試合3得点。', 'ハットトリック', (c) => c.hats >= 1],
    ['h5', 'ハットトリックの達人', '5度のハットトリック。', 'ハットトリック5回', (c) => c.hats >= 5],
    ['h10', 'ハットトリック王', '10度のハットトリック。', 'ハットトリック10回', (c) => c.hats >= 10],
    ['max4', '1試合4得点', '止められない夜があった。', '1試合で4得点', (c) => c.R.maxGoalsGame >= 4],
    ['st5', '5戦連発', '5試合連続でゴール。', '5試合連続ゴール', (c) => c.R.bestGoalStreak >= 5],
    ['st8', '止まらない', '8試合連続でゴール。', '8試合連続ゴール', (c) => c.R.bestGoalStreak >= 8],
    ['st10', '神懸かり', '10試合連続ゴールの奇跡。', '10試合連続ゴール', (c) => c.R.bestGoalStreak >= 10],
    ['cst5', '5試合連続無失点', '5試合、ゴールを許さなかった。', '5試合連続無失点（GK・DF）', (c) => c.R.bestCsStreak >= 5],
    ['ply100', '100試合連続出場', '休まず100試合。', '100試合連続出場', (c) => c.R.bestPlayStreak >= 100],
    ['rv', '宿命のライバル', '何度もぶつかり合った。', 'ライバルと10回対戦', (c) => c.rv && c.rv.n >= 10],
    ['rvw', 'ライバルに勝ち越し', '最後に笑ったのはこちら。', 'ライバルとの対戦で勝ち越す（5試合以上）', (c) => c.rv && c.rv.n >= 5 && c.rv.w > c.rv.l],
    ['rvl', '永遠の挑戦者', '一度も越えられなかった背中。', 'ライバルとの対戦で負け越す（5試合以上）', (c) => c.rv && c.rv.n >= 5 && c.rv.l > c.rv.w],
    ['rvg', 'ライバル超え', '数字でもライバルを上回った。', '通算でライバルより多く得点（GK・DFは出場数）', (c) => c.rv && (c.pos === 'GK' || c.pos === 'DF' ? c.T.apps > c.rv.apps : c.T.goals > c.rv.goals)],
    ['jt', '親子共演', '親子で同じピッチに立った。', '子どもと同じ試合に出る', (c) => c.joint >= 1],
    ['cb', '親子鷹', '親から子へのホットライン。', '子どものゴールをアシスト', (c) => c.combo >= 1],
    ['cb3', '親子の絆', '何度もつながった親子のパス。', '親子弾を3回', (c) => c.combo >= 3],
    ['gen2', '二代目', '親の背中を追いかけた。', '2代目として引退', (c) => c.gen >= 2],
    ['fam3', 'サッカー一家', '3代続くサッカーの家系。', '3代目として引退', (c) => c.gen >= 3],
    ['fam5', 'サッカー名門', '5代続く名門。', '5代目として引退', (c) => c.gen >= 5],
    ['fam7', 'サッカー王朝', '7代続く王朝。', '7代目として引退', (c) => c.gen >= 7],
    ['lm', '有終の美', '引退試合で最高のプレー。', '引退試合を成功させる', (c) => c.last && c.last.hit],
    ['lmf', '最後まで自分らしく', '外れても、拍手は鳴りやまなかった。', '引退試合で失敗する', (c) => c.last && !c.last.hit],
    ['rC', 'プロとして', 'プロとして生き抜いた。', '生涯ランクC以上', (c) => c.score >= 1800],
    ['rB', '実力者', '確かな実力の持ち主。', '生涯ランクB以上', (c) => c.score >= 2800],
    ['rA', '名選手', '誰もが認める名選手。', '生涯ランクA以上', (c) => c.score >= 3800],
    ['rS', 'スター', '国中が知るスター。', '生涯ランクS以上', (c) => c.score >= 4800],
    ['rSS', 'レジェンド', '語り継がれる伝説。', '生涯ランクSS', (c) => c.score >= 6500],
    ['pot', '自分を知る者', '自分の限界を知り、その先を目指した。', '才能を完全に見抜く', (c) => c.potKnown],
    ['pot90', '天賦の才', '生まれ持った才能が違った。', '才能90以上で生まれる', (c) => c.pot >= 90],
    ['gkg', 'ゴールを決めたGK', 'キーパーなのに点を取った。', 'GKでゴールを決める', (c) => c.pos === 'GK' && c.T.goals >= 1],
    ['dfg', '攻撃的DF', '守って、攻めた。', 'DFで通算15得点', (c) => c.pos === 'DF' && c.T.goals >= 15],
    ['fwa', 'お膳立て上手のFW', '点を取らせるのもうまかった。', 'FWで通算50アシスト', (c) => c.pos === 'FW' && c.T.assists >= 50],
    ['mfb', '万能型', '点も取れて、アシストもできる。', 'MFで通算50得点・50アシスト', (c) => c.pos === 'MF' && c.T.goals >= 50 && c.T.assists >= 50],
    ['cup', 'カップ王者', '一発勝負を勝ち抜いた。', 'カップ戦で優勝', (c) => c.cup >= 1],
    ['cup3', 'カップ戦の鬼', 'トーナメントに強い。', 'カップ戦で3回優勝', (c) => c.cup >= 3],
    ['cupL2', 'ジャイアントキリング', '2部から大物を次々に倒した。', '2部のクラブでカップ優勝', (c) => c.cupL2 >= 1],
    ['ch_loyal', '一筋の誓い', '最後まで移籍しなかった。', '縛り「一筋」を達成', (c) => c.ch === 'loyal'],
    ['ch_domestic', '国内の雄', '海を渡らず頂点へ。', '縛り「国内一筋」を達成', (c) => c.ch === 'domestic'],
    ['ch_weak', '再建の英雄', '最弱クラブを頂点へ導いた。', '縛り「最弱クラブ再建」を達成', (c) => c.ch === 'weak'],
    ['ch_lowpot', '凡才の逆襲', '才能がなくても、ここまで来た。', '縛り「凡才」を達成', (c) => c.ch === 'lowpot'],
    ['ch_norest', '休まない人', '休まず走り続けた。', '縛り「休養禁止」を達成', (c) => c.ch === 'norest'],
    ['ch_keeper', 'GKの道を極めた', 'キーパー一筋で代表の柱に。', '縛り「GKの道」を達成', (c) => c.ch === 'keeper'],
    ['quickS', '60秒の奇跡', 'たった60秒で伝説になった。', '60秒モードでランクS以上', (c) => c.mode === 'quick' && c.score >= 4800],
    ['patient', 'じっくり派', '一週一週を大切に生きた。', 'じっくりモードで15シーズン以上', (c) => c.mode === 'normal' && c.seasons >= 15],
    ['ace', 'エースナンバー', 'チームの顔の背番号を背負った。', 'エースの背番号（FW9・MF10・DF4・GK1）を着ける', (c) => c.nums.has(ACE[c.pos])],
    ['nums', '背番号コレクター', 'いろんな番号を背負った。', '5種類以上の背番号を着ける', (c) => c.nums.size >= 5],
  ];
  function earnedTitles(s, sum) {
    const c = titleContext(s, sum);
    return TITLES.filter((t) => { try { return t[4](c); } catch { return false; } }).map((t) => t[0]);
  }
  const titleInfo = (id) => { const t = TITLES.find((x) => x[0] === id); return t ? { id: t[0], name: t[1], desc: t[2], hint: t[3] } : null; };

  // ===== 実績（端末に残る、すべての人生を通しての目標） =====
  // [id, 名前, 説明, (コレクション) => [いま, 目標]]
  const LETTERS = ['D', 'C', 'B', 'A', 'S', 'SS'];
  const best = (col, l) => LETTERS.indexOf(col.stats.bestLetter || 'D') >= LETTERS.indexOf(l) && col.stats.careers > 0 ? 1 : 0;
  const posBest = (col, pos, l) => LETTERS.indexOf((col.stats.posBest || {})[pos] || '') >= LETTERS.indexOf(l) ? 1 : 0;
  const ACHIEVEMENTS = [
    ['c1', 'プロの一生', '選手を1人引退させる', (c) => [c.stats.careers, 1]],
    ['c5', '5つの人生', '選手を5人引退させる', (c) => [c.stats.careers, 5]],
    ['c10', '10の物語', '選手を10人引退させる', (c) => [c.stats.careers, 10]],
    ['c30', '人生の語り部', '選手を30人引退させる', (c) => [c.stats.careers, 30]],
    ['pos4', '全ポジション経験', 'FW・MF・DF・GKすべてで引退させる', (c) => [Object.keys(c.stats.positions || {}).length, 4]],
    ['fwS', 'FWのスター', 'FWで生涯ランクS以上', (c) => [posBest(c, 'FW', 'S'), 1]],
    ['mfS', 'MFのスター', 'MFで生涯ランクS以上', (c) => [posBest(c, 'MF', 'S'), 1]],
    ['dfS', 'DFのスター', 'DFで生涯ランクS以上', (c) => [posBest(c, 'DF', 'S'), 1]],
    ['gkS', 'GKのスター', 'GKで生涯ランクS以上', (c) => [posBest(c, 'GK', 'S'), 1]],
    ['rkA', 'Aランク到達', '生涯ランクA以上の選手を出す', (c) => [best(c, 'A'), 1]],
    ['rkS', 'Sランク到達', '生涯ランクS以上の選手を出す', (c) => [best(c, 'S'), 1]],
    ['rkSS', 'SSランク到達', '生涯ランクSSの選手を出す', (c) => [best(c, 'SS'), 1]],
    ['clubs10', 'ユニフォーム10枚', 'のべ10クラブでプレーする（すべての選手の合計）', (c) => [(c.stats.clubs || []).length, 10]],
    ['clubs20', 'ユニフォーム20枚', 'のべ20クラブでプレーする', (c) => [(c.stats.clubs || []).length, 20]],
    ['clubs30', '全クラブ制覇', '30クラブすべてでプレーする', (c) => [(c.stats.clubs || []).length, 30]],
    ['goals500', '500ゴール', 'すべての選手の通算ゴールが500', (c) => [c.stats.goals, 500]],
    ['goals1000', '1000ゴール', 'すべての選手の通算ゴールが1000', (c) => [c.stats.goals, 1000]],
    ['apps2000', '2000試合', 'すべての選手の通算出場が2000試合', (c) => [c.stats.apps, 2000]],
    ['wc1', '世界一', 'ワールドカップで優勝する', (c) => [c.stats.wcWins, 1]],
    ['wc3', '世界一を3度', 'ワールドカップで3回優勝する（すべての選手の合計）', (c) => [c.stats.wcWins, 3]],
    ['world', '世界最優秀選手', '世界年間最優秀選手に選ばれる', (c) => [c.stats.worldBest, 1]],
    ['eu5', '海を渡った5人', '欧州でプレーした選手を5人出す', (c) => [c.stats.euPlayers, 5]],
    ['gen3', '3代続く一族', '3代目まで続ける', (c) => [c.stats.maxGen, 3]],
    ['gen5', '5代続く一族', '5代目まで続ける', (c) => [c.stats.maxGen, 5]],
    ['gen7', '7代続く一族', '7代目まで続ける', (c) => [c.stats.maxGen, 7]],
    ['t10', '称号10個', '称号を10種類集める', (c) => [Object.keys(c.titles).length, 10]],
    ['t30', '称号30個', '称号を30種類集める', (c) => [Object.keys(c.titles).length, 30]],
    ['t60', '称号60個', '称号を60種類集める', (c) => [Object.keys(c.titles).length, 60]],
    ['t100', '称号100個', '称号を100種類集める', (c) => [Object.keys(c.titles).length, 100]],
    ['ch1', '縛りに挑む者', '縛りプレイを1つ達成する', (c) => [(c.stats.challenges || []).length, 1]],
    ['ch3', '縛りの達人', '縛りプレイを3つ達成する', (c) => [(c.stats.challenges || []).length, 3]],
    ['ch6', '縛りの王', '縛りプレイを6つすべて達成する', (c) => [(c.stats.challenges || []).length, 6]],
    ['quickS', '60秒のスター', '60秒モードで生涯ランクS以上', (c) => [c.stats.quickS || 0, 1]],
    ['quick10', '早送りの人生', '60秒モードで10人引退させる', (c) => [c.stats.quick || 0, 10]],
    ['online1', 'オンラインの一生', 'オンラインリーグで1人引退させる', (c) => [c.stats.online || 0, 1]],
    ['cup3', 'カップ戦の常連', 'カップ戦で3回優勝する（すべての選手の合計）', (c) => [c.stats.cups || 0, 3]],
    ['combo', '親子弾', '親子弾を決める', (c) => [c.stats.combos || 0, 1]],
    ['rich', '100億円', 'すべての選手の生涯年俸の合計が100億円', (c) => [c.stats.earned || 0, 1000000]],
    ['last10', '有終の美×10', '引退試合を10回成功させる', (c) => [c.stats.lastHits || 0, 10]],
    ['pot', '自分を知る', '才能を完全に見抜いた選手を出す', (c) => [c.titles.pot ? 1 : 0, 1]],
  ];
  function newCollection() { return { v: 1, titles: {}, ach: {}, stats: { careers: 0, positions: {}, posBest: {}, clubs: [], goals: 0, apps: 0, wcWins: 0, worldBest: 0, euPlayers: 0, maxGen: 0, challenges: [], cups: 0, combos: 0, earned: 0, lastHits: 0, quick: 0, quickS: 0, online: 0 } }; }
  // 引退した選手1人分をコレクションに足す。新しく手に入れた称号と実績を返す
  function addToCollection(col, sum, kind = sum.mode) {
    col = col && col.v === 1 ? col : newCollection();
    const st = col.stats, newT = [], newA = [];
    const before = new Set(ACHIEVEMENTS.filter((a) => { const [n, g] = a[3](col); return n >= g; }).map((a) => a[0]));
    st.careers++;
    st.positions[sum.pos] = (st.positions[sum.pos] || 0) + 1;
    const better = (a, b) => LETTERS.indexOf(a) > LETTERS.indexOf(b || '');
    if (better(sum.letter, st.posBest[sum.pos])) st.posBest[sum.pos] = sum.letter;
    if (better(sum.letter, st.bestLetter)) st.bestLetter = sum.letter;
    st.clubs = [...new Set(st.clubs.concat(sum.clubIds || []))];
    st.goals += sum.goals; st.apps += sum.apps;
    st.wcWins += sum.wc.filter((w) => w.reached === '優勝').length;
    st.worldBest += sum.worldBest || 0;
    if (sum.eu) st.euPlayers++;
    st.maxGen = Math.max(st.maxGen, sum.gen);
    if (sum.challenge && sum.challenge.cleared && !st.challenges.includes(sum.challenge.id)) st.challenges.push(sum.challenge.id);
    st.cups += sum.cupWins || 0;
    st.combos += (sum.family && sum.family.combo) || 0;
    st.earned += sum.earned || 0;
    if (sum.lastMatch && sum.lastMatch.hit) st.lastHits++;
    if (kind === 'quick') { st.quick++; if (sum.score >= 4800) st.quickS++; }
    if (kind === 'online') st.online++;
    for (const id of sum.titles || []) if (!col.titles[id]) { col.titles[id] = { by: sum.name, y: sum.endYear }; newT.push(id); }
    for (const a of ACHIEVEMENTS) { const [n, g] = a[3](col); if (n >= g && !before.has(a[0]) && !col.ach[a[0]]) { col.ach[a[0]] = Date.now(); newA.push(a[0]); } }
    return { col, newTitles: newT, newAch: newA };
  }

  // ===== おまかせ（60秒モード） =====
  const POLICY = {
    challenge: { name: '挑戦派', desc: '強いクラブ・海外へ。出番が少なくても上を目指す' },
    stable: { name: '安定派', desc: '試合に出られるクラブで、長くコツコツ' },
    money: { name: 'お金派', desc: 'いちばん高い年俸を出すクラブへ' },
  };
  function autoTrain(s) {
    if ((s.p.injury || s.p.fatigue > 60) && s.challenge !== 'norest') return 'rest';
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
    out.review = endSeason(s); out.nat = nationalYear(s);
    // おまかせでもお金は使う：家・教育・キャンプ・診断
    for (const id of ['house', 'edu', 'camp']) if (s.p.money >= SHOP[id].price * 3) buy(s, id);
    out.notes = ageUp(s);
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
    for (const id of ['trainer', 'clinic']) if (s.p.money >= SHOP[id].price * 3) buy(s, id);
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
    START_MONEY, ROULETTE, RL_BETS, rlColor, rlBetInfo, rlCheck, spinRoulette, resolveRoulette,
    CHALLENGES, SHOP, shopList, buy, narrowPot, TITLES, titleInfo, ACHIEVEMENTS, newCollection, addToCollection, CUP_WEEKS,
    migrate, inheritBonus, lastMatchInfo, playLastMatch, familyTitle, POLICY, autoDraft, autoYear, autoLastMatch, lastName,
    // オンライン版のサーバーが同じルールで試合を回すための部品
    _: { trackRecords, healWeek, condDown, newCup, cupPair, cupFinish, newRecords, potRange, train, decay, newWorld, lambda, poisson, gauss, ri, chance, pick, clamp, sig, roundRobin, wageFor, rookieOffers, newPlayer, assignNumber, goalHow, assistHow, CLUB_SEED, rankLetter, legendTitle },
  };
})();

if (typeof module !== 'undefined') module.exports = SL;
