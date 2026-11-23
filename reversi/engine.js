// リバーシのルール（ブラウザとサーバー（room-api）の両方で使う）
// 盤は長さ64の配列。0=空き 1=黒 2=白。黒が先手。
const DIRS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

export function initBoard() {
  const b = new Array(64).fill(0);
  b[27] = 2; b[28] = 1; b[35] = 1; b[36] = 2;
  return b;
}

// i に色 c を置いたときにひっくり返る石
export function flips(b, i, c) {
  if (b[i]) return [];
  const o = 3 - c, x0 = i % 8, y0 = (i / 8) | 0, out = [];
  for (const [dx, dy] of DIRS) {
    let x = x0 + dx, y = y0 + dy;
    const line = [];
    while (x >= 0 && x < 8 && y >= 0 && y < 8 && b[y * 8 + x] === o) { line.push(y * 8 + x); x += dx; y += dy; }
    if (line.length && x >= 0 && x < 8 && y >= 0 && y < 8 && b[y * 8 + x] === c) out.push(...line);
  }
  return out;
}

export function legal(b, c) {
  const r = [];
  for (let i = 0; i < 64; i++) if (!b[i] && flips(b, i, c).length) r.push(i);
  return r;
}

export function play(b, i, c) {
  const f = flips(b, i, c);
  if (!f.length) return null;
  const nb = b.slice();
  nb[i] = c;
  for (const j of f) nb[j] = c;
  return { board: nb, flipped: f };
}

export function count(b) {
  let k = 0, w = 0;
  for (const v of b) { if (v === 1) k++; else if (v === 2) w++; }
  return [k, w];
}

// c が打ったあと、次はだれの番か。turn=0 なら終局。pass=true なら相手が打てずパス
export function nextTurn(b, c) {
  const o = 3 - c;
  if (legal(b, o).length) return { turn: o, pass: false };
  if (legal(b, c).length) return { turn: c, pass: true };
  return { turn: 0, pass: false };
}

// ===== CPU =====
const W = [
  120, -20, 20, 5, 5, 20, -20, 120,
  -20, -40, -5, -5, -5, -5, -40, -20,
  20, -5, 15, 3, 3, 15, -5, 20,
  5, -5, 3, 3, 3, 3, -5, 5,
  5, -5, 3, 3, 3, 3, -5, 5,
  20, -5, 15, 3, 3, 15, -5, 20,
  -20, -40, -5, -5, -5, -5, -40, -20,
  120, -20, 20, 5, 5, 20, -20, 120,
];
const CORNER_OF = { 1: 0, 8: 0, 9: 0, 6: 7, 15: 7, 14: 7, 48: 56, 57: 56, 49: 56, 55: 63, 62: 63, 54: 63 };

function evalBoard(b, c) {
  const o = 3 - c;
  let s = 0;
  for (let i = 0; i < 64; i++) {
    if (!b[i]) continue;
    let w = W[i];
    // 角を取ったあとのそばのマスは危なくない
    if (i in CORNER_OF && b[CORNER_OF[i]]) w = 8;
    s += b[i] === c ? w : -w;
  }
  s += (legal(b, c).length - legal(b, o).length) * 6;
  return s;
}

function search(b, me, toMove, depth, alpha, beta, exact) {
  const moves = legal(b, toMove);
  if (!moves.length) {
    if (!legal(b, 3 - toMove).length) {
      const [k, w] = count(b);
      const d = me === 1 ? k - w : w - k;
      return d * 1000;
    }
    return search(b, me, 3 - toMove, depth, alpha, beta, exact);
  }
  if (depth === 0) return exact ? (() => { const [k, w] = count(b); return (me === 1 ? k - w : w - k) * 1000; })() : evalBoard(b, me);
  const maxing = toMove === me;
  moves.sort((x, y) => W[y] - W[x]);
  for (const m of moves) {
    const v = search(play(b, m, toMove).board, me, 3 - toMove, depth - 1, alpha, beta, exact);
    if (maxing) { if (v > alpha) alpha = v; } else if (v < beta) beta = v;
    if (alpha >= beta) break;
  }
  return maxing ? alpha : beta;
}

// level: 0=よわい 1=ふつう 2=つよい
export function cpuMove(b, c, level = 1) {
  const moves = legal(b, c);
  if (!moves.length) return -1;
  if (level === 0) {
    // ほぼランダム。たまに角だけは取る
    const corner = moves.find((m) => W[m] === 120);
    if (corner !== undefined && Math.random() < 0.5) return corner;
    return moves[(Math.random() * moves.length) | 0];
  }
  const empties = b.filter((v) => !v).length;
  const exact = level === 2 && empties <= 10;
  const depth = exact ? empties : level === 1 ? 1 : 4;
  let best = moves[0], bestV = -Infinity;
  for (const m of moves) {
    let v = search(play(b, m, c).board, c, 3 - c, depth - 1, -Infinity, Infinity, exact);
    if (level === 1) v += Math.random() * 12;
    if (v > bestV) { bestV = v; best = m; }
  }
  return best;
}
