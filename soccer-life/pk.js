// ===== PKチャレンジの画面（一人用・オンライン共通） =====
// openPK({ start, kick, onClose })
//   start()   … 挑戦を始める。{ kicks: すでに蹴った本数, goals } か { error }
//   kick(k)   … 1本蹴る。k = { dir: 'L'|'C'|'R', high, power }。{ goal, why, dive, n, goals, reward } か { error }
// 狙う場所を選ぶ → 動くゲージを真ん中で止める → キーパーとの勝負。5本でゴール数に応じた賞金。
'use strict';
(() => {
  const ZONES = [['L', true], ['C', true], ['R', true], ['L', false], ['C', false], ['R', false]];
  const X = { L: -96, C: 0, R: 96 };
  const fmt = (v) => `${v.toLocaleString()}万円`;

  window.openPK = async function openPK(opt) {
    const P = SL.PK;
    let n = 0, goals = 0, aim = null, busy = false, raf = 0, t0 = 0, done = false;
    const dots = [];
    const bg = document.createElement('div'); bg.className = 'ov-bg';
    bg.innerHTML = `<div class="sheet pkgame">
      <div class="rl-head"><b>⚽ PKチャレンジ</b><span class="pk-dots"></span></div>
      <p class="sub" style="margin:2px 0 8px">5本蹴って、1ゴール${P.perGoal}万円・全部決めたら＋${P.perfect}万円。1節に1回</p>
      <div class="pk-field">
        <div class="pk-goal">${ZONES.map(([d, h], i) => `<button class="pk-zone" data-i="${i}" aria-label="${d}${h ? '上' : '下'}"></button>`).join('')}
          <div class="pk-keeper"><svg viewBox="0 0 44 62" width="44" height="62"><path d="M12 24 L2 8 M32 24 L42 8" stroke="#ffd04a" stroke-width="7" stroke-linecap="round"/><circle cx="2" cy="8" r="4.5" fill="#fff"/><circle cx="42" cy="8" r="4.5" fill="#fff"/>
            <circle cx="22" cy="11" r="8" fill="#f6d2ad"/><path d="M14 9 Q15 2 22 2 Q29 2 30 9 Q26 5 22 5 Q18 5 14 9Z" fill="#2b2118"/><rect x="11" y="19" width="22" height="24" rx="6" fill="#ffd04a"/><text x="22" y="36" text-anchor="middle" font-size="10" font-weight="800" fill="#3a2a00" font-family="Outfit,sans-serif">1</text>
            <rect x="13" y="42" width="7" height="18" rx="3" fill="#1f2328"/><rect x="24" y="42" width="7" height="18" rx="3" fill="#1f2328"/></svg></div></div>
        <div class="pk-ball">⚽</div>
      </div>
      <div class="pk-msg">狙う場所をタップ</div>
      <div class="pk-meter hidden"><div class="pk-sweet"></div><div class="pk-needle"></div></div>
      <button class="btn gold hidden" data-act="shoot">蹴る！</button>
      <button class="btn ghost" data-act="close">やめる</button></div>`;
    document.body.appendChild(bg);
    const $q = (s) => bg.querySelector(s);
    const msg = (t, cls = '') => { $q('.pk-msg').innerHTML = t; $q('.pk-msg').className = 'pk-msg ' + cls; };
    const paintDots = () => { $q('.pk-dots').innerHTML = Array.from({ length: P.kicks }, (_, i) => `<i class="${dots[i] === true ? 'ok' : dots[i] === false ? 'ng' : ''}"></i>`).join(''); };
    const keeper = $q('.pk-keeper'), ball = $q('.pk-ball'), needle = $q('.pk-needle');

    const st = await opt.start();
    if (!st || st.error) { msg((st && st.error) || '通信できませんでした', 'warn'); return; }
    n = st.kicks || 0; goals = st.goals || 0;
    for (let i = 0; i < n; i++) dots.push(i < goals); // 途中から再開したとき（だいたいの表示）
    paintDots();
    if (n) msg(`${n}本目まで蹴っています。続きから`);

    function reset() {
      keeper.style.transform = ''; ball.style.transform = ''; ball.classList.remove('fly');
      bg.querySelectorAll('.pk-zone').forEach((z) => z.classList.remove('on'));
      $q('.pk-meter').classList.add('hidden'); $q('[data-act="shoot"]').classList.add('hidden');
      aim = null; cancelAnimationFrame(raf);
    }
    function choose(i) {
      if (busy || done) return;
      aim = ZONES[i];
      bg.querySelectorAll('.pk-zone').forEach((z, j) => z.classList.toggle('on', j === i));
      // ちょうどいい強さの幅（上を狙うほど狭い）
      const tol = aim[1] ? P.tol.high : P.tol.low;
      const sw = $q('.pk-sweet'); sw.style.left = `${(0.5 - tol) * 100}%`; sw.style.width = `${tol * 200}%`;
      $q('.pk-meter').classList.remove('hidden'); $q('[data-act="shoot"]').classList.remove('hidden');
      msg(aim[1] ? '上の隅は決まれば止められにくい。でもゲージが狭い' : 'ゲージが緑のところで「蹴る！」');
      t0 = performance.now(); cancelAnimationFrame(raf);
      const loop = (t) => { needle.style.left = `${pos(t) * 100}%`; raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
    }
    const pos = (t) => { const ph = ((t - t0) / 1000 * 1.3) % 2; return ph < 1 ? ph : 2 - ph; };
    async function shoot() {
      if (busy || !aim || done) return;
      busy = true; cancelAnimationFrame(raf);
      const power = Math.round(pos(performance.now()) * 1000) / 1000;
      const r = await opt.kick({ dir: aim[0], high: aim[1], power });
      if (!r || r.error) { busy = false; msg((r && r.error) || '通信できませんでした', 'warn'); return; }
      // キーパーが飛び、ボールが飛ぶ
      keeper.style.transform = `translateX(${X[r.dive]}px) rotate(${r.dive === 'L' ? -40 : r.dive === 'R' ? 40 : 0}deg)`;
      const bx = X[aim[0]], by = r.why === 'over' ? -150 : r.why === 'weak' ? -40 : aim[1] ? -128 : -86;
      ball.classList.add('fly'); ball.style.transform = `translate(${bx}px, ${by}px) scale(.6)`;
      await new Promise((ok) => setTimeout(ok, 750));
      n = r.n; goals = r.goals; dots[n - 1] = r.goal; paintDots();
      msg(r.goal ? '⚽ ゴール！！' : r.why === 'saved' ? '🧤 止められた…' : r.why === 'over' ? '💨 強すぎて枠の外…' : '😣 弱すぎてキーパーの正面…', r.goal ? 'win' : 'lose');
      await new Promise((ok) => setTimeout(ok, 1100));
      busy = false;
      if (r.reward != null) {
        done = true; reset();
        msg(`${goals}/${P.kicks}本成功！ 賞金 <b>${fmt(r.reward)}</b>${goals === P.kicks ? '<br>🎉 パーフェクト！' : ''}`, 'win');
        $q('[data-act="close"]').textContent = '閉じる';
        return;
      }
      reset(); msg(`${n + 1}本目：狙う場所をタップ`);
    }
    bg.addEventListener('click', (e) => {
      const z = e.target.closest('.pk-zone'); if (z) return choose(+z.dataset.i);
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'shoot') shoot();
      if (a.dataset.act === 'close' && !busy) { cancelAnimationFrame(raf); bg.remove(); if (opt.onClose) opt.onClose(); }
    });
  };
})();
