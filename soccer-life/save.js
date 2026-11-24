// ===== 一人用セーブデータの読み書き（バージョン管理・移行・バックアップ） =====
// ブラウザでは window.SaveData、Node（テスト）では require で使う。
// storage は { get(k), set(k, v), del(k) } の形（index.html の store。キーの頭に 'soccer-' が付く）。
//
// 決まりごと
// - 元のセーブデータ（文字列）は、移行する前に必ず別のキーへコピーしてから触る。コピーは上書きしない。
// - 読めないデータ・新しすぎるデータは「なし」扱いにせず、そのまま残す。上書きする前にも退避する。
'use strict';
(function (root, factory) {
  // ブラウザでは core.js の SL（グローバルな const。window のプロパティではない）を、Node では require で
  const api = factory(typeof SL !== 'undefined' ? SL : require('./sl.js'));
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SaveData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (SL) {
  const KEY = 'save';
  const VERSION = 2; // セーブデータの形が変わったら上げて、下の MIGRATIONS に移行を足す
  // MIGRATIONS[n] は「バージョン n のデータを n+1 にする」関数。最後に s.v を n+1 にする
  const MIGRATIONS = {
    // v1→v2：クラブの新しい名前・略称・特徴（IDと所属リーグ・強さはそのまま、経歴のクラブ名は当時のまま）、NPC選手の名簿
    1: (s) => { SL.upgradeWorld(s); s.v = 2; return s; },
  };

  const backupKey = (v) => `save-backup-v${v}`;

  // バックアップ（同じキーにすでにあれば上書きしない）
  function backupOnce(storage, raw, v) {
    const k = backupKey(v);
    if (storage.get(k) == null) storage.set(k, raw);
    return k;
  }

  // 読む：{ status, state, raw, from }
  //   status: 'none' データなし / 'ok' そのまま読めた / 'migrated' 移行した / 'newer' 新しい版のデータ / 'broken' 壊れている
  function read(storage) {
    const raw = storage.get(KEY);
    if (raw == null || raw === '') return { status: 'none', state: null, raw: null };
    let j;
    try { j = JSON.parse(raw); } catch { return { status: 'broken', state: null, raw }; }
    if (!j || typeof j !== 'object' || typeof j.v !== 'number' || !j.p) return { status: 'broken', state: null, raw };
    if (j.v > VERSION) return { status: 'newer', state: null, raw, from: j.v };
    // 今の版のデータも、いつか移行するときのために一度だけ控えておく
    backupOnce(storage, raw, j.v);
    let s = j, from = j.v;
    try {
      while (s.v < VERSION) {
        const up = MIGRATIONS[s.v];
        if (!up) return { status: 'broken', state: null, raw };
        s = up(s); s.v = s.v || from + 1;
      }
      s = SL.migrate(s); // 小さな項目の補充（いつでも安全）
    } catch (e) {
      return { status: 'broken', state: null, raw, error: String(e && e.message || e) };
    }
    return { status: from < VERSION ? 'migrated' : 'ok', state: s, raw, from };
  }

  function write(storage, state) {
    state.v = VERSION;
    storage.set(KEY, JSON.stringify(state));
  }

  // 新しく始める前に：読めない・新しすぎるデータが残っていれば退避してから消す（勝手に失わない）
  function protectBeforeOverwrite(storage, now = Date.now()) {
    const r = read(storage);
    if (r.status === 'broken' || r.status === 'newer') {
      const k = `save-unreadable-${now}`;
      storage.set(k, r.raw);
      return k;
    }
    return null;
  }

  // バックアップ用にまとめて書き出す（ダウンロード用）。引き継ぎコードは含めない
  function exportAll(storage, keys) {
    const out = { app: 'soccer-life', exportedAt: new Date().toISOString(), version: VERSION, data: {} };
    for (const k of keys) { const v = storage.get(k); if (v != null) out.data[k] = v; }
    return out;
  }

  return { VERSION, MIGRATIONS, read, write, backupOnce, backupKey, protectBeforeOverwrite, exportAll };
});
