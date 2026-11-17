// ===== 名前 → 戦国武将（同じ名前からは必ず同じ武将が生まれる） =====
'use strict';

const STAT_KEYS = ['bu', 'tou', 'chi', 'sei', 'un'];
const STAT_NAMES = { bu: '武力', tou: '統率', chi: '知略', sei: '政治', un: '運' };

const RARITIES = [
  { id: 'nami', name: '並', p: 0.55, total: [200, 260], color: '#8a93a3', glow: '#c9d1dc' },
  { id: 'ryo', name: '良将', p: 0.30, total: [260, 310], color: '#2f7de1', glow: '#8cc0ff' },
  { id: 'mei', name: '名将', p: 0.12, total: [310, 360], color: '#8b4fe0', glow: '#c9a5ff' },
  { id: 'ten', name: '天下人', p: 0.028, total: [360, 410], color: '#e0a100', glow: '#ffe08a' },
  { id: 'den', name: '伝説', p: 0.002, total: [420, 470], color: '#e8432f', glow: '#ffb3a6' },
];

const TROOPS = [
  { id: 'kiba', name: '騎馬', icon: '🐎' },
  { id: 'teppo', name: '鉄砲', icon: '🔫' },
  { id: 'ashigaru', name: '足軽', icon: '🗡️' },
  { id: 'yumi', name: '弓', icon: '🏹' },
  { id: 'shinobi', name: '忍', icon: '🥷' },
];
// 相性：左が右に強い（騎馬→弓→足軽→鉄砲→騎馬。忍は誰にも有利不利なし・回避が高い）
const BEATS = { kiba: 'yumi', yumi: 'ashigaru', ashigaru: 'teppo', teppo: 'kiba' };

// 固有スキル
const SKILLS = [
  { id: 'sandan', name: '三段構え', desc: '確率で2回攻撃する', kind: 'good' },
  { id: 'haisui', name: '背水の陣', desc: '兵が4割を切ると攻撃力1.8倍', kind: 'good' },
  { id: 'utsuke', name: 'うつけの奇策', desc: 'まれに一発逆転の大打撃', kind: 'good' },
  { id: 'shippu', name: '疾風怒濤', desc: '1戦目の攻撃力1.5倍', kind: 'good' },
  { id: 'teppeki', name: '鉄壁', desc: '確率で受けるダメージ半減', kind: 'good' },
  { id: 'kakei', name: '火計', desc: '確率で敵兵を焼き払う', kind: 'good' },
  { id: 'chouryaku', name: '調略', desc: '確率で敵の攻撃力を下げる', kind: 'good' },
  { id: 'hyourou', name: '兵糧攻め', desc: '毎戦、敵兵がじわじわ減る', kind: 'good' },
  { id: 'ichiban', name: '一番槍', desc: '開戦直後に先制攻撃', kind: 'good' },
  { id: 'kagemusha', name: '影武者', desc: '一度だけ敗北を回避する', kind: 'good' },
  { id: 'oni', name: '鬼の形相', desc: '開戦時、敵の統率を下げる', kind: 'good' },
  { id: 'yashu', name: '夜襲', desc: '確率で会心の一撃', kind: 'good' },
  { id: 'saihai', name: '名采配', desc: '常に攻撃力1.15倍', kind: 'good' },
  { id: 'taiko', name: '鼓舞の太鼓', desc: '2戦目に兵を回復', kind: 'good' },
  { id: 'otoshiana', name: '落とし穴', desc: '騎馬の敵の攻撃を封じる', kind: 'good' },
  { id: 'nanban', name: '南蛮渡来', desc: '鉄砲なら攻撃力1.3倍', kind: 'good' },
  { id: 'nitou', name: '二刀流', desc: '確率で追撃する', kind: 'good' },
  { id: 'chanoyu', name: '茶の湯', desc: '3戦目の前に兵を回復', kind: 'good' },
  { id: 'shinsoku', name: '神速', desc: '確率で敵の攻撃を回避', kind: 'good' },
  { id: 'harapeko', name: '腹ペコ', desc: '空腹で攻撃力0.85倍（残念）', kind: 'bad' },
  { id: 'houkou', name: '方向音痴', desc: 'たまに攻撃が空振り（残念）', kind: 'bad' },
  { id: 'hirune', name: '昼寝', desc: '1戦目は寝ているが3戦目は2倍', kind: 'odd' },
  { id: 'sake', name: '酒豪', desc: '飲むと強いが守りが甘い', kind: 'odd' },
  { id: 'nekozuki', name: '猫好き', desc: 'まれに猫に気を取られる…が猫が助けることも', kind: 'odd' },
];

const NICK_PRE = ['雷鳴の', '月下の', '紅蓮の', '疾風の', '漆黒の', '黄金の', '不死身の', '無双の', '鬼神の', '千年に一度の',
  '腹ペコの', '寝坊助の', '方向音痴の', '酒豪の', '二日酔いの', '泣き虫の', '猫好きの', '遅刻魔の', '筋肉の', '甘党の',
  '蒼天の', '白銀の', '炎の', '氷の', '風来の'];
const NICK_CORE = ['鬼武者', '軍師', '槍使い', '鉄砲名人', '忍び', '荒武者', '若武者', '猛将', '知将', '弓取り',
  '姫武者', '侍大将', '足軽頭', '傾奇者', '剣豪', '覇王', '名君', '策士'];
const COOL_PRE = ['雷鳴の', '月下の', '紅蓮の', '漆黒の', '黄金の', '不死身の', '無双の', '鬼神の', '千年に一度の', '蒼天の', '白銀の'];

// 隠し武将（歴史上の名前など）
const SPECIAL = {
  'おだのぶなが': { rarity: 'den', nick: '第六天魔王', skills: ['sandan', 'utsuke'], troop: 'teppo' },
  '織田信長': { rarity: 'den', nick: '第六天魔王', skills: ['sandan', 'utsuke'], troop: 'teppo' },
  'とよとみひでよし': { rarity: 'den', nick: '天下人', skills: ['chouryaku', 'taiko'], troop: 'ashigaru' },
  '豊臣秀吉': { rarity: 'den', nick: '天下人', skills: ['chouryaku', 'taiko'], troop: 'ashigaru' },
  'とくがわいえやす': { rarity: 'den', nick: '泰平の礎', skills: ['teppeki', 'hyourou'], troop: 'ashigaru' },
  '徳川家康': { rarity: 'den', nick: '泰平の礎', skills: ['teppeki', 'hyourou'], troop: 'ashigaru' },
  'たけだしんげん': { rarity: 'den', nick: '甲斐の虎', skills: ['shippu', 'saihai'], troop: 'kiba' },
  '武田信玄': { rarity: 'den', nick: '甲斐の虎', skills: ['shippu', 'saihai'], troop: 'kiba' },
  'うえすぎけんしん': { rarity: 'den', nick: '越後の龍', skills: ['yashu', 'kagemusha'], troop: 'kiba' },
  '上杉謙信': { rarity: 'den', nick: '越後の龍', skills: ['yashu', 'kagemusha'], troop: 'kiba' },
  'だてまさむね': { rarity: 'den', nick: '独眼竜', skills: ['nanban', 'nitou'], troop: 'teppo' },
  '伊達政宗': { rarity: 'den', nick: '独眼竜', skills: ['nanban', 'nitou'], troop: 'teppo' },
  'さなだゆきむら': { rarity: 'den', nick: '日本一の兵', skills: ['haisui', 'ichiban'], troop: 'kiba' },
  '真田幸村': { rarity: 'den', nick: '日本一の兵', skills: ['haisui', 'ichiban'], troop: 'kiba' },
  'あけちみつひで': { rarity: 'den', nick: '本能寺の主', skills: ['kakei', 'chouryaku'], troop: 'teppo' },
  '明智光秀': { rarity: 'den', nick: '本能寺の主', skills: ['kakei', 'chouryaku'], troop: 'teppo' },
  'とんまと': { rarity: 'den', nick: '赤き果実の忍び', skills: ['utsuke', 'nekozuki'], troop: 'shinobi' },
};

function normName(s) {
  s = String(s || '').normalize('NFKC').trim().replace(/\s+/g, '');
  s = s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  return s.toLowerCase();
}
function displayName(s) { return [...String(s || '').normalize('NFKC').trim().replace(/\s+/g, ' ')].slice(0, 12).join(''); }

function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067); h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213); h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067); h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213); h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= (h2 ^ h3 ^ h4); h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}
function sfc32(a, b, c, d) {
  return function () {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11); c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
function seeded(str) { const s = cyrb128(str); const R = sfc32(s[0], s[1], s[2], s[3]); for (let i = 0; i < 12; i++) R(); return R; }
const pick = (R, arr) => arr[Math.floor(R() * arr.length)];
const between = (R, a, b) => a + Math.floor(R() * (b - a + 1));

function makeBushou(rawName) {
  const name = displayName(rawName);
  const key = normName(rawName);
  const R = seeded('bushou:' + key);
  const sp = SPECIAL[key] || SPECIAL[name];

  // レア度
  let rarity;
  if (sp) rarity = RARITIES.find((r) => r.id === sp.rarity);
  else {
    let x = R(), acc = 0;
    rarity = RARITIES[0];
    for (const r of [...RARITIES].reverse()) { acc += r.p; if (x < acc) { rarity = r; break; } }
  }

  // 能力値：合計をレア度で決め、5つに配分
  const total = between(R, rarity.total[0], rarity.total[1]);
  const w = STAT_KEYS.map(() => 0.35 + R() * R() * 1.8);
  const ws = w.reduce((a, b) => a + b, 0);
  const stats = {};
  STAT_KEYS.forEach((k, i) => { stats[k] = Math.max(8, Math.min(100, Math.round(total * w[i] / ws))); });
  // 100で頭打ちになった分は、ほかの能力に配り直す
  for (let guard = 0; guard < 20; guard++) {
    const sum = STAT_KEYS.reduce((a, k) => a + stats[k], 0), open = STAT_KEYS.filter((k) => stats[k] < 100);
    if (sum >= total || !open.length) break;
    const add = Math.ceil((total - sum) / open.length);
    open.forEach((k) => { stats[k] = Math.min(100, stats[k] + add); });
  }

  const troop = sp ? TROOPS.find((t) => t.id === sp.troop) : pick(R, TROOPS);
  // スキル：名将以上は2つ
  const nSkill = ['mei', 'ten', 'den'].includes(rarity.id) ? 2 : 1;
  let skills = [];
  if (sp) skills = sp.skills.map((id) => SKILLS.find((s) => s.id === id));
  else {
    const pool = SKILLS.filter((s) => rarity.id === 'nami' || s.kind !== 'bad');
    while (skills.length < nSkill) { const s = pick(R, pool); if (!skills.includes(s)) skills.push(s); }
  }
  const pre = sp ? '' : (['ten', 'den'].includes(rarity.id) ? pick(R, COOL_PRE) : pick(R, NICK_PRE));
  const nick = sp ? sp.nick : pre + pick(R, NICK_CORE);
  const power = Math.round(stats.bu * 1.3 + stats.tou * 1.2 + stats.chi * 1.0 + stats.sei * .6 + stats.un * .9);

  // 見た目
  const look = {
    skin: pick(R, ['#f2c9a0', '#e9b48a', '#d9a077', '#f6d2b0', '#c98d63']),
    armor: pick(R, ['#2b2f3a', '#7a1f1f', '#1f3b6b', '#2e4a2b', '#4a2a5c', '#5a4a2a', '#1d1d1d', '#8a6a1a']),
    lace: pick(R, ['#e8432f', '#2f7de1', '#e0a100', '#ffffff', '#3cb371', '#8b4fe0', '#ff8ab0']),
    helm: pick(R, ['#1d1d1d', '#3a3f4b', '#7a1f1f', '#2b3a5c', '#5c4a2a']),
    crest: pick(R, ['kuwagata', 'mikazuki', 'nichirin', 'usagi', 'shika', 'honoo', 'hoshi', 'kamon']),
    crestColor: pick(R, ['#e8c14a', '#d9d9d9', '#e8432f', '#e8c14a', '#f2f2f2']),
    eyes: pick(R, ['fierce', 'round', 'sleepy', 'glare', 'fierce']),
    brows: pick(R, ['angry', 'flat', 'sad', 'angry']),
    mouth: pick(R, ['grin', 'shout', 'frown', 'smirk', 'frown']),
    beard: pick(R, ['none', 'mustache', 'full', 'goatee', 'mustache']),
    mask: R() < .18,
    scar: R() < .2,
    eyepatch: key.includes('まさむね') || key.includes('政宗') || R() < .04,
    flag: pick(R, ['#e8432f', '#2f7de1', '#f2f2f2', '#1d1d1d', '#e0a100', '#3cb371', '#8b4fe0']),
  };
  // 家紋
  const kamon = {
    n: pick(R, [3, 4, 5, 5, 6, 8]),
    shape: pick(R, ['circle', 'leaf', 'diamond', 'wedge', 'drop']),
    ring: R() < .6,
    inner: pick(R, ['dot', 'ring', 'petals', 'none']),
    rot: R() < .5 ? 0 : 1,
  };
  return { name, key, rarity, stats, total, power, troop, skills, nick, look, kamon, special: !!sp };
}

if (typeof module !== 'undefined') module.exports = { makeBushou, normName, seeded, SKILLS, TROOPS, BEATS, RARITIES, STAT_KEYS, STAT_NAMES };
