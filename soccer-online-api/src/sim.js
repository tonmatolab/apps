// ===== オンラインリーグのルール =====
// 1人用の soccer-life/core.js のルール（成長・衰え・評価・契約・引退）をそのまま使い、
// 「同じリーグに本物のプレイヤーが何人もいる」ところだけをここで扱う。
import SL from '../../soccer-life/sl.js'; // core.js と分割したファイル（称号・ミニゲーム）をまとめて読み込む

const { train, decay, newWorld, lambda, poisson, gauss, ri, chance, pick, clamp, roundRobin, rookieOffers, newPlayer, goalHow, assistHow, CLUB_SEED,
  trackRecords, healWeek, condDown, newCup, cupPair, cupFinish, newRecords } = SL._;
const { POS, GROW, LEAGUES, SEASON_WEEKS, mainStats, ovr, startChance } = SL;

// 休眠：これだけ来ていないプレイヤーは、オフの終わりにクラブの枠を空けて休眠にする（戻ってきたら空いているクラブを選び直す）
// オンラインの1日は、ゲームの中では1.6年ほど。来ないまま何年も試合に出つづけて枠をふさがないように、3日にする
export const DORMANT_MS = 3 * 24 * 3600000;
// 休眠のまま、これだけ来なかった人は引退にする（戻ってきたときに引退の記録を作り、次の世代から始める）
export const RETIRE_IDLE_MS = 30 * 24 * 3600000;
// 休眠・引退のまま、これだけ来ていない人は「しまっておく」（起動のたびに読み込まない。来たときに読み込む）
export const ARCHIVE_MS = 3 * 24 * 3600000;
// 登録したままクラブを選ばない人は、これだけたつと休眠にして定員の枠を空ける（毎節たしかめる）
// 作り直し（リセマラ）で捨てられたアカウントが枠をふさがないように1時間。普通は登録して数分で選ぶ。あとで来れば、また選べる
export const DRAFT_IDLE_MS = 1 * 3600000;
// ----- 時刻で決まる日程（日本時間）-----
// シーズンは毎日 5時と17時に開幕し、30分ごとに1節（18節＝9時間）。オフは 2〜5時・14〜17時（3時間＝6節分）。
// いちばん遊ばれる夜（19〜24時）は必ず試合中になる
export const SEASON_STARTS_JST = [5, 17];
const SLOT_MS = 30 * 60000, HOUR = 3600000, JST = 9 * HOUR;
// その時刻に「どこまで進んでいるべきか」：{ phase: 'season', week: 消化した節 } か { phase: 'off', left: オフの残り（節の数） }
export function clockTarget(now) {
  const t = now + JST, day = Math.floor(t / (24 * HOUR)) * 24 * HOUR;
  let start = -Infinity;
  for (const d of [day - 24 * HOUR, day]) for (const h of SEASON_STARTS_JST) { const s = d + h * HOUR; if (s <= t && s > start) start = s; }
  const slots = Math.floor((t - start) / SLOT_MS);
  if (slots < SL.SEASON_WEEKS) return { phase: 'season', week: slots };
  return { phase: 'off', left: Math.max(1, OFF_TICKS - (slots - SL.SEASON_WEEKS)) };
}
// 次の区切り（毎時 0分・30分）
export const nextSlot = (now) => (Math.floor(now / SLOT_MS) + 1) * SLOT_MS;
// 今のシーズン（またはオフ）が終わる時刻
export function phaseEndAt(now, phase) {
  const t = now + JST, day = Math.floor(t / (24 * HOUR)) * 24 * HOUR;
  const marks = phase === 'off' ? SEASON_STARTS_JST : SEASON_STARTS_JST.map((h) => h + 9); // オフの終わり＝開幕。シーズンの終わり＝開幕から9時間後
  let best = Infinity;
  for (const d of [day - 24 * HOUR, day, day + 24 * HOUR]) for (const h of marks) { const x = d + h * HOUR; if (x > t && x < best) best = x; }
  return best - JST;
}
export const OFF_TICKS = 6; // オフシーズンの長さ（節の何回分か。30分ごとなら3時間）。この間に契約を選ぶ。選ばなかった人は移籍方針で自動で決まる
// 1つのクラブに入れる本物のプレイヤーの数（強い人が1つのクラブに集まりすぎないように）
// 国内のクラブは14人まで（国内の枠が足りなくなったので12人から増やした）。欧州は12人のまま
export const CLUB_CAP = 14, CLUB_CAP_EU = 12, GK_CAP = 3, FW_CAP = 4;
export const capOf = (clubId) => (SL.isEU((CLUB_SEED[clubId] || {}).lg) ? CLUB_CAP_EU : CLUB_CAP); // 欧州と国内のあいだは入れかわらない（昇格・降格は欧州の中・国内の中だけ）ので、最初のリーグで決まる // 1クラブの本物のプレイヤーの上限（GK・FWは別に上限。先発の枠が少ないので）。名簿は22人のままで、そのぶんNPCが控え組に回る
export const POS_CAP = { GK: GK_CAP, FW: FW_CAP };
const XI = { GK: 1, DF: 4, MF: 4, FW: 2 }; // 先発の枠（4-4-2）
export const POP_BONUS = 6; // 「狙い目」のポジションで始めたときの才能のボーナス
// 年俸の上限（万円）。リーグごと
export const SALARY_CAP = { 0: 30000, 1: 8000, 2: 2000, 3: 1000, 4: 600, 5: 15000, 6: 9000 };
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
export const WORLD_VERSION = 4;
const WORLD_MIGRATIONS = {
  // v1→v2：クラブ名・略称・特徴を ID ごとに付け直す（今の所属リーグと強さはそのまま。経歴のクラブ名は当時のまま）
  1: (w) => { SL._.applyClubData(w.clubs); },
  // v2→v3：国内3部・4部（20クラブ）を足す。シーズン中なら、今の節から残りの日程を戦う。NPCは league.js が名簿に足す
  2: (w) => {
    const added = SL.extendClubs(w);
    if (added.length) addNews(w, `🆕 国内3部・4部ができた！ ${added.length}クラブが加わり、新しい選手が入れるようになった`);
  },
  // v3→v4：欧州2部・3部（20クラブ）を足す。シーズン中なら、今の節から残りの日程を戦う（このシーズンは昇格・降格なし）
  3: (w) => {
    const added = SL.extendClubs(w);
    if (added.length) addNews(w, `🆕 欧州2部・3部ができた！ ${added.length}クラブが加わり、欧州へ挑戦しやすくなった`);
  },
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
  if (!m.seenAt) m.seenAt = Date.now(); // 最後に来た時刻（休眠の判定。以前のデータは今を入れる）
  if (!m.col) { m.col = newOnlineCol(); if (m.status === 'retired' && m.summary) recordLife(m, w); }
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
  return humansAt(members, clubId, null, except) >= capOf(clubId) || (POS_CAP[pos] != null && humansAt(members, clubId, pos, except) >= POS_CAP[pos]);
}
// ポジションごとの空きと混み具合（新人が入れる国内のクラブで数える）
//   open：あと何人入れるか / crowd：本物のプレイヤーの数 ÷ 先発の枠の数 / label：激戦・ふつう・狙い目 / bonus：狙い目なら才能のボーナス
// 新人が入れるクラブ：国内の全クラブ＋欧州3部（国内が満員のときの受け皿。海外の育成枠として入る）
export const rookieClubs = (w) => w.clubs.filter((c) => !SL.isEU(c.lg) || c.lg === 6);
export function positionInfo(w, members) {
  const dom = rookieClubs(w), out = {};
  for (const pos of ['GK', 'DF', 'MF', 'FW']) {
    let open = 0, humans = 0;
    for (const c of dom) {
      const all = humansAt(members, c.id), mine = humansAt(members, c.id, pos);
      humans += mine;
      open += Math.max(0, Math.min(capOf(c.id) - all, POS_CAP[pos] != null ? POS_CAP[pos] - mine : Infinity));
    }
    const crowd = humans / (dom.length * XI[pos]);
    const label = open === 0 ? '満員' : crowd >= 1 ? '激戦' : crowd <= .5 ? '狙い目' : 'ふつう';
    out[pos] = { open, crowd: Math.round(crowd * 100) / 100, label, bonus: label === '狙い目' ? POP_BONUS : 0 };
  }
  return out;
}
function capSalary(w, o) { const cap = SALARY_CAP[w.clubs[o.club].lg]; if (o.salary > cap) { o.salary = cap; o.capped = true; } return o; }
export function standings(w, lg) {
  return w.clubs.filter((c) => c.lg === lg).map((c) => ({ c, t: w.table[c.id] })).sort(SL.tableOrder);
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
  const pl = newPlayer(name, pos, opt.bonus || 0, 18, opt.appeal || null);
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
    wc: m.wc, year: w.year, log: m.log, papers: [], news: [], family: { combo: 0, jointApps: 0, jointGoals: 0, hats: m.hats || 0 }, rival: null, mode: 'online',
    gen: m.gen, lineage: m.lineage, parent: m.parent, season: m.season, lastMatch: null,
    records: m.records || (m.records = newRecords()), phase: w.phase === 'season' ? 'season' : 'off',
  };
}
function trimLog(m) { if (m.log.length > 60) m.log.splice(0, m.log.length - 60); }

// 入団先の候補：満員のクラブは、同じリーグで強さが近い空きのあるクラブに差し替える
export function draftOffers(m, w, members = []) {
  const list = rookieOffers({ p: m.pl, clubs: w.clubs });
  const used = new Set();
  const out = list.map((o) => {
    if (!clubFull(members, o.club, m.pl.pos) && !used.has(o.club)) { used.add(o.club); return capSalary(w, o); }
    const base = w.clubs[o.club];
    const alt = w.clubs.filter((c) => c.lg === base.lg && !used.has(c.id) && !clubFull(members, c.id, m.pl.pos)).sort((a, b) => Math.abs(a.str - base.str) - Math.abs(b.str - base.str))[0];
    if (!alt) return null;
    used.add(alt.id);
    return capSalary(w, { ...o, club: alt.id });
  }).filter(Boolean);
  if (!out.length) { // オファーのリーグがどれも満員：空きのある国内のクラブから2つまで
    const o = SL.ovr(m.pl);
    for (const c of w.clubs.filter((x) => !SL.isEU(x.lg) && !clubFull(members, x.id, m.pl.pos)).sort((a, b) => a.str - b.str).slice(0, 2)) { // 弱いクラブから
      out.push(capSalary(w, { club: c.id, salary: SL._.wageFor(c, o, m.pl.fame), years: 3, rookie: true }));
    }
  }
  if (!out.length) { // 国内がどこも満員：欧州3部の弱いクラブが「育成枠」として受け入れる（出番は少なめ・年俸は国内並み）
    const o = SL.ovr(m.pl);
    for (const c of w.clubs.filter((x) => x.lg === 6 && !clubFull(members, x.id, m.pl.pos)).sort((a, b) => a.str - b.str).slice(0, 2)) {
      out.push(capSalary(w, { club: c.id, salary: Math.min(600, SL._.wageFor(c, o, m.pl.fame)), years: 3, rookie: true, youth: true }));
    }
  }
  return out;
}
export function join(m, w, i, members = []) {
  const o = m.draft[i]; if (!o) return 'bad_choice';
  if (clubFull(members, o.club, m.pl.pos, m)) return 'club_full';
  SL.joinClub(adapter(m, w), o);
  if (o.youth && !m.history.length) m.youthStart = true;
  addNews(w, `🆕 ${m.pl.name}（${m.pl.pos}）が${w.clubs[o.club].name}に入団${m.gen > 1 ? `。${m.gen}代目` : ''}`);
  m.draft = null; m.season = emptySeason(); m.cupSeason = emptySeason();
  if (m.debutYear == null) m.debutYear = w.year; // 休眠から戻ったときは最初のデビューの年のまま
  m.returning = false;
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
        if (chance(.012 + (p.fatigue > 70 ? .03 : 0))) {
          p.injury = Math.max(p.injury, ri(1, 5)); m.note = '試合中に接触プレーで負傷';
          if (p.injury >= 4) m.log.push({ y: w.year, age: p.age, k: 'injury', t: `${w.year}年、試合中の接触プレーで負傷。全治${p.injury}週の離脱を経験したが、そこから復帰した。` });
        }
        if (r.goals >= 3) m.hats = (m.hats || 0) + 1;
        p.fame = clamp(p.fame + r.goals * .6 + r.assists * .3 + (r.rating >= 8 ? 1 : 0) + (side.c.lg === 0 ? .2 : SL.isEU(side.c.lg) ? .1 : 0), 0, 100);
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
  // 冬の移籍期間：第7節が終わったらオファーが届き、第10節が終わるまで選べる（選ばなければ残留）
  if (w.week === SL.WINTER.open) {
    let n = 0;
    for (const m of active) {
      const wo = SL.winterOffers(adapter(m, w), { full: (x) => clubFull(members, x.id, m.pl.pos, m) });
      m.winter = wo ? { ...wo, list: wo.list.map((o) => capSalary(w, o)) } : null;
      if (wo) n++;
    }
    addNews(w, `❄️ 冬の移籍期間が始まった（第${SL.WINTER.close}節まで）。${n}人にシーズン途中のオファーが届いた`);
  }
  if (w.week >= SL.WINTER.close) for (const m of members) if (m.winter) m.winter = null;
  return store;
}
// 冬のオファーを受ける（i：何番目か）。満員なら 'club_full'
export function winterMove(m, w, i, members = []) {
  const o = m.winter && m.winter.list[i];
  if (!o) return 'bad_choice';
  if (clubFull(members, o.club, m.pl.pos, m)) return 'club_full';
  const from = w.clubs[m.pl.club];
  SL.accept(adapter(m, w), o);
  m.winterN = (m.winterN || 0) + 1;
  m.log.push({ y: w.year, age: m.pl.age, k: 'winter', t: `${w.year}年の冬、シーズンの途中で${from.name}から${w.clubs[o.club].name}へ移籍。` });
  addNews(w, `❄️ ${m.pl.name}が冬の移籍で${w.clubs[o.club].name}へ（${from.name}から）`);
  m.winter = null;
  return null;
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
  addNews(w, `🏆 ${w.year}年の優勝：${LEAGUES.filter((L) => w.clubs.some((c) => c.lg === L.id)).map((L) => `${L.short} ${standings(w, L.id)[0].c.city}`).join('／')}`);
  if (w.cup && w.cup.winner != null) clubRec(w, w.cup.winner).cups.push(w.year);

  // 昇格・降格とクラブ力の変動
  const mv = SL._.leagueMoves(w.clubs, (lg) => standings(w, lg).map((x) => x.c), w.partialLeagues || []);
  delete w.partialLeagues;
  for (const m of active) {
    const c = w.clubs[m.pl.club];
    if (mv.up.has(c) && m.season.apps >= 5) { const a = `${LEAGUES[c.lg].short}昇格`; m.trophies.push(`${w.year} ${a}`); m.seasonAwards.push(a); }
  }
  SL._.driftClubs(w.clubs, mv);
  w.history.push({ year: w.year, champions, moves: mv.text, awards: awRec });
  if (w.history.length > 30) w.history.shift();

  // 代表（W杯は全員で同じ大会にしたいので、最小構成ではまだやらない）
  for (const m of active) {
    const lgN = w.clubs[m.pl.club].lg, o = ovr(m.pl), line = 70 - (lgN === 0 ? 3 : SL.isEU(lgN) ? 2 : 0);
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
  // オンラインだけ：有名選手は引退から10〜20年後に転生する（待ち行列は世界の記録に残す）
  const rep = SL.npcOffseason(npcs, w.clubs, stats, w.year, R2.npcLegends || (R2.npcLegends = []), [], { rebirth: R2.rebirth || (R2.rebirth = []) });
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
    const fromEU = m.pl.club != null && SL.isEU(w.clubs[m.pl.club].lg);
    SL.accept(adapter(m, w), offer);
    if (!offer.stay) addNews(w, `✈️ ${m.pl.name}が${w.clubs[offer.club].name}へ移籍${SL.isEU(w.clubs[offer.club].lg) && !fromEU ? '（欧州挑戦！）' : ''}`);
  }
  m.status = 'decided'; m.offer = null; trimLog(m);
  return null;
}
// オフに自分から移籍を希望する（1回だけ）。移籍のオファーを出し直してもらう（満員のクラブは外す）
export function requestTransfer(m, w, members = []) {
  if (m.status !== 'off' || !m.offer || m.offer.forced) return 'not_now';
  if (m.offer.requested) return 'already';
  const s = adapter(m, w);
  const fresh = SL.offers(s, { request: true });
  m.offer.res.transfers = fresh.transfers.filter((t) => !clubFull(members, t.club, m.pl.pos, m)).map((t) => capSalary(w, t));
  m.offer.requested = true;
  m.pl.fame = clamp(m.pl.fame - 1, 0, 100);
  m.log.push({ y: w.year, age: m.pl.age, k: 'request', t: `${w.year}年オフ、${w.clubs[m.pl.club].name}に移籍を希望した。` });
  trimLog(m);
  return null;
}
// 休眠から戻ってきた：入団の画面からやり直す（能力・経歴・お金はそのまま）
export function wake(m, w, members = []) {
  if (m.status !== 'dormant') return false;
  m.status = 'draft'; m.returning = m.prevClub != null; // 一度もクラブに入らずに休眠した人には「おかえりなさい」を出さない
  m.draft = draftOffers(m, w, members);
  addNews(w, `👋 ${m.pl.name}が休眠から戻ってきた`);
  return true;
}
// クラブを選ばないまま長くたった人を休眠にする。休眠にした人を返す（保存は呼び出し側）
export function sweepIdleDrafts(w, members, now = Date.now()) {
  const out = members.filter((m) => m.status === 'draft' && now - (m.seenAt || m.created || now) > DRAFT_IDLE_MS);
  for (const m of out) { m.status = 'dormant'; m.prevClub = null; m.dormantSince = w.year; m.returning = false; }
  if (out.length) addNews(w, `💤 クラブを選ばないまま1時間たった${out.length}人が休眠に入り、定員の枠が空いた`);
  return out;
}
// ----- 移籍方針：オフに選ばなかったときの決め方（いつでも変えられる） -----
export const POLICY = {
  auto: { name: 'おまかせ', icon: '🤖', desc: '出番・強さ・年俸のバランスで選ぶ' },
  minutes: { name: '出番重視', icon: '⚽', desc: '先発で出られるクラブを選ぶ' },
  money: { name: '年俸重視', icon: '💰', desc: 'いちばん年俸の高いクラブを選ぶ' },
  top: { name: '上を目指す', icon: '🏆', desc: '強いクラブ・上のリーグを選ぶ' },
  stay: { name: '残留優先', icon: '🏠', desc: 'できるだけ今のクラブに残る' },
};
// 契約が残っていても、方針に合うオファーがあれば移るか
export const MOVE_SWITCH = { bench: '控えのときだけ', always: 'する', never: 'しない' };
const LG_RANK = { 0: 7, 5: 6, 6: 5, 1: 4, 2: 3, 3: 2, 4: 1 };
// そのクラブでの立ち位置（先発に入れるか・何番手か）。npcs がなければ総合力とクラブの強さから
function seatAt(m, w, clubId, members, npcs) {
  const o = ovr(m.pl);
  if (!npcs) { const x = SL.startChanceOvr(o, w.clubs[clubId], m.pl.age); return { starter: x > .45, rank: x > .45 ? 1 : 9 }; }
  const hum = members.filter((x) => x !== m && x.pl.club === clubId && x.status !== 'retired' && x.status !== 'draft' && x.status !== 'dormant').map((x) => ({ pos: x.pl.pos, ovr: ovr(x.pl) }));
  return SL.depthOf(npcs, clubId, { pos: m.pl.pos, ovr: o }, hum);
}
// 方針ごとの点数（大きいほど良い）と、契約中に移るのに必要な差
function policyValue(pol, cand, seat, club, cur) {
  if (pol === 'money') return cand.salary;
  if (pol === 'minutes') return (seat.starter ? 1000 : 0) - seat.rank * 10 + cand.salary / 1e4;
  if (pol === 'top') return LG_RANK[club.lg] * 1000 + club.str + cand.salary / 1e4;
  return (seat.starter ? 40 : 0) + LG_RANK[club.lg] * 15 + club.str * .5 + 10 * Math.log2(Math.max(1, cand.salary) / Math.max(1, cur.salary));
}
const MARGIN = { money: (cur) => cur * .1, minutes: () => 1000, top: () => 3, auto: () => 10 };
// オフに選ばなかったときに、どうなるか（自動の決定と、画面の「このままだと」の両方で使う）
//   { kind: 'retire' } / { kind: 'stay', offer? } / { kind: 'move', offer }
export function planAuto(m, w, members, npcs = null) {
  const o = m.offer, res = o.res, pol = POLICY[m.policy] ? m.policy : 'auto', sw = MOVE_SWITCH[m.sw] ? m.sw : 'bench';
  if (o.forced) return { kind: 'retire' };
  const list = offerList(m).filter((x) => x.stay || !clubFull(members, x.club, m.pl.pos, m));
  const free = res.expiring || res.released;
  if (!free) {
    const here = seatAt(m, w, m.pl.club, members, npcs);
    if (pol === 'stay' || sw === 'never' || (sw === 'bench' && here.starter)) return { kind: 'stay' };
    const cur = { club: m.pl.club, salary: m.pl.salary };
    const curV = policyValue(pol, cur, here, w.clubs[m.pl.club], cur);
    let best = null, bestV = curV + MARGIN[pol](curV);
    for (const t of list) {
      if (t.stay) continue;
      const v = policyValue(pol, t, seatAt(m, w, t.club, members, npcs), w.clubs[t.club], cur);
      if (v >= bestV) { best = t; bestV = v; }
    }
    return best ? { kind: 'move', offer: best } : { kind: 'stay' };
  }
  if (!list.length) return { kind: 'retire' };
  if (pol === 'stay') { const x = list.slice().sort((a, b) => (b.stay ? 1 : 0) - (a.stay ? 1 : 0) || b.salary - a.salary)[0]; return { kind: x.stay ? 'stay' : 'move', offer: x }; }
  const cur = { club: m.pl.club, salary: m.pl.salary };
  let best = null, bestV = -Infinity;
  for (const t of list) { const v = policyValue(pol, t, seatAt(m, w, t.club, members, npcs), w.clubs[t.club], cur); if (v > bestV) { best = t; bestV = v; } }
  return { kind: best.stay ? 'stay' : 'move', offer: best };
}
function autoDecide(m, w, members, npcs) {
  const plan = planAuto(m, w, members, npcs);
  if (plan.kind === 'retire') return retire(m, w);
  if (plan.offer) {
    SL.accept(adapter(m, w), plan.offer);
    if (plan.kind === 'move') {
      const P = POLICY[m.policy] || POLICY.auto;
      addNews(w, `🔁 ${m.pl.name}が${w.clubs[plan.offer.club].name}へ移籍（移籍方針：${P.icon}${P.name}）`);
    }
  }
  m.status = 'decided'; m.offer = null; trimLog(m);
}
export function finishOffseason(w, members, now = Date.now(), npcs = null) {
  for (const m of members) if (m.status === 'off') autoDecide(m, w, members, npcs);
  // 長く来ていないプレイヤーは休眠：クラブの枠を空ける。本人の時間も止まる（年をとらない・試合に出ない）
  const slept = [];
  for (const m of members) if (m.status === 'decided' && now - (m.seenAt || now) > DORMANT_MS) {
    m.status = 'dormant'; m.prevClub = m.pl.club; m.pl.club = null; m.dormantSince = w.year; slept.push(m.pl.name);
  }
  if (slept.length === 1) addNews(w, `💤 ${slept[0]}が休眠に入った（戻ってきたら、空いているクラブから選び直せる）`);
  else if (slept.length) addNews(w, `💤 3日以上来ていない${slept.length}人が休眠に入り、クラブの枠が空いた（戻ってきたら選び直せる）`);
  startSeason(w);
  for (const m of members) if (m.status === 'decided') {
    m.status = 'active'; m.season = emptySeason(); m.cupSeason = emptySeason(); m.last = null; m.lastCup = null;
    m.pl.trainMul = 1; m.pl.clinic = false;
  }
}

// ----- 称号図鑑（アカウントごと。世代をまたいで集まる） -----
// t：{ 称号ID: [取った回数, 最初に取った世代, その年, その選手の名前] }、clubs：{ クラブID: シーズン数 }、lives：引退した人数、last：いちばん新しい引退で増えたもの
export function newOnlineCol() { return { v: 1, t: {}, clubs: {}, lives: 0, last: null }; }
// この人生のオンラインの文脈（オンライン専用の称号の判定に使う）
export function onlineContext(m, w, famClubs) {
  const h = m.history, per = new Map();
  for (const x of h) per.set(x.clubId, (per.get(x.clubId) || 0) + (x.apps || 0));
  const years = new Set(h.map((x) => x.year)), R = w.records || {};
  const inRec = (list) => (list || []).some((r) => r.name === m.pl.name && years.has(r.year));
  return {
    lgs: new Set(h.map((x) => x.lg)), first: h[0] ? h[0].lg : null, youth: !!m.youthStart, motw: m.motw || 0, winter: m.winterN || 0,
    maxClubApps: Math.max(0, ...per.values()), record: inRec(R.seasonGoals) || inRec(R.seasonAssists), famClubs,
  };
}
// 引退した人生を図鑑に記録する（オンライン専用の称号も、ここで summary.titles に足す）。1つの人生で1回だけ
export function recordLife(m, w, col = m.col || (m.col = newOnlineCol())) {
  const sm = m.summary;
  if (!sm || sm.colDone) return [];
  const fam = new Set(Object.keys(col.clubs).map(Number).concat(m.history.map((x) => x.clubId)));
  sm.titles = [...new Set((sm.titles || []).concat(SL.onlineTitles(onlineContext(m, w, fam))))];
  const fresh = [];
  for (const id of sm.titles) {
    if (col.t[id]) col.t[id][0]++;
    else { col.t[id] = [1, m.gen, sm.endYear || w.year, sm.name]; fresh.push(id); }
  }
  for (const x of m.history) col.clubs[x.clubId] = (col.clubs[x.clubId] || 0) + 1;
  col.lives++;
  col.last = { gen: m.gen, name: sm.name, titles: fresh };
  sm.colDone = true;
  return fresh;
}

// ----- 引退と次の世代 -----
export function retire(m, w) {
  const s = adapter(m, w);
  s.caps = m.caps; s.natGoals = m.natGoals;
  m.summary = SL.retire(s);
  addNews(w, `👋 ${m.summary.name}が${m.summary.retireAge}歳で引退。「${m.summary.title}」ランク${m.summary.letter}`);
  m.status = 'retired'; m.offer = null; m.pl.club = null;
  recordLife(m, w);
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
// しまっておいた人が戻ってきたとき：休眠のまま長く来なかった人は、ここで引退にする（引退の記録を作る）
export function returnFromIdle(m, w, now = Date.now()) {
  if (m.status !== 'dormant' || now - (m.seenAt || now) <= RETIRE_IDLE_MS) return false;
  if (m.prevClub != null && m.pl.club == null) m.pl.club = m.prevClub; // 引退の記録（最後のクラブ）用。すぐ外す
  retire(m, w);
  m.idleRetired = true; // 画面で「長く来なかったので引退した」と出す
  return true;
}
// 名前が同じかどうか（全角・半角、大文字・小文字、空白のちがいは同じとみなす）
export const nameKey = (s) => String(s || '').normalize('NFKC').replace(/[\s・._\-]+/g, '').toLowerCase();
export const SAME_NAME_MAX = 2; // 同じ名前の選手は2人まで（休眠・引退の人は数えない）
export function nameCrowded(members, name, except = null) {
  const k = nameKey(name); let n = 0;
  for (const m of members) if (m !== except && m.status !== 'dormant' && m.status !== 'retired' && nameKey(m.pl.name) === k) n++;
  return n >= SAME_NAME_MAX;
}
export function nextGeneration(old, id, name, pos, w, members = [], appeal = null, extraBonus = 0) {
  const sm = old.summary;
  const lineage = old.lineage.concat([{ gen: old.gen, name: sm.name, pos: sm.pos, title: sm.title, letter: sm.letter, score: sm.score, apps: sm.apps, goals: sm.goals, cs: sm.cs, years: `${sm.startYear}-${sm.endYear}` }]);
  const m = newMember(id, old.account, name, pos, { gen: old.gen + 1, lineage, bonus: SL.inheritBonus(sm) + extraBonus, parent: { name: sm.name, title: sm.title }, appeal });
  m.col = old.col || newOnlineCol(); // 称号図鑑はアカウント（一族）で集める
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
