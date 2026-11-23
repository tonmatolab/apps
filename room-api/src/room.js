// 1部屋 = 1つの Durable Object。盤面・手番・参加者をここだけが持ち、打った手はサーバーで確かめる。
// WebSocket は Hibernation API で受けるので、だれも打っていない間は課金時間がかからない。
import { DurableObject } from 'cloudflare:workers';
import * as R from '../../reversi/engine.js';

const ROOM_TTL = 24 * 3600 * 1000;      // 最後に動きがあってから24時間で部屋を消す
const REUSE_AFTER = 6 * 3600 * 1000;    // 6時間動きのない部屋の合言葉は使い回してよい
const NG_WORDS = ['死ね', 'しね', '殺す', 'ころす', 'fuck', 'shit', 'ちんこ', 'まんこ', 'ちんぽ', 'sex'];
const STAMPS = 8;

function cleanName(raw) {
  let s = String(raw || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim();
  s = [...s].slice(0, 10).join('');
  const low = s.toLowerCase();
  if (!s || NG_WORDS.some((w) => low.includes(w))) return 'ななし';
  return s;
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.s = null;
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => { this.s = (await ctx.storage.get('s')) || null; });
  }

  async save() {
    this.s.updated = Date.now();
    await this.ctx.storage.put('s', this.s);
  }

  sockets(except) {
    return this.ctx.getWebSockets().filter((w) => w !== except && w.readyState === 1);
  }

  view(except) {
    const s = this.s;
    const online = new Set(this.sockets(except).map((w) => (w.deserializeAttachment() || {}).pid));
    const players = s.players.map((p) => ({ pid: p.pid, name: p.name, online: online.has(p.pid), wins: s.wins[p.pid] || 0 }));
    const watchers = [...online].filter((pid) => !s.players.some((p) => p.pid === pid)).length;
    return {
      code: s.code, game: s.game, status: s.status, round: s.round,
      players, watchers, colors: s.colors, board: s.board, turn: s.turn,
      last: s.last, result: s.result, rematch: s.rematch,
      legal: s.status === 'playing' ? R.legal(s.board, s.turn) : [],
    };
  }

  broadcast(msg, except) {
    const data = JSON.stringify(msg);
    for (const w of this.sockets(except)) { try { w.send(data); } catch {} }
  }
  sendState(except) { this.broadcast({ t: 'state', s: this.view(except) }, except); }

  start() {
    const s = this.s;
    const pids = s.players.map((p) => p.pid);
    // 再戦なら先手（黒）を交代。初回や相手が変わったときはランダム
    if (s.round > 0 && s.colors && s.colors.every((p) => pids.includes(p))) s.colors = [s.colors[1], s.colors[0]];
    else s.colors = Math.random() < 0.5 ? pids : [pids[1], pids[0]];
    s.round += 1;
    s.status = 'playing';
    s.board = R.initBoard();
    s.turn = 1;
    s.last = null;
    s.result = null;
    s.rematch = [];
  }

  finish(winner, reason) {
    const s = this.s;
    const [k, w] = R.count(s.board);
    s.status = 'over';
    s.turn = 0;
    s.result = { winner, reason, counts: [k, w] };
    if (winner) { const pid = s.colors[winner - 1]; s.wins[pid] = (s.wins[pid] || 0) + 1; }
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/init') {
      const { code, game } = await req.json();
      const now = Date.now();
      if (this.s && (now - this.s.updated < REUSE_AFTER || this.sockets().length)) return json({ error: 'busy' }, 409);
      this.s = { code, game, created: now, updated: now, players: [], colors: null, status: 'waiting', round: 0,
        board: R.initBoard(), turn: 0, last: null, result: null, rematch: [], wins: {} };
      await this.save();
      await this.ctx.storage.setAlarm(now + ROOM_TTL);
      return json({ ok: true });
    }
    if (url.pathname === '/info') {
      if (!this.s) return json({ exists: false });
      return json({ exists: true, game: this.s.game, status: this.s.status, players: this.s.players.map((p) => p.name) });
    }

    // ----- WebSocket で入室 -----
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    const pid = String(url.searchParams.get('pid') || '');
    if (!this.s || !/^[a-z0-9]{8,32}$/i.test(pid)) {
      server.send(JSON.stringify({ t: 'error', e: this.s ? 'bad' : 'notfound' }));
      server.close(4004, 'no room');
      return new Response(null, { status: 101, webSocket: client });
    }
    server.serializeAttachment({ pid, stampAt: 0 });
    const name = cleanName(url.searchParams.get('name'));
    const s = this.s;
    const me = s.players.find((p) => p.pid === pid);
    if (me) me.name = name;
    else if (s.players.length < 2 && s.status !== 'playing') s.players.push({ pid, name });
    if (s.players.length === 2 && s.status === 'waiting') this.start();
    await this.save();
    this.sendState();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    if (!this.s || typeof raw !== 'string' || raw.length > 200) return;
    let m; try { m = JSON.parse(raw); } catch { return; }
    const att = ws.deserializeAttachment() || {};
    const pid = att.pid;
    const s = this.s;
    const color = s.colors ? s.colors.indexOf(pid) + 1 : 0; // 1=黒 2=白 0=観戦
    const isPlayer = s.players.some((p) => p.pid === pid);

    if (m.t === 'move') {
      const i = m.i | 0;
      if (s.status !== 'playing' || !color || s.turn !== color || i < 0 || i > 63) return ws.send(JSON.stringify({ t: 'state', s: this.view() }));
      const r = R.play(s.board, i, color);
      if (!r) return ws.send(JSON.stringify({ t: 'state', s: this.view() }));
      s.board = r.board;
      const nt = R.nextTurn(s.board, color);
      s.last = { i, flipped: r.flipped, by: color, pass: nt.pass ? 3 - color : 0 };
      if (nt.turn) s.turn = nt.turn;
      else {
        const [k, w] = R.count(s.board);
        this.finish(k > w ? 1 : w > k ? 2 : 0, 'end');
      }
      await this.save();
      return this.sendState();
    }
    if (m.t === 'resign') {
      if (s.status !== 'playing' || !color) return;
      this.finish(3 - color, 'resign');
      await this.save();
      return this.sendState();
    }
    if (m.t === 'rematch') {
      if (s.status !== 'over' || !isPlayer || s.players.length < 2) return;
      if (!s.rematch.includes(pid)) s.rematch.push(pid);
      if (s.rematch.length >= 2) this.start();
      await this.save();
      return this.sendState();
    }
    if (m.t === 'leave') {
      if (s.status === 'playing' && color) this.finish(3 - color, 'leave');
      s.players = s.players.filter((p) => p.pid !== pid);
      s.rematch = [];
      if (s.status !== 'playing') s.status = 'waiting';
      await this.save();
      try { ws.close(1000, 'bye'); } catch {}
      return this.sendState(ws);
    }
    if (m.t === 'stamp') {
      const k = m.k | 0;
      const now = Date.now();
      if (k < 0 || k >= STAMPS || now - (att.stampAt || 0) < 800) return;
      att.stampAt = now; ws.serializeAttachment(att);
      return this.broadcast({ t: 'stamp', pid, k });
    }
  }

  async webSocketClose(ws) {
    if (this.s) this.sendState(ws);
  }
  async webSocketError(ws) {
    if (this.s) this.sendState(ws);
  }

  async alarm() {
    if (!this.s) return this.ctx.storage.deleteAll();
    const idle = Date.now() - this.s.updated;
    if (idle >= ROOM_TTL && !this.sockets().length) {
      for (const w of this.ctx.getWebSockets()) { try { w.close(1000, 'expired'); } catch {} }
      this.s = null;
      await this.ctx.storage.deleteAll();
    } else {
      await this.ctx.storage.setAlarm(this.s.updated + ROOM_TTL);
    }
  }
}
