// ===== リーグ本体（Durable Object） =====
// リーグ全体を1つのオブジェクトが持ち、アラームで一定時間ごとに1節ずつ進める。
// 無料枠の「1日の書き込み行数」を守るため、書き込みは「1節につき 世界1行＋現役プレイヤー1人1行」だけ。
// 読み込みは起動時に全部メモリへ載せ、以後のリクエストはメモリから返す。
import { DurableObject } from 'cloudflare:workers';
import * as G from './sim.js';
import { isNg } from '../../shared/ng-words.js'; // 名前に使えない言葉（全国ランキングと共通）

// 登録の上限（休眠・引退をのぞく人数）＝ 1軍の定員の合計（国内22人×40クラブ＋欧州12人×30クラブ＝1240人）＋ Bチームの上限（500人）＝ 1740人。
// 選手は30人ずつまとめて保存するので、人数が増えても読み書きはほとんど増えない（先に足りなくなるのは Workers のリクエスト）
const MAX_PLAYERS = G.SL._.CLUB_SEED.reduce((a, c, id) => a + G.capOf(id), 0) + G.RESERVE_CAP;
const LOGIN_BONUS = 20;       // ログインボーナス（万円／日）
const SIGNUP_PER_HOUR = 5;     // 同じIPからの新規登録の上限（1時間。メモリだけなので、サーバーが休むと消える）
const SIGNUP_PER_DAY = 3;      // 同じIPからの新規登録の上限（日本時間の1日。保存するので消えない）
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// 選手は30人ずつ1行（pchunk）にまとめて保存する。Durable Object は使われていないとすぐ眠り、起きるたびに全員を読み込むので、
// 1人1行だと起きるたびに1,000行以上を読む。まとめると数十行で済む（節ごとの書き込みも数十行になる）
const CHUNK = 30;

function cleanName(raw) {
  let s = String(raw || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim();
  s = [...s].slice(0, 12).join('');
  if (!s) return null;
  return isNg(s) ? null : s;
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
    // NPC選手の名簿。クラブごとに1行（30行）。節ごとには書かない（成長・移籍が入るまでは作ったときだけ）
    this.sql.exec('CREATE TABLE IF NOT EXISTS rosters (club INTEGER PRIMARY KEY, data TEXT)');
    // NPCの今季の成績（1行。節ごとに書く）
    this.sql.exec('CREATE TABLE IF NOT EXISTS npcstats (k TEXT PRIMARY KEY, v TEXT)');
    // 読み込みの節約：起動のたびに読むのは players だけ。長く来ていない休眠・引退の人（idle）と前の世代（past）は別の表にしまう
    // （SQLは条件に合わない行も読んだ数に入るので、同じ表に置いたままだと減らない）
    this.sql.exec('CREATE TABLE IF NOT EXISTS idle (account TEXT PRIMARY KEY, id TEXT, data TEXT)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS past (id TEXT PRIMARY KEY, account TEXT, data TEXT)');
    // 同じIPからの登録の回数（IPはそのまま残さず、元に戻せない形にして保存）。起動のときは読まない
    this.sql.exec('CREATE TABLE IF NOT EXISTS signups (ip TEXT PRIMARY KEY, day TEXT, n INTEGER)');
    // 選手のまとまり（data は選手のデータの配列）。前の players 表は、移したあとは読まない（もしものときの控えとして残す）
    this.sql.exec('CREATE TABLE IF NOT EXISTS pchunk (k INTEGER PRIMARY KEY, data TEXT)');
    // 前の世代（active = 0）は past へ移す（一度だけ。済んだ印を1行で持つ。毎回 players を数えると、そのたびに全員分を読んでしまう）
    if (!this.sql.exec("SELECT k FROM npcstats WHERE k = 'pastMoved'").toArray().length) this.ctx.storage.transactionSync(() => {
      this.sql.exec('INSERT OR REPLACE INTO past (id, account, data) SELECT id, account, data FROM players WHERE active = 0');
      this.sql.exec('DELETE FROM players WHERE active = 0');
      this.sql.exec("INSERT OR REPLACE INTO npcstats (k, v) VALUES ('pastMoved', '1')");
    });
    this.reqAuth = new WeakMap(); // リクエストごとの引き継ぎコード（本文で送られてきたとき）
    const fresh = this.loadState();
    // 失敗しても起動は止めない（図鑑に前の世代が入らないだけ。次の起動でもう一度ためす）
    if (!this.sql.exec("SELECT k FROM npcstats WHERE k = 'colPast'").toArray().length) try { this.atomic(() => {
      const rows = this.sql.exec('SELECT account, data FROM past').toArray().map((r) => ({ account: r.account, m: JSON.parse(r.data) })).sort((a, b) => (a.m.gen || 1) - (b.m.gen || 1));
      const touched = new Set();
      for (const { account, m: pm } of rows) {
        const cur = this.members.get(this.byAccount.get(account));
        if (!cur || !pm.summary || pm.summary.colDone) continue;
        G.recordLife(pm, this.w, cur.col); touched.add(cur);
      }
      for (const m of touched) { m.col.last = null; this.saveMember(m); }
      this.sql.exec("INSERT INTO npcstats (k, v) VALUES ('colPast', '1') ON CONFLICT(k) DO UPDATE SET v = excluded.v");
    }); } catch (e) { console.log('colPast failed', e && e.message); }
    this.ensureSchedule(fresh);
    await this.armAlarm();
  }

  // 次の試合・次のルーレットの時刻がなければ決めて、必ず保存する
  // （保存しないと、起き直すたびに時刻が先送りされて進まない／アラームを設定できない）
  ensureSchedule(forceSave = false) {
    let changed = forceSave || this.needSave || this.needChunk;
    if (!this.w.rl) { this.w.rl = G.newTable(Date.now(), this.rlMs()); changed = true; }
    if (!this.w.kb) { this.w.kb = { round: 0, nextAt: this.kbNext(), card: G.SL.newKeibaCard(1), hist: [], last: null }; changed = true; }
    if (!(this.w.nextAt > 0)) { this.w.nextAt = Date.now() + this.tickMs(); changed = true; }
    // 移行した世界・作ったばかりの名簿は、ここでまとめて保存する（全部成功か全部なし）
    if (changed || this.rostersDirty) this.atomic(() => { if (this.needChunk) this.chunkAll(); this.saveWorld(); if (this.rostersDirty) this.saveRosters(); });
    this.needSave = false; this.rostersDirty = false;
  }

  // 保存されている状態をメモリに読み込む（起動時と、処理が失敗して取り消したとき）。新しく作ったときは true
  loadState() {
    const row = this.sql.exec("SELECT v FROM world WHERE k = 'w'").toArray()[0];
    const raw = row ? JSON.parse(row.v) : null;
    this.w = G.migrateWorld(raw || G.newWorldState());
    this.needSave = !!raw && (raw.v || 1) < G.WORLD_VERSION; // 古い形から移行したら一度保存する
    // NPCの名簿。なければ（初めて・移行直後）今のクラブの所属から作る
    this.npcs = [];
    for (const r of this.sql.exec('SELECT club, data FROM rosters ORDER BY club')) this.npcs.push(...JSON.parse(r.data));
    this.rostersDirty = false;
    if (!this.npcs.length) { this.npcs = G.SL.newNpcWorld(this.w.clubs, G.NPC_SEED); this.rostersDirty = true; }
    else if (G.SL.extendNpcs(this.npcs, this.w.clubs, G.NPC_SEED, (this.w.records && this.w.records.npcLegends) || []).length) this.rostersDirty = true; // 国内3部・4部ができたとき
    const ns = this.sql.exec("SELECT v FROM npcstats WHERE k = 'season'").toArray()[0];
    this.npcSeason = ns ? JSON.parse(ns.v) : { season: this.w.season, stats: {} };
    this.accounts = new Map(); // hash -> account id（来た人の分だけ。起動のたびに全員分を読まない）
    this.members = new Map(); // player id -> member
    this.byAccount = new Map(); // account -> player id（現役中または引退直後の1人）
    this.chunks = new Map(); // まとまりの番号 -> Map(player id -> member)
    this.chunkOf = new Map(); // player id -> まとまりの番号
    this.dirty = new Set(); // 書き直すまとまり
    this.needChunk = false;
    if (this.sql.exec("SELECT k FROM npcstats WHERE k = 'chunked'").toArray().length) {
      for (const r of this.sql.exec('SELECT k, data FROM pchunk')) {
        const map = new Map();
        for (const raw of JSON.parse(r.data)) { const m = G.migrateMember(raw, this.w); this.members.set(m.id, m); this.byAccount.set(m.account, m.id); map.set(m.id, m); this.chunkOf.set(m.id, r.k); }
        this.chunks.set(r.k, map);
      }
    } else {
      // まだまとめていない：前の players 表（1人1行）から読み、このあとまとまりに作り直す（ensureSchedule で一度だけ）
      for (const r of this.sql.exec('SELECT id, account, data FROM players WHERE active = 1')) {
        const m = G.migrateMember(JSON.parse(r.data), this.w);
        if (!m.id) m.id = r.id; if (!m.account) m.account = r.account;
        this.members.set(r.id, m); this.byAccount.set(r.account, r.id);
      }
      this.needChunk = true;
    }
    return !row;
  }

  // 複数の書き込みを「全部成功」か「全部なし」にする。失敗したらメモリも保存済みの状態に戻す。
  // アラームが失敗するとCloudflareが同じ処理をやり直すので、途中まで進んだ状態が残ると節が二重に進む。それを防ぐ。
  // まとまりへの書き込みは、最後に1回だけ（同じまとまりを何度も書かない）
  atomic(fn) {
    this.batch = (this.batch || 0) + 1;
    try { return this.ctx.storage.transactionSync(() => { const r = fn(); if (this.batch === 1) this.flush(); return r; }); }
    catch (e) { this.dirty = new Set(); this.loadState(); throw e; }
    finally { this.batch--; }
  }
  // 選手をまとまりに入れる（空きのあるまとまりへ）。番号を返す
  assignChunk(m) {
    let k = this.chunkOf.get(m.id);
    if (k == null) {
      for (const [ck, map] of this.chunks) if (map.size < CHUNK) { k = ck; break; }
      if (k == null) k = Math.max(-1, ...this.chunks.keys()) + 1;
      if (!this.chunks.has(k)) this.chunks.set(k, new Map());
      this.chunkOf.set(m.id, k);
    }
    this.chunks.get(k).set(m.id, m);
    return k;
  }
  unchunk(id) {
    const k = this.chunkOf.get(id); if (k == null) return;
    this.chunks.get(k).delete(id); this.chunkOf.delete(id); this.dirty.add(k);
  }
  // 書き直すまとまりを保存する（空になったまとまりは消す）
  flush() {
    for (const k of this.dirty) {
      const map = this.chunks.get(k);
      if (!map || !map.size) { this.sql.exec('DELETE FROM pchunk WHERE k = ?', k); this.chunks.delete(k); continue; }
      this.sql.exec('INSERT INTO pchunk (k, data) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET data = excluded.data', k, JSON.stringify([...map.values()]));
    }
    this.dirty = new Set();
  }
  // 1人1行の players 表から、まとまりに作り直す（一度だけ）
  chunkAll() {
    for (const m of this.members.values()) this.dirty.add(this.assignChunk(m));
    this.sql.exec("INSERT INTO npcstats (k, v) VALUES ('chunked', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", String(Date.now()));
    this.needChunk = false;
  }

  tickMs() { return Math.max(1, Number(this.env.TICK_MINUTES || 60)) * 60000; }
  rlMs() { return Math.max(.1, Number(this.env.RL_MINUTES || 3)) * 60000; }
  // アラームは1つだけなので「次の試合」と「次のルーレット」の早いほうに合わせる
  // 次に起きる時刻：次の節か、賭けがあるときだけ次のルーレット（誰も賭けていないのに3分ごとに起きない）
  async armAlarm() {
    this.rlCatchUp(); this.kbCatchUp();
    let at = this.w.nextAt;
    if (this.betCount()) at = Math.min(at, this.w.rl.nextAt);
    if (this.kbBetCount()) at = Math.min(at, this.w.kb.nextAt);
    await this.ctx.storage.setAlarm(at);
  }
  kbMs() { return Math.max(.1, Number(this.env.KEIBA_MINUTES || 60)) * 60000; }
  // 次の発走時刻：区切りのいい時刻（1時間ごとなら毎時0分）
  kbNext(now = Date.now()) { const ms = this.kbMs(); return (Math.floor(now / ms) + 1) * ms; }
  kbBetCount() { let n = 0; for (const m of this.members.values()) if (m.kbBet) n++; return n; }
  // 誰も馬券を買わずに発走の時刻を過ぎたら、走らせずに次の区切りまで時刻を進める（出走表はそのまま。保存しない）
  kbCatchUp(now = Date.now()) {
    const K = this.w.kb;
    if (!K || now < K.nextAt || this.kbBetCount()) return;
    K.nextAt = this.kbNext(now);
  }
  // レースを1回走らせ、馬券を買った全員を同じ着順で精算する。書き込むのは「買った人」と「世界の1行」だけ
  kbRun() {
    const K = this.w.kb, card = K.card, order = G.SL.keibaOrder(card), round = K.round + 1, winners = [];
    let players = 0, totalBet = 0;
    for (const m of this.members.values()) {
      if (!m.kbBet) continue;
      const bets = m.kbBet.bets; m.kbBet = null;
      if (m.status === 'draft' || m.status === 'retired') { this.saveMember(m); continue; }
      const e = G.SL.keibaCheck(m.pl, card, bets);
      if (e) { m.kbLast = { round, void: e, total: bets.reduce((x, b) => x + b.a, 0) }; this.saveMember(m); continue; }
      const r = G.SL.resolveKeiba(m.pl, card, bets, order);
      m.kbLast = { round, net: r.net, total: r.total, back: r.back, results: r.results };
      players++; totalBet += r.total;
      const big = r.results.filter((x) => x.win).sort((a, b) => b.odds - a.odds)[0];
      if (r.net >= 500) G.addNews(this.w, `🏇 ${m.pl.name}が競馬で+${r.net.toLocaleString()}万円！（${big ? `${big.name} ${big.odds}倍` : ''}）`);
      winners.push({ name: m.pl.name, net: r.net });
      this.saveMember(m);
    }
    const pub = G.SL.keibaPublic(card), win = card.horses[order[0] - 1];
    K.round = round;
    K.hist.unshift({ no: win.no, odds: win.win }); if (K.hist.length > 10) K.hist.length = 10;
    K.last = { round, name: card.name, course: card.course, horses: pub.horses, order, q: card.pairs[`${Math.min(order[0], order[1])}-${Math.max(order[0], order[1])}`], at: Date.now(), players, totalBet, winners: winners.filter((x) => x.net > 0).sort((a, b) => b.net - a.net).slice(0, 5) };
    K.card = G.SL.newKeibaCard(round + 1);
    K.nextAt = this.kbNext();
    this.saveWorld();
  }
  keibaView(m) {
    this.kbCatchUp();
    const K = this.w.kb;
    return {
      now: Date.now(), nextAt: K.nextAt, round: K.card.round, intervalMin: this.kbMs() / 60000, card: G.SL.keibaPublic(K.card), last: K.last, hist: K.hist,
      players: this.kbBetCount(), myBets: m && m.kbBet ? m.kbBet.bets : [], myLast: m ? m.kbLast || null : null, money: m ? m.pl.money : null,
    };
  }
  // 誰も賭けずに回る時刻を過ぎていたら、回さずに次の区切り（3分ごと）まで時刻を進める（保存はしない。いつ計算しても同じになる）
  rlCatchUp(now = Date.now()) {
    const T = this.w.rl, ms = this.rlMs();
    if (now < T.nextAt || this.betCount()) return;
    T.nextAt += Math.floor((now - T.nextAt) / ms + 1) * ms;
  }
  // 保存は「なければ足す・あれば書きかえる」（INSERT OR REPLACE は、いったん消してから足すので2行の書き込みに数えられる。これは1行）
  saveWorld() { this.sql.exec("INSERT INTO world (k, v) VALUES ('w', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", JSON.stringify(this.w)); }
  saveRosters() {
    const by = new Map(this.w.clubs.map((c) => [c.id, []]));
    for (const p of this.npcs) if (by.has(p.club)) by.get(p.club).push(p);
    for (const [club, list] of by) this.sql.exec('INSERT INTO rosters (club, data) VALUES (?, ?) ON CONFLICT(club) DO UPDATE SET data = excluded.data', club, JSON.stringify(list));
  }
  isAdmin(req) { const key = this.env.ADMIN_KEY || ''; return key.length >= 16 && req.headers.get('X-Admin-Key') === key; }
  saveMember(m, active = 1) {
    if (!active) { this.sql.exec('INSERT OR REPLACE INTO past (id, account, data) VALUES (?, ?, ?)', m.id, m.account, JSON.stringify(m)); this.unchunk(m.id); }
    else this.dirty.add(this.assignChunk(m));
    if (!this.batch) this.flush();
  }
  // 休眠・引退のまま長く来ていない人をしまう（メモリと players から外して idle へ）。しまった人数を返す
  archiveIdle(now = Date.now()) {
    const out = [...this.members.values()].filter((m) => (m.status === 'dormant' || m.status === 'retired') && !m.rlBet && !m.kbBet && now - (m.seenAt || now) > G.ARCHIVE_MS);
    for (const m of out) {
      this.sql.exec('INSERT OR REPLACE INTO idle (account, id, data) VALUES (?, ?, ?)', m.account, m.id, JSON.stringify(m));
      this.unchunk(m.id);
      this.members.delete(m.id); this.byAccount.delete(m.account);
    }
    if (out.length && !this.batch) this.flush();
    return out.length;
  }
  // しまっておいた人が来たら読み込む（長く休眠していた人は、ここで引退にする）
  restoreIdle(acc) {
    const r = this.sql.exec('SELECT id, data FROM idle WHERE account = ?', acc).toArray()[0];
    if (!r) return null;
    const m = G.migrateMember(JSON.parse(r.data), this.w);
    this.atomic(() => {
      if (G.returnFromIdle(m, this.w)) this.saveWorld();
      this.saveMember(m);
      this.sql.exec('DELETE FROM idle WHERE account = ?', acc);
    });
    this.members.set(m.id, m); this.byAccount.set(acc, m.id);
    return m;
  }

  async alarm() {
    const now = Date.now();
    // 「次の時刻」も同じまとまりで保存するので、成功したあとにアラームがやり直されても二重には進まない
    this.atomic(() => {
      if (now >= this.w.rl.nextAt - 500 && this.betCount()) this.rlSpin();
      if (now >= this.w.kb.nextAt - 500 && this.kbBetCount()) this.kbRun();
      if (now >= this.w.nextAt - 500) {
        if (this.clockMode()) { this.clockCatchUp(now); this.w.nextAt = G.nextSlot(now) + 2000; }
        else { this.tick(); this.w.nextAt = now + this.tickMs(); }
        this.saveWorld();
      }
    });
    await this.armAlarm();
  }

  // 日程を時刻で決めるか（本番）。手元のテスト（DEV）は今までどおり一定の間隔で進める
  // 時刻に切りかえるのは、今のオフが終わってから（オフの途中で急に打ち切らない）。一度切りかえたら印を残す
  clockMode() {
    if (this.env.DEV === '1' && this.env.SCHEDULE !== 'clock') return false;
    if (!this.w.clock && this.w.phase === 'season') this.w.clock = true;
    return !!this.w.clock;
  }
  // 時刻に追いつくまで節を進める（ずれていたとき・止まっていたときは、まとめて進める。1回に40節まで）
  clockCatchUp(now) {
    const T = G.clockTarget(now);
    for (let n = 0; n < 40; n++) {
      const w = this.w;
      if (w.phase === 'season' && T.phase === 'season' && w.week >= T.week) break;
      if (w.phase === 'off' && T.phase === 'off' && w.offLeft <= T.left) break;
      this.tick();
    }
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
  // ログインボーナス：日本時間で1日1回、毎日同じ額（毎日来ないと損をする作りにしない）
  loginBonus(m) {
    if (m.status === 'draft' || m.status === 'retired') return null;
    const day = (t) => new Date(t + 9 * 3600000).toISOString().slice(0, 10);
    const today = day(Date.now());
    if (m.loginDay === today) return null;
    m.loginDay = today; delete m.loginStreak;
    const amount = LOGIN_BONUS;
    m.pl.money += amount;
    this.saveMember(m);
    return { amount };
  }
  betCount() { let n = 0; for (const m of this.members.values()) if (m.rlBet) n++; return n; }
  tableView(m) {
    this.rlCatchUp();
    const T = this.w.rl;
    return {
      now: Date.now(), nextAt: T.nextAt, round: T.round + 1, intervalMin: this.rlMs() / 60000, last: T.last, hist: T.hist,
      players: this.betCount(), myBets: m && m.rlBet ? m.rlBet.bets : [], myLast: m ? m.rlLast || null : null, money: m ? m.pl.money : null,
    };
  }

  // 1節すすめる（オフシーズン中はオフの残りを1つ減らす）
  tick() {
    const w = this.w, all = [...this.members.values()];
    for (const m of G.sweepIdleDrafts(w, all)) this.saveMember(m); // クラブを選ばないまま1時間たった人は休眠（定員の枠を空ける）
    this.archiveIdle(); // 休眠・引退のまま3日来ていない人は、しまっておく（起動のたびに読まない）
    if (w.phase === 'season') {
      this.npcSeason = G.playMatchday(w, all, this.npcs, this.npcSeason);
      this.sql.exec("INSERT INTO npcstats (k, v) VALUES ('season', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", JSON.stringify(this.npcSeason));
      if (w.week >= G.SEASON_WEEKS) { G.endSeason(w, all, this.npcs, this.npcSeason); this.saveRosters(); } // NPCの受賞を名簿に残す（シーズンに1回・30行）
      for (const m of all) if (m.status === 'active' || m.status === 'off') this.saveMember(m);
      if (this.failNext) { this.failNext = false; throw new Error('テスト用の失敗（途中まで保存したところで止める）'); }
    } else {
      if (w.offLeft > G.OFF_TICKS) w.offLeft = G.OFF_TICKS; // オフを短くしたとき、今のオフも新しい長さに合わせる
      w.offLeft--;
      if (w.offLeft <= 0) { G.finishOffseason(w, all, Date.now(), this.npcs); for (const m of all) if (this.members.has(m.id)) this.saveMember(m); }
    }
    this.saveWorld();
  }

  // 引き継ぎコードは Authorization ヘッダーか、本文の auth（ヘッダーを付けると、ブラウザは毎回「事前確認」のリクエストを先に送る＝リクエスト数が増える）
  async me(req) {
    const code = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '') || this.reqAuth.get(req) || '';
    if (!code) return null;
    const hash = await sha(code);
    let acc = this.accounts.get(hash);
    if (!acc) {
      const r = this.sql.exec('SELECT id FROM accounts WHERE hash = ?', hash).toArray()[0]; // 1行だけ（hash は UNIQUE）
      if (!r) return null;
      acc = r.id; this.accounts.set(hash, acc);
    }
    const m = this.members.get(this.byAccount.get(acc)) || this.restoreIdle(acc);
    if (!m) return null;
    m.seenAt = Date.now();
    // 来た日数（日本時間で1日1回だけ数えて保存する＝最後に来た時刻も残る）
    const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    if (m.visitDay !== today) { m.visitDay = today; m.visitDays = (m.visitDays || 0) + 1; this.saveMember(m); }
    return m;
  }

  async fetch(req) {
    const url = new URL(req.url), path = url.pathname.replace(/^\/api/, '');
    const body = req.method === 'POST' ? (await req.json().catch(() => ({}))) || {} : {};
    // 画面は「事前確認」が要らない形（text/plain の POST）で送ってくる。読むだけのものは本文に _m: 'GET'
    const method = req.method === 'POST' && body._m === 'GET' ? 'GET' : req.method;
    if (typeof body.auth === 'string') { this.reqAuth.set(req, body.auth); delete body.auth; }
    delete body._m;
    try {
      if (method === 'GET' && path === '/public') return json(this.publicView());
      // 全国ランキング（ログインしていれば自分の順位も返す）
      if (method === 'GET' && path === '/rankings') return json(this.rankingsView(await this.me(req)));
      // 今季の個人ランキング（NPCも含む）：?lg=0〜2&cat=goals|assists|rating|defense|saves|cs&who=all|npc|user
      if (method === 'GET' && path === '/ranking') {
        const q = url.searchParams, lg = q.get('lg') === 'all' ? null : Math.max(0, Math.min(G.LEAGUES.length - 1, Number(q.get('lg')) || 0));
        const cat = G.SL.RANK_CATS[q.get('cat')] ? q.get('cat') : 'goals', who = ['all', 'npc', 'user'].includes(q.get('who')) ? q.get('who') : 'all';
        const me = await this.me(req);
        const r = G.SL.ranking(this.seasonEntries(), cat, { lg, who, n: 100, meKey: me ? 'u:' + me.id : null });
        const pub = (x) => (x ? { ...x, key: x.type === 'npc' ? x.key : undefined } : null); // 本物のプレイヤーの内部IDは出さない
        return json({ lg, cat, who, top: r.top.map(pub), mine: pub(r.mine), total: r.total });
      }
      if (req.method === 'POST' && path === '/signup') return this.signup(req, body);
      if (req.method === 'POST' && path === '/dev/tick') {
        if (this.env.DEV !== '1') return err('not_found', 404);
        const n = Math.min(40, Number(body.n) || 1);
        this.atomic(() => { for (let i = 0; i < n; i++) this.tick(); });
        return json({ ok: true, world: this.worldView() });
      }
      // 開発用：節の途中でわざと失敗させ、保存が取り消されることを確かめる
      // 開発用：全員の「最後に来た時刻」を ms だけ昔にする（休眠のテスト用）
      if (req.method === 'POST' && path === '/dev/seen') {
        if (this.env.DEV !== '1') return err('not_found', 404);
        const ago = Number(body.ms) || 0; for (const x of this.members.values()) x.seenAt = Date.now() - ago;
        return json({ ok: true });
      }
      if (req.method === 'POST' && path === '/dev/fail-tick') {
        if (this.env.DEV !== '1') return err('not_found', 404);
        this.failNext = true;
        try { this.atomic(() => this.tick()); } catch (e) { return json({ failed: true, message: String(e.message), world: this.worldView() }, 500); }
        return json({ failed: false });
      }
      // 開発用：書き出したデータをそのまま読み込む（本番データのコピーで移行を試すため）
      if (req.method === 'POST' && path === '/dev/storage') { // 開発用：保存のようす（まとまりの数・人数・中身の指紋）
        if (this.env.DEV !== '1') return err('not_found', 404);
        const rows = this.sql.exec('SELECT k, data FROM pchunk').toArray(), ids = rows.flatMap((r) => JSON.parse(r.data).map((m) => m.id)).sort();
        let h = 0; for (const m of [...this.members.values()].sort((x, y) => (x.id < y.id ? -1 : 1))) for (const ch of m.id + m.pl.money + m.pl.age + m.status + (m.history || []).length) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        return json({ chunked: !!this.sql.exec("SELECT k FROM npcstats WHERE k = 'chunked'").toArray().length, chunkRows: rows.length, maxPerChunk: Math.max(0, ...rows.map((r) => JSON.parse(r.data).length)), maxChunkKB: Math.round(Math.max(0, ...rows.map((r) => r.data.length)) / 1024), idsInChunks: ids.length, uniqueIds: new Set(ids).size, members: this.members.size, fingerprint: h, playersTableRows: this.sql.exec('SELECT COUNT(*) AS n FROM players').one().n, week: this.w.week, year: this.w.year });
      }
      if (req.method === 'POST' && path === '/dev/import') {
        if (this.env.DEV !== '1') return err('not_found', 404);
        if (!body || !Array.isArray(body.accounts) || !Array.isArray(body.players) || !body.world) return err('bad_dump');
        this.atomic(() => {
          this.sql.exec('DELETE FROM accounts'); this.sql.exec('DELETE FROM players'); this.sql.exec('DELETE FROM world'); this.sql.exec('DELETE FROM rosters'); this.sql.exec('DELETE FROM npcstats'); this.sql.exec('DELETE FROM idle'); this.sql.exec('DELETE FROM past');
          this.sql.exec('DELETE FROM pchunk');
          for (const r of body.npcstats || []) if (r.k !== 'chunked') this.sql.exec('INSERT INTO npcstats (k, v) VALUES (?, ?)', r.k, r.v);
          for (const r of body.rosters || []) this.sql.exec('INSERT INTO rosters (club, data) VALUES (?, ?)', r.club, r.data);
          for (const a of body.accounts) this.sql.exec('INSERT INTO accounts (id, hash, created) VALUES (?, ?, ?)', a.id, a.hash, a.created);
          for (const p of body.players) {
            if (p.active === 2) this.sql.exec('INSERT OR REPLACE INTO idle (account, id, data) VALUES (?, ?, ?)', p.account, p.id, p.data);
            else if (!p.active) this.sql.exec('INSERT OR REPLACE INTO past (id, account, data) VALUES (?, ?, ?)', p.id, p.account, p.data);
            else this.sql.exec('INSERT INTO players (id, account, active, data) VALUES (?, ?, ?, ?)', p.id, p.account, p.active, p.data);
          }
          this.sql.exec("INSERT INTO world (k, v) VALUES ('w', ?)", body.world);
        });
        this.loadState(); this.ensureSchedule(); await this.armAlarm();
        return json({ ok: true, players: this.members.size, npcs: this.npcs.length, world: this.worldView() });
      }
      // 管理用：来ている人の様子（人数だけ）。最後に来た時刻・来た日数・状態
      if (method === 'GET' && path === '/admin/activity') {
        if (!this.isAdmin(req)) return err('not_found', 404);
        const now = Date.now(), st = {}, seen = { '1日以内': 0, '3日以内': 0, '7日以内': 0, 'それ以上': 0 }, days = {};
        for (const m of this.members.values()) {
          st[m.status] = (st[m.status] || 0) + 1;
          const d = (now - (m.seenAt || 0)) / 864e5; seen[d <= 1 ? '1日以内' : d <= 3 ? '3日以内' : d <= 7 ? '7日以内' : 'それ以上']++;
          const v = m.visitDays || 0, k = v >= 7 ? '7日以上' : v + '日'; days[k] = (days[k] || 0) + 1;
        }
        const idle = this.sql.exec('SELECT COUNT(*) AS n FROM idle').one().n, past = this.sql.exec('SELECT COUNT(*) AS n FROM past').one().n;
        return json({ loaded: this.members.size, players: this.activeCount(), max: MAX_PLAYERS, status: st, lastSeen: seen, visitDays: days, idle, past });
      }
      // 管理用：使えない言葉を含む名前の一覧（言葉を増やしたあと、前からいる人を探す）
      if (req.method === 'POST' && path === '/admin/restore-reserve') {
        if (!this.isAdmin(req)) return err('not_found', 404);
        // 対象：満員のせいで若くして強制引退になった人（30歳未満・ランクD・30日来なかったための引退ではない）
        const targets = [...this.members.values()].filter((m) => m.status === 'retired' && m.summary && m.summary.retireAge < 30 && m.summary.letter === 'D' && !m.idleRetired);
        const idleRows = this.sql.exec('SELECT COUNT(*) AS n FROM idle').toArray()[0].n;
        if (body.dry) return json({ targets: targets.length, idleRows, reserveNow: G.reserveCount([...this.members.values()]), cap: G.RESERVE_CAP, ages: targets.map((m) => m.summary.retireAge) });
        let n = 0;
        this.atomic(() => {
          for (const m of targets) { if (G.reserveCount([...this.members.values()]) >= G.RESERVE_CAP) break; if (G.restoreToReserve(m, this.w)) { this.saveMember(m); n++; } }
          if (n) G.addNews(this.w, `🅱️ 満員のため引退になっていた${n}人が、Bチームで現役に復帰した`);
          this.saveWorld();
        });
        return json({ restored: n, reserveNow: G.reserveCount([...this.members.values()]) });
      }
      if (method === 'GET' && path === '/admin/ng') {
        if (!this.isAdmin(req)) return err('not_found', 404);
        return json({ players: [...this.members.values()].filter((m) => isNg(m.pl.name) || (m.pl.move && isNg(m.pl.move))).map((m) => ({ id: m.id, name: m.pl.name, move: m.pl.move || null, status: m.status })) });
      }
      // 管理用：名前を変える。{ id, to }（to を省くと「選手＋数字」）。速報・記録・家系図に残った古い名前も置きかえる。必殺技が使えない言葉なら消す
      if (req.method === 'POST' && path === '/admin/rename') {
        if (!this.isAdmin(req)) return err('not_found', 404);
        const m = this.members.get(String(body.id || ''));
        if (!m) return err('no_player', 404);
        const from = m.pl.name, to = body.to ? cleanName(body.to) : '選手' + (1000 + Math.floor(Math.random() * 9000));
        if (!to) return err('bad_name');
        // 名前そのもの（文字列がまるごと古い名前）だけを置きかえる。短い名前がほかの名前やクラブ名の一部を書きかえないように
        const swap = (o) => {
          if (typeof o === 'string') return o === from ? to : o;
          if (Array.isArray(o)) { for (let i = 0; i < o.length; i++) o[i] = swap(o[i]); return o; }
          if (o && typeof o === 'object') { for (const k of Object.keys(o)) o[k] = swap(o[k]); return o; }
          return o;
        };
        this.atomic(() => {
          swap(this.w);
          for (const n of this.w.news || []) if (n && typeof n.t === 'string') n.t = n.t.split(from).join(to); // 速報の文の中は部分一致で
          this.saveWorld();
          for (const x of this.members.values()) { const before = JSON.stringify(x); swap(x); if (x === m || JSON.stringify(x) !== before) this.saveMember(x); }
          if (m.pl.move && isNg(m.pl.move)) { m.pl.move = null; this.saveMember(m); }
        });
        return json({ ok: true, from, to });
      }
      // 管理用：全データの書き出し（バックアップ）。ADMIN_KEY（Cloudflareの秘密の設定）を知っている人だけ
      if (method === 'GET' && path === '/admin/export') {
        const key = this.env.ADMIN_KEY || '';
        if (key.length < 16 || req.headers.get('X-Admin-Key') !== key) return err('not_found', 404);
        const dump = {
          app: 'soccer-online', exportedAt: new Date().toISOString(), worldVersion: G.WORLD_VERSION, memberVersion: G.MEMBER_VERSION,
          accounts: this.sql.exec('SELECT id, hash, created FROM accounts').toArray(),
          players: (this.sql.exec("SELECT k FROM npcstats WHERE k = 'chunked'").toArray().length
            ? this.sql.exec('SELECT data FROM pchunk').toArray().flatMap((r) => JSON.parse(r.data).map((m) => ({ id: m.id, account: m.account, active: 1, data: JSON.stringify(m) })))
            : this.sql.exec('SELECT id, account, active, data FROM players').toArray())
            .concat(this.sql.exec('SELECT id, account, 0 AS active, data FROM past').toArray(), this.sql.exec('SELECT id, account, 2 AS active, data FROM idle').toArray()),
          world: (this.sql.exec("SELECT v FROM world WHERE k = 'w'").toArray()[0] || {}).v || null,
          rosters: this.sql.exec('SELECT club, data FROM rosters ORDER BY club').toArray(),
          npcstats: this.sql.exec('SELECT k, v FROM npcstats').toArray(),
        };
        return json(dump);
      }
      if (req.method === 'POST' && path === '/dev/reserve') { // 開発用：自分を Bチームにする／1軍に戻す（画面の確認用）
        if (this.env.DEV !== '1') return err('not_found', 404);
        const me = await this.me(req); if (!me) return err('unauthorized', 401);
        me.reserve = !me.reserve; me.rsv = G.emptyRsv(); this.saveMember(me); return json(this.stateView(me));
      }
      if (req.method === 'POST' && path === '/dev/race') {
        if (this.env.DEV !== '1') return err('not_found', 404);
        this.atomic(() => this.kbRun()); await this.armAlarm(); return json({ ok: true, last: this.w.kb.last });
      }
      if (req.method === 'POST' && path === '/dev/spin') {
        if (this.env.DEV !== '1') return err('not_found', 404);
        this.rlSpin(); await this.armAlarm(); return json({ ok: true, last: this.w.rl.last });
      }
      if (method === 'GET' && path === '/casino') return json(this.tableView(await this.me(req)));
      const m = await this.me(req);
      if (!m) return err('unauthorized', 401);
      if (method === 'GET' && path === '/state') {
        if (G.wake(m, this.w, [...this.members.values()])) { this.saveMember(m); this.saveWorld(); }
        if (m.status === 'draft') {
          const all = [...this.members.values()];
          if (!(m.draft || []).some((o) => (o.reserve ? G.reserveOpen(all) : !G.clubFull(all, o.club, m.pl.pos, m)))) { const d = G.draftOffers(m, this.w, all); if (JSON.stringify(d) !== JSON.stringify(m.draft || [])) { m.draft = d; this.saveMember(m); } }
        }
        const bonus = this.loginBonus(m);
        const idleRetired = !!m.idleRetired; if (idleRetired) { delete m.idleRetired; this.saveMember(m); }
        const restored = !!m.restored; if (restored) { delete m.restored; this.saveMember(m); }
        return json({ ...this.stateView(m), bonus, idleRetired, restored });
      }
      // PKチャレンジは終了（試合中のPKに変わった）。古い画面から呼ばれたとき用
      if (req.method === 'POST' && (path === '/pk/start' || path === '/pk/kick')) return err('pk_ended', 410);
      if (req.method === 'POST' && path === '/join') {
        if (m.status !== 'draft') return err('not_now');
        const e = G.join(m, this.w, Number(body.i), [...this.members.values()]); if (e) return err(e);
        this.saveMember(m); return json(this.stateView(m));
      }
      // 次の回への賭けを置く（[] なら取り消し）。賭けはプレイヤーのデータに保存し、お金は回った瞬間に動く
      if (method === 'GET' && path === '/keiba') return json(this.keibaView(m));
      if (req.method === 'POST' && path === '/keiba/bet') {
        if (m.status === 'draft' || m.status === 'retired') return err('not_now');
        const bets = Array.isArray(body.bets) ? body.bets.slice(0, 20).map((b) => ({ k: String(b && b.k).slice(0, 8), a: Number(b && b.a) })) : [];
        if (!bets.length) { if (m.kbBet) { m.kbBet = null; this.saveMember(m); await this.armAlarm(); } return json(this.keibaView(m)); }
        this.kbCatchUp(); // 誰も買っていなかった間に過ぎた発走時刻は飛ばして、次のレースに
        const e = G.SL.keibaCheck(m.pl, this.w.kb.card, bets); if (e) return err(e);
        m.kbBet = { bets, at: Date.now(), round: this.w.kb.card.round };
        this.saveMember(m);
        await this.armAlarm();
        return json(this.keibaView(m));
      }
      if (req.method === 'POST' && path === '/casino/bet') {
        if (m.status === 'draft' || m.status === 'retired') return err('not_now');
        const bets = Array.isArray(body.bets) ? body.bets.map((b) => ({ k: String(b && b.k), a: Number(b && b.a) })) : [];
        if (!bets.length) { if (m.rlBet) { m.rlBet = null; this.saveMember(m); await this.armAlarm(); } return json(this.tableView(m)); }
        const e = G.SL.rlCheck(m.pl, bets); if (e) return err(e);
        this.rlCatchUp(); // 誰も賭けていなかった間に過ぎた回は飛ばして、次に回る時刻に賭ける
        m.rlBet = { bets, at: Date.now() };
        this.saveMember(m);
        await this.armAlarm();
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
      // オフに移籍を希望する（1回だけ・人気-1）
      // 冬の移籍期間のオファー：{ choice: 番号 | 'stay' }
      if (req.method === 'POST' && path === '/retire-plan') {
        const e = G.planRetire(m, this.w, !!body.on); if (e) return err(e);
        this.saveMember(m); this.saveWorld(); return json(this.stateView(m));
      }
      if (method === 'GET' && path === '/retire-preview') {
        if (m.status === 'draft' || m.status === 'retired' || m.status === 'dormant') return err('not_now');
        return json(G.retirePreviewOf(m, this.w));
      }
      if (req.method === 'POST' && path === '/winter') {
        if (m.status !== 'active' || !m.winter) return err('not_now');
        if (body.choice === 'stay') { m.winter = null; this.saveMember(m); return json(this.stateView(m)); }
        const e = G.winterMove(m, this.w, Number(body.choice), [...this.members.values()]); if (e) return err(e);
        this.atomic(() => { this.saveMember(m); this.saveWorld(); });
        return json(this.stateView(m));
      }
      if (req.method === 'POST' && path === '/request') {
        const e = G.requestTransfer(m, this.w, [...this.members.values()]); if (e) return err(e);
        this.saveMember(m); return json(this.stateView(m));
      }
      // 必殺技の名前（10文字まで。空なら消す）
      if (req.method === 'POST' && path === '/move') {
        const raw = String(body.move || '').trim();
        const v = raw ? cleanName(raw) : null;
        if (raw && !v) return err('bad_move');
        m.pl.move = v ? [...v].slice(0, 10).join('') : null;
        this.saveMember(m); return json(this.stateView(m));
      }
      if (req.method === 'POST' && path === '/policy') {
        if (body.policy != null) { if (!G.POLICY[body.policy]) return err('bad_choice'); m.policy = body.policy; }
        if (body.sw != null) { if (!G.MOVE_SWITCH[body.sw]) return err('bad_choice'); m.sw = body.sw; }
        this.saveMember(m); return json(this.stateView(m));
      }
      if (req.method === 'POST' && path === '/decide') {
        const e = G.decide(m, this.w, body.choice, [...this.members.values()]); if (e) return err(e);
        this.saveMember(m); return json(this.stateView(m));
      }
      if (req.method === 'POST' && path === '/nextgen') {
        if (m.status !== 'retired') return err('not_now');
        const name = cleanName(body.name); if (!name) return err('bad_name');
        if (G.nameCrowded(this.members.values(), name, m)) return err('name_crowded', 409);
        if (!G.POS[body.pos]) return err('bad_pos');
        const PI = G.positionInfo(this.w, [...this.members.values()]);
        const nm = G.nextGeneration(m, crypto.randomUUID(), name, body.pos, this.w, [...this.members.values()], G.SL.appealChoices(body.pos).includes(body.appeal) ? body.appeal : null, PI[body.pos].bonus);
        this.atomic(() => { this.saveMember(m, 0); this.saveMember(nm); });
        this.members.delete(m.id); this.members.set(nm.id, nm); this.byAccount.set(nm.account, nm.id);
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
    if (this.activeCount() >= MAX_PLAYERS) return err('full', 503);
    const PI = G.positionInfo(this.w, [...this.members.values()]);
    if (G.nameCrowded(this.members.values(), name)) return err('name_crowded', 409);
    if (!G.draftOffers(G.newMember('probe', '', name, body.pos, { bonus: PI[body.pos].bonus }), this.w, [...this.members.values()]).length) return err('full', 503); // 1軍も Bチームも満員
    const ip = req.headers.get('CF-Connecting-IP') || 'local';
    const now = Date.now(), hits = (this.signups.get(ip) || []).filter((t) => now - t < 3600000);
    if (hits.length >= SIGNUP_PER_HOUR) return err('too_many', 429);
    // 1日の回数（保存する）。同じ人が何十個も作れないように
    const perDay = Number(this.env.SIGNUP_PER_DAY) || SIGNUP_PER_DAY;
    const ipKey = (await sha('ip:' + ip + ':' + (this.env.ADMIN_KEY || ''))).slice(0, 32), day = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
    const row = this.sql.exec('SELECT day, n FROM signups WHERE ip = ?', ipKey).toArray()[0];
    const used = row && row.day === day ? row.n : 0;
    if (used >= perDay) return err('too_many_today', 429);
    hits.push(now); this.signups.set(ip, hits);
    this.sql.exec('INSERT INTO signups (ip, day, n) VALUES (?, ?, ?) ON CONFLICT(ip) DO UPDATE SET day = excluded.day, n = excluded.n', ipKey, day, used + 1);
    const code = newCode(), hash = await sha(code), acc = crypto.randomUUID();
    this.sql.exec('INSERT INTO accounts (id, hash, created) VALUES (?, ?, ?)', acc, hash, now);
    this.accounts.set(hash, acc);
    const m = G.newMember(crypto.randomUUID(), acc, name, body.pos, { bonus: PI[body.pos].bonus, appeal: G.SL.appealChoices(body.pos).includes(body.appeal) ? body.appeal : null });
    m.draft = G.draftOffers(m, this.w, [...this.members.values()]);
    this.members.set(m.id, m); this.byAccount.set(acc, m.id); this.saveMember(m);
    return json({ code, state: this.stateView(m) });
  }

  // ----- 画面に返す形 -----
  // 参加人数（休眠・引退の人は数えない）。定員の判定にも使う
  activeCount() { let n = 0; for (const x of this.members.values()) if (x.status !== 'dormant' && x.status !== 'retired') n++; return n; }
  worldView() {
    const w = this.w;
    const now = Date.now();
    // 今の区切りが終わる時刻（時刻で決まる日程なら決まった時刻。切りかえ前は残りの節から見積もる）
    const endAt = w.clock ? G.phaseEndAt(now, w.phase) : w.phase === 'off' ? w.nextAt + Math.max(0, w.offLeft - 1) * this.tickMs() : w.nextAt + Math.max(0, G.SEASON_WEEKS - w.week - 1) * this.tickMs();
    return { year: w.year, season: w.season, week: w.week, weeks: G.SEASON_WEEKS, phase: w.phase, offLeft: w.offLeft, nextAt: w.nextAt, endAt, clock: !!w.clock, now, tickMin: this.tickMs() / 60000, players: this.activeCount() };
  }
  clubsView() {
    const count = new Map();
    for (const m of this.members.values()) if (m.pl.club != null && m.status !== 'retired' && !m.reserve) count.set(m.pl.club, (count.get(m.pl.club) || 0) + 1);
    return this.w.clubs.map((c) => ({ id: c.id, name: c.name, city: c.city, short: c.short, mark: c.mark, lg: c.lg, str: c.str, atk: c.atk, dfn: c.dfn, depth: c.depth, youth: c.youth, money: c.money, pop: c.pop, recruit: c.recruit, color: c.color, humans: count.get(c.id) || 0, cap: G.capOf(c.id) }));
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
    const all = [...this.members.values()];
    return { reserve: { n: G.reserveCount(all), cap: G.RESERVE_CAP }, world: this.worldView(), positions: G.positionInfo(this.w, all), scorers: this.ranking(null, 'goals'), motw: this.w.motw || null, news: (this.w.news || []).slice(0, 8), last: this.w.last ? { week: this.w.last.week, year: this.w.last.year } : null };
  }
  // 今季の個人成績の表（NPC＋本物のプレイヤー）。メモリから作るだけで、書き込みはしない
  seasonEntries() {
    const w = this.w, stats = this.npcSeason && this.npcSeason.season === w.season ? this.npcSeason.stats : {};
    const act = [...this.members.values()].filter((m) => m.status !== 'draft' && m.status !== 'retired' && m.pl.club != null && m.season);
    return G.SL.npcEntries(this.npcs, stats, w.clubs).concat(act.map((m) => G.SL.userEntry(m.pl, m.season, w.clubs, { key: 'u:' + m.id })));
  }
  // クラブの名簿（NPC＋本物のプレイヤー）。本物のプレイヤーが入った分、同じポジションのNPCが控え組に回る
  squadView(clubId, me) {
    const humans = [...this.members.values()].filter((x) => x.pl.club === clubId && !x.reserve && x.status !== 'retired' && x.status !== 'draft' && x.status !== 'dormant');
    const sq = G.SL.clubSquad(this.npcs, clubId, humans.map((x) => ({ pos: x.pl.pos })));
    const rows = sq.npcs.map(G.SL.npcView).concat(humans.map((x) => ({ type: 'user', me: x === me, name: x.pl.name, pos: x.pl.pos, age: x.pl.age, ovr: G.ovr(x.pl), no: x.pl.number, nat: '日本', style: '' })));
    return { rows, reserves: sq.reserves.length };
  }
  stateView(m) {
    const w = this.w, p = m.pl, lg = p.club != null ? w.clubs[p.club].lg : 1;
    const tables = G.LEAGUES.map((L) => G.standings(w, L.id).map((x) => ({ id: x.c.id, ...x.t })));
    const mates = p.club == null ? [] : [...this.members.values()].filter((x) => x !== m && x.pl.club === p.club && x.status !== 'retired' && x.status !== 'draft' && x.status !== 'dormant')
      .map((x) => (x.reserve
        ? { b: true, name: x.pl.name, pos: x.pl.pos, age: x.pl.age, ovr: G.ovr(x.pl), gen: x.gen, apps: (x.rsv || {}).apps || 0, goals: (x.rsv || {}).goals || 0, assists: (x.rsv || {}).assists || 0 }
        : { name: x.pl.name, pos: x.pl.pos, age: x.pl.age, ovr: G.ovr(x.pl), gen: x.gen, apps: x.season.apps, goals: x.season.goals, assists: x.season.assists }));
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
      results: w.last ? { week: w.last.week, year: w.last.year, list: w.last.results.filter((r) => r.lg === lg || r.goals.some((g) => g.human)) } : null,
      scorers: this.ranking(lg, 'goals'), assisters: this.ranking(lg, 'assists'), mates, squad: p.club != null ? this.squadView(p.club, m) : null, seasonHistory: w.history.slice(-3),
      motw: w.motw || null, records: { ...w.records, clubs: undefined, npcLegends: (w.records.npcLegends || []).slice(0, 20) }, clubRecord: cr, cohort, debutYear: m.debutYear,
      cup: w.cup ? { results: w.cup.results, alive: w.cup.alive, winner: w.cup.winner } : null,
      shop: m.status === 'draft' || m.status === 'retired' ? [] : G.SL.shopList(G.adapter(m, w)),
      caps: { club: G.CLUB_CAP, gk: G.GK_CAP, fw: G.FW_CAP, salary: G.SALARY_CAP },
      casino: this.tableView(m),
      keiba: m.kbBet && this.w.kb ? { round: this.w.kb.card.round, total: m.kbBet.bets.reduce((x, b) => x + b.a, 0), nextAt: this.w.kb.nextAt } : null,
      news: (w.news || []).slice(0, 12),
      me: {
        id: m.id, gen: m.gen, status: m.status, training: m.training, name: p.name, pos: p.pos, age: p.age, stats: p.stats, ovr: G.ovr(p),
        policy: G.POLICY[m.policy] ? m.policy : 'auto', sw: G.MOVE_SWITCH[m.sw] ? m.sw : 'bench',
        autoPlan: m.status === 'off' && m.offer ? (() => { const pl = G.planAuto(m, this.w, [...this.members.values()], this.npcs); return { kind: pl.kind, club: pl.offer ? pl.offer.club : null }; })() : null,
        appeal: p.appeal || null, move: p.move || null, outlook: G.SL.growthOutlook(p), returning: !!m.returning,
        depth: p.club != null && !m.reserve ? G.SL.depthOf(this.npcs, p.club, { pos: p.pos, ovr: G.ovr(p) }, [...this.members.values()].filter((x) => x !== m && x.pl.club === p.club && !x.reserve && x.status !== 'retired' && x.status !== 'draft' && x.status !== 'dormant').map((x) => ({ pos: x.pl.pos, ovr: G.ovr(x.pl) }))) : null,
        grow: p.growKnown ? p.grow : null, gtype: p.growKnown ? p.gtype : null, best: Math.max(p.best || 0, G.ovr(p)), cond: p.cond, fatigue: Math.round(p.fatigue), injury: p.injury, fame: Math.round(p.fame), money: p.money,
        club: p.club, salary: p.salary, contract: p.contract, number: p.number,
        season: { ...m.season, ratings: undefined, avg: G.avg(m.season.ratings) }, totals: m.totals, history: m.history, awards: m.awards, trophies: m.trophies,
        caps: m.caps, natGoals: m.natGoals, last: m.last, draft: m.draft, offer, summary: m.summary, winter: m.winter && m.status === 'active' ? { ...m.winter, closeAt: w.nextAt + Math.max(0, G.SL.WINTER.close - 1 - w.week) * this.tickMs() } : null, lineage: m.lineage, log: m.log.slice(-12),
        potLo: p.potLo, potHi: p.potHi, potKnown: p.potLo === p.potHi ? p.pot : null, records: m.records || null, cupSeason: m.cupSeason || null, lastCup: m.lastCup || null, motw: m.motw || 0, col: m.col || null, retirePlan: m.retirePlan || null, reserve: !!m.reserve, rsv: m.rsv ? { ...m.rsv, ratings: undefined, avg: G.avg(m.rsv.ratings || []) } : null, rsvLast: m.rsvLast || null, liveTitles: G.liveTitles(m, w),
        perks: { trainer: p.trainMul > 1, clinic: !!p.clinic, camp: !!p.camp, house: !!p.house, edu: p.edu || 0 },
      },
    };
  }
}
