// ===== オンラインリーグのルール =====
// 1人用の soccer-life/core.js のルール（成長・衰え・評価・契約・引退）をそのまま使い、
// 「同じリーグに本物のプレイヤーが何人もいる」ところだけをここで扱う。
import SL from '../../soccer-life/sl.js'; // core.js と分割したファイル（称号・ミニゲーム）をまとめて読み込む

const { train, decay, newWorld, lambda, poisson, gauss, ri, chance, pick, clamp, roundRobin, rookieOffers, newPlayer, goalHow, assistHow, CLUB_SEED,
  trackRecords, healWeek, condDown, newCup, cupPair, cupFinish, newRecords } = SL._;
const { POS, GROW, LEAGUES, SEASON_WEEKS, mainStats, ovr, startChance } = SL;

export const OFF_TICKS = 2; // オフシーズンの長さ（節の何回分か。30分ごとなら1時間）。この間に契約を選ぶ
// 1つのクラブに入れる本物のプレイヤーの数（強い人が1つのクラブに集まりすぎないように）
export const CLUB_CAP = 6, GK_CAP = 2;
// 年俸の上限（万円）。リーグごと
export const SALARY_CAP = { 0: 30000, 1: 8000, 2: 2000 };
// ルーレットの台：全員共通で一定時間ごとに1回まわる（間隔は wrangler.toml の RL_MINUTES）
export function newTable(now, ms) { return { round: 0, nextAt: now + ms, hist: [], last: null }; }

// ----- 世界（クラブ・日程・順位表） -----
export function newWorldState() {
  const w = { v: 1, year: SL.START_YEAR, season: 1, week: 0, phase: 'season', offLeft: 0, clubs: newWorld(), last: null, nextAt: 0, history: [], records: newWorldRecords() };
  startSeason(w);
  return w;
}
function startSeason(w) {
  w.week = 0; w.phase = 'season'; w.schedule = {}; w.table = {};
  for (const L of LEAGUES) {
    const ids = w.clubs.filter((c) => c.lg === L.id).map((c) => c.id).sort(() => Math.random() - .5);
    w.schedule[L.id] = roundRobin(ids);
  }
  for (const c of w.clubs) w.table[c.id] = { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 };
  w.cup = newCup(w.clubs);
}

// ----- リーグの全記録・クラブの歴史 -----
export function newWorldRecords() { return { seasonGoals: [], seasonAssists: [], careerGoals: [], careerApps: [], careerScore: [], motw: [], clubs: {} }; }
// リーグ速報（全員が見るニュース。直近30件）
export function addNews(w, t) {
  if (!w.news) w.news = [];
  w.news.unshift({ t, at: Date.now(), y: w.year });
  if (w.news.length > 30) w.news.length = 30;
}
// ----- データの版管理 -----
// データの形を変えるときは VERSION を上げて、MIGRATIONS[古い版] に「1つ新しい版へ直す」関数を足す。
// 移行は起動のたびに読み込んだデータに対して行い、次に保存するときに新しい形で書かれる。
export const WORLD_VERSION = 2;
const WORLD_MIGRATIONS = {
  // v1→v2：クラブ名・略称・特徴を ID ごとに付け直す（今の所属リーグと強さはそのまま。経歴のクラブ名は当時のまま）
  1: (w) => { SL._.applyClubData(w.clubs); },
};
// NPC選手を作るときのシード（オンラインの世界は1つなので固定）。名簿は rosters 表にクラブごとに保存する
export const NPC_SEED = 1;
export const MEMBER_VERSION = 1;
const MEMBER_MIGRATIONS = {};
// プレイヤー1人分を今の形にそろえる（以前は起動処理の中に直接書いていたもの）
export function migrateMember(m, w) {
  if (!m.v) m.v = 1;
  while (m.v < MEMBER_VERSION) { MEMBER_MIGRATIONS[m.v](m, w); m.v++; }
  if (m.pl.potLo == null) Object.assign(m.pl, SL._.potRange(m.pl.pot));
  SL.gtypeOf(m.pl); // 成長の型がなければ名前から決める（Phase 4）
  if (m.status !== 'draft' && m.status !== 'retired' && m.debutYear == null) m.debutYear = (m.history[0] && m.history[0].year) || w.year;
  return m;
}
export function migrateWorld(w) {
  if (!w.v) w.v = 1;
  while (w.v < WORLD_VERSION) { WORLD_MIGRATIONS[w.v](w); w.v++; }
  w.records = w.records || newWorldRecords();
  w.news = w.news || [];
  if (!w.cup) w.cup = newCup(w.clubs);
  return w;
}
function pushTop(list, row, key = 'v', n = 10) {
  list.push(row); list.sort((a, b) => b[key] - a[key]); if (list.length > n) list.length = n;
}
function clubRec(w, id) { return w.records.clubs[id] || (w.records.clubs[id] = { titles: [], cups: [], scorers: [], legends: [] }); }

// ----- 人数制限・年俸上限 -----
export function humansAt(members, clubId, pos = null, except = null) {
  let n = 0;
  for (const m of members) if (m !== except && m.pl.club === clubId && m.status !== 'retired' && m.status !== 'draft' && (!pos || m.pl.pos === pos)) n++;
  return n;
}
export function clubFull(members, clubId, pos, except = null) {
  return humansAt(members, clubId, null, except) >= CLUB_CAP || (pos === 'GK' && humansAt(members, clubId, 'GK', except) >= GK_CAP);
}
function capSalary(w, o) { const cap = SALARY_CAP[w.clubs[o.club].lg]; if (o.salary > cap) { o.salary = cap; o.capped = true; } return o; }
export function standings(w, lg) {
  return w.clubs.filter((c) => c.lg === lg).map((c) => ({ c, t: w.table[c.id] }))
    .sort((a, b) => b.t.p - a.t.p || (b.t.gf - b.t.ga) - (a.t.gf - a.t.ga) || b.t.gf - a.t.gf || b.c.str - a.c.str);
}
function record(w, h, a, gh, ga) {
  const th = w.table[h], ta = w.table[a];
  th.gf += gh; th.ga += ga; ta.gf += ga; ta.ga += gh;
  if (gh > ga) { th.w++; th.p += 3; ta.l++; } else if (gh < ga) { ta.w++; ta.p += 3; th.l++; } else { th.d++; ta.d++; th.p++; ta.p++; }
}

// ----- プレイヤー -----
const emptySeason = () => ({ apps: 0, starts: 0, goals: 0, assists: 0, cs: 0, mins: 0, ratings: [] });
const emptyTotals = () => ({ apps: 0, starts: 0, goals: 0, assists: 0, cs: 0, rating: 0, mins: 0 });

export function newMember(id, account, name, pos, opt = {}) {
  const pl = newPlayer(name, pos, opt.bonus || 0);
  const m = {
    id, account, gen: opt.gen || 1, lineage: opt.lineage || [], parent: opt.parent || null,
    pl, status: 'draft', training: pos === 'GK' ? 'gk' : mainStats(pos)[0],
    season: emptySeason(), totals: emptyTotals(), history: [], awards: [], trophies: [], caps: 0, natGoals: 0, wc: [], log: [],
    last: null, offer: null, summary: null, created: Date.now(), records: newRecords(), cupSeason: emptySeason(), motw: 0,
  };
  return m;
}

// core.js の関数は「1人用のセーブデータ」を受け取るので、その形に見せかける
export function adapter(m, w) {
  return {
    p: m.pl, clubs: w.clubs, history: m.history, totals: m.totals, trophies: m.trophies, awards: m.awards, caps: m.caps, natGoals: m.natGoals,
    wc: m.wc, year: w.year, log: m.log, papers: [], news: [], family: { combo: 0, jointApps: 0, jointGoals: 0 }, rival: null, mode: 'online',
    gen: m.gen, lineage: m.lineage, parent: m.parent, season: m.season, lastMatch: null,
    records: m.records || (m.records = newRecords()), phase: w.phase === 'season' ? 'season' : 'off',
  };
}
function trimLog(m) { if (m.log.length > 60) m.log.splice(0, m.log.length - 60); }

// 入団先の候補：満員のクラブは、同じリーグで強さが近い空きのあるクラブに差し替える
export function draftOffers(m, w, members = []) {
  const list = rookieOffers({ p: m.pl, clubs: w.clubs });
  const used = new Set();
  return list.map((o) => {
    if (!clubFull(members, o.club, m.pl.pos) && !used.has(o.club)) { used.add(o.club); return capSalary(w, o); }
    const base = w.clubs[o.club];
    const alt = w.clubs.filter((c) => c.lg === base.lg && !used.has(c.id) && !clubFull(members, c.id, m.pl.pos)).sort((a, b) => Math.abs(a.str - base.str) - Math.abs(b.str - base.str))[0];
    if (!alt) return null;
    used.add(alt.id);
    return capSalary(w, { ...o, club: alt.id });
  }).filter(Boolean);
}
export function join(m, w, i, members = []) {
  const o = m.draft[i]; if (!o) return 'bad_choice';
  if (clubFull(members, o.club, m.pl.pos, m)) return 'club_full';
  SL.joinClub(adapter(m, w), o);
  addNews(w, `🆕 ${m.pl.name}（${m.pl.pos}）が${w.clubs[o.club].name}に入団${m.gen > 1 ? `。${m.gen}代目` : ''}`);
  m.draft = null; m.season = emptySeason(); m.cupSeason = emptySeason();
  m.debutYear = w.year;
  m.status = w.phase === 'season' ? 'active' : 'decided';
  trimLog(m);
  return null;
}

// ----- 1週間：練習 → 試合 -----
function weeklyTraining(m) {
  const p = m.pl;
  if (p.injury > 0) { p.fatigue = Math.max(0, p.fatigue - 20); return; }
  if (m.training === 'rest') { p.fatigue = Math.max(0, p.fatigue - 32); if (chance(.45)) p.cond = clamp(p.cond + 1, -2, 2); return; }
  if (m.training === 'hard') {
    for (const k of mainStats(p.pos)) train(p, k, .5);
    p.fatigue = clamp(p.fatigue + 24, 0, 100);
    if (chance(.04 + p.fatigue / 900)) { p.injury = ri(1, 3); m.note = '猛練習中に足を痛めた'; }
    return;
  }
  const k = m.training in p.stats ? m.training : mainStats(p.pos)[0];
  train(p, k, 1.7);
  p.fatigue = clamp(p.fatigue + 9, 0, 100);
}
function weeklyAfter(m, mins, rating, wasInjured) {
  const p = m.pl;
  if (mins > 0) for (const k of mainStats(p.pos)) train(p, k, .14 * mins / 90);
  const over = p.age - GROW[p.grow].peak;
  if (over > 0) for (const k of Object.keys(p.stats)) decay(p, k, ((k === 'spd' || k === 'phy') ? .06 : k === 'gk' ? .032 : .024) * Math.min(over, 7));
  p.fatigue = Math.max(0, p.fatigue - 6);
  if (wasInjured && p.injury > 0) healWeek(p);
  if (rating) {
    if (rating >= 7.5 && chance(.6)) p.cond = clamp(p.cond + 1, -2, 2);
    if (rating < 5.5 && chance(.5)) condDown(p);
  }
  if (chance(.18)) { if (chance(.5)) p.cond = clamp(p.cond + 1, -2, 2); else condDown(p); }
}

// 1試合：両クラブの名簿（NPC＋本物のプレイヤー）で試合エンジン（core-match.js）を回す
// 本物のプレイヤーは、試合に出た分の成績・評価点・ケガ・疲れをここで反映する。NPCの成績は npcSeason にためる
function clubPool(cid, byClub, npcs) {
  const humans = byClub.get(cid) || [];
  const seats = humans.map((m) => ({ pos: m.pl.pos }));
  return SL.clubSquad(npcs, cid, seats).npcs.map((p) => ({ p, human: false }))
    .concat(humans.filter((m) => !(m.pl.injury > 0)).map((m) => ({ p: m.pl, human: true, m })));
}
function clubMatch(w, h, a, byClub, npcs, npcSeason, cup = false) {
  const raw = SL.simMatch([{ club: w.clubs[h], pool: clubPool(h, byClub, npcs) }, { club: w.clubs[a], pool: clubPool(a, byClub, npcs) }]);
  const fin = SL.finishMatch(raw);
  const gh = fin.gh, ga = fin.ga;
  if (!cup) { record(w, h, a, gh, ga); SL.addNpcStats(npcSeason, raw); }
  const scored = raw.events.filter((e) => e.t === 'goal' || (e.t === 'pk' && e.res));
  for (const [si, cid] of [h, a].entries()) {
    const side = { c: w.clubs[cid] }, other = w.clubs[si === 0 ? a : h];
    const gf = si === 0 ? gh : ga, gc = si === 0 ? ga : gh;
    for (const m of byClub.get(cid) || []) {
      const p = m.pl, S = cup ? (m.cupSeason || (m.cupSeason = emptySeason())) : m.season;
      const sl = raw.S[si].slots.find((x) => x.m === m);
      const r = { role: p.injury > 0 ? 'injured' : sl && sl.on != null ? (sl.start ? 'start' : 'sub') : 'bench', mins: 0, goals: 0, assists: 0, wasInjured: p.injury > 0 };
      if (sl && sl.on != null) { r.mins = sl.mins; r.goals = sl.line.g; r.assists = sl.line.a; r.rating = sl.rating; r.cs = !!sl.cs; }
      if (r.mins > 0) {
        S.apps++; if (r.role === 'start') S.starts++;
        S.goals += r.goals; S.assists += r.assists; S.mins += r.mins; if (r.cs) S.cs++;
        if (!cup) { SL.addLine(S, sl.line); if (sl.motm) S.motm = (S.motm || 0) + 1; }
        S.ratings.push(r.rating);
        if (r.role === 'start') p.fatigue = clamp(p.fatigue + 10, 0, 100);
        if (chance(.012 + (p.fatigue > 70 ? .03 : 0))) { p.injury = Math.max(p.injury, ri(1, 5)); m.note = '試合中に接触プレーで負傷'; }
        p.fame = clamp(p.fame + r.goals * .6 + r.assists * .3 + (r.rating >= 8 ? 1 : 0) + (side.c.lg === 0 ? .2 : 0), 0, 100);
        if (!cup) r.pay = SL.matchPay(p, r.mins, r.goals);
        if (!cup && r.goals >= 2) addNews(w, `⚽ ${p.name}が${other.city}戦で${r.goals >= 3 ? 'ハットトリック！' : '2ゴール'}（${side.c.name}）`);
        if (!cup && m.totals.apps + S.apps === 1) m.log.push({ y: w.year, age: p.age, k: 'debut', t: `${w.year}年、第${w.week + 1}節の${other.name}戦でプロデビュー。` });
      }
      const report = {
        year: w.year, week: w.week + 1, home: si === 0, club: cid, opp: other.id, gf, gc, role: r.role, mins: r.mins,
        goals: r.goals, assists: r.assists, rating: r.rating || null, cs: !!r.cs, note: m.note || null, injury: p.injury, pay: r.pay || 0,
        ht: si === 0 ? fin.ht : [fin.ht[1], fin.ht[0]], st: sl && sl.on != null ? { ...sl.line } : null, motm: !!(sl && sl.motm),
        events: scored.map((e) => ({
          min: e.min, us: e.side === si,
          who: e.a === sl ? 'me' : e.a.p.name, how: e.a === sl ? (e.t === 'pk' ? 'PKを冷静に決める' : e.how) : null,
          assist: e.b ? (e.b === sl ? 'me' : e.b.p.name) : null,
        })),
        log: SL.matchLog(raw, si, sl || {}),
      };
      if (cup) {
        // カップ戦は週の処理（回復・衰え）を二重にしない。試合経験だけ
        if (r.mins > 0) for (const k of SL.mainStats(p.pos)) train(p, k, .14 * r.mins / 90);
        m.lastCup = { ...report, round: SL.CUP_WEEKS[w.week + 1] };
      } else {
        weeklyAfter(m, r.mins, r.rating, r.wasInjured);
        m.last = report;
        trackRecords(adapter(m, w), { mins: r.mins, goals: r.goals, role: r.role, cs: !!r.cs }, other.name);
        m._rating = r.rating || 0; m._mins = r.mins;
      }
      m.note = null;
      trimLog(m);
    }
  }
  // 全員向けの結果（NPCのゴールも名前を出す。human：本物のプレイヤーが関わったゴール）
  return {
    lg: w.clubs[h].lg, h, a, gh, ga,
    goals: scored.map((e) => ({ min: e.min, side: e.side, who: e.a.p.name, assist: e.b ? e.b.p.name : null, human: !!(e.a.human || (e.b && e.b.human)), pk: e.t === 'pk' })),
  };
}

// npcSeason：{ season, stats }（NPCの今季の成績。シーズンが変わったら空にする）
export function playMatchday(w, members, npcs = [], npcSeason = null) {
  const store = npcSeason && npcSeason.season === w.season ? npcSeason : { season: w.season, stats: {} };
  const active = members.filter((m) => m.status === 'active' && m.pl.club != null);
  for (const m of active) { weeklyTraining(m); m._mins = 0; m._rating = 0; }
  const byClub = new Map();
  for (const m of active) { if (!byClub.has(m.pl.club)) byClub.set(m.pl.club, []); byClub.get(m.pl.club).push(m); }
  const results = [];
  for (const L of LEAGUES) for (const [h, a] of w.schedule[L.id][w.week]) results.push(clubMatch(w, h, a, byClub, npcs, store.stats));
  // 今週の最優秀選手（45分以上出た本物のプレイヤーで評価点がいちばん）
  const best = active.filter((m) => m._mins >= 45).sort((a, b) => b._rating - a._rating || b.last.goals - a.last.goals)[0];
  w.motw = best ? { year: w.year, week: w.week + 1, name: best.pl.name, pos: best.pl.pos, club: best.pl.club, rating: best._rating, goals: best.last.goals, assists: best.last.assists } : null;
  if (best) {
    best.motw = (best.motw || 0) + 1;
    addNews(w, `🏅 第${w.week + 1}節の最優秀選手は${best.pl.name}（評価${best._rating.toFixed(1)}）`);
    best.log.push({ y: w.year, age: best.pl.age, k: 'motw', t: `${w.year}年第${w.week + 1}節、週間最優秀選手に選ばれた（評価${best._rating.toFixed(1)}）。` });
    pushTop(w.records.motw, { ...w.motw, v: w.motw.rating }, 'v', 20);
  }
  // カップ戦（第4・8・12・16節）
  let cupRes = null;
  const round = SL.CUP_WEEKS[w.week + 1];
  if (round && w.cup && w.cup.winner == null) {
    const res = [];
    for (const [h, a] of cupPair(w.cup)) {
      const r = clubMatch(w, h, a, byClub, npcs, store.stats, true);
      res.push({ h, a, gh: r.gh, ga: r.ga, pk: r.gh === r.ga, win: r.gh > r.ga ? h : r.ga > r.gh ? a : (chance(.5) ? h : a), goals: r.goals });
    }
    cupFinish(w.cup, round, res);
    cupRes = { round, res };
  }
  w.week++;
  w.last = { year: w.year, week: w.week, at: Date.now(), results, cup: cupRes };
  return store;
}

// ----- シーズン終了 -----
const avg = (a) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 100) / 100 : 0;

// npcs・npcSeason：NPCの名簿と今季の成績（個人賞をNPCも含めて決める）。NPCの受賞は npcs に書き込む
export function endSeason(w, members, npcs = [], npcSeason = null) {
  const active = members.filter((m) => m.status === 'active' && m.pl.club != null);
  const rankOf = (cid) => standings(w, w.clubs[cid].lg).findIndex((x) => x.c.id === cid) + 1;
  const champions = LEAGUES.map((L) => standings(w, L.id)[0].c.name);
  // 個人賞：NPCと本物のプレイヤーを同じ表に並べ、実際の成績で決める（core-awards.js）
  const stats = npcSeason && npcSeason.season === w.season ? npcSeason.stats : {};
  const entries = SL.npcEntries(npcs, stats, w.clubs).concat(active.map((m) => SL.userEntry(m.pl, m.season, w.clubs, { key: 'u:' + m.id, rookie: m.history.length === 0 && m.pl.age <= 21 })));
  const awd = SL.seasonAwards(entries, (lg) => standings(w, lg).map((x) => x.c.id));
  SL.stampNpcAwards(npcs, awd.won, w.year);
  const awRec = SL.awardsRecord(w.year, awd, champions);
  for (const L of LEAGUES) { const A = awRec.lg[L.id]; if (A.scorer.length) addNews(w, `⚽ ${w.year}年 ${L.short}得点王：${A.scorer.map((x) => x.name).join('・')}（${A.scorer[0].v}点）／MVP：${A.mvp ? A.mvp.name : '-'}`); }
  for (const m of active) {
    const p = m.pl, S = m.season, c = w.clubs[p.club], L = LEAGUES[c.lg], rank = rankOf(c.id), avgR = avg(S.ratings);
    const aw = [];
    if (rank === 1 && S.apps >= 5) aw.push(`${L.short}リーグ優勝`);
    aw.push(...(awd.won.get('u:' + m.id) || []));
    if (w.cup && w.cup.winner === c.id && m.cupSeason && m.cupSeason.apps > 0) aw.push(c.lg === 2 ? 'カップ優勝（2部から）' : 'カップ優勝');
    p.money += p.salary;
    p.fame = clamp(p.fame + aw.length * 4 + (avgR >= 7 ? 3 : 0), 0, 100);
    p.contract--;
    m.history.push({ year: w.year, age: p.age, club: c.name, clubId: c.id, lg: L.short, number: p.number, apps: S.apps, starts: S.starts, goals: S.goals, assists: S.assists, cs: S.cs, rating: avgR, rank, awards: aw, ovr: ovr(p), salary: p.salary,
      shots: S.shots || 0, tackles: S.tackles || 0, inters: S.inters || 0, saves: S.saves || 0, yellow: S.yellow || 0, red: S.red || 0, motm: S.motm || 0 });
    const T = m.totals;
    T.apps += S.apps; T.starts += S.starts; T.goals += S.goals; T.assists += S.assists; T.cs += S.cs; T.mins += S.mins; T.rating += S.ratings.reduce((x, y) => x + y, 0);
    for (const k of Object.keys(SL.LINE_KEYS).concat(['motm'])) T[k] = (T[k] || 0) + (S[k] || 0);
    for (const x of aw) (x.includes('優勝') || x.includes('昇格') ? m.trophies : m.awards).push(`${w.year} ${x}`);
    const big = aw.filter((x) => /得点王|アシスト王|MVP|最優秀|カップ優勝/.test(x));
    if (big.length) addNews(w, `🏆 ${m.pl.name}が${w.year}年の${big.join('・')}`);
    if (aw.length) m.log.push({ y: w.year, age: p.age, k: 'award', t: `${w.year}年、${c.name}で${aw.join('・')}。` });
    m.seasonAwards = aw;
  }
  // リーグの記録・クラブの歴史
  for (const m of active) {
    const S = m.season, club = w.clubs[m.pl.club];
    if (S.goals) pushTop(w.records.seasonGoals, { name: m.pl.name, year: w.year, club: club.name, v: S.goals });
    if (S.assists) pushTop(w.records.seasonAssists, { name: m.pl.name, year: w.year, club: club.name, v: S.assists });
  }
  const bestByClub = new Map();
  for (const m of active) { const b = bestByClub.get(m.pl.club); if (!b || m.season.goals > b.season.goals) bestByClub.set(m.pl.club, m); }
  for (const [cid, m] of bestByClub) if (m.season.goals > 0) { const cr = clubRec(w, cid); cr.scorers.push({ year: w.year, name: m.pl.name, goals: m.season.goals }); if (cr.scorers.length > 12) cr.scorers.shift(); }
  for (const L of LEAGUES) clubRec(w, standings(w, L.id)[0].c.id).titles.push(`${w.year} ${L.short}`);
  addNews(w, `🏆 ${w.year}年の優勝：欧州 ${standings(w, 0)[0].c.city}／1部 ${standings(w, 1)[0].c.city}／2部 ${standings(w, 2)[0].c.city}`);
  if (w.cup && w.cup.winner != null) clubRec(w, w.cup.winner).cups.push(w.year);

  // 昇格・降格とクラブ力の変動
  const r1 = standings(w, 1).slice(-2).map((x) => x.c), p2 = standings(w, 2).slice(0, 2).map((x) => x.c);
  r1.forEach((x) => { x.lg = 2; }); p2.forEach((x) => { x.lg = 1; });
  for (const m of active) if (p2.some((x) => x.id === m.pl.club) && m.season.apps >= 5) { m.trophies.push(`${w.year} 1部昇格`); m.seasonAwards.push('1部昇格'); }
  for (const x of w.clubs) {
    const old = x.str;
    x.str = clamp(Math.round(x.str + (CLUB_SEED[x.id].str - x.str) * .3 + gauss() * 1.5 + (p2.includes(x) ? 3 : 0) - (r1.includes(x) ? 2 : 0)), 44, 90);
    if (x.atk != null) { x.atk += x.str - old; x.dfn += x.str - old; }
  }
  w.history.push({ year: w.year, champions, moves: [...r1.map((x) => `${x.name} が2部へ降格`), ...p2.map((x) => `${x.name} が1部へ昇格`)], awards: awRec });
  if (w.history.length > 30) w.history.shift();

  // 代表（W杯は全員で同じ大会にしたいので、最小構成ではまだやらない）
  for (const m of active) {
    const o = ovr(m.pl), line = 70 - (w.clubs[m.pl.club].lg === 0 ? 3 : 0);
    if (o >= line || (o >= line - 3 && chance(.4))) {
      if (!m.caps) m.log.push({ y: w.year, age: m.pl.age, k: 'nat', t: `${w.year}年、${m.pl.age}歳で日本代表に初選出。` });
      const n = ri(4, 7); m.caps += n; m.natCalled = n;
      for (let i = 0; i < n; i++) if (chance(POS[m.pl.pos].goal * 1.1)) m.natGoals++;
    } else m.natCalled = 0;
  }
  // 年をとって、オファーが届く
  for (const m of active) {
    const s = adapter(m, w);
    const notes = SL.ageUp(s); // （NPCの1年は上でまとめて済ませた。adapter には名簿がないので ageUp では動かない）
    const res = SL.offers(s);
    res.transfers = res.transfers.filter((t) => !clubFull(members, t.club, m.pl.pos, m)).map((t) => capSalary(w, t));
    if (res.contract) capSalary(w, res.contract);
    m.offer = { res, notes, forced: SL.mustRetire(s, res), canRetire: SL.canRetire(s), year: w.year, awards: m.seasonAwards, nat: m.natCalled };
    m.status = 'off';
    trimLog(m);
  }
  // NPCの1年（成長・衰え・移籍・引退・新人）。名簿はこのあと league.js が保存する
  const R2 = w.records || (w.records = newWorldRecords());
  const rep = SL.npcOffseason(npcs, w.clubs, stats, w.year, R2.npcLegends || (R2.npcLegends = []));
  for (const t of SL.offseasonNotes(rep)) addNews(w, t);
  w.year++; w.season++;
  w.phase = 'off'; w.offLeft = OFF_TICKS;
}

// オフの選択肢： 'stay' / 'retire' / オファーの番号
export function offerList(m) {
  const res = m.offer.res; const list = [];
  if (res.contract) list.push({ ...res.contract, stay: true });
  for (const t of res.transfers) list.push(t);
  return list;
}
export function decide(m, w, choice, members = []) {
  if (m.status !== 'off' || !m.offer) return 'not_now';
  const o = m.offer, res = o.res;
  if (choice === 'retire') { if (!o.forced && !o.canRetire) return 'too_young'; retire(m, w); return null; }
  if (o.forced) return 'must_retire';
  if (choice === 'stay') { if (res.expiring || res.released) return 'no_contract'; }
  else {
    const offer = offerList(m)[Number(choice)];
    if (!offer) return 'bad_choice';
    if (!offer.stay && clubFull(members, offer.club, m.pl.pos, m)) return 'club_full';
    SL.accept(adapter(m, w), offer);
    if (!offer.stay) addNews(w, `✈️ ${m.pl.name}が${w.clubs[offer.club].name}へ移籍${w.clubs[offer.club].lg === 0 ? '（欧州挑戦！）' : ''}`);
  }
  m.status = 'decided'; m.offer = null; trimLog(m);
  return null;
}
function autoDecide(m, w, members) {
  const o = m.offer, res = o.res;
  if (o.forced) return retire(m, w);
  if (!res.expiring && !res.released) { m.status = 'decided'; m.offer = null; return; }
  const list = offerList(m).filter((x) => x.stay || !clubFull(members, x.club, m.pl.pos, m)).sort((a, b) => (b.stay ? 1 : 0) - (a.stay ? 1 : 0) || b.salary - a.salary);
  if (!list.length) return retire(m, w);
  SL.accept(adapter(m, w), list[0]);
  m.status = 'decided'; m.offer = null;
}
export function finishOffseason(w, members) {
  for (const m of members) if (m.status === 'off') autoDecide(m, w, members);
  startSeason(w);
  for (const m of members) if (m.status === 'decided') {
    m.status = 'active'; m.season = emptySeason(); m.cupSeason = emptySeason(); m.last = null; m.lastCup = null;
    m.pl.trainMul = 1; m.pl.clinic = false;
  }
}

// ----- 引退と次の世代 -----
export function retire(m, w) {
  const s = adapter(m, w);
  s.caps = m.caps; s.natGoals = m.natGoals;
  m.summary = SL.retire(s);
  addNews(w, `👋 ${m.summary.name}が${m.summary.retireAge}歳で引退。「${m.summary.title}」ランク${m.summary.letter}`);
  m.status = 'retired'; m.offer = null; m.pl.club = null;
  const sm = m.summary, R = w.records || (w.records = newWorldRecords());
  const row = { name: sm.name, years: `${sm.startYear}-${sm.endYear}`, gen: sm.gen, title: sm.title };
  pushTop(R.careerGoals, { ...row, v: sm.goals });
  pushTop(R.careerApps, { ...row, v: sm.apps });
  pushTop(R.careerScore, { ...row, v: sm.score, letter: sm.letter });
  // 所属したクラブごとのレジェンド（そのクラブでの出場数）
  const per = new Map();
  for (const h of m.history) { const x = per.get(h.clubId) || { apps: 0, goals: 0 }; x.apps += h.apps; x.goals += h.goals; per.set(h.clubId, x); }
  for (const [cid, x] of per) if (x.apps >= 10) pushTop(clubRec(w, cid).legends, { name: sm.name, apps: x.apps, goals: x.goals, v: x.apps });
  return m.summary;
}
export function nextGeneration(old, id, name, pos, w, members = []) {
  const sm = old.summary;
  const lineage = old.lineage.concat([{ gen: old.gen, name: sm.name, pos: sm.pos, title: sm.title, letter: sm.letter, score: sm.score, apps: sm.apps, goals: sm.goals, cs: sm.cs, years: `${sm.startYear}-${sm.endYear}` }]);
  const m = newMember(id, old.account, name, pos, { gen: old.gen + 1, lineage, bonus: SL.inheritBonus(sm), parent: { name: sm.name, title: sm.title } });
  m.draft = draftOffers(m, w, members);
  return m;
}

export function scoreNow(m, w) {
  if (m.summary) return m.summary.score;
  const s = adapter(m, w); s.caps = m.caps; s.natGoals = m.natGoals;
  // 今シーズンの成績も足して「いま」のスコアにする
  const T = m.totals, S = m.season;
  s.totals = { ...T, apps: T.apps + S.apps, goals: T.goals + S.goals, assists: T.assists + S.assists, cs: T.cs + S.cs, tackles: (T.tackles || 0) + (S.tackles || 0), inters: (T.inters || 0) + (S.inters || 0) };
  return SL.careerScore(s);
}

export { SL, ovr, POS, LEAGUES, SEASON_WEEKS, avg, pick };
