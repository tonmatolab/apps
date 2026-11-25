// 名前・必殺技に使えない言葉（オンラインリーグ・全国ランキングで共通）
// 見比べる前に、全角半角・カタカナとひらがな・大文字小文字・空白や記号の違いをそろえる（「死 ね」「シネ」「ｼﾈ」も止める）
const WORDS = [
  // 暴言・脅し
  'しね', '死ね', '死んで', '氏ね', 'ころすぞ', 'ころしてやる', '殺す', '殺し', '殺され', 'くたばれ', 'きえろ', '消えろ', '自殺',
  // 差別
  'がいじ', 'きちがい', '基地外', '池沼', 'にがー', 'nigger', 'nigga',
  // 性的
  'ちんこ', 'ちんぽ', 'まんこ', 'せっくす', 'sex', 'れいぷ', 'rape', 'fuck', 'shit', 'bitch', 'cunt', 'pussy', 'porn',
];
// カタカナ → ひらがな、空白と区切りの記号を消す
export function ngNorm(s) {
  return String(s || '').normalize('NFKC').toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s・._\-~〜＿*＊/|!！?？。、,]/g, '');
}
const NORM = WORDS.map(ngNorm);
export function isNg(s) {
  const n = ngNorm(s);
  return NORM.some((w) => n.includes(w));
}
