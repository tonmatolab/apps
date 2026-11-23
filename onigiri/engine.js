// おにぎりの形と硬さのシミュレーション（画面に依存しない部分。node でもテストできる）
// 形は「中心からの距離 r(θ)」を N 方向ぶん持つ。上の手が「へ」の字で2面を押し、下の手のひらが丸く支える。
// 1回握ると上に角が1つできる → 1/3回転して握る、を繰り返すと三角になる。
(function (root) {
  'use strict';
  const N = 96, TAU = Math.PI * 2, DT = TAU / N, DEG = Math.PI / 180;
  const V_N = [30 * DEG, 150 * DEG];      // 上の手（へ の字）の2面の向き
  const CUP0 = 238 * DEG, CUP1 = 302 * DEG; // 下の手のひらが当たる範囲
  const GAP0 = [190 * DEG, 238 * DEG], GAP1 = [302 * DEG, 350 * DEG]; // 上の手と下の手のすき間
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const wrap = (a) => ((a % TAU) + TAU) % TAU;

  // 米の量(g)と硬さ c(0〜1) から面積。110g・c=0.5 で半径1の円と同じ面積
  const areaTarget = (M, c) => Math.PI * (M / 110) * (1.3 - 0.6 * c);
  const areaOf = (r) => { let s = 0; for (let i = 0; i < N; i++) s += r[i] * r[i]; return 0.5 * s * DT; };

  function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  function makeRice(M, seed) {
    const R = rng(seed || 7), r = new Float32Array(N);
    const ph = [R() * TAU, R() * TAU, R() * TAU, R() * TAU], am = [0.025, 0.03, 0.015, 0.01];
    const rc = Math.sqrt(areaTarget(M, 0.12) / Math.PI);
    for (let i = 0; i < N; i++) {
      const t = i * DT; let k = 1;
      for (let j = 0; j < 4; j++) k += am[j] * Math.sin((j + 1) * t + ph[j]);
      r[i] = rc * k;
    }
    const st = { r, rot: 0, c: 0.12, M, M0: M, lost: 0, sq: 0, pressT: 0, overT: 0, wet: 1, pressing: false, clip: new Uint8Array(N), contact: 0 };
    fixArea(st, 1);
    return st;
  }
  function fixArea(st, k) {
    const At = areaTarget(st.M, st.c), A = areaOf(st.r), s = 1 + (Math.sqrt(At / A) - 1) * k;
    for (let i = 0; i < N; i++) st.r[i] *= s;
  }
  // 手の位置（画面の向きで）。p=押す強さ 0〜1。o=手の開き具合（演出用、0=触れている）
  function hands(st, p) {
    const rc = Math.sqrt(areaTarget(st.M, st.c) / Math.PI);
    return { rc, d: rc * (1.25 - 0.42 * p), db: rc * (1.14 - 0.24 * p) };
  }
  // 1フレーム進める。p>0 なら握っている
  function step(st, p, dt, opt) {
    opt = opt || {};
    const r = st.r, clip = st.clip; clip.fill(0);
    const { rc, d, db } = hands(st, p);
    let contact = 0;
    if (p > 0.02) {
      const ease = Math.min(1, dt * 22);
      // clip: 1=手に押された 2=手と手のすき間（形がそのまま残る。前に作った角がここで守られる）
      for (let i = 0; i < N; i++) {
        const phi = wrap(i * DT + st.rot);
        const gap = (phi > GAP0[0] && phi < GAP0[1]) || (phi > GAP1[0] && phi < GAP1[1]);
        let lim = Infinity;
        for (const n of V_N) { const cs = Math.cos(phi - n); if (cs > 0.04) lim = Math.min(lim, d / cs); }
        if (phi > CUP0 && phi < CUP1) lim = Math.min(lim, db);
        if (gap) lim = Math.min(lim, rc * 1.5);
        if (r[i] > lim) { r[i] = lerp(r[i], lim, ease); clip[i] = 1; contact++; }
        else if (gap) clip[i] = 2;
      }
      // 押されたぶんの米は、手の当たっていない上の角へ逃げる
      const At = areaTarget(st.M, st.c);
      let Ac = 0, Au = 0;
      for (let i = 0; i < N; i++) (clip[i] ? (Ac += r[i] * r[i]) : (Au += r[i] * r[i]));
      Ac *= 0.5 * DT; Au *= 0.5 * DT;
      if (Au > 1e-6) {
        const s = clamp(Math.sqrt(Math.max(At - Ac, Au * 0.95) / Au), 0.995, 1 + dt * 1.6);
        for (let i = 0; i < N; i++) if (!clip[i]) r[i] = Math.min(r[i] * s, rc * 1.42);
      }
      // 硬くなる（ぬれすぎだと固まりにくい）
      const wetK = st.wet >= 4 ? 0.7 : st.wet >= 3 ? 0.88 : 1;
      // 1秒ぎゅっ ≒ +0.07。押しっぱなし（力MAX）はさらに固くなる
      const gain = dt * ((opt.gain || 0.3) * p + (p > 0.97 ? 0.22 : 0)) * (contact / N) * wetK;
      st.c = clamp(st.c + gain * (1.1 - st.c * 0.5), 0, 1);
      st.pressT += dt; if (p > 0.97) st.overT += dt;
    }
    st.contact = contact / N;
    // ならす（やわらかいほど丸く戻る。握っている間は少しだけ）
    const a = p > 0.02 ? dt * 0.5 : dt * (0.25 + 1.4 * Math.max(0, 0.75 - st.c));
    const tmp = Float32Array.from(r);
    for (let i = 0; i < N; i++) r[i] = lerp(tmp[i], (tmp[(i + N - 1) % N] + tmp[(i + 1) % N]) / 2, clamp(a * 2, 0, 0.5));
    if (p <= 0.02) fixArea(st, Math.min(1, dt * 5));
  }
  // 形の特徴：k回対称の強さ（3なら三角、2なら俵/レモン、4なら四角）
  function harmonics(r) {
    let mean = 0; for (let i = 0; i < N; i++) mean += r[i]; mean /= N;
    const h = [0];
    for (let k = 1; k <= 6; k++) {
      let a = 0, b = 0;
      for (let i = 0; i < N; i++) { a += r[i] * Math.cos(k * i * DT); b += r[i] * Math.sin(k * i * DT); }
      h.push(Math.hypot(a, b) * 2 / N / mean);
    }
    return { mean, h };
  }
  // 細長さ（面積の2次モーメントの長軸/短軸）
  function aspectOf(r) {
    let xx = 0, yy = 0, xy = 0;
    for (let i = 0; i < N; i++) { const t = i * DT, w = r[i] ** 4, c = Math.cos(t), s = Math.sin(t); xx += w * c * c; yy += w * s * s; xy += w * c * s; }
    const tr = xx + yy, q = Math.sqrt(Math.max(0, tr * tr / 4 - (xx * yy - xy * xy)));
    return Math.sqrt((tr / 2 + q) / Math.max(1e-9, tr / 2 - q));
  }
  function shapeOf(st) {
    const { h } = harmonics(st.r);
    const h1 = h[1], h2 = h[2], h3 = h[3], h4 = h[4];
    const other = h1 * 0.8 + h2 + h4 + h[5] * 0.6;
    let type, q = 0;
    // q＝三角のきれいさ（0〜1）。角の立ち具合 × ゆがみの少なさ
    if (h3 >= 0.042 && h3 > h2 * 1.75 && h3 > h4 * 1.4) {
      type = 'tri'; q = clamp((h3 - 0.05) / 0.06, 0, 1) * clamp(1.25 - (other / h3) * 1.1, 0, 1);
    } else if (Math.max(h1, h2, h3, h4) < 0.07 && h2 + h3 + h4 < 0.16) type = 'round';
    else if (h2 >= 0.06 && h2 > h3 * 1.3 && h2 > h4 * 1.2) type = h1 > 0.06 ? 'drop' : 'oval';
    else if (h4 >= 0.06 && h4 > h3 && h4 > h2 * 1.1) type = 'square';
    else if ((h1 > 0.05 || h2 > 0.05) && h3 > 0.08 && h4 < h3 * 0.6) type = 'drop';
    else type = aspectOf(st.r) >= 1.27 ? 'oval' : 'ibitsu'; // 細長いものは俵あつかい（半回転ずつ握ると出やすい）
    return { type, q, h };
  }

  root.ONIGIRI_ENGINE = { N, DT, TAU, DEG, V_N, CUP0, CUP1, areaTarget, areaOf, makeRice, step, hands, harmonics, shapeOf, clamp, lerp, rng, wrap };
})(typeof window !== 'undefined' ? window : globalThis);
