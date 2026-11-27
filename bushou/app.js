'use strict';
const $ = (id) => document.getElementById(id);
const API = 'https://tonmatolab-counter.tonmatolab.workers.dev';
const SITE = 'tonmatolab.tonmatolab.workers.dev/bushou';
const HASHTAGS = ['名将ガチャ'];
const AFFILIATE = { amazonTag: '' }; // 例: 'yourname-22'
const RECS = [
  { label: '名入れの印鑑・はんこ', q: '名入れ 印鑑 はんこ' },
  { label: '家紋グッズ（手ぬぐい・Tシャツ）', q: '家紋 グッズ' },
  { label: '学習まんが 戦国時代', q: '学習まんが 日本の歴史 戦国' },
  { label: '戦国武将の甲冑フィギュア', q: '甲冑 フィギュア 戦国武将' },
];
const RANK_ORDER = ['nami', 'ryo', 'mei', 'ten', 'den'];

const store = {
  get(k) { try { return localStorage.getItem('bushou_' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('bushou_' + k, v); } catch {} },
};
async function api(path, method = 'GET') {
  try { const r = await fetch(API + path, { method, signal: AbortSignal.timeout(8000) }); return r.ok ? await r.json() : null; } catch { return null; }
}

// ===== 効果音 =====
let ac = null;
function audio() { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch {} return ac; }
function tone(f, dur, type = 'sine', vol = .2, at = 0) {
  const a = audio(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, a.currentTime + at);
  g.gain.setValueAtTime(vol, a.currentTime + at); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + at + dur);
  o.connect(g).connect(a.destination); o.start(a.currentTime + at); o.stop(a.currentTime + at + dur);
}
function noise(dur, freq, vol = .3, at = 0) {
  const a = audio(); if (!a) return;
  const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource(); s.buffer = buf;
  const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq;
  const g = a.createGain(); g.gain.value = vol;
  s.connect(f).connect(g).connect(a.destination); s.start(a.currentTime + at);
}
const sfx = {
  drum() { tone(70, .35, 'sine', .5); noise(.15, 200, .25); },
  shine(level) { [523, 659, 784, 1047, 1319, 1568].slice(0, 2 + level).forEach((f, i) => tone(f, .35, 'triangle', .16, i * .08)); },
  clash() { noise(.3, 1800, .35); tone(110, .2, 'square', .12); },
  cut() { noise(.25, 3500, .3); tone(880, .15, 'sawtooth', .08); },
  horn() { tone(196, .9, 'sawtooth', .1); tone(247, .9, 'sawtooth', .07, .05); },
  win() { [392, 523, 659, 784].forEach((f, i) => tone(f, .4, 'triangle', .18, i * .12)); },
};

// ===== 画面切替 =====
function show(id) {
  ['home', 'cardView', 'battleView'].forEach((s) => $(s).classList.toggle('hidden', s !== id));
  window.scrollTo(0, 0);
}

// ===== ホーム =====
function renderHome() {
  const fan = $('fan');
  const samples = ['織田信長', 'さくら', 'たろう'];
  fan.innerHTML = samples.map((n, i) => {
    const b = makeBushou(n);
    const rot = (i - 1) * 12, dx = (i - 1) * 92, dy = Math.abs(i - 1) * 16;
    return `<div class="mini" style="transform:translateX(calc(-50% + ${dx}px)) translateY(${dy}px) rotate(${rot}deg);z-index:${i === 1 ? 3 : 1};border-color:${b.rarity.color}">${portraitSVG(b)}<b>${b.rarity.name}・${b.nick}</b></div>`;
  }).join('');
  $('rarList').innerHTML = RARITIES.map((r) => `<span style="background:${r.color}">${r.name} ${(r.p * 100).toFixed(r.p < .01 ? 1 : 0)}%</span>`).join('');
  $('sMine').textContent = store.get('count') || '0';
  const best = store.get('best');
  $('sBest').textContent = best ? RARITIES.find((r) => r.id === best).name : '-';
  loadTop();
  api('/get?keys=bushou-play').then((j) => { $('sPlay').textContent = j ? (j['bushou-play'] || 0).toLocaleString() : '-'; });
}

// ===== 召喚演出 =====
let summonSkip = null;
function summon(name) {
  const b = makeBushou(name);
  audio();
  if (!store.get('played')) { store.set('played', '1'); api('/hit/bushou-play', 'POST'); }
  store.set('count', String(Number(store.get('count') || 0) + 1));
  const best = store.get('best');
  if (!best || RANK_ORDER.indexOf(b.rarity.id) > RANK_ORDER.indexOf(best)) store.set('best', b.rarity.id);

  const el = $('summon'), cv = $('smCv'), g = cv.getContext('2d');
  el.classList.remove('hidden');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const W = innerWidth, H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const lvl = RANK_ORDER.indexOf(b.rarity.id);
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(portraitSVG(b));
  const kimg = new Image();
  kimg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${kamonSVG(b.kamon, '#e8c14a', 50, 50, 48)}</svg>`);
  const T = 3.6 + lvl * .5; // レアほど長く
  let t0 = performance.now(), done = false, drums = 0;
  const finish = () => { if (done) return; done = true; el.classList.add('hidden'); openCard(b, true); };
  summonSkip = finish;
  const tick = (now) => {
    if (done) return;
    const t = (now - t0) / 1000;
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    // 太鼓のリズム
    if (t > drums * .45 && t < 1.8) { drums++; sfx.drum(); }
    // 家紋が回りながら大きく
    const k = Math.min(1, t / 1.8);
    g.save(); g.translate(cx, cy); g.rotate(t * (2 + k * 6));
    const ks = 80 + k * 120;
    g.globalAlpha = .9; g.drawImage(kimg, -ks / 2, -ks / 2, ks, ks); g.restore(); g.globalAlpha = 1;
    // 光の筋（レア度の色）
    if (t > 1.2) {
      const p = Math.min(1, (t - 1.2) / 1.2);
      g.save(); g.translate(cx, cy);
      for (let i = 0; i < 18 + lvl * 6; i++) {
        const a = i / (18 + lvl * 6) * Math.PI * 2 + t * .8;
        g.fillStyle = lvl === 4 ? `hsla(${(i * 40 + t * 200) % 360},90%,60%,${.35 * p})` : hexA(b.rarity.glow, .35 * p);
        g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 900, Math.sin(a) * 900); g.lineTo(Math.cos(a + .06) * 900, Math.sin(a + .06) * 900); g.fill();
      }
      g.restore();
    }
    // 予告テキスト（名将以上）
    if (lvl >= 2 && t > 1.5 && t < 2.6) {
      g.fillStyle = b.rarity.color; g.font = `800 ${28 + lvl * 4}px "Shippori Mincho"`; g.textAlign = 'center';
      g.fillText(lvl === 4 ? '天 変 地 異 ！？' : lvl === 3 ? '只者ではない…！' : '気配が違う…', cx, cy - 150);
    }
    // フラッシュ
    if (t > 2.6 && t < 2.9) { g.fillStyle = `rgba(255,255,255,${1 - (t - 2.6) / .3})`; g.fillRect(0, 0, W, H); }
    if (t > 2.6 && !tick.shone) { tick.shone = true; sfx.shine(lvl); if (navigator.vibrate) navigator.vibrate(lvl >= 3 ? [60, 40, 120] : 40); }
    // 肖像が現れる
    if (t > 2.6) {
      const p = Math.min(1, (t - 2.6) / .6), ease = 1 - Math.pow(1 - p, 3);
      const pw = Math.min(W * .7, 300), ph = pw * 1.2;
      g.save(); g.globalAlpha = ease; g.translate(cx, cy - 20); g.scale(.6 + ease * .4, .6 + ease * .4);
      g.shadowColor = b.rarity.glow; g.shadowBlur = 40;
      g.drawImage(img, -pw / 2, -ph / 2, pw, ph); g.restore();
      g.globalAlpha = ease; g.textAlign = 'center';
      g.fillStyle = b.rarity.color; g.font = '800 26px "Shippori Mincho"'; g.fillText(`【${b.rarity.name}】`, cx, cy + ph / 2 + 10);
      g.fillStyle = '#fff'; g.font = '800 30px "Shippori Mincho"'; g.fillText(`${b.nick}`, cx, cy + ph / 2 + 48);
      g.globalAlpha = 1;
    }
    if (t > T) return finish();
    requestAnimationFrame(tick);
  };
  tick.shone = false;
  requestAnimationFrame(tick);
}
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }

// ===== 武将カード =====
let curB = null;
function cardHTML(b) {
  const bars = STAT_KEYS.map((k) => `<div class="bar"><span>${STAT_NAMES[k]}</span><i><em style="width:${b.stats[k]}%"></em></i><b>${b.stats[k]}</b></div>`).join('');
  const sk = b.skills.map((s) => `<div class="skill ${s.kind}"><b>${s.name}</b>${s.desc}</div>`).join('');
  return `<div class="card ${b.rarity.id === 'den' ? 'den' : ''}" style="--rc:${b.rarity.color}">
    <div class="rbadge">${b.rarity.name}</div>
    <div class="pw"><small>総合戦闘力</small><b>${b.power}</b></div>
    <div class="pic">${portraitSVG(b)}</div>
    <div class="namebox"><div class="nick">${esc(b.nick)}</div><div class="nm">${esc(b.name)}</div><span class="troop">${b.troop.icon} ${b.troop.name}隊</span></div>
    <div class="body"><div class="radar">${radarSVG(b.stats, b.rarity.color)}</div><div class="bars">${bars}</div></div>
    <div class="skills">${sk}</div>
  </div>`;
}
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
function openCard(b, from) {
  curB = b;
  $('cardBox').innerHTML = cardHTML(b);
  $('vsIn').value = '';
  $('backBattle').classList.toggle('hidden', from !== 'battle');
  setTimeout(() => cachedImage('card:' + b.key, () => cardImage(b)), 300);
  $('backBattle').textContent = BT && BT.tenka ? '← 天下統一の結果に戻る' : '← 合戦の結果に戻る';
  show('cardView');
  if (from !== 'battle') history.replaceState(null, '', `?n=${encodeURIComponent(b.name)}`);
}
function backToBattle() {
  if (!BT) return;
  show('battleView');
  if (!BT.tenka) history.replaceState(null, '', `?a=${encodeURIComponent(BT.A.name)}&b=${encodeURIComponent(BT.B.name)}`);
  btDraw();
}

// ===== 天下統一 =====
let TENKA = null;
async function startTenka(name) {
  const btn = $('tenkaBtn'); btn.disabled = true; btn.textContent = '全国の武将を集めています…';
  audio();
  const r = await fetch(API + '/bushou/tenka', { method: 'POST', body: JSON.stringify({ name }) } /* Content-Type なし＝事前確認なし */)
    .then((x) => x.json()).catch(() => null);
  btn.disabled = false; btn.textContent = '出陣する';
  if (!r || r.error) { alert(r && r.error === 'bad_name' ? 'その名前では出陣できません。別の名前にしてください。' : '通信に失敗しました。時間をおいてもう一度お試しください。'); return; }
  TENKA = { me: makeBushou(name), data: r, idx: 0, fast: false, id: Date.now() };
  playTenka();
}
function renderTenkaBar() {
  const T = TENKA, n = 10;
  let s = '';
  for (let i = 0; i < n; i++) {
    const m = T.data.matches[i];
    const boss = i === n - 1;
    let cls = boss ? 'boss' : '';
    if (i < T.idx || (i === T.idx && BT && BT.done)) cls += m && m.win ? ' won' : m ? ' lost' : '';
    else if (i === T.idx) cls += ' now';
    s += `<span class="${cls}">${boss ? '🏯' : '⛩️'}<small>${boss ? '最強' : i + 1}</small></span>`;
  }
  $('tenkaBar').innerHTML = s;
}
function playTenka() {
  const T = TENKA, m = T.data.matches[T.idx];
  startBattle(T.me.name, m.name, { seed: m.seed, tenka: true });
  if ((BT.res.winner === 0) !== m.win) console.warn('replay mismatch', m);
  renderTenkaBar();
  logLine(`天下統一 ${m.boss ? '最終戦（全国最強）' : `第${T.idx + 1}戦`}：${m.name}の城を攻める！`, 'round');
}
function tenkaAfterBattle(rout) {
  const T = TENKA, m = T.data.matches[T.idx], d = T.data;
  renderTenkaBar();
  const box = $('tenkaBox');
  box.classList.remove('hidden');
  $('tkRank').classList.add('hidden'); $('nextBtn').classList.add('hidden'); $('tkFinal').classList.add('hidden');
  const more = m.win && T.idx + 1 < d.matches.length;
  if (more) {
    $('tkTitle').textContent = `${T.idx + 1}連勝！`;
    $('tkSub').textContent = `${m.name}は${rout}`;
    $('nextBtn').textContent = T.data.matches[T.idx + 1].boss ? '最後の城へ（全国最強）▶' : '次の城へ ▶';
    $('nextBtn').classList.remove('hidden');
    if (T.fast) setTimeout(() => { if (TENKA === T && !$('nextBtn').classList.contains('hidden')) nextTenka(); }, 700);
    return;
  }
  // 終了
  sfx.win();
  $('tkTitle').textContent = d.unified ? '天下統一！' : `${d.streak}連勝で散った…`;
  $('tkSub').textContent = d.unified ? `全国最強の${m.name}をも打ち破り、天下を手にした！` : `${m.name}に敗れた。${T.me.name}は${rout}`;
  $('tkRank').textContent = `自己ベスト ${d.best}連勝｜全国 ${d.rank}位 / ${d.total}武将`;
  $('tkRank').classList.remove('hidden');
  $('tkFinal').classList.remove('hidden');
  loadTop();
  cachedImage('tenka:' + T.id, tenkaImage);
}
function nextTenka() { TENKA.idx++; $('tenkaBox').classList.add('hidden'); playTenka(); }
function shareTenka() {
  const T = TENKA, d = T.data, b = T.me;
  const text = d.unified
    ? `【天下統一】「${b.name}」（${b.rarity.name}・${b.nick}）が全国の武将を10人抜きして天下統一！🏯\n全国${d.rank}位`
    : `「${b.name}」（${b.rarity.name}・${b.nick}）で天下統一に挑み、${d.streak}連勝で散った…⚔️\n自己ベスト${d.best}連勝・全国${d.rank}位`;
  shareRich(text + '\n\nあなたの名前は何連勝できる？', pageUrl(), 'tenka:' + T.id, tenkaImage, 'bushou-tenka.png',
    [{ key: 'card:' + b.key, make: () => cardImage(b), filename: `bushou-${b.name}.png` }]);
}

// ===== 全国番付 =====
let TOP = null, topTab = 'streak';
async function loadTop() {
  const j = await api('/bushou/top');
  TOP = j; renderTop();
}
function renderTop() {
  const el = $('topList');
  if (!TOP) { el.innerHTML = '<li class="empty">読み込めませんでした</li>'; return; }
  $('topTotal').textContent = `登録 ${TOP.total.toLocaleString()}武将`;
  const rows = TOP[topTab];
  if (!rows.length) { el.innerHTML = `<li class="empty">${topTab === 'streak' ? 'まだ誰も連勝していません。一番乗りを狙え！' : 'まだ登録された武将がいません'}</li>`; return; }
  el.innerHTML = '';
  rows.forEach((r, i) => {
    const b = makeBushou(r.name);
    const li = document.createElement('li');
    li.innerHTML = `<span class="no">${i + 1}</span><span class="face">${portraitSVG(b)}</span><span class="nm"></span><span class="v">${r.v}<small>${topTab === 'streak' ? '連勝' : ''}</small></span>`;
    li.querySelector('.nm').innerHTML = `${esc(r.name)}<small style="color:${b.rarity.color}">${b.rarity.name}・${esc(b.nick)}</small>`;
    li.onclick = () => openCard(b);
    el.appendChild(li);
  });
}

// ===== 合戦 =====
const bcv = $('btCv'), bg = bcv.getContext('2d');
const BW = 360, BH = 300;
let BT = null;
function fighterHTML(b, side) {
  return `<div class="face">${portraitSVG(b)}</div><div class="who"><b>${esc(b.name)}</b><small>${b.rarity.name}・${b.troop.icon}${b.troop.name}・${b.power}</small></div>`;
}
function startBattle(nameA, nameB, opt = {}) {
  audio();
  if (!store.get('played')) { store.set('played', '1'); api('/hit/bushou-play', 'POST'); }
  const A = makeBushou(nameA), B = makeBushou(nameB);
  const res = simulateBattle(A, B, opt.seed ? seeded('battle:' + opt.seed) : Math.random);
  if (!opt.tenka) history.replaceState(null, '', `?a=${encodeURIComponent(A.name)}&b=${encodeURIComponent(B.name)}`);
  $('fL').innerHTML = fighterHTML(A, 0); $('fR').innerHTML = fighterHTML(B, 1);
  $('log').innerHTML = ''; $('resultBox').classList.add('hidden'); $('tenkaBox').classList.add('hidden'); $('skipBtn').classList.remove('hidden');
  $('tenkaBar').classList.toggle('hidden', !opt.tenka); $('skipAllBtn').classList.toggle('hidden', !opt.tenka || (TENKA && TENKA.fast));
  show('battleView');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  bcv.width = BW * dpr; bcv.height = BH * dpr; bg.setTransform(dpr, 0, 0, dpr, 0, 0);
  const mk = (b) => { const i = new Image(); i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(portraitSVG(b)); return i; };
  BT = {
    A, B, res, imgs: [mk(A), mk(B)], troops: [res.max[0], res.max[1]], max: res.max,
    i: 0, stepT: 0, stepDur: 0, cur: null, t: 0, charge: 0, dust: [], floaters: [], cutIn: null, fallen: [[], []], done: false, skip: false,
    soldiers: [makeArmy(0), makeArmy(1)], tenka: !!opt.tenka, id: Date.now() + Math.random(),
  };
  if (opt.tenka && TENKA && TENKA.fast) BT.skip = true;
  setHP();
  sfx.horn();
  cancelAnimationFrame(BT.raf);
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    btUpdate(dt); btDraw();
    if (!BT.done) BT.raf = requestAnimationFrame(loop);
  };
  BT.raf = requestAnimationFrame(loop);
}
function makeArmy(side) {
  const arr = [];
  for (let i = 0; i < 24; i++) {
    const col = i % 4, row = Math.floor(i / 4);
    arr.push({ bx: side === 0 ? 30 + col * 22 + (row % 2) * 8 : BW - 30 - col * 22 - (row % 2) * 8, by: 150 + row * 22, alive: true, ph: Math.random() * 6 });
  }
  return arr;
}
function setHP() {
  const [a, b] = BT.troops, [ma, mb] = BT.max;
  $('hpL').style.width = Math.max(0, a / ma * 100) + '%'; $('hpR').style.width = Math.max(0, b / mb * 100) + '%';
  $('hpnL').textContent = `${Math.max(0, Math.round(a)).toLocaleString()}人`; $('hpnR').textContent = `${Math.max(0, Math.round(b)).toLocaleString()}人`;
}
function logLine(text, cls = '') {
  const p = document.createElement('p'); p.textContent = text; if (cls) p.className = cls;
  const box = $('log'); box.appendChild(p);
  while (box.children.length > 7) box.removeChild(box.firstChild);
}
const DUR = { say: .9, cut: 1.5, hit: .55, round: 1.0, charge: .9, heal: .5, roundEnd: .35, end: .3 };
function btUpdate(dt) {
  const S = BT; S.t += dt;
  if (S.cutIn) { S.cutIn.t += dt; if (S.cutIn.t > 1.4) S.cutIn = null; }
  S.dust = S.dust.filter((d) => (d.t += dt) < d.life);
  S.floaters = S.floaters.filter((f) => (f.t += dt) < 1.1);
  S.charge = Math.max(0, S.charge - dt * 1.2);
  S.stepT += dt;
  const speed = S.skip ? 12 : 1;
  if (S.stepT * speed < S.stepDur) return;
  // 次のイベントへ
  if (S.i >= S.res.events.length) { if (!S.done) finishBattle(); return; }
  const e = S.res.events[S.i++];
  S.stepT = 0; S.stepDur = DUR[e.type] || .5;
  const names = [S.A.name, S.B.name];
  if (e.type === 'say') logLine(e.text);
  if (e.type === 'round') { logLine(`―― 第${['一', '二', '三'][e.round - 1]}戦 ――`, 'round'); S.banner = { text: `第${['一', '二', '三'][e.round - 1]}戦`, t: 0 }; if (!S.skip) sfx.drum(); }
  if (e.type === 'charge') { S.charge = 1; if (!S.skip) sfx.clash(); for (let i = 0; i < 14; i++) S.dust.push({ x: BW / 2 + (Math.random() - .5) * 120, y: 160 + Math.random() * 110, r: 8 + Math.random() * 18, t: 0, life: .8 + Math.random() * .6 }); }
  if (e.type === 'cut') { logLine(e.text, 'cut'); if (!S.skip) { S.cutIn = { side: e.side, skill: e.skill, t: 0 }; sfx.cut(); if (navigator.vibrate) navigator.vibrate(30); } }
  if (e.type === 'hit' || e.type === 'heal' || e.type === 'roundEnd' || e.type === 'end') {
    if (e.troops) {
      for (const s of [0, 1]) {
        const before = S.troops[s]; S.troops[s] = e.troops[s];
        // 兵の数を見た目に反映
        const alive = Math.ceil(Math.max(0, S.troops[s]) / S.max[s] * 24);
        S.soldiers[s].forEach((so, idx) => {
          const should = idx < alive;
          if (so.alive && !should) { so.alive = false; so.fall = 0; }
          if (!so.alive && should) { so.alive = true; so.fall = undefined; }
        });
        if (e.type === 'hit' && s === e.side && before > S.troops[s]) S.floaters.push({ side: s, text: `-${e.dmg}`, t: 0, fire: e.fire });
      }
      setHP();
    }
  }
  if (e.type === 'end') finishBattle();
}
function finishBattle() {
  const S = BT; if (S.done) return; S.done = true;
  const w = S.res.winner, W = w === 0 ? S.A : S.B, L = w === 0 ? S.B : S.A;
  $('skipBtn').classList.add('hidden'); $('skipAllBtn').classList.add('hidden');
  btDraw();
  sfx.win();
  const rout = ROUT_LINES[Math.floor(Math.random() * ROUT_LINES.length)];
  if (S.tenka) { BT.rout = rout; BT.winT = 0; const lp = () => { BT.winT += 1 / 60; btDraw(); if (BT.winT < 2) requestAnimationFrame(lp); }; requestAnimationFrame(lp); tenkaAfterBattle(rout); return; }
  $('kachi').textContent = `勝ち鬨！ ${W.name}の勝利`;
  $('rout').textContent = `${S.res.reason === 'judge' ? '判定勝ち。' : ''}${L.name}は${rout}`;
  $('seeA').textContent = `${S.A.name}のカード`; $('seeB').textContent = `${S.B.name}のカード`;
  $('resultBox').classList.remove('hidden');
  BT.rout = rout;
  cachedImage('battle:' + BT.id, battleImage);
  [BT.A, BT.B].forEach((b) => cachedImage('card:' + b.key, () => cardImage(b)));
  // 勝ち鬨の演出
  BT.winT = 0;
  const loop = () => { BT.winT += 1 / 60; btDraw(); if (BT.winT < 2) requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}
function btDraw() {
  const S = BT, g = bg;
  // 空と山
  const sky = g.createLinearGradient(0, 0, 0, 150); sky.addColorStop(0, '#2a3a5a'); sky.addColorStop(1, '#d8a05a');
  g.fillStyle = sky; g.fillRect(0, 0, BW, 150);
  g.fillStyle = '#5a4a5a'; g.beginPath(); g.moveTo(0, 130); g.lineTo(60, 90); g.lineTo(120, 120); g.lineTo(190, 80); g.lineTo(260, 118); g.lineTo(320, 92); g.lineTo(360, 110); g.lineTo(360, 150); g.lineTo(0, 150); g.fill();
  const field = g.createLinearGradient(0, 140, 0, BH); field.addColorStop(0, '#6a7a3a'); field.addColorStop(1, '#3d4a22');
  g.fillStyle = field; g.fillRect(0, 140, BW, BH - 140);
  // 本陣の旗
  for (const s of [0, 1]) {
    const b = s === 0 ? S.A : S.B, x = s === 0 ? 18 : BW - 18;
    g.strokeStyle = '#3a2a1a'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, 150); g.lineTo(x, 60); g.stroke();
    g.fillStyle = b.look.flag; g.fillRect(s === 0 ? x : x - 26, 62, 26, 50);
  }
  // 兵
  const ch = Math.sin(Math.min(1, S.charge) * Math.PI);
  for (const s of [0, 1]) {
    const b = s === 0 ? S.A : S.B, dir = s === 0 ? 1 : -1;
    const color = s === 0 ? '#2f6fd8' : '#d93a2a';
    for (const so of S.soldiers[s]) {
      let x = so.bx + dir * ch * 70, y = so.by + Math.sin(S.t * 8 + so.ph) * (S.charge > 0 ? 2 : .6);
      let alpha = 1;
      if (!so.alive) { so.fall = (so.fall || 0) + 1 / 60; if (so.fall > 1) continue; x -= dir * so.fall * 30; y -= Math.sin(so.fall * Math.PI) * 26; alpha = 1 - so.fall; }
      g.globalAlpha = alpha;
      drawSoldier(g, x, y, color, b.look.flag, dir, b.troop.id);
      g.globalAlpha = 1;
    }
  }
  // 砂ぼこり
  for (const d of S.dust) { const k = d.t / d.life; g.fillStyle = `rgba(220,200,160,${.55 * (1 - k)})`; g.beginPath(); g.arc(d.x, d.y - k * 20, d.r * (1 + k), 0, 7); g.fill(); }
  // ダメージ数字
  for (const f of S.floaters) {
    const x = f.side === 0 ? 90 : BW - 90, y = 160 - f.t * 40;
    g.globalAlpha = 1 - f.t / 1.1; g.font = '24px "Dela Gothic One"'; g.textAlign = 'center';
    g.lineWidth = 5; g.strokeStyle = '#000'; g.strokeText(f.text, x, y); g.fillStyle = f.fire ? '#ff8a3a' : '#fff'; g.fillText(f.text, x, y); g.globalAlpha = 1;
  }
  // 「第一戦」バナー
  if (S.banner) {
    S.banner.t += 1 / 60;
    const k = S.banner.t;
    if (k < 1) {
      g.globalAlpha = Math.min(1, (1 - k) * 2); g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, 100, BW, 60);
      g.font = '800 34px "Shippori Mincho"'; g.textAlign = 'center'; g.fillStyle = '#e8c14a'; g.fillText(S.banner.text, BW / 2, 142); g.globalAlpha = 1;
    } else S.banner = null;
  }
  // カットイン
  if (S.cutIn) {
    const c = S.cutIn, k = Math.min(1, c.t / .2), out = c.t > 1.15 ? (c.t - 1.15) / .25 : 0;
    const left = c.side === 0;
    g.save(); g.globalAlpha = 1 - out;
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, BW, BH);
    g.translate((left ? -1 : 1) * (1 - k) * BW, 0);
    g.fillStyle = left ? '#1c3a78' : '#7a1c14';
    g.beginPath(); g.moveTo(0, 80); g.lineTo(BW, 60); g.lineTo(BW, 200); g.lineTo(0, 220); g.fill();
    g.strokeStyle = '#e8c14a'; g.lineWidth = 3; g.stroke();
    // 集中線
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 2;
    for (let i = 0; i < 16; i++) { const y = 70 + i * 9; g.beginPath(); g.moveTo(left ? BW : 0, y); g.lineTo(left ? BW - 120 - (i % 3) * 40 : 120 + (i % 3) * 40, y); g.stroke(); }
    const img = S.imgs[c.side];
    const px = left ? 10 : BW - 130;
    g.drawImage(img, 0, 50, 200, 130, px, 82, 120, 78 * 1.6);
    g.textAlign = left ? 'left' : 'right';
    const tx = left ? 140 : BW - 140;
    g.font = '800 15px "M PLUS Rounded 1c"'; g.fillStyle = '#fff'; g.fillText((left ? S.A : S.B).name, tx, 112);
    g.font = '800 34px "Shippori Mincho"'; g.lineWidth = 6; g.strokeStyle = '#000'; g.strokeText(c.skill, tx, 156); g.fillStyle = '#ffd36b'; g.fillText(c.skill, tx, 156);
    g.restore();
  }
  // 勝ち鬨
  if (S.done && S.winT != null) {
    const k = Math.min(1, S.winT / .4);
    g.fillStyle = `rgba(0,0,0,${.5 * k})`; g.fillRect(0, 0, BW, BH);
    const w = S.res.winner === 0 ? S.A : S.B;
    g.save(); g.translate(BW / 2, 130); g.scale(.6 + k * .4, .6 + k * .4); g.globalAlpha = k;
    g.drawImage(S.imgs[S.res.winner], -60, -90, 120, 144);
    g.font = '800 36px "Shippori Mincho"'; g.textAlign = 'center'; g.lineWidth = 7; g.strokeStyle = '#000';
    g.strokeText('勝ち鬨', 0, 92); g.fillStyle = '#e8c14a'; g.fillText('勝ち鬨', 0, 92);
    g.restore(); g.globalAlpha = 1;
  }
}
function drawSoldier(g, x, y, color, flag, dir, troop) {
  // 影
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(x, y + 9, 7, 2.5, 0, 0, 7); g.fill();
  if (troop === 'kiba') { g.fillStyle = '#6b4a2b'; g.beginPath(); g.ellipse(x, y + 2, 11, 5, 0, 0, 7); g.fill(); g.fillRect(x + dir * 8, y - 4, 4, 7); }
  // 背中の旗
  g.fillStyle = flag; g.fillRect(x - dir * 4 - 3, y - 20, 6, 9);
  g.strokeStyle = '#2a1a0a'; g.lineWidth = 1; g.beginPath(); g.moveTo(x - dir * 4, y - 20); g.lineTo(x - dir * 4, y - 4); g.stroke();
  // 体
  g.fillStyle = color; g.fillRect(x - 4, y - 8, 8, 10);
  g.fillStyle = '#f0c49c'; g.beginPath(); g.arc(x, y - 11, 3.5, 0, 7); g.fill();
  g.fillStyle = '#2a2a2a'; g.beginPath(); g.arc(x, y - 12.5, 4, Math.PI, 0); g.fill();
  // 武器
  g.strokeStyle = troop === 'teppo' ? '#333' : '#bbb'; g.lineWidth = troop === 'teppo' ? 2.4 : 1.4;
  g.beginPath();
  if (troop === 'yumi') { g.arc(x + dir * 5, y - 4, 7, -1.2, 1.2); }
  else if (troop === 'teppo') { g.moveTo(x, y - 5); g.lineTo(x + dir * 12, y - 6); }
  else { g.moveTo(x + dir * 2, y + 4); g.lineTo(x + dir * 14, y - 16); }
  g.stroke();
}

// ===== シェア =====
const pageUrl = () => location.origin + location.pathname;
// ===== 画像付きシェア =====
// スマホ：共有シートで画像＋文章を渡す（Xアプリを選べば画像付きで投稿できる）
// PC：Xの投稿画面を開き、同時に画像を保存する（投稿画面に貼り付けてもらう）
const isMobile = () => matchMedia('(pointer: coarse)').matches;
const imgCache = new Map();
function cachedImage(key, make) {
  if (!imgCache.has(key)) imgCache.set(key, make().then((c) => new Promise((r) => c.toBlob((b) => r({ c, blob: b }), 'image/png'))));
  return imgCache.get(key);
}
function toast(text) {
  let t = $('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = text; t.className = 'on';
  clearTimeout(toast.tm); toast.tm = setTimeout(() => (t.className = ''), 3200);
}
async function shareRich(text, url, key, make, filename, extras = []) {
  const full = `${text}\n${url}\n#${HASHTAGS[0]}`;
  if (isMobile() && navigator.canShare) {
    try {
      const all = [{ key, make, filename }, ...extras];
      const blobs = await Promise.all(all.map((x) => cachedImage(x.key, x.make)));
      const files = blobs.map(({ blob }, i) => new File([blob], all[i].filename, { type: 'image/png' }));
      if (files.length > 1 && navigator.canShare({ files })) { await navigator.share({ files, text: full }); return; }
      if (navigator.canShare({ files: [files[0]] })) { await navigator.share({ files: [files[0]], text: full }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  tweet(text, url);
  try {
    const { blob } = await cachedImage(key, make);
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('画像を保存しました。Xの投稿画面に画像を貼り付けてください');
  } catch {}
}
function tweet(text, url) {
  const u = new URL('https://twitter.com/intent/tweet');
  u.searchParams.set('text', text); u.searchParams.set('url', url); u.searchParams.set('hashtags', HASHTAGS.join(','));
  window.open(u.toString(), '_blank', 'noopener');
}
function shareCard() {
  const b = curB, top = STAT_KEYS.slice().sort((x, y) => b.stats[y] - b.stats[x])[0];
  shareRich(`私の名前「${b.name}」は【${b.rarity.name}】${b.nick}でした⚔️\n${STAT_NAMES[top]}${b.stats[top]}・総合戦闘力${b.power}・スキル「${b.skills.map((s) => s.name).join('」「')}」\n\nあなたの名前は何者？`, pageUrl(), 'card:' + b.key, () => cardImage(b), `bushou-${b.name}.png`);
}
function shareBattle() {
  const S = BT, w = S.res.winner === 0 ? S.A : S.B, l = S.res.winner === 0 ? S.B : S.A;
  shareRich(`【合戦】${S.A.name} vs ${S.B.name}\n勝者は… ${w.name}（${w.rarity.name}・${w.nick}）！\n${l.name}は${S.rout}\n\nあなたの名前は何者？ 召喚して確かめよう`, pageUrl(), 'battle:' + S.id, battleImage, 'bushou-battle.png',
    [S.A, S.B].map((b) => ({ key: 'card:' + b.key, make: () => cardImage(b), filename: `bushou-${b.name}.png` })));
}

// ===== 画像保存 =====
function svgImg(svg) { return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); }); }
async function fontsReady() { await Promise.all(['800 40px "Shippori Mincho"', '40px "Dela Gothic One"', '800 30px "M PLUS Rounded 1c"'].map((f) => document.fonts.load(f))); }
async function cardImage(b) {
  await fontsReady();
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const g = c.getContext('2d');
  const bgr = g.createLinearGradient(0, 0, 0, 1350); bgr.addColorStop(0, '#2a1d14'); bgr.addColorStop(1, '#0e0b09');
  g.fillStyle = bgr; g.fillRect(0, 0, 1080, 1350);
  g.strokeStyle = b.rarity.color; g.lineWidth = 16; g.strokeRect(24, 24, 1032, 1302);
  const img = await svgImg(portraitSVG(b));
  g.drawImage(img, 140, 60, 800, 960);
  g.strokeStyle = '#000'; g.lineWidth = 6; g.strokeRect(140, 60, 800, 960);
  g.fillStyle = b.rarity.color; g.fillRect(140, 60, 220, 70); g.fillStyle = '#fff'; g.font = '800 44px "Shippori Mincho"'; g.textAlign = 'center'; g.fillText(b.rarity.name, 250, 112);
  g.textAlign = 'right'; g.font = '30px "M PLUS Rounded 1c"'; g.fillStyle = '#ddd'; g.fillText('総合戦闘力', 920, 104);
  g.font = '64px "Dela Gothic One"'; g.lineWidth = 8; g.strokeStyle = '#000'; g.strokeText(String(b.power), 920, 170); g.fillStyle = '#fff'; g.fillText(String(b.power), 920, 170);
  g.textAlign = 'center'; g.fillStyle = '#e8c14a'; g.font = '800 40px "M PLUS Rounded 1c"'; g.fillText(b.nick, 540, 1080);
  g.fillStyle = '#fff'; g.font = '800 86px "Shippori Mincho"'; g.fillText(b.name, 540, 1170);
  g.font = '800 34px "M PLUS Rounded 1c"'; g.fillStyle = '#b6a48e';
  g.fillText(STAT_KEYS.map((k) => `${STAT_NAMES[k]}${b.stats[k]}`).join('  ') + `  ${b.troop.name}隊`, 540, 1230);
  g.fillStyle = '#e8c14a'; g.font = '800 30px "M PLUS Rounded 1c"'; g.fillText('スキル：' + b.skills.map((s) => s.name).join('・'), 540, 1276);
  g.fillStyle = '#7d6d5a'; g.font = '800 26px "M PLUS Rounded 1c"'; g.fillText(`名将ガチャ｜${SITE}`, 540, 1318);
  return c;
}
async function battleImage() {
  await fontsReady();
  const S = BT, c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const g = c.getContext('2d');
  g.fillStyle = '#120e0b'; g.fillRect(0, 0, 1080, 1350);
  const [ia, ib] = await Promise.all([svgImg(portraitSVG(S.A)), svgImg(portraitSVG(S.B))]);
  const w = S.res.winner;
  g.drawImage(ia, 40, 200, 480, 576); g.drawImage(ib, 560, 200, 480, 576);
  // 敗者は暗く
  g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(w === 0 ? 560 : 40, 200, 480, 576);
  g.textAlign = 'center'; g.fillStyle = '#e8c14a'; g.font = '800 70px "Shippori Mincho"'; g.fillText('合 戦', 540, 130);
  g.font = '110px "Dela Gothic One"'; g.lineWidth = 12; g.strokeStyle = '#000'; g.strokeText('VS', 540, 540); g.fillStyle = '#d93a2a'; g.fillText('VS', 540, 540);
  g.fillStyle = '#fff'; g.font = '800 54px "Shippori Mincho"'; g.fillText(S.A.name, 280, 860); g.fillText(S.B.name, 800, 860);
  g.font = '800 30px "M PLUS Rounded 1c"'; g.fillStyle = '#b6a48e';
  g.fillText(`${S.A.rarity.name}・${S.A.power}`, 280, 905); g.fillText(`${S.B.rarity.name}・${S.B.power}`, 800, 905);
  // 勝ち鬨の札
  const wx = w === 0 ? 280 : 800;
  g.save(); g.translate(wx, 300); g.rotate(-.12); g.strokeStyle = '#d93a2a'; g.lineWidth = 10; g.strokeRect(-140, -60, 280, 120);
  g.fillStyle = '#d93a2a'; g.font = '800 76px "Shippori Mincho"'; g.fillText('勝利', 0, 28); g.restore();
  const winner = w === 0 ? S.A : S.B;
  g.fillStyle = '#e8c14a'; g.font = '800 56px "Shippori Mincho"'; g.fillText(`勝ち鬨！ ${winner.name}`, 540, 1040);
  g.fillStyle = '#ddd'; g.font = '800 32px "M PLUS Rounded 1c"';
  const lose = w === 0 ? S.B : S.A;
  g.fillText(`${lose.name}は${S.rout}`.slice(0, 32), 540, 1110);
  g.fillStyle = '#7d6d5a'; g.font = '800 28px "M PLUS Rounded 1c"'; g.fillText(`名将ガチャ｜${SITE}`, 540, 1300);
  return c;
}
async function tenkaImage() {
  await fontsReady();
  const T = TENKA, d = T.data, b = T.me;
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const g = c.getContext('2d');
  const bgr = g.createLinearGradient(0, 0, 0, 1350); bgr.addColorStop(0, '#3a2410'); bgr.addColorStop(1, '#0e0b09');
  g.fillStyle = bgr; g.fillRect(0, 0, 1080, 1350);
  g.strokeStyle = '#e8c14a'; g.lineWidth = 14; g.strokeRect(24, 24, 1032, 1302);
  g.textAlign = 'center'; g.fillStyle = '#e8c14a'; g.font = '800 64px "Shippori Mincho"'; g.fillText('天下統一への道', 540, 130);
  const img = await svgImg(portraitSVG(b));
  g.drawImage(img, 300, 170, 480, 576);
  g.fillStyle = '#fff'; g.font = '800 70px "Shippori Mincho"'; g.fillText(b.name, 540, 830);
  g.fillStyle = b.rarity.color; g.font = '800 34px "M PLUS Rounded 1c"'; g.fillText(`【${b.rarity.name}】${b.nick}`, 540, 880);
  // 城の列
  for (let i = 0; i < 10; i++) {
    const m = d.matches[i], x = 120 + i * 93, y = 980;
    g.fillStyle = m ? (m.win ? '#e8c14a' : '#d93a2a') : '#3a2e24';
    g.beginPath(); g.arc(x, y, 34, 0, 7); g.fill();
    g.fillStyle = '#120e0b'; g.font = '30px "Dela Gothic One"'; g.fillText(m ? (m.win ? '勝' : '負') : '・', x, y + 11);
  }
  g.fillStyle = d.unified ? '#e8c14a' : '#fff'; g.font = '800 92px "Shippori Mincho"';
  g.fillText(d.unified ? '天下統一！' : `${d.streak}連勝`, 540, 1140);
  g.fillStyle = '#b6a48e'; g.font = '800 36px "M PLUS Rounded 1c"'; g.fillText(`全国 ${d.rank}位 / ${d.total}武将`, 540, 1200);
  g.fillStyle = '#7d6d5a'; g.font = '800 28px "M PLUS Rounded 1c"'; g.fillText(`名将ガチャ｜${SITE}`, 540, 1300);
  return c;
}
async function saveCanvas(c, name) {
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: '名将ガチャ' }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ===== おすすめ =====
function renderRecs() {
  $('recList').innerHTML = '';
  RECS.forEach((r) => {
    const u = new URL('https://www.amazon.co.jp/s'); u.searchParams.set('k', r.q);
    if (AFFILIATE.amazonTag) u.searchParams.set('tag', AFFILIATE.amazonTag);
    const a = document.createElement('a'); a.href = u.toString(); a.target = '_blank'; a.rel = 'noopener sponsored'; a.textContent = `${r.label} を見る →`;
    $('recList').appendChild(a);
  });
  $('prNote').classList.toggle('hidden', !AFFILIATE.amazonTag);
}

// ===== イベント =====
const val = (id) => $(id).value.trim();
function needName(id) { const v = val(id); if (!v) { $(id).focus(); $(id).style.borderColor = '#d93a2a'; setTimeout(() => ($(id).style.borderColor = ''), 800); } return v; }
$('summonBtn').onclick = () => { const n = needName('nameIn'); if (n) summon(n); };
$('nameIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('summonBtn').click(); });
$('duelBtn').onclick = () => { const a = needName('aIn'); if (!a) return; const b = needName('bIn'); if (b) startBattle(a, b); };
$('smSkip').onclick = () => summonSkip && summonSkip();
$('cardShare').onclick = shareCard;
$('cardImg').onclick = async () => saveCanvas(await cardImage(curB), `bushou-${curB.name}.png`);
$('vsBtn').onclick = () => { const v = needName('vsIn'); if (v) startBattle(curB.name, v); };
$('againBtn').onclick = () => { history.replaceState(null, '', pageUrl()); $('nameIn').value = ''; renderHome(); show('home'); $('nameIn').focus(); };
$('skipBtn').onclick = () => { if (BT) BT.skip = true; };
$('btShare').onclick = shareBattle;
$('btImg').onclick = async () => saveCanvas(await battleImage(), 'bushou-battle.png');
$('rematch').onclick = () => startBattle(BT.A.name, BT.B.name);
$('seeA').onclick = () => openCard(BT.A, 'battle');
$('seeB').onclick = () => openCard(BT.B, 'battle');
$('backBattle').onclick = backToBattle;
$('tenkaBtn').onclick = () => startTenka(curB.name);
$('nextBtn').onclick = nextTenka;
$('skipAllBtn').onclick = () => { if (TENKA) { TENKA.fast = true; if (BT) BT.skip = true; $('skipAllBtn').classList.add('hidden'); } };
$('tkShare').onclick = shareTenka;
$('tkImg').onclick = async () => saveCanvas(await tenkaImage(), 'bushou-tenka.png');
$('tkRetry').onclick = () => startTenka(TENKA.me.name);
$('tkCard').onclick = () => openCard(TENKA.me);
$('tkHome').onclick = () => { history.replaceState(null, '', pageUrl()); renderHome(); show('home'); };
document.querySelectorAll('.tab').forEach((t) => (t.onclick = () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === t));
  topTab = t.dataset.tab; renderTop();
}));
$('homeBtn').onclick = () => { history.replaceState(null, '', pageUrl()); renderHome(); show('home'); };

// ===== URLから開く =====
renderRecs();
renderHome();
const q = new URLSearchParams(location.search);
if (q.get('a') && q.get('b')) { $('aIn').value = q.get('a'); $('bIn').value = q.get('b'); startBattle(q.get('a'), q.get('b')); }
else if (q.get('n')) openCard(makeBushou(q.get('n')));
