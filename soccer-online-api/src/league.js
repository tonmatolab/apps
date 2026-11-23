// ===== リーグ本体（Durable Object） =====
// リーグ全体を1つのオブジェクトが持ち、アラームで一定時間ごとに1節ずつ進める。
// 無料枠の「1日の書き込み行数」を守るため、書き込みは「1節につき 世界1行＋現役プレイヤー1人1行」だけ。
// 読み込みは起動時に全部メモリへ載せ、以後のリクエストはメモリから返す。
import { DurableObject } from 'cloudflare:workers';
import * as G from './sim.js';

const MAX_PLAYERS = 1500;      // 無料枠を守るための上限（試合ごとに全員を保存するので、1日の書き込み10万行に収まる人数）
const SIGNUP_PER_HOUR = 5;     // 同じIPからの新規登録の上限
const NG_WORDS = ['死ね', 'しね', '殺す', 'ころす', 'fuck', 'shit', 'ちんこ', 'まんこ', 'ちんぽ', 'sex'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function cleanName(raw) {
  let s = String(raw || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim();
  s = [...s].slice(0, 12).join('');
  if (!s) return null;
  const low = s.toLowerCase();
  return NG_WORDS.some((w) => low.includes(w)) ? null : s;
}
function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  const c = [...b].map((x) => CODE_CHARS[x % CODE_CHARS.length]).join('');
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}-${c.slice(12, 16)}`;
}
async function sha(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s).toUpperCase().replace(/[^A-Z0-9]/g, '')));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const err = (e, status = 400) => json({ error: e }, status);

export class League extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.signups = new Map();
    // 次の回の賭けは、各プレイヤーのデータ（m.rlBet）に保存する。
    // Durable Object は使われていないとメモリから消えるので、メモリだけに持つと賭けが消えてしまう
    ctx.blockConcurrencyWhile(() => this.boot());
  }

  async boot() {
    this.sql.exec('CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, hash TEXT UNIQUE, created INTEGER)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, account TEXT, active INTEGER, data TEXT)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS world (k TEXT PRIMARY KEY, v TEXT)');
    const row = this.sql.exec("SELECT v FROM world WHERE k = 'w'").toArray()[0];
    this.w = G.migrateWorld(row ? JSON.parse(row.v) : G.newWorldState());
    this.accounts = new Map(); // hash -> account id
    for (const r of this.sql.exec('SELECT id, hash FROM accounts')) this.accounts.set(r.hash, r.id);
    this.members = new Map(); // player id -> member
    this.byAccount = new Map(); // account -> player id（現役中または引退直後の1人）
    for (const r of this.sql.exec('SELECT id, account, data FROM players WHERE active = 1')) {
      const m = JSON.parse(r.data); this.members.set(r.id, m); this.byAccount.set(r.account, r.id);
      if (m.pl.potLo == null) Object.assign(m.pl, G.SL._.potRange(m.pl.pot));
      if (m.status !== 'draft' && m.status !== 'retired' && m.debutYear == null) m.debutYear = (m.history[0] && m.history[0].year) || this.w.year;
    }
    // 台を初めて作ったらすぐ保存する（保存しないと、起き直すたびに次の時刻が先送りされて回らない）
    if (!this.w.rl) { this.w.rl = G.newTable(Date.now(), this.rlMs()); this.saveWorld(); }
    if (!row) this.saveWorld();
    if (!this.w.nextAt) this.w.nextAt = Date.now() + this.tickMs();
    await this.armAlarm();
  }

  tickMs() { return Math.max(1, Number(this.env.TICK_MINUTES || 60)) * 60000; }
  rlMs() { return Math.max(.1, Number(this.env.RL_MINUTES || 3)) * 60000; }
  // アラームは1つだけなので「次の試合」と「次のルーレット」の早いほうに合わせる
  async armAlarm() { await this.ctx.storage.setAlarm(Math.min(this.w.nextAt, this.w.rl.nextAt)); }
  saveWorld() { this.sql.exec("INSERT OR REPLACE INTO world (k, v) VALUES ('w', ?)", JSON.stringify(this.w)); }
  saveMember(m, active = 1) { this.sql.exec('INSERT OR REPLACE INTO players (id, account, active, data) VALUES (?, ?, ?, ?)', m.id, m.account, active, JSON.stringify(m)); }

  async alarm() {
    const now = Date.now();
    if (now >= this.w.rl.nextAt - 500) this.rlSpin();
    if (now >= this.w.nextAt - 500) { this.tick(); this.w.nextAt = now + this.tickMs(); this.saveWorld(); }
    await this.armAlarm();
  }

  // ルーレットを1回まわし、賭けている全員を同じ出目で精算する。
  // 書き込むのは「賭けていた人」と「台の状態（世界の1行）」だけ。
  rlSpin() {
    const T = this.w.rl, num = G.SL._.ri(0, 36), round = T.round + 1, winners = [];
    let players = 0, totalBet = 0;
    for (const m of this.members.values()) {
      if (!m.rlBet) continue;
      const bets = m.rlBet.bets; m.rlBet = null;
      if (m.status === 'draft' || m.status === 'retired') { this.saveMember(m); continue; }
      const e = G.SL.rlCheck(m.pl, bets);
      if (e) { m.rlLast = { round, num, void: e, total: bets.reduce((x, b) => x + b.a, 0) }; this.saveMember(m); continue; } // お金が減っていたら、その賭けは無効
      const r = G.SL.resolveRoulette(m.pl, bets, num);
      m.rlLast = { round, num, net: r.net, total: r.total, back: r.back, results: r.results };
      players++; totalBet += r.total;
      if (r.net >= 500) G.addNews(this.w, `🎰 ${m.pl.name}がルーレットで+${r.net.toLocaleString()}万円！（${num}）`);
      winners.push({ name: m.pl.name, net: r.net });
      this.saveMember(m);
    }
    T.round = round;
    T.hist.unshift(num); if (T.hist.length > 20) T.hist.length = 20;
    T.last = { round, num, color: G.SL.rlColor(num), at: Date.now(), players, totalBet, winners: winners.filter((x) => x.net > 0).sort((a, b) => b.net - a.net).slice(0, 5) };
    T.nextAt = Date.now() + this.rlMs();
    this.saveWorld(); // 回の番号と次の時刻を残す（1日480行ほど）
  }
  // PKは1節に1回（節が進むと新しく挑戦できる）
  pkKey() { const w = this.w; return w.season + '-' + w.phase + '-' + w.week + '-' + w.offLeft; }
  // ログインボーナス：日本時間で1日1回。連続日数で増える（1日目20万円、1日ごとに+10万円、7日目以降は80万円）
  loginBonus(m) {
    if (m.status === 'draft' || m.status === 'retired') return null;
    const day = (t) => new Date(t + 9 * 3600000).toISOString().slice(0, 10);
    const today = day(Date.now()), yest = day(Date.now() - 86400000);
    if (m.loginDay === today) return null;
    m.loginStreak = m.loginDay === yest ? (m.loginStreak || 0) + 1 : 1;
    m.loginDay = today;
    const amount = 20 + Math.min(6, m.loginStreak - 1) * 10;
    m.pl.money += amount;
    this.saveMember(m);
    return { amount, streak: m.loginStreak };
  }
  betCount() { let n = 0; for (const m of this.members.values()) if (m.rlBet) n++; return n; }
  tableView(m) {
    const T = this.w.rl;
    return {
      now: Date.now(), nextAt: T.nextAt, round: T.round + 1, intervalMin: this.rlMs() / 60000, last: T.last, hist: T.hist,
      players: this.betCount(), myBets: m && m.rlBet ? m.rlBet.bets : [], myLast: m ? m.rlLast || null : null, money: m ? m.pl.money : null,
    };
  }

  // 1節すすめる（オフシーズン中はオフの残りを1つ減らす）
  tick() {
    const w = this.w, all = [...this.members.values()];
    if (w.phase === 'season') {
      G.playMatchday(w, all);
      if (w.week >= G.SEASON_WEEKS) G.endSeason(w, all);
      for (const m of all) if (m.status === 'active' || m.status === 'off') this.saveMember(m);
    } else {
      w.offLeft--;
      if (w.offLeft <= 0) { G.finishOffseason(w, all); for (const m of all) this.saveMember(m); }
    }
    this.saveWorld();
  }

  async me(req) {
    const code = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!code) return null;
    const acc = this.accounts.get(await sha(code));
    if (!acc) return null;
    return this.members.get(this.byAccount.get(acc)) || null;
  }

  async fetch(req) {
    const url = new URL(req.url), path = url.pathname.replace(/^\/api/, '');
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    try {
      if (req.method === 'GET' && path === '/public') return json(this.publicView());
      // 全国ランキング（ログインしていれば自分の順位も返す）
      if (req.method === 'GET' && path === '/rankings') return json(this.rankingsView(await this.me(req)));
      if (req.method === 'POST' && path === '/signup') return this.signup(req, body);
      if (req.method === 'POST' && path === '/dev/tick') {
        if (this.env.DEV !== '1') return err('not_found', 404);
        const n = Math.min(40, Number(body.n) || 1); for (let i = 0; i < n; i++) this.tick();
        return json({ ok: true, world: this.worldView() });
      }
      if (req.method === 'POST' && path === '/dev/spin') {
        if (this.env.DEV !== '1') return err('not_found', 404);
        this.rlSpin(); await this.armAlarm(); return json({ ok: true, last: this.w.rl.last });
      }
      if (req.method === 'GET' && path === '/casino') return json(this.tableView(await this.me(req)));
      const m = await this.me(req);
      if (!m) return err('unauthorized', 401);
      if (req.method === 'GET' && path === '/state') {
        const bonus = this.loginBonus(m);
        return json({ ...this.stateView(m), bonus });
      }
      // PK戦チャレンジ：始める（キーパーの飛ぶ方向5本分をサーバーで決めて保存）
      if (req.method === 'POST' && path === '/pk/start') {
        if (m.status === 'draft' || m.status === 'retired') return err('not_now');
        const key = this.pkKey();
        if (m.pk && m.pk.key === key && m.pk.done) return err('pk_done');
        if (!m.pk || m.pk.key !== key) { m.pk = { key, dives: Array.from({ length: G.SL.PK.kicks }, () => G.SL.pkDive()), kicks: [], done: false }; this.saveMember(m); }
        return json({ kicks: m.pk.kicks.length, goals: m.pk.kicks.filter((x) => x.goal).length });
      }
      // 1本蹴る。5本目で賞金を払って保存
      if (req.method === 'POST' && path === '/pk/kick') {
        const pk = m.pk;
        if (!pk || pk.key !== this.pkKey() || pk.done) return err('not_now');
        const k = { dir: body.dir, high: body.high === true, power: Number(body.power) };
        if (!G.SL.pkCheckKick(k)) return err('bad_kick');
        const r = G.SL.pkResult(k, pk.dives[pk.kicks.length]);
        pk.kicks.push({ ...k, goal: r.goal });
        let reward = null;
        if (pk.kicks.length >= G.SL.PK.kicks) {
          pk.done = true;
          const goals = pk.kicks.filter((x) => x.goal).length;
          reward = G.SL.pkReward(goals); m.pl.money += reward;
          if (goals === G.SL.PK.kicks) G.addNews(this.w, `⚽ ${m.pl.name}がPKチャレンジで5本全部成功！`);
          this.saveMember(m);
        }
        return json({ ...r, n: pk.kicks.length, goals: pk.kicks.filter((x) => x.goal).length, reward, money: m.pl.money });
      }
      if (req.method === 'POST' && path === '/join') {
        if (m.status !== 'draft') return err('not_now');
        const e = G.join(m, this.w, Number(body.i), [...this.members.values()]); if (e) return err(e);
        this.saveMember(m); return json(this.stateView(m));
      }
      // 次の回への賭けを置く（[] なら取り消し）。賭けはプレイヤーのデータに保存し、お金は回った瞬間に動く
      if (req.method === 'POST' && path === '/casino/bet') {
        if (m.status === 'draft' || m.status === 'retired') return err('not_now');
        const bets = Array.isArray(body.bets) ? body.bets.map((b) => ({ k: String(b && b.k), a: Number(b && b.a) })) : [];
        if (!bets.length) { if (m.rlBet) { m.rlBet = null; this.saveMember(m); } return json(this.tableView(m)); }
        const e = G.SL.rlCheck(m.pl, bets); if (e) return err(e);
        m.rlBet = { bets, at: Date.now() };
        this.saveMember(m);
        return json(this.tableView(m));
      }
      if (req.method === 'POST' && path === '/buy') {
        if (m.status === 'draft' || m.status === 'retired') return err('not_now');
        const r = G.SL.buy(G.adapter(m, this.w), String(body.id || ''));
        if (r.error) return err(r.error);
        this.saveMember(m); return json({ ok: true, text: r.text, state: this.stateView(m) });
      }
      if (req.method === 'POST' && path === '/training') {
        if (!(body.k in G.SL.TRAINING) || (body.k === 'gk' && m.pl.pos !== 'GK')) return err('bad_training');
        m.training = body.k; this.saveMember(m); return json({ ok: true });
      }
      if (req.method === 'POST' && path === '/decide') {
        const e = G.decide(m, this.w, body.choice, [...this.members.values()]); if (e) return err(e);
        this.saveMember(m); return json(this.stateView(m));
      }
      if (req.method === 'POST' && path === '/nextgen') {
        if (m.status !== 'retired') return err('not_now');
        const name = cleanName(body.name); if (!name) return err('bad_name');
        if (!G.POS[body.pos]) return err('bad_pos');
        const nm = G.nextGeneration(m, crypto.randomUUID(), name, body.pos, this.w, [...this.members.values()]);
        this.saveMember(m, 0); this.members.delete(m.id);
        this.members.set(nm.id, nm); this.byAccount.set(nm.account, nm.id); this.saveMember(nm);
        return json(this.stateView(nm));
      }
      return err('not_found', 404);
    } catch (e) {
      console.error(e && e.stack || e);
      return err('server_error', 500);
    }
  }

  async signup(req, body) {
    const name = cleanName(body.name); if (!name) return err('bad_name');
    if (!G.POS[body.pos]) return err('bad_pos');
    if (this.members.size >= MAX_PLAYERS) return err('full', 503);
    const ip = req.headers.get('CF-Connecting-IP') || 'local';
    const now = Date.now(), hits = (this.signups.get(ip) || []).filter((t) => now - t < 3600000);
    if (hits.length >= SIGNUP_PER_HOUR) return err('too_many', 429);
    hits.push(now); this.signups.set(ip, hits);
    const code = newCode(), hash = await sha(code), acc = crypto.randomUUID();
    this.sql.exec('INSERT INTO accounts (id, hash, created) VALUES (?, ?, ?)', acc, hash, now);
    this.accounts.set(hash, acc);
    const m = G.newMember(crypto.randomUUID(), acc, name, body.pos);
    m.draft = G.draftOffers(m, this.w, [...this.members.values()]);
    this.members.set(m.id, m); this.byAccount.set(acc, m.id); this.saveMember(m);
    return json({ code, state: this.stateView(m) });
  }

  // ----- 画面に返す形 -----
  worldView() {
    const w = this.w;
    return { year: w.year, season: w.season, week: w.week, weeks: G.SEASON_WEEKS, phase: w.phase, offLeft: w.offLeft, nextAt: w.nextAt, now: Date.now(), tickMin: this.tickMs() / 60000, players: this.members.size };
  }
  clubsView() {
    const count = new Map();
    for (const m of this.members.values()) if (m.pl.club != null && m.status !== 'retired') count.set(m.pl.club, (count.get(m.pl.club) || 0) + 1);
    return this.w.clubs.map((c) => ({ id: c.id, name: c.name, city: c.city, lg: c.lg, str: c.str, color: c.color, humans: count.get(c.id) || 0, cap: G.CLUB_CAP }));
  }
  ranking(lg, key) {
    return [...this.members.values()].filter((m) => m.status !== 'retired' && m.status !== 'draft' && m.pl.club != null && (lg == null || this.w.clubs[m.pl.club].lg === lg) && m.season[key] > 0)
      .sort((a, b) => b.season[key] - a.season[key] || b.season.apps - a.season.apps).slice(0, 10)
      .map((m) => ({ name: m.pl.name, club: this.w.clubs[m.pl.club].name, pos: m.pl.pos, v: m.season[key] }));
  }
  // 現役のプレイヤー全員を比べる全国ランキング。メモリ上のデータから計算するだけで、書き込みはしない
  rankingsView(me) {
    const w = this.w;
    const act = [...this.members.values()].filter((m) => m.status !== 'draft' && m.status !== 'retired' && m.pl.club != null);
    const build = (val, filter = () => true) => {
      const all = act.filter(filter).map((m) => ({ m, v: val(m) })).sort((a, b) => b.v - a.v || b.m.season.apps - a.m.season.apps);
      const top = all.slice(0, 20).map(({ m, v }) => ({ name: m.pl.name, pos: m.pl.pos, age: m.pl.age, gen: m.gen, club: w.clubs[m.pl.club].name, v, me: m === me }));
      const i = me ? all.findIndex((x) => x.m === me) : -1;
      return { top, total: all.length, mine: i >= 0 ? { rank: i + 1, v: all[i].v } : null };
    };
    const ovrOf = (m) => G.ovr(m.pl);
    return {
      year: w.year, week: w.week,
      score: build((m) => G.scoreNow(m, w)),
      ovr: build(ovrOf),
      FW: build(ovrOf, (m) => m.pl.pos === 'FW'),
      MF: build(ovrOf, (m) => m.pl.pos === 'MF'),
      DF: build(ovrOf, (m) => m.pl.pos === 'DF'),
      GK: build(ovrOf, (m) => m.pl.pos === 'GK'),
      rating: build((m) => G.avg(m.season.ratings), (m) => m.season.apps >= 10),
      salary: build((m) => m.pl.salary),
      money: build((m) => m.pl.money),
    };
  }

  publicView() {
    return { world: this.worldView(), scorers: this.ranking(null, 'goals'), motw: this.w.motw || null, news: (this.w.news || []).slice(0, 8), last: this.w.last ? { week: this.w.last.week, year: this.w.last.year } : null };
  }
  stateView(m) {
    const w = this.w, p = m.pl, lg = p.club != null ? w.clubs[p.club].lg : 1;
    const tables = G.LEAGUES.map((L) => G.standings(w, L.id).map((x) => ({ id: x.c.id, ...x.t })));
    const mates = p.club == null ? [] : [...this.members.values()].filter((x) => x !== m && x.pl.club === p.club && x.status !== 'retired' && x.status !== 'draft')
      .map((x) => ({ name: x.pl.name, pos: x.pl.pos, age: x.pl.age, ovr: G.ovr(x.pl), gen: x.gen, apps: x.season.apps, goals: x.season.goals, assists: x.season.assists }));
    let next = null;
    if (w.phase === 'season' && p.club != null && w.schedule[lg][w.week]) {
      const pair = w.schedule[lg][w.week].find(([h, a]) => h === p.club || a === p.club);
      if (pair) next = { home: pair[0] === p.club, opp: pair[0] === p.club ? pair[1] : pair[0] };
    }
    const offer = m.offer ? { ...m.offer, list: G.offerList(m), res: undefined, expiring: m.offer.res.expiring, released: m.offer.res.released } : null;
    const all = [...this.members.values()];
    // 同期（同じ年にデビューした本物のプレイヤー）の今の生涯スコア
    const cohort = m.debutYear == null ? [] : all.filter((x) => x.debutYear === m.debutYear)
      .map((x) => ({ name: x.pl.name, pos: x.pl.pos, club: x.pl.club != null ? w.clubs[x.pl.club].name : '引退', retired: x.status === 'retired', goals: x.totals.goals + (x.status === 'retired' ? 0 : x.season.goals), score: G.scoreNow(x, w), me: x === m }))
      .sort((a, b) => b.score - a.score).slice(0, 30);
    const cr = p.club != null ? (w.records.clubs[p.club] || null) : null;
    return {
      world: this.worldView(), clubs: this.clubsView(), tables, next,
      results: w.last ? { week: w.last.week, year: w.last.year, list: w.last.results.filter((r) => r.lg === lg || r.goals.some((g) => g.who || g.assist)) } : null,
      scorers: this.ranking(lg, 'goals'), assisters: this.ranking(lg, 'assists'), mates, seasonHistory: w.history.slice(-3),
      motw: w.motw || null, records: { ...w.records, clubs: undefined }, clubRecord: cr, cohort, debutYear: m.debutYear,
      cup: w.cup ? { results: w.cup.results, alive: w.cup.alive, winner: w.cup.winner } : null,
      shop: m.status === 'draft' || m.status === 'retired' ? [] : G.SL.shopList(G.adapter(m, w)),
      caps: { club: G.CLUB_CAP, gk: G.GK_CAP, salary: G.SALARY_CAP },
      casino: this.tableView(m),
      news: (w.news || []).slice(0, 12),
      pk: { done: !!(m.pk && m.pk.key === this.pkKey() && m.pk.done), kicks: m.pk && m.pk.key === this.pkKey() ? m.pk.kicks.length : 0, reward: G.SL.pkReward(G.SL.PK.kicks) },
      me: {
        id: m.id, gen: m.gen, status: m.status, training: m.training, name: p.name, pos: p.pos, age: p.age, stats: p.stats, ovr: G.ovr(p),
        grow: p.growKnown ? p.grow : null, cond: p.cond, fatigue: Math.round(p.fatigue), injury: p.injury, fame: Math.round(p.fame), money: p.money,
        club: p.club, salary: p.salary, contract: p.contract, number: p.number,
        season: { ...m.season, ratings: undefined, avg: G.avg(m.season.ratings) }, totals: m.totals, history: m.history, awards: m.awards, trophies: m.trophies,
        caps: m.caps, natGoals: m.natGoals, last: m.last, draft: m.draft, offer, summary: m.summary, lineage: m.lineage, log: m.log.slice(-12),
        potLo: p.potLo, potHi: p.potHi, potKnown: p.potLo === p.potHi ? p.pot : null, records: m.records || null, cupSeason: m.cupSeason || null, lastCup: m.lastCup || null, motw: m.motw || 0,
        perks: { trainer: p.trainMul > 1, clinic: !!p.clinic, camp: !!p.camp, house: !!p.house, edu: p.edu || 0 },
      },
    };
  }
}
