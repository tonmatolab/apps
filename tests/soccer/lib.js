// テスト用の共通部品（サッカー人生）
'use strict';
const fs = require('fs');
const path = require('path');

// 決まった順に乱数を出す（同じシードなら毎回同じ結果になる）
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 文字列のハッシュ（結果が1文字でも変われば値が変わる）
function hash(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

// ブラウザの localStorage の代わり（キーには soccer- が付く前提のラッパーと同じ動き）
function fakeStore(init = {}) {
  const data = { ...init };
  return {
    data,
    get: (k) => (k in data ? data[k] : null),
    set: (k, v) => { data[k] = String(v); },
    del: (k) => { delete data[k]; },
    keys: () => Object.keys(data),
  };
}

let failures = 0;
function check(cond, msg) {
  if (!cond) { failures++; console.log('  ✗ ' + msg); } else if (process.env.VERBOSE) console.log('  ✓ ' + msg);
}
const failed = () => failures;

const ROOT = path.join(__dirname, '..', '..');
const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeJSON = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 1) + '\n');

module.exports = { seeded, hash, fakeStore, check, failed, ROOT, readJSON, writeJSON };
