// セーブデータのテスト（読み込み・移行・バックアップ・続きから遊べるか）
//   node tests/soccer/save.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const { seeded, fakeStore, check, failed } = require('./lib');
const SL = require('./sl');
const SaveData = require('../../soccer-life/save.js');

SL.setRng(seeded(4242));
const DIR = path.join(__dirname, 'fixtures');
const files = fs.readdirSync(DIR).filter((f) => f.startsWith('v1-') && f.endsWith('.json'));
check(files.length >= 9, `見本が9種類以上ある（${files.length}）`);

// 画面と同じ順で、続きから2シーズン遊ぶ
function continuePlay(s) {
  if (s.phase === 'draft') { SL.joinClub(s, s.draft[0]); delete s.draft; SL.startSeason(s); }
  if (s.phase === 'retiring') { SL.playLastMatch(s, 0, false); SL.retire(s); }
  if (s.phase === 'retired') { s = SL.nextGeneration(s, SL.childName(s.p.name), s.p.pos); SL.joinClub(s, s.draft[0]); delete s.draft; SL.startSeason(s); }
  for (let y = 0; y < 2; y++) {
    if (s.phase === 'off' && s.off) { delete s.off; SL.startSeason(s); }
    while (s.phase === 'season') { const w = SL.playWeek(s); if (w.event) SL.resolveEvent(s, w.event, 0); }
    if (s.phase === 'seasonEnd') { SL.endSeason(s); SL.nationalYear(s); SL.ageUp(s); }
    const o = SL.offers(s);
    if (SL.mustRetire(s, o)) { SL.playLastMatch(s, 0, true); SL.retire(s); return s; }
    if (o.contract) SL.accept(s, o.contract); else if (o.transfers[0]) SL.accept(s, o.transfers[0]);
    SL.startSeason(s);
  }
  return s;
}
function sane(s, label) {
  const p = s.p;
  check(Object.values(p.stats).every((v) => Number.isInteger(v) && v >= 1 && v <= 99), `${label}: 能力が1〜99`);
  check(Number.isFinite(p.money), `${label}: 所持金が数値`);
  check(p.potLo <= p.pot && p.pot <= p.potHi, `${label}: 才能の見立てが本当の才能を含む`);
  check(Array.isArray(s.log) && Array.isArray(s.papers) && s.records, `${label}: 記録・新聞・ログがある`);
}

// v1→v2：クラブは ID ごとに新しい名前・特徴になり、所属リーグと強さ・経歴のクラブ名はそのまま。NPCが22人ずつできる
function migratedWorld(old, s, label) {
  check(s.clubs.length === 70 && s.clubs.slice(0, 30).every((c, i) => c.id === i && c.lg === old.clubs[i].lg && c.str === old.clubs[i].str), `${label}: 前からの30クラブのIDと所属リーグ・強さはそのまま`);
  check(s.clubs.slice(30, 50).every((c) => c.lg === 3 || c.lg === 4) && s.clubs.slice(50).every((c) => c.lg === 5 || c.lg === 6) && s.clubs.filter((c) => c.lg === 3).length === 10, `${label}: 国内3部・4部と欧州2部・3部の40クラブが足される`);
  check(s.clubs.slice(0, 30).every((c) => c.short && c.mark && c.atk != null && c.recruit >= 1 && c.name !== old.clubs[c.id].name), `${label}: クラブ名・略称・特徴が新しくなる`);
  check(JSON.stringify(s.history.map((h) => h.club)) === JSON.stringify(old.history.map((h) => h.club)), `${label}: 経歴のクラブ名は当時のまま`);
  check(s.p.club === old.p.club && s.p.name === old.p.name && JSON.stringify(s.p.stats) === JSON.stringify(old.p.stats), `${label}: 選手本人のデータは変わらない`);
  check(Array.isArray(s.npcs) && s.npcs.length === 1540 && s.clubs.length === 70 && s.clubs.every((c) => s.npcs.filter((n) => n.club === c.id).length === 22), `${label}: NPCが各クラブ22人`);
  const again = SL.upgradeWorld(JSON.parse(JSON.stringify(old)));
  check(JSON.stringify(again.npcs) === JSON.stringify(s.npcs), `${label}: 同じセーブから移行すると同じNPCになる`);
}

for (const f of files) {
  const label = f.replace('.json', '');
  const raw = fs.readFileSync(path.join(DIR, f), 'utf8');
  const store = fakeStore({ save: raw });
  const r = SaveData.read(store);
  check(r.status === 'migrated' && r.from === 1 && r.state && r.state.v === 2, `${label}: v1 から v2 に移行して読み込める（${r.status}${r.error ? ' ' + r.error : ''}）`);
  if (!r.state) continue;
  check(store.get('save') === raw, `${label}: 読み込みで元のデータを書き換えない`);
  check(store.get(SaveData.backupKey(1)) === raw, `${label}: 元のデータのバックアップが取れている`);
  let s = r.state;
  sane(s, label + '（読込直後）');
  migratedWorld(JSON.parse(raw), s, label);
  try { s = continuePlay(s); sane(s, label + '（2シーズン後）'); } catch (e) { check(false, `${label}: 続きから遊べる（${e.stack.split('\n').slice(0, 3).join(' / ')}）`); continue; }
  // 書いて読み直しても同じ
  SaveData.write(store, s);
  const again = SaveData.read(store);
  check(again.status === 'ok' && JSON.stringify(SL.migrate(JSON.parse(JSON.stringify(s)))) === JSON.stringify(again.state), `${label}: 書いて読み直すと同じ`);
  check(store.get(SaveData.backupKey(1)) === raw, `${label}: バックアップは最初のデータのまま（上書きしない）`);
}

// 壊れたデータ・新しすぎるデータ
{
  const store = fakeStore({ save: '{これは壊れている' });
  const r = SaveData.read(store);
  check(r.status === 'broken' && r.state === null, '壊れたデータは broken');
  check(store.get('save') === '{これは壊れている', '壊れたデータを消さない');
  const k = SaveData.protectBeforeOverwrite(store, 123);
  check(k === 'save-unreadable-123' && store.get(k) === '{これは壊れている', 'はじめからの前に、壊れたデータを退避する');
}
{
  const raw = JSON.stringify({ v: 99, p: { name: 'x' } });
  const store = fakeStore({ save: raw });
  const r = SaveData.read(store);
  check(r.status === 'newer', '新しい版のデータは newer（読まずに残す）');
  check(store.get('save') === raw && store.get(SaveData.backupKey(99)) == null, '新しい版のデータには触らない');
}
{
  const store = fakeStore({});
  check(SaveData.read(store).status === 'none', 'データなしは none');
  check(SaveData.protectBeforeOverwrite(store) === null, 'データなしなら退避しない');
}
{
  const store = fakeStore({ save: '{"v":1,"p":{}}', collection: '{"v":1}', 'save-backup-v1': 'x', lastName: '山田' });
  const ex = SaveData.exportAll(store, ['save', 'collection', 'save-backup-v1']);
  check(ex.app === 'soccer-life' && Object.keys(ex.data).length === 3 && !('lastName' in ex.data), '書き出しに必要なデータだけが入る');
}

console.log(`save: ${files.length} fixtures, ${failed() ? failed() + ' failed' : 'all passed'}`);
process.exitCode = failed() ? 1 : 0;
