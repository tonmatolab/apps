// ===== サッカー人生 オンラインリーグ（画面側） =====
// 一人用（index.html の本体スクリプト）と名前がぶつからないよう、全体を1つの関数の中に閉じ込めている。
// 画面の切り替え showScreen()、esc() などは一人用のものを共有する。
'use strict';
(() => {
  const $ = (id) => document.getElementById('ol-' + id); // オンラインの部品はすべて ol- で始まるID
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem('soccerol-' + k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem('soccerol-' + k, v); } catch {} },
    del(k) { try { localStorage.removeItem('soccerol-' + k); } catch {} },
  };
  // 開発中（localhost）は手元の wrangler dev、それ以外は本番のAPI
  const API = new URLSearchParams(location.search).get('api')
    || (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://127.0.0.1:8787/api' : 'https://tonmatolab-soccer.tonmatolab.workers.dev/api');
  let CODE = store.get('code');
  let ST = null;      // サーバーから受け取った状態
  let skew = 0;       // サーバー時計とのずれ
  let fetchedAt = 0;

  async function api(path, body) {
    try {
      const opt = { method: body ? 'POST' : 'GET', headers: {}, signal: AbortSignal.timeout(10000) };
      if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
      if (CODE) opt.headers.Authorization = 'Bearer ' + CODE;
      const r = await fetch(API + path, opt);
      const j = await r.json().catch(() => null);
      return r.ok ? j : { error: (j && j.error) || 'http_' + r.status };
    } catch { return { error: 'network' }; }
  }
  const ERR = { network: '通信できませんでした', bad_name: 'その名前は使えません', too_many: '登録が多すぎます。しばらく待ってください', full: '満員です。ごめんなさい', unauthorized: 'コードが正しくありません', not_now: '今はできません', must_retire: '引退するしかありません', too_young: '30歳から引退できます', no_contract: '契約が切れています。オファーを選んでください', bad_choice: '選べません' };
  const errMsg = (e) => ERR[e] || 'エラー：' + e;
  function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2000); }
  function show(id) { showScreen('ol-' + id); if (location.hash !== '#online') history.replaceState(null, '', '#online'); }

  // ----- 見た目の部品 -----
  function textOn(hex) { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * .299 + ((n >> 8) & 255) * .587 + (n & 255) * .114) > 170 ? '#1d2433' : '#ffffff'; }
  const club = (id) => ST.clubs[id];
  const crest = (c) => `<div class="crest" style="background:${c.color};color:${textOn(c.color)}">${esc(c.city.slice(0, 2))}</div>`;
  const posTag = (p) => `<span class="tag t-${p}">${p}</span>`;
  const man = (v) => v >= 10000 ? `${(v / 10000).toFixed(1)}億円` : `${v.toLocaleString()}万円`;
  const ratingColor = (r) => r >= 8 ? '#e0a100' : r >= 7 ? '#17924c' : r >= 6 ? '#5f8f6c' : r >= 5 ? '#8a96a0' : '#e5483a';
  function avatar(color, number, age, pos) {
    const tc = textOn(color), hair = age >= 34 ? '#8d8d8d' : '#2b2118';
    const glove = pos === 'GK' ? '<circle cx="22" cy="92" r="8" fill="#ffd166"/><circle cx="98" cy="92" r="8" fill="#ffd166"/>' : '';
    return `<svg viewBox="0 0 120 120"><rect width="120" height="120" fill="#7fc98f"/><path d="M0 92 Q60 80 120 92 V120 H0Z" fill="#5cb06f"/>
      <path d="M24 120 V96 Q24 74 60 72 Q96 74 96 96 V120Z" fill="${color}"/><text x="60" y="108" text-anchor="middle" font-family="Outfit,sans-serif" font-weight="800" font-size="24" fill="${tc}">${number}</text>
      <rect x="52" y="60" width="16" height="14" rx="5" fill="#f2c9a0"/><circle cx="60" cy="44" r="21" fill="#f6d2ad"/>
      <path d="M39 42 Q38 20 60 20 Q83 20 81 42 Q76 30 60 31 Q46 30 39 42Z" fill="${hair}"/>
      <circle cx="52" cy="46" r="2.6" fill="#2b2118"/><circle cx="68" cy="46" r="2.6" fill="#2b2118"/>
      <path d="M53 55 Q60 60 67 55" stroke="#2b2118" stroke-width="2.4" fill="none" stroke-linecap="round"/>${glove}</svg>`;
  }
  function startChanceTxt(ovr, c, age) { const x = 1 / (1 + Math.exp(-(ovr - (c.str - 4) + (age <= 20 ? 2 : 0)) / 3)); return x > .75 ? ['◎', 'レギュラー'] : x > .45 ? ['○', '出場多め'] : x > .2 ? ['△', '控え'] : ['✕', '厳しい']; }
  function offerCard(o, i, badge = '') {
    const c = club(o.club), L = SL.LEAGUES[c.lg], pc = startChanceTxt(ST.me.ovr, c, ST.me.age);
    return `<button class="offer" data-i="${i}">${crest(c)}<div class="bd"><div class="nm">${badge}${esc(c.name)}${c.humans ? `<span class="hum">👤${c.humans}</span>` : ''}</div>
      <div class="mt"><b>${L.name}</b>｜チーム力 <b class="num">${c.str}</b><br>年俸 <b>${man(o.salary)}</b>・${o.years}年契約${o.trial ? '（テスト入団）' : ''}</div></div><div class="pt"><b>${pc[0]}</b>${pc[1]}</div></button>`;
  }
  function countdown() {
    if (!ST) return '';
    const left = ST.world.nextAt - (Date.now() + skew);
    if (left <= 0) return '集計中…';
    const m = Math.floor(left / 60000), s = Math.floor(left / 1000) % 60;
    return `${ST.world.phase === 'season' ? '次の節' : 'オフ終了まで'} ${m}:${String(s).padStart(2, '0')}`;
  }

  // ===== はじめに =====
  async function renderStart() {
    show('scrStart');
    const j = await api('/public');
    if (j.error) { $('startWorld').innerHTML = `<div style="grid-column:1/-1">${errMsg(j.error)}</div>`; $('startScorers').innerHTML = '<li class="empty">-</li>'; return; }
    const w = j.world; skew = w.now - Date.now();
    $('tickTxt').textContent = w.tickMin >= 60 ? `${w.tickMin / 60}時間` : `${w.tickMin}分`;
    $('startWorld').innerHTML = `<div>シーズン<b>${w.year}年</b></div><div>${w.phase === 'season' ? '節' : 'オフ'}<b>${w.phase === 'season' ? `${w.week}/${w.weeks}` : `残り${w.offLeft}`}</b></div><div>プレイヤー<b>${w.players}人</b></div>`;
    $('startScorers').innerHTML = j.scorers.length ? j.scorers.map((r, i) => `<li><span class="no">${i + 1}</span><span class="nm">${esc(r.name)} <span class="sub">${esc(r.club)}</span></span><span class="v">${r.v}</span></li>`).join('') : '<li class="empty">まだゴールを決めたプレイヤーはいません</li>';
  }

  // ===== 作成 =====
  let selPos = 'FW';
  function renderCreate(next = false) {
    $('createTitle').textContent = next ? '子どもの名前は？' : 'あなたの名前は？';
    $('signupBtn').textContent = next ? '次の世代を始める ▶' : 'プロになる ▶';
    $('signupBtn').dataset.next = next ? '1' : '';
    if (next) { const sur = String(ST.me.name).split(/[\s　]+/); $('nameIn').value = sur.length > 1 ? sur[0] + ' ' : ''; }
    $('poses').innerHTML = Object.entries(SL.POS).map(([k, v]) => `<button class="pos${k === selPos ? ' on' : ''}" data-p="${k}"><b>${posTag(k)}${v.name}</b><span>${v.desc}</span></button>`).join('');
    $('poses').querySelectorAll('.pos').forEach((b) => b.onclick = () => { selPos = b.dataset.p; $('poses').querySelectorAll('.pos').forEach((x) => x.classList.toggle('on', x === b)); });
    $('signupMsg').textContent = '';
    show('scrCreate');
  }
  async function signup() {
    const name = $('nameIn').value.trim(); if (!name) { $('signupMsg').textContent = '名前を入れてください'; return; }
    $('signupBtn').disabled = true;
    if ($('signupBtn').dataset.next) {
      const j = await api('/nextgen', { name, pos: selPos });
      $('signupBtn').disabled = false;
      if (j.error) { $('signupMsg').textContent = errMsg(j.error); return; }
      setState(j); return route();
    }
    const j = await api('/signup', { name, pos: selPos });
    $('signupBtn').disabled = false;
    if (j.error) { $('signupMsg').textContent = errMsg(j.error); return; }
    CODE = j.code; store.set('code', CODE); setState(j.state);
    // アプリ一覧の「遊んだ人数」（全アプリ共通のカウンター）
    try { if (!localStorage.getItem('soccer-played')) { localStorage.setItem('soccer-played', '1'); fetch('https://tonmatolab-counter.tonmatolab.workers.dev/hit/soccer-play', { method: 'POST' }).catch(() => {}); } } catch {}
    $('codeShow').textContent = CODE;
    show('scrCode');
  }
  function setState(j) { ST = j; skew = j.world.now - Date.now(); fetchedAt = Date.now(); }

  // ===== 入団 =====
  function renderDraft() {
    $('draftList').innerHTML = ST.me.draft.map((o, i) => offerCard(o, i)).join('');
    $('draftList').querySelectorAll('.offer').forEach((b) => b.onclick = async () => {
      const j = await api('/join', { i: +b.dataset.i });
      if (j.error) return toast(errMsg(j.error));
      setState(j); toast(`${club(j.me.club).name} に入団！`); route();
    });
    show('scrDraft');
  }

  // ===== ホーム =====
  let tab = 'table';
  function renderHome() {
    const me = ST.me, w = ST.world, c = me.club != null ? club(me.club) : null;
    $('topYear').textContent = `${w.year}年 ${w.phase === 'season' ? `第${Math.min(w.week + 1, w.weeks)}節` : 'オフシーズン'}・${w.players}人`;
    $('topCd').textContent = countdown();
    const color = c ? c.color : '#8a96a0';
    $('pCard').innerHTML = `<div class="band" style="background:${color}"></div>
      <div class="in"><div class="av">${avatar(color, me.number, me.age, me.pos)}</div>
        <div class="who"><div class="nm">${esc(me.name)}</div>
          <div class="cl">${posTag(me.pos)} ${c ? `背番号<b>${me.number}</b>・` : ''}${me.age}歳${me.gen > 1 ? `・${me.gen}代目` : ''}<br>${c ? `<b>${esc(c.name)}</b><br>${SL.LEAGUES[c.lg].name}・年俸 ${man(me.salary)}` : '所属なし'}</div></div>
        <div class="ov"><b style="color:${me.ovr >= 80 ? 'var(--gold)' : 'var(--ink)'}">${me.ovr}</b><span>総合力</span></div></div>
      <div class="meters"><div>調子<b>${['↓', '↘', '→', '↗', '↑'][me.cond + 2]}</b></div><div>疲労<b>${me.fatigue}</b></div><div>人気<b>${me.fame}</b></div><div>${me.injury ? 'ケガ' : '貯金'}<b style="font-size:.78rem">${me.injury ? `🚑 ${me.injury}週` : man(me.money)}</b></div></div>`;
    renderStatus();
    // 前節
    const L = me.last;
    $('lastCard').classList.toggle('hidden', !L);
    if (L) {
      const us = club(L.club), op = club(L.opp), H = L.home ? us : op, A = L.home ? op : us;
      const res = L.gf > L.gc ? '勝利' : L.gf < L.gc ? '敗戦' : '引き分け';
      const role = { start: `先発（${L.mins}分）`, sub: `途中出場（${L.mins}分）`, bench: 'ベンチで出番なし', injured: 'ケガで欠場' }[L.role];
      $('lastHead').textContent = `📺 第${L.week}節の試合（${res}）`;
      $('lastBody').innerHTML = `<div class="score"><div class="tm">${crest(H)}${esc(H.name)}</div><div class="sc">${L.home ? L.gf : L.gc} - ${L.home ? L.gc : L.gf}</div><div class="tm">${crest(A)}${esc(A.name)}</div></div>
        <div class="me-row"><div class="rating" style="background:${L.rating ? ratingColor(L.rating) : '#b9c3bb'}">${L.rating ? L.rating.toFixed(1) : '-'}</div>
          <div><div class="sub">${role}</div><div style="font-weight:800;font-size:.86rem">${[L.goals ? `⚽ ${L.goals}ゴール` : '', L.assists ? `👟 ${L.assists}アシスト` : '', L.cs ? '🧱 無失点' : ''].filter(Boolean).join('　') || (!L.mins ? '次こそ出番を' : L.rating >= 6.5 ? '堅実なプレーで貢献' : L.rating < 5.5 ? '見せ場を作れず…' : 'まずまずの出来')}</div></div></div>
        <ul class="hl">${L.events.map((e) => {
          if (!e.us) return `<li><span class="m">${e.min}'</span><span class="sub">${esc(op.city)}のゴール</span></li>`;
          const mine = e.who === 'me' || e.assist === 'me', mate = !mine && (e.who || e.assist);
          const t = e.who === 'me' ? `あなたの${esc(e.how)}！` : e.who ? `<b>${esc(e.who)}</b>のゴール` : `${esc(us.city)}のゴール`;
          const a = e.assist === 'me' ? '（あなたのアシスト）' : e.assist ? `（${esc(e.assist)}のアシスト）` : '';
          return `<li class="${mine ? 'mine' : mate ? 'mate' : ''}"><span class="m">${e.min}'</span><span>⚽ ${t}${a}</span></li>`;
        }).join('') || '<li class="empty">スコアレス</li>'}</ul>${L.note ? `<p class="sub">🚑 ${esc(L.note)}</p>` : ''}`;
    }
    // シーズン
    const S = me.season, rank = c ? ST.tables[c.lg].findIndex((t) => t.id === c.id) + 1 : '-';
    $('seasonHead').innerHTML = `📅 ${w.year}年シーズン`;
    $('seasonBox').innerHTML = `<div>順位<b>${rank}位</b></div><div>出場<b>${S.apps}</b></div><div>${me.pos === 'GK' || me.pos === 'DF' ? '無失点' : 'ゴール'}<b>${me.pos === 'GK' || me.pos === 'DF' ? S.cs : S.goals}</b></div><div>平均評価<b>${S.avg ? S.avg.toFixed(2) : '-'}</b></div>`;
    $('nextTxt').textContent = ST.next ? `次節：${ST.next.home ? 'ホーム' : 'アウェイ'} vs ${club(ST.next.opp).name}` : '';
    // 能力
    const main = SL.mainStats(me.pos);
    $('statList').innerHTML = Object.keys(SL.STATS).filter((k) => k !== 'gk' || me.pos === 'GK').sort((a, b) => main.includes(b) - main.includes(a))
      .map((k) => `<li class="${main.includes(k) ? 'main' : ''}"><span>${SL.STATS[k]}</span><div class="bar"><i style="width:${me.stats[k]}%;${main.includes(k) ? '' : 'background:#9fb3a3'}"></i></div><span class="v">${me.stats[k]}</span></li>`).join('');
    renderTab();
    show('scrHome');
  }

  function renderStatus() {
    const me = ST.me, w = ST.world, el = $('statusPanel');
    if (me.status === 'active') {
      const main = SL.mainStats(me.pos);
      el.innerHTML = `<div class="card"><h2>🏋️ 練習メニュー <span class="sub" style="margin-left:auto">毎節の前に反映</span></h2><div class="trains">${Object.entries(SL.TRAINING).filter(([k, t]) => !t.gkOnly || me.pos === 'GK')
        .map(([k, t]) => `<button class="tr${me.training === k ? ' on' : ''}" data-k="${k}"><i>${t.icon}</i>${t.name}${t.stats && t.stats.length === 1 && main.includes(t.stats[0]) ? '<br><span class="sub" style="font-size:.6rem">得意</span>' : ''}</button>`).join('')}</div>
        <p class="sub" style="margin:8px 0 0">${me.injury ? '🚑 ケガの間はリハビリになります' : SL.TRAINING[me.training].desc || ''}</p></div>`;
      el.querySelectorAll('.tr').forEach((b) => b.onclick = async () => {
        const k = b.dataset.k; const j = await api('/training', { k });
        if (j.error) return toast(errMsg(j.error));
        me.training = k; renderStatus(); toast(`${SL.TRAINING[k].name}にしました`);
      });
    } else if (me.status === 'off') {
      const o = me.offer, c = club(me.club);
      const head = o.forced ? (me.age >= 40 ? '40歳。体が限界を迎えた…' : 'どのクラブからも声がかからなかった…')
        : o.released ? `${esc(c.name)} から戦力外通告…` : o.expiring ? `${esc(c.name)} との契約が切れた。` : `${esc(c.name)} との契約はあと${me.contract}年。`;
      el.innerHTML = `<div class="card panel"><h2>📝 オフシーズン：契約を選ぼう</h2>
        ${o.awards && o.awards.length ? `<ul class="ach" style="margin-bottom:8px">${o.awards.map((a) => `<li>🏅 ${esc(a)}</li>`).join('')}</ul>` : ''}
        ${o.nat ? `<p class="sub" style="margin:0 0 6px">🇯🇵 日本代表に選ばれた（${o.nat}試合）</p>` : ''}
        <p style="font-weight:800;margin:0">${head}</p>${o.notes.map((n) => `<p class="sub" style="margin:2px 0">${esc(n)}</p>`).join('')}
        <div class="stack" style="margin-top:10px" id="ol-offerList">${o.forced ? '' : o.list.map((x, i) => offerCard(x, i, x.stay ? '<span class="badge stay">残留</span>' : club(x.club).lg === 0 ? '<span class="badge eu">海外</span>' : '<span class="badge">移籍</span>')).join('')}</div>
        <div class="stack" style="margin-top:10px">
          ${!o.forced && !o.expiring && !o.released ? `<button class="btn primary" data-c="stay">${esc(c.city)}に残る（契約あと${me.contract}年）</button>` : ''}
          ${o.forced || o.canRetire ? `<button class="btn ${o.forced ? 'primary' : 'ghost'}" data-c="retire">👋 引退する</button>` : ''}
        </div>
        <p class="sub" style="margin:8px 0 0">選ばなかった場合は、オフ終了時に自動で決まります（残留できれば残留、なければ年俸が高いオファー）</p></div>`;
      const pick = async (choice) => {
        if (choice === 'retire' && !confirm('本当に引退しますか？')) return;
        const j = await api('/decide', { choice });
        if (j.error) return toast(errMsg(j.error));
        setState(j); renderHome(); toast(choice === 'retire' ? 'おつかれさまでした' : '契約しました！');
      };
      el.querySelectorAll('#ol-offerList .offer').forEach((b) => b.onclick = () => pick(+b.dataset.i));
      el.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => pick(b.dataset.c));
    } else if (me.status === 'decided') {
      el.innerHTML = `<div class="card"><h2>✅ 契約済み</h2><p style="margin:0;font-weight:700">${esc(club(me.club).name)}で新シーズンを待とう。開幕は約${w.offLeft * w.tickMin}分後。</p></div>`;
    } else if (me.status === 'retired') {
      const sm = me.summary;
      el.innerHTML = `<div class="card panel" style="text-align:center"><div class="sub" style="font-weight:800">${sm.retireAge}歳で現役引退</div>
        <div style="font-family:var(--head);font-size:1.7rem;color:var(--green);margin:6px 0 2px">${esc(sm.title)}</div><div class="sub">${esc(sm.titleDesc)}</div>
        <div style="margin-top:8px;font-family:var(--num);font-weight:800"><span style="font-size:2.6rem;color:var(--gold)">${sm.letter}</span> ${sm.score.toLocaleString()}pt</div>
        <div class="bigstat"><div>シーズン<b>${sm.years}</b></div><div>出場<b>${sm.apps}</b></div><div>ゴール<b>${sm.goals}</b></div><div>代表<b>${sm.caps}</b></div></div>
        <button class="btn primary" id="ol-nextGenBtn">👶 次の世代へ（${me.gen + 1}代目）</button></div>`;
      $('nextGenBtn').onclick = () => renderCreate(true);
    }
  }

  function renderTab() {
    document.querySelectorAll('#ol-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    const me = ST.me, lg = me.club != null ? club(me.club).lg : 1, body = $('tabBody');
    if (tab === 'table') {
      body.innerHTML = SL.LEAGUES.map((L) => `<div class="sub" style="margin:${L.id === 0 ? 0 : 12}px 0 4px;font-weight:800">${L.name}</div>
        <div class="tbwrap"><table class="tb"><tr><th></th><th style="text-align:left">クラブ</th><th>勝</th><th>分</th><th>敗</th><th>差</th><th>点</th></tr>
        ${ST.tables[L.id].map((t, i) => { const c = club(t.id); return `<tr class="${t.id === me.club ? 'me' : ''}"><td>${i + 1}</td><td class="l"><span class="dot" style="background:${c.color}"></span>${esc(c.name)}${c.humans ? `<span class="hum">👤${c.humans}</span>` : ''}</td><td>${t.w}</td><td>${t.d}</td><td>${t.l}</td><td>${t.gf - t.ga > 0 ? '+' : ''}${t.gf - t.ga}</td><td><b>${t.p}</b></td></tr>`; }).join('')}</table></div>`).join('');
    } else if (tab === 'rank') {
      const list = (rows) => rows.length ? `<ol class="list">${rows.map((r, i) => `<li${r.name === me.name ? ' style="background:var(--chip)"' : ''}><span class="no">${i + 1}</span><span class="nm">${esc(r.name)} <span class="sub">${esc(r.club)}</span></span><span class="v">${r.v}</span></li>`).join('')}</ol>` : '<p class="empty">まだいません</p>';
      body.innerHTML = `<h2>⚽ 得点ランキング（${SL.LEAGUES[lg].short}・プレイヤー）</h2>${list(ST.scorers)}<h2 style="margin-top:12px">👟 アシストランキング</h2>${list(ST.assisters)}`;
    } else if (tab === 'mates') {
      body.innerHTML = me.club == null ? '<p class="empty">所属なし</p>' : `<h2>👥 ${esc(club(me.club).name)}のプレイヤー</h2>${ST.mates.length ? `<ul class="list">${ST.mates.map((m) => `<li>${posTag(m.pos)}<span class="nm">${esc(m.name)} <span class="sub">${m.age}歳${m.gen > 1 ? `・${m.gen}代目` : ''}</span></span><span class="v">${m.ovr}</span><span class="sub">${m.apps}試${m.goals}G${m.assists}A</span></li>`).join('')}</ul>` : '<p class="empty">ほかのプレイヤーはまだいません。友達を誘おう</p>'}`;
    } else if (tab === 'results') {
      const R = ST.results;
      body.innerHTML = !R ? '<p class="empty">まだ試合がありません</p>' : `<h2>📋 第${R.week}節の結果</h2><ul class="list">${R.list.map((r) => {
        const h = club(r.h), a = club(r.a);
        const g = r.goals.filter((x) => x.who || x.assist).map((x) => `${x.min}' ${esc(x.who || '')}${x.assist ? `（A ${esc(x.assist)}）` : ''}`).join('、');
        return `<li style="display:block"><span class="dot" style="background:${h.color}"></span>${esc(h.city)} <b class="num">${r.gh} - ${r.ga}</b> ${esc(a.city)} <span class="dot" style="background:${a.color};margin-left:4px"></span><span class="sub">${SL.LEAGUES[r.lg].short}</span>${g ? `<div class="sub">⚽ ${g}</div>` : ''}</li>`;
      }).join('')}</ul>${ST.seasonHistory.length ? `<h2 style="margin-top:12px">🏆 過去の優勝</h2><ul class="list">${ST.seasonHistory.map((x) => `<li style="display:block"><b>${x.year}年</b> <span class="sub">欧州 ${esc(x.champions[0])}／1部 ${esc(x.champions[1])}／2部 ${esc(x.champions[2])}</span></li>`).join('')}</ul>` : ''}`;
    } else {
      const aw = me.trophies.map((t) => `<li>🏆 ${esc(t)}</li>`).concat(me.awards.map((t) => `<li>🏅 ${esc(t)}</li>`));
      body.innerHTML = `<div class="bigstat"><div>通算出場<b>${me.totals.apps}</b></div><div>通算G<b>${me.totals.goals}</b></div><div>通算A<b>${me.totals.assists}</b></div><div>代表<b>${me.caps}</b></div></div>
        ${aw.length ? `<ul class="ach">${aw.join('')}</ul>` : ''}
        ${me.history.length ? `<div class="tbwrap" style="margin-top:10px"><table class="tb"><tr><th>年</th><th>歳</th><th style="text-align:left">クラブ</th><th>試</th><th>G</th><th>A</th><th>評価</th></tr>${me.history.map((r) => `<tr><td>${String(r.year).slice(2)}</td><td>${r.age}</td><td class="l">${esc(r.club)}</td><td>${r.apps}</td><td>${r.goals}</td><td>${r.assists}</td><td>${r.rating ? r.rating.toFixed(2) : '-'}</td></tr>`).join('')}</table></div>` : '<p class="empty">1年目のシーズン中</p>'}
        ${me.lineage.length ? `<h2 style="margin-top:12px">🌳 一族</h2><ul class="list">${me.lineage.map((l) => `<li><span class="no">${l.gen}</span><span class="nm">${esc(l.name)} <span class="sub">「${esc(l.title)}」${l.years}</span></span><span class="v" style="color:var(--gold)">${l.letter}</span></li>`).join('')}</ul>` : ''}
        ${me.log.length ? `<h2 style="margin-top:12px">📝 できごと</h2><ul class="list">${me.log.slice().reverse().map((l) => `<li class="sub" style="display:block">${esc(l.t)}</li>`).join('')}</ul>` : ''}`;
    }
  }

  // ===== 画面の振り分け =====
  function route() {
    if (!ST) return renderStart();
    if (ST.me.status === 'draft') return renderDraft();
    renderHome();
  }
  async function load() {
    if (!CODE) return renderStart();
    const j = await api('/state');
    if (j.error === 'unauthorized') { CODE = null; store.del('code'); return renderStart(); }
    if (j.error) { toast(errMsg(j.error)); return ST ? route() : renderStart(); }
    setState(j); route();
  }

  // 自動では何度も取りに行かない（無料枠を守る）。節が進んだ直後に1回だけ取り直す
  setInterval(() => {
    if (!ST || $('scrHome').classList.contains('hidden')) return;
    $('topCd').textContent = countdown();
    const due = ST.world.nextAt + 8000 - (Date.now() + skew);
    if (due < 0 && Date.now() - fetchedAt > 30000 && document.visibilityState === 'visible') load();
  }, 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && ST && Date.now() - fetchedAt > 60000) load(); });

  $('startBtn').onclick = () => renderCreate(false);
  $('createBack').onclick = () => (ST && ST.me.status === 'retired' ? renderHome() : renderStart());
  $('signupBtn').onclick = signup;
  $('nameIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') signup(); });
  $('copyBtn').onclick = async () => { try { await navigator.clipboard.writeText(CODE); toast('コピーしました'); } catch { toast('長押しでコピーしてください'); } };
  $('codeOkBtn').onclick = () => route();
  $('loginBtn').onclick = async () => {
    const code = $('codeIn').value.trim().toUpperCase(); if (!code) return;
    CODE = code; const j = await api('/state');
    if (j.error) { CODE = store.get('code'); $('loginMsg').textContent = errMsg(j.error); return; }
    store.set('code', code); setState(j); route();
  };
  $('refreshBtn').onclick = load;
  $('tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { tab = b.dataset.t; renderTab(); } });
  $('revealBtn').onclick = () => { $('myCode').textContent = CODE; };
  $('logoutBtn').onclick = () => {
    if (!confirm('ログアウトします。引き継ぎコードをメモしていないと、二度と戻れません。よろしいですか？')) return;
    CODE = null; ST = null; store.del('code'); renderStart();
  };
  $('backBtn').onclick = $('homeBackBtn').onclick = () => { history.replaceState(null, '', location.pathname); renderTitle(); };

  // 一人用のタイトル画面にある「オンラインリーグ」の入口
  async function entryCard() {
    const info = document.getElementById('olEntryInfo'), btn = document.getElementById('olEntryBtn');
    if (!info) return;
    btn.textContent = CODE ? 'オンラインの続きから ▶' : 'オンラインで遊ぶ ▶';
    const j = await api('/public');
    info.textContent = j.error ? '' : `いま ${j.world.year}年・${j.world.phase === 'season' ? `第${j.world.week}節` : 'オフシーズン'}・${j.world.players}人が参加中`;
  }
  document.getElementById('olEntryBtn').onclick = load;
  window.OL = { open: load, entryCard };
  entryCard();
  if (location.hash === '#online') load();
})();
