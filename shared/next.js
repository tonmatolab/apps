// 各アプリの下に「次はこれで遊ぼう」を出す ＋ ホーム画面に追加（PWA）の準備
// 使い方：<div class="tonmato-next" data-current="iai"></div> を置いて、../shared/apps.js と ../shared/next.js を読み込む
(function () {
  'use strict';
  const me = document.currentScript;
  const BASE = new URL('../', me.src); // アプリ集のトップ（/apps/）
  const API = 'https://tonmatolab-counter.tonmatolab.workers.dev';
  // 公式Xアカウント（ご意見・不具合・お問い合わせの窓口）。各アプリのいちばん下に出す
  const X_LINE = '<p class="tn-x">お問い合わせ・ご意見・不具合の報告は<br>X（旧Twitter）<a href="https://x.com/tonmatolab" target="_blank" rel="noopener">@tonmatolab</a> へどうぞ</p>';

  // ----- ホーム画面に追加（manifest・アイコン・service worker） -----
  const head = document.head;
  const addLink = (rel, href, extra = {}) => {
    if (head.querySelector(`link[rel="${rel}"]`)) return;
    const l = document.createElement('link'); l.rel = rel; l.href = href;
    Object.entries(extra).forEach(([k, v]) => l.setAttribute(k, v));
    head.appendChild(l);
  };
  addLink('manifest', new URL('manifest.webmanifest', BASE).href);
  addLink('apple-touch-icon', new URL('icons/icon-192.png', BASE).href);
  if (!head.querySelector('meta[name="theme-color"]')) { const m = document.createElement('meta'); m.name = 'theme-color'; m.content = '#e8432f'; head.appendChild(m); }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register(new URL('sw.js', BASE).href, { scope: BASE.pathname }).catch(() => {});
  }

  // ----- 次はこれで遊ぼう -----
  const css = `
  .tonmato-next { margin: 26px 0 0; font-family: "M PLUS Rounded 1c", system-ui, sans-serif; }
  .tonmato-next h3 { margin: 0 0 10px; font-size: 1.05rem; text-align: center; color: inherit; }
  .tonmato-next .tn-list { display: grid; gap: 10px; }
  .tonmato-next a { display: flex; gap: 12px; align-items: center; background: #fff; color: #1d2433; border-radius: 16px; padding: 8px; text-decoration: none;
    box-shadow: 0 4px 0 rgba(0,0,0,.18); border: 2px solid rgba(0,0,0,.06); transition: transform .08s; }
  .tonmato-next a:active { transform: translateY(3px); box-shadow: 0 1px 0 rgba(0,0,0,.18); }
  .tonmato-next img { width: 112px; height: 59px; object-fit: cover; border-radius: 10px; flex: none; background: #eee; }
  .tonmato-next .tn-t { font-weight: 800; font-size: .95rem; line-height: 1.35; }
  .tonmato-next .tn-d { font-size: .75rem; color: #66708a; line-height: 1.4; margin-top: 2px; }
  .tonmato-next .tn-p { font-size: .7rem; font-weight: 800; color: #e8432f; margin-top: 2px; }
  .tonmato-next .tn-all { display: block; text-align: center; margin-top: 10px; font-size: .85rem; font-weight: 800; color: inherit; opacity: .8; }
  .tonmato-next .tn-x { margin: 14px 0 0; text-align: center; font-size: .75rem; line-height: 1.6; color: inherit; opacity: .75; }
  .tonmato-next .tn-x a { display: inline; background: none; box-shadow: none; border: 0; padding: 0; border-radius: 0; color: inherit; font-weight: 800; text-decoration: underline; }`;
  const st = document.createElement('style'); st.textContent = css; head.appendChild(st);

  // 全アプリの遊んだ人数（1回で全部取って、1時間は使い回す。次に来たときも使えるように localStorage。トップページと共通の入れ物）
  function playCounts(apps) {
    try { const c = JSON.parse(localStorage.getItem('tn-counts') || 'null'); if (c && Date.now() - c.t < 3600000) return Promise.resolve(c.j); } catch {}
    return fetch(`${API}/get?keys=${apps.map((a) => a.key).join(',')}`).then((r) => r.json()).then((j) => {
      try { localStorage.setItem('tn-counts', JSON.stringify({ t: Date.now(), j })); } catch {}
      return j;
    });
  }
  function render() {
    const apps = window.TONMATO_APPS || [];
    document.querySelectorAll('.tonmato-next').forEach((box) => {
      const cur = box.dataset.current;
      const others = apps.filter((a) => a.id !== cur);
      // 毎回少し順番を変えて、いろんなアプリを見てもらう
      const pick = others.map((a) => ({ a, r: Math.random() })).sort((x, y) => x.r - y.r).slice(0, 3).map((x) => x.a);
      box.innerHTML = `<h3>🎮 次はこれで遊ぼう</h3><div class="tn-list"></div><a class="tn-all" href="${BASE.href}">ほかのゲーム・診断をぜんぶ見る →</a>${X_LINE}`;
      const list = box.querySelector('.tn-list');
      pick.forEach((a) => {
        const el = document.createElement('a');
        el.href = new URL(a.path, BASE).href;
        el.innerHTML = `<img alt="" loading="lazy"><div><div class="tn-t"></div><div class="tn-d"></div><div class="tn-p" data-key="${a.key}"></div></div>`;
        el.querySelector('img').src = new URL(a.path + 'og.png', BASE).href;
        el.querySelector('.tn-t').textContent = `${a.icon} ${a.title}`;
        el.querySelector('.tn-d').textContent = a.desc;
        list.appendChild(el);
      });
      playCounts(apps).then((j) => {
        box.querySelectorAll('.tn-p').forEach((p) => { const n = j[p.dataset.key] || 0; if (n > 0) p.textContent = `👤 ${n.toLocaleString()}人が遊びました`; });
      }).catch(() => {});
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
})();
