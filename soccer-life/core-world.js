// ===== サッカー人生：世界の選手（NPC） =====
// クラブに所属するNPC選手を作る。名前・ポジション・能力は決まった乱数（シード）から作るので、何度作り直しても同じになる。
// core.js のあとに読み込む。作ったものを SL に足す。
// 名前はすべて架空。元になった人物の名前や対応関係は、このファイルにもセーブデータにも入れない。
'use strict';
(function (SL) {
  const { clamp } = SL._;
  const { POS, ovr } = SL;

  // ----- このファイル専用の乱数（ゲームの乱数とは別。シードが同じなら必ず同じ結果） -----
  function hashStr(str) { let h = 2166136261 >>> 0; for (const ch of String(str)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }
  function makeRng(seed) {
    let a = seed >>> 0;
    const f = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    f.ri = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    f.gauss = () => { let u = 0, v = 0; while (!u) u = f(); while (!v) v = f(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    return f;
  }

  // ----- 1クラブの人数とポジションの枠 -----
  const SQUAD_SIZE = 22;
  const SQUAD_QUOTA = { GK: 3, DF: 7, MF: 7, FW: 5 };
  const STARTERS = { GK: 1, DF: 4, MF: 4, FW: 2 }; // 4-4-2 の先発の人数（名簿の強さの目安）

  // ----- プレースタイル（ポジションの中の役割。能力の形から決まる） -----
  const STYLES = {
    striker: { pos: 'FW', name: 'ストライカー' }, post: { pos: 'FW', name: 'ポストプレーヤー' }, dribbler: { pos: 'FW', name: 'ドリブラー' },
    playmaker: { pos: 'MF', name: 'プレーメーカー' }, b2b: { pos: 'MF', name: 'ボックストゥボックス' }, anchor: { pos: 'MF', name: '守備的MF' }, wide: { pos: 'MF', name: 'サイドハーフ' },
    cb: { pos: 'DF', name: 'センターバック' }, fb: { pos: 'DF', name: '攻撃的サイドバック' },
    keeper: { pos: 'GK', name: '守護神' }, sweeper: { pos: 'GK', name: 'スイーパーキーパー' },
  };
  // スタイルごとに得意な能力。生成するときはこの能力を少し高くし、判定するときは得意な能力がいちばん目立つスタイルを選ぶ
  const STYLE_KEYS = {
    striker: ['sht'], post: ['phy', 'sht'], dribbler: ['drb', 'spd'],
    playmaker: ['pas'], b2b: ['phy', 'spd'], anchor: ['def'], wide: ['spd', 'drb'],
    cb: ['def', 'phy'], fb: ['spd', 'pas'], keeper: ['gk'], sweeper: ['pas'],
  };
  // 1クラブの中でのスタイルの組み合わせ（ポジションの枠の人数と同じ数）
  const STYLE_MIX = {
    GK: ['keeper', 'keeper', 'sweeper'], DF: ['cb', 'fb', 'cb', 'fb', 'cb', 'fb', 'cb'],
    MF: ['anchor', 'playmaker', 'b2b', 'wide', 'anchor', 'playmaker', 'wide'], FW: ['striker', 'dribbler', 'post', 'striker', 'dribbler'],
  };
  function styleOf(p) {
    if (p.pos === 'GK') return p.stats.pas >= 58 ? 'sweeper' : 'keeper';
    const others = Object.keys(POS[p.pos].w);
    let best = null, bestV = -Infinity;
    for (const [k, keys] of Object.entries(STYLE_KEYS)) {
      if (STYLES[k].pos !== p.pos) continue;
      const v = keys.reduce((a, x) => a + p.stats[x], 0) / keys.length - others.reduce((a, x) => a + p.stats[x], 0) / others.length;
      if (v > bestV) { best = k; bestV = v; }
    }
    return best;
  }

  // ----- 名前のプール（国ごと。自然な架空の姓名を組み合わせる） -----
  // jp：「姓 名」、それ以外：「名・姓」
  const NAME_POOLS = {
    日本: { jp: true,
      last: ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤', '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '清水', '山崎', '森', '池田', '橋本', '阿部', '石川', '前田', '藤田', '小川', '岡田', '後藤', '長谷川', '村上', '近藤', '石井', '坂本', '遠藤', '青木', '藤井', '西村', '福田', '太田', '三浦', '岡本', '松田', '中川', '中野', '原田', '小野', '竹内', '金子', '和田', '中山', '石田', '上田', '森田', '原', '柴田', '酒井', '工藤', '横山'],
      first: ['蓮', '大翔', '陽翔', '湊', '颯太', '悠真', '翼', '海斗', '陸', '律', '樹', '奏太', '瑛太', '蒼', '大和', '悠人', '拓海', '優斗', '健太', '翔太', '大輝', '匠', '隼人', '颯', '陽向', '結翔', '朝陽', '智也', '亮介', '雄大', '直樹', '慎吾', '光希', '和真', '圭佑', '誠', '一真', '怜', '晴', '空', '奏', '純', '凌', '慧', '拓真', '友哉', '駿', '永遠'] },
    ブラジル: { last: ['サントス', 'オリヴェイラ', 'ソウザ', 'フェレイラ', 'アウヴェス', 'ゴメス', 'カルヴァーリョ', 'アラウージョ', 'メロ', 'ロシャ', 'カルドーゾ', 'テイシェイラ', 'モラエス', 'ノゲイラ', 'ピント', 'マシャード'],
      first: ['ガブリエル', 'ルーカス', 'マテウス', 'ラファエル', 'チアゴ', 'ジエゴ', 'フェリペ', 'ヴィトール', 'レアンドロ', 'エヴェルトン', 'ダニーロ', 'アンデルソン', 'カイオ', 'エリキ', 'ウェリントン', 'ジョルジ', 'ブレノ', 'イゴール', 'ケヴィン', 'オタヴィオ'] },
    アルゼンチン: { last: ['ロドリゲス', 'ペレス', 'ソサ', 'ロメロ', 'アコスタ', 'ベニテス', 'エレーラ', 'スアレス', 'アギーレ', 'ヒメネス', 'カブレラ', 'ゴドイ', 'ルナ', 'フネス', 'ペラルタ', 'ビジャルバ', 'コロネル'],
      first: ['マティアス', 'ニコラス', 'ファクンド', 'サンティアゴ', 'ホアキン', 'トマス', 'アグスティン', 'フランコ', 'ルシアーノ', 'ガストン', 'レアンドロ', 'イグナシオ', 'セバスティアン', 'ブルーノ', 'エセキエル', 'ヘルマン', 'ロドリゴ', 'マキシミリアーノ', 'ナウエル', 'ヴァレンティン'] },
    スペイン: { last: ['ガルシア', 'マルティン', 'サンチェス', 'ゴメス', 'ルイス', 'ムニョス', 'ナバロ', 'ドミンゲス', 'バスケス', 'ラミレス', 'ヒル', 'セラーノ', 'ブランコ', 'モレノ', 'カストロ', 'オルテガ', 'デルガド', 'マリン', 'イグレシアス'],
      first: ['アレハンドロ', 'ダニエル', 'パブロ', 'ハビエル', 'アドリアン', 'ディエゴ', 'アルバロ', 'マリオ', 'イバン', 'ルベン', 'ホルヘ', 'ミゲル', 'ビクトル', 'ゴンサロ', 'マルコス', 'ウナイ', 'ニコ', 'エリック', 'オリオル', 'イサーク'] },
    ポルトガル: { last: ['ソアレス', 'マルティンス', 'ジェズス', 'ロペス', 'モンテイロ', 'コレイア', 'カブラル', 'ゴウヴェイア', 'ピレス', 'ファリア', 'ボルジェス', 'カンポス', 'モウラ', 'ブランダォン', 'ヌネス', 'ピニェイロ'],
      first: ['ジョアン', 'ティアゴ', 'ディオゴ', 'ゴンサロ', 'ルイ', 'ヌーノ', 'アンドレ', 'リカルド', 'ミゲル', 'ペドロ', 'ラファエル', 'ダニエル', 'ウーゴ', 'セルジオ', 'ヴィトール', 'ファビオ', 'マルコ', 'エドゥアルド', 'ジルベルト', 'トマス'] },
    フランス: { last: ['マルタン', 'ベルナール', 'デュボワ', 'ロベール', 'リシャール', 'プティ', 'デュラン', 'ルロワ', 'モロー', 'シモン', 'ローラン', 'ルフェーヴル', 'ミシェル', 'ガルニエ', 'フォール', 'ルソー', 'ブラン', 'ゲラン', 'ボワイエ', 'シャルパンティエ'],
      first: ['ルカ', 'ユーゴ', 'テオ', 'ネイサン', 'エンゾ', 'ルイ', 'ラファエル', 'アルチュール', 'ジュール', 'マエル', 'ノア', 'サシャ', 'ヤニス', 'アドリアン', 'バティスト', 'クレマン', 'マティス', 'ロマン', 'ケヴィン', 'ブライス'] },
    ドイツ: { last: ['ミュラー', 'シュミット', 'シュナイダー', 'フィッシャー', 'ヴェーバー', 'マイヤー', 'ヴァーグナー', 'ベッカー', 'コッホ', 'リヒター', 'クライン', 'ヴォルフ', 'シュレーダー', 'ノイマン', 'シュヴァルツ', 'ツィンマー', 'ブラウン', 'ハルトマン'],
      first: ['ルーカス', 'レオン', 'フィン', 'ヨナス', 'ニクラス', 'ティモ', 'ユリアン', 'マクシミリアン', 'パウル', 'フェリックス', 'ニコ', 'ヤニク', 'トビアス', 'ダヴィト', 'マルヴィン', 'ベネディクト', 'ルーカ', 'ヘンリク', 'ラース', 'ザシャ'] },
    イングランド: { last: ['スミス', 'ジョーンズ', 'テイラー', 'ブラウン', 'ウィリアムズ', 'ジョンソン', 'デイヴィス', 'ロビンソン', 'ライト', 'トンプソン', 'エヴァンス', 'ウォーカー', 'ロバーツ', 'グリーン', 'ホール', 'ウッド', 'ジャクソン', 'クラーク'],
      first: ['オリバー', 'ジャック', 'ハリー', 'ジョージ', 'チャーリー', 'ジェイコブ', 'トーマス', 'オスカー', 'ジェームズ', 'ウィリアム', 'ジョシュア', 'ルイス', 'ダニエル', 'ライアン', 'ベン', 'ネイサン', 'カラム', 'リース', 'メイソン', 'タイラー'] },
    イタリア: { last: ['ロッシ', 'ルッソ', 'フェラーリ', 'エスポジト', 'ビアンキ', 'ロマーノ', 'コロンボ', 'リッチ', 'マリーノ', 'グレコ', 'ブルーノ', 'ガッロ', 'コンティ', 'デ・ルカ', 'マンチーニ', 'コスタ', 'ジョルダーノ', 'リッツォ', 'ロンバルディ', 'モレッティ'],
      first: ['ロレンツォ', 'フランチェスコ', 'アレッサンドロ', 'レオナルド', 'マッティア', 'アンドレア', 'ガブリエーレ', 'リッカルド', 'トンマーゾ', 'エドアルド', 'マッテオ', 'ジャコモ', 'ダヴィデ', 'フェデリコ', 'ステファノ', 'シモーネ', 'ピエトロ', 'ルカ', 'ニコロ', 'サムエーレ'] },
    オランダ: { last: ['ヤンセン', 'デ・フリース', 'ファン・デン・ベルフ', 'バッカー', 'フィッセル', 'スミット', 'メイヤー', 'デ・ブール', 'モス', 'デッケル', 'ブラウワー', 'ダイクストラ', 'ヘルマンス', 'クラーセン', 'ファン・ダム', 'ポストマ', 'ヴェスターホフ', 'ブロム', 'ケイゼル'],
      first: ['ダーン', 'セム', 'ルーカス', 'ミラン', 'レヴィ', 'ティス', 'ヨリス', 'ステイン', 'バス', 'ラウル', 'ヴァウト', 'ニールス', 'ケース', 'ヤスパー', 'ルーク', 'ティム', 'ボブ', 'イェレ', 'マタイス', 'ダニー'] },
    韓国: { jpOrderKr: true, last: ['キム', 'イ', 'パク', 'チェ', 'チョン', 'カン', 'チョ', 'ユン', 'チャン', 'イム', 'ハン', 'オ', 'ソ', 'シン', 'クォン', 'ファン', 'アン', 'ソン', 'ホン', 'ユ'],
      first: ['ジフン', 'ミンジュン', 'ソジュン', 'ドユン', 'ヒョンウ', 'ジホ', 'ジュンソ', 'ウジン', 'ソンミン', 'テヤン', 'ドンヒョン', 'ジェウォン', 'スンホ', 'ヨンジュン', 'ハジュン', 'ミンソク', 'サンウ', 'ギュヒョン', 'テウン', 'ジョンフン'] },
  };
  // クラブの地元ではない選手の国籍の候補（欧州のクラブ用・国内のクラブ用）
  const ABROAD_EU = ['ブラジル', 'アルゼンチン', 'スペイン', 'ポルトガル', 'フランス', 'ドイツ', 'イングランド', 'イタリア', 'オランダ', 'ブラジル', 'フランス', '日本'];
  const ABROAD_JP = ['ブラジル', 'ブラジル', 'ブラジル', '韓国', '韓国', 'スペイン', 'オランダ', 'アルゼンチン', 'ポルトガル'];
  function fullName(nat, r) {
    const P = NAME_POOLS[nat] || NAME_POOLS.日本;
    const l = r.pick(P.last), f = r.pick(P.first);
    if (P.jp) return `${l} ${f}`;
    if (P.jpOrderKr) return `${l}・${f}`;
    return `${f}・${l}`;
  }

  // ----- 有名選手をイメージした100人（架空名・国籍・ポジション・格。格は 1〜5） -----
  // 能力・年齢は名前から決まる（同じ名前なら必ず同じ）。所属先は格とリーグの強さから決まる。
  const FAMOUS = [
    // 日本の選手 40人
    ['大迫 勇哉', '日本', 'FW', 3], ['武藤 佳紀', '日本', 'FW', 2], ['小川 航希', '日本', 'FW', 3], ['細谷 真太', '日本', 'FW', 2], ['鈴木 優馬', '日本', 'FW', 3],
    ['谷口 海人', '日本', 'FW', 2], ['山田 真', '日本', 'FW', 1], ['ジャーメイン 亮', '日本', 'FW', 2], ['宮代 大成', '日本', 'FW', 2], ['長倉 幹希', '日本', 'FW', 1],
    ['林 大智', '日本', 'FW', 1], ['久保 建秀', '日本', 'MF', 4], ['三笘 馨', '日本', 'MF', 4], ['堂安 律希', '日本', 'MF', 3], ['伊東 純哉', '日本', 'FW', 3],
    ['鎌田 大智', '日本', 'MF', 4], ['遠藤 渡', '日本', 'MF', 4], ['田中 蒼', '日本', 'MF', 3], ['旗手 玲央', '日本', 'MF', 3], ['脇坂 泰人', '日本', 'MF', 2],
    ['家長 明博', '日本', 'MF', 2], ['佐野 海周', '日本', 'MF', 3], ['荒木 遼大', '日本', 'MF', 2], ['松木 久生', '日本', 'MF', 2], ['小泉 佳歩', '日本', 'MF', 1],
    ['谷口 彰吾', '日本', 'DF', 2], ['板倉 光', '日本', 'DF', 3], ['冨安 健太', '日本', 'DF', 4], ['伊藤 洋樹', '日本', 'DF', 3], ['高井 幸太', '日本', 'DF', 2],
    ['昌子 源太', '日本', 'DF', 1], ['酒井 宏希', '日本', 'DF', 2], ['中谷 進ノ介', '日本', 'DF', 2], ['毎熊 晴矢', '日本', 'DF', 2], ['鈴木 彩円', '日本', 'GK', 3],
    ['大迫 敬助', '日本', 'GK', 2], ['谷 晃輔', '日本', 'GK', 2], ['小久保 怜央ブライアン', '日本', 'GK', 1], ['前川 黛哉', '日本', 'GK', 1], ['中村 俊介', '日本', 'MF', 2],
    // 海外の選手 FW 20人
    ['リオネル・メッシア', 'アルゼンチン', 'FW', 5], ['クリスティアーノ・ロナルドス', 'ポルトガル', 'FW', 4], ['キリアン・エムバペル', 'フランス', 'FW', 5], ['アーリング・ハーランドル', 'ノルウェー', 'FW', 5],
    ['モハメド・サラフ', 'エジプト', 'FW', 4], ['ハリー・ケインズ', 'イングランド', 'FW', 5], ['ロベルト・レヴァンドフス', 'ポーランド', 'FW', 4], ['ヴィニシオ・ジュニオル', 'ブラジル', 'FW', 5],
    ['ラミン・ヤマレス', 'スペイン', 'FW', 5], ['ラウタロ・マルティネスオ', 'アルゼンチン', 'FW', 4], ['アントワーヌ・グリーズマンヌ', 'フランス', 'FW', 4], ['ソン・フンミョン', '韓国', 'FW', 4],
    ['フリアン・アルバロス', 'アルゼンチン', 'FW', 4], ['ブカヨ・サッカ', 'イングランド', 'FW', 4], ['フィル・フォーディン', 'イングランド', 'FW', 4], ['ウスマン・デンベル', 'フランス', 'FW', 5],
    ['ヴィクター・オシムヘル', 'ナイジェリア', 'FW', 4], ['ドゥシャン・ヴラホヴィッチュ', 'セルビア', 'FW', 3], ['アレクサンデル・イサーキ', 'スウェーデン', 'FW', 4], ['フロリアン・ヴィルツェ', 'ドイツ', 'FW', 4],
    // MF 20人
    ['ケヴィン・デ・ブライノ', 'ベルギー', 'MF', 4], ['ジュード・ベリンガー', 'イングランド', 'MF', 5], ['ペドリオ', 'スペイン', 'MF', 5], ['ガビオ', 'スペイン', 'MF', 3],
    ['ロドリス', 'スペイン', 'MF', 5], ['フレンキー・デ・ヨンガ', 'オランダ', 'MF', 4], ['ジャマル・ムシアーノ', 'ドイツ', 'MF', 4], ['ブルーノ・フェルナンデスオ', 'ポルトガル', 'MF', 4],
    ['ベルナルド・シウヴェス', 'ポルトガル', 'MF', 4], ['エンツォ・フェルナンデル', 'アルゼンチン', 'MF', 3], ['デクラン・ライツ', 'イングランド', 'MF', 4], ['フェデリコ・バルベルダ', 'ウルグアイ', 'MF', 4],
    ['トニ・クローネ', 'ドイツ', 'MF', 4], ['ルカ・モドリッチュ', 'クロアチア', 'MF', 3], ['マルティン・ウーデゴー', 'ノルウェー', 'MF', 4], ['アレクシス・マクアリスター', 'アルゼンチン', 'MF', 4],
    ['コール・パルマー', 'イングランド', 'MF', 4], ['メスト・エジール', 'ドイツ', 'MF', 3], ['アンドレス・イニエスト', 'スペイン', 'MF', 3], ['ネイマールト', 'ブラジル', 'MF', 4],
    // DF 15人
    ['フィルジル・ファン・ダイケ', 'オランダ', 'DF', 5], ['アントニオ・リュディガ', 'ドイツ', 'DF', 4], ['ウィリアム・サリヴァ', 'フランス', 'DF', 4], ['ルベン・ディアスオ', 'ポルトガル', 'DF', 4],
    ['アクラフ・ハキーミ', 'モロッコ', 'DF', 4], ['トレント・アレクサンダー・アーノル', 'イングランド', 'DF', 4], ['アレッサンドロ・バストーニオ', 'イタリア', 'DF', 4], ['マルキーニョ', 'ブラジル', 'DF', 4],
    ['ジョアン・カンセーロ', 'ポルトガル', 'DF', 3], ['テオ・エルナンデスオ', 'フランス', 'DF', 4], ['ダニ・カルバハール', 'スペイン', 'DF', 3], ['ニコロ・バレッロ', 'イタリア', 'DF', 4],
    ['セルヒオ・ラモスオ', 'スペイン', 'DF', 3], ['ジェラール・ピケス', 'スペイン', 'DF', 3], ['マルセリオ', 'ブラジル', 'DF', 3],
    // GK 5人
    ['ティボー・クルトア', 'ベルギー', 'GK', 5], ['アリソン・ベッケル', 'ブラジル', 'GK', 4], ['エミリアーノ・マルティネスオ', 'アルゼンチン', 'GK', 4], ['ジャンルイジ・ドンナルーマ', 'イタリア', 'GK', 4],
    ['マヌエル・ノイエル', 'ドイツ', 'GK', 3],
  ];
  // 格ごとの総合力の幅：日本の選手と海外の選手で分ける
  const LV_OVR = { jp: { 1: [60, 64], 2: [65, 69], 3: [70, 74], 4: [75, 79] }, ww: { 3: [77, 81], 4: [81, 85], 5: [86, 90] } };

  // ----- 能力の作り方：ポジションの重みで計算した総合力が target になるように整える -----
  function makeStats(pos, target, r, style = null) {
    const w = POS[pos].w, st = {}, keys = style ? STYLE_KEYS[style] : [];
    for (const k of ['spd', 'sht', 'pas', 'drb', 'def', 'phy', 'gk']) {
      if (k === 'gk') st.gk = pos === 'GK' ? 0 : r.ri(5, 15);
      else if (w[k]) st[k] = target + r.ri(-6, 6) + (keys.includes(k) ? 7 : style ? -2 : 0);
      else st[k] = clamp(target - 16 + r.ri(-8, 8) + (keys.includes(k) ? 12 : 0), 20, 90);
    }
    if (pos === 'GK') st.gk = target + r.ri(-3, 3);
    for (let i = 0; i < 4; i++) { // 丸めの誤差を直す
      const d = target - ovr({ pos, stats: st });
      if (!d) break;
      for (const k of Object.keys(w)) st[k] = clamp(st[k] + d, 20, 99);
    }
    return st;
  }
  function makeNpc(id, name, nat, pos, target, age, r, extra = {}, style = null) {
    const stats = makeStats(pos, target, r, style);
    const grow = r.pick(['early', 'normal', 'normal', 'normal', 'late']);
    const room = age <= 21 ? r.ri(4, 14) : age <= 25 ? r.ri(1, 7) : 0;
    const p = { id, type: 'npc', name, nat, pos, age, grow, pot: clamp(target + room, target, 99), stats, club: null, no: 0, ...extra };
    p.style = style || styleOf(p);
    return p;
  }
  // 「ウィリアム・ウィリアムズ」のように名と姓の頭がそろう組み合わせは不自然なので作り直す
  const awkward = (name) => { const m = name.split(/[・ ]/); return m.length === 2 && m[0].slice(0, 3) === m[1].slice(0, 3); };

  // ----- 世界じゅうのNPCを作る（クラブごとに22人） -----
  // clubs：今の世界のクラブ（所属リーグ lg・強さ str を使う）、seed：世界ごとの数（同じなら同じ選手ができる）
  function newNpcWorld(clubs, seed = 1) {
    const out = [], used = new Set(FAMOUS.map((f) => f[0]));
    let n = 0;
    const nextId = () => 'n' + String(++n).padStart(4, '0');
    const byClub = new Map(clubs.map((c) => [c.id, []]));
    const count = (cid, pos) => byClub.get(cid).filter((p) => p.pos === pos).length;
    const add = (p, cid) => { p.club = cid; byClub.get(cid).push(p); out.push(p); };
    // 1. 有名選手：格の高い順に、強いクラブから順番に（同じポジションの枠が空いているクラブへ）
    const lgOrder = (lg) => clubs.filter((c) => c.lg === lg).sort((a, b) => b.str - a.str || a.id - b.id);
    const eu = lgOrder(0), j1 = lgOrder(1), j2 = lgOrder(2);
    const famous = FAMOUS.map((f, i) => ({ name: f[0], nat: f[1], pos: f[2], lv: f[3], i })).sort((a, b) => b.lv - a.lv || a.i - b.i);
    const cursor = new Map();
    const place = (f, list, key) => {
      let k = cursor.get(key) || 0;
      for (let t = 0; t < list.length; t++, k++) {
        const c = list[k % list.length];
        if (count(c.id, f.pos) < (f.pos === 'GK' ? 1 : STARTERS[f.pos])) { cursor.set(key, k + 1); return c; }
      }
      for (const c of list) if (count(c.id, f.pos) < SQUAD_QUOTA[f.pos]) return c;
      return list[0];
    };
    for (const f of famous) {
      const r = makeRng(hashStr(f.name)), jp = f.nat === '日本';
      const range = (jp ? LV_OVR.jp : LV_OVR.ww)[f.lv];
      const target = r.ri(range[0], range[1]), age = r.ri(20, 33);
      // 行き先：海外の選手は欧州（格5は上位6クラブ、格3は下位5クラブ）。日本の選手は格4が欧州の下位、格3〜2が1部、格1が2部
      const [list, key] = !jp ? (f.lv >= 5 ? [eu.slice(0, 6), 'eu5'] : f.lv >= 4 ? [eu, 'eu4'] : [eu.slice(-5), 'eu3'])
        : f.lv >= 4 ? [eu.slice(-5), 'eu-jp'] : f.lv >= 2 ? [j1, 'j1'] : [j2, 'j2'];
      const c = place(f, list, key);
      add(makeNpc(nextId(), f.name, f.nat, f.pos, target, age, r, { fam: 1 }), c.id);
    }
    // 2. 残りの枠を、クラブの国に合った名前の選手で埋める
    const R = makeRng(hashStr('world:' + seed));
    for (const c of clubs.slice().sort((a, b) => a.id - b.id)) {
      const home = c.nat || (c.lg === 0 ? 'イングランド' : '日本');
      // 有名選手が強さを押し上げた分だけ、ほかの先発クラスを少し下げる（先発11人の平均がクラブの強さ str に近くなるように）
      const fam = byClub.get(c.id);
      const extra = fam.reduce((a, p) => a + Math.max(0, ovr(p) - c.str), 0);
      const starterAdj = -Math.min(7, extra / Math.max(1, 11 - Math.min(10, fam.length)));
      for (const pos of ['GK', 'DF', 'MF', 'FW']) {
        const styles = STYLE_MIX[pos].slice();
        for (const p of byClub.get(c.id)) if (p.pos === pos) { const i = styles.indexOf(p.style); styles.splice(i >= 0 ? i : 0, 1); }
        while (count(c.id, pos) < SQUAD_QUOTA[pos]) {
          const k = count(c.id, pos);
          // 先発クラスはクラブの強さ前後、控えは少し下、最後の1〜2人は若手（育成が得意なクラブほど才能がある）
          const youth = k >= SQUAD_QUOTA[pos] - (pos === 'GK' ? 1 : 2);
          const starter = k < STARTERS[pos];
          const target = clamp(Math.round(c.str + (starter ? starterAdj : youth ? -12 : -5) + R.gauss() * (starter ? 2.5 : 3)), 40, 92);
          const age = youth ? R.ri(18, 21) : starter ? R.ri(23, 32) : R.ri(20, 34);
          const nat = R() < (c.lg === 0 ? .45 : .86) ? home : R.pick(c.lg === 0 ? ABROAD_EU : ABROAD_JP);
          let name = fullName(nat, R);
          for (let t = 0; (used.has(name) || awkward(name)) && t < 50; t++) name = fullName(nat, R);
          if (used.has(name)) name = `${name}${count(c.id, pos) + 2}`; // ここまで来ることはほぼない
          used.add(name);
          const p = makeNpc(nextId(), name, nat, pos, target, age, R, {}, styles.shift() || null);
          if (youth) p.pot = clamp(target + R.ri(8, 14) + (c.youth || 3) * 2, target, 95);
          add(p, c.id);
        }
      }
    }
    // 3. 背番号（GKは1・21・31、ほかは強い順に2〜）
    for (const list of byClub.values()) {
      const gks = list.filter((p) => p.pos === 'GK').sort((a, b) => ovr(b) - ovr(a));
      gks.forEach((p, i) => { p.no = [1, 21, 31][i] || 41 + i; });
      const order = ['DF', 'MF', 'FW'];
      const rest = list.filter((p) => p.pos !== 'GK').sort((a, b) => ovr(b) - ovr(a) || order.indexOf(a.pos) - order.indexOf(b.pos));
      let no = 2; for (const p of rest) { if (no === 21) no = 22; p.no = no++; }
    }
    return out.sort((a, b) => a.club - b.club || a.no - b.no);
  }

  // ----- 試合に出られる名簿：本物のプレイヤーが入ったクラブでは、NPCが枠を譲る -----
  // humans：そのクラブにいる本物のプレイヤー（{ pos } を持つもの）。譲ったNPCはデータから消さず「控え組（reserves）」に回す。
  // 22人を超えた分だけ、枠を一番超えているポジションの、一番弱いNPCから譲る。GKのNPCは最低1人残す。
  function clubSquad(npcs, clubId, humans = []) {
    const list = npcs.filter((p) => p.club === clubId);
    const keep = new Set(list), reserves = [];
    const n = (pos) => humans.filter((h) => h.pos === pos).length + list.filter((p) => keep.has(p) && p.pos === pos).length;
    while (keep.size + humans.length > SQUAD_SIZE) {
      let best = null;
      for (const pos of Object.keys(SQUAD_QUOTA)) {
        const mine = list.filter((p) => keep.has(p) && p.pos === pos);
        if (!mine.length || (pos === 'GK' && mine.length <= 1)) continue;
        const over = n(pos) - SQUAD_QUOTA[pos];
        if (!best || over > best.over) best = { pos, over, mine };
      }
      if (!best) break;
      const weakest = best.mine.sort((a, b) => ovr(a) - ovr(b) || b.age - a.age)[0];
      keep.delete(weakest); reserves.push(weakest);
    }
    return { npcs: list.filter((p) => keep.has(p)), reserves };
  }
  // ----- 特殊能力（能力の値から決まる。NPCも本物のプレイヤーも同じ決まり。最大3つ） -----
  // 試合での効き目は core-match.js（決定力：シュートが決まりやすい、など）
  const SKILLS = {
    finisher: { name: '決定力', icon: '🎯', desc: 'シュートが決まりやすい', ok: (p) => p.pos !== 'GK' && p.stats.sht >= 82, m: (p) => p.stats.sht - 82 },
    longshot: { name: 'ロングシュート', icon: '🚀', desc: '遠くからでも狙う（シュートが増える）', ok: (p) => p.pos === 'MF' && p.stats.sht >= 76, m: (p) => p.stats.sht - 76 },
    through: { name: 'スルーパス', icon: '🧵', desc: 'アシストが増える', ok: (p) => p.pos !== 'GK' && p.stats.pas >= 80, m: (p) => p.stats.pas - 80 },
    dribble: { name: 'ドリブル突破', icon: '🌀', desc: 'シュートとアシストが少し増える', ok: (p) => (p.pos === 'FW' || p.pos === 'MF') && p.stats.drb >= 82, m: (p) => p.stats.drb - 82 },
    aerial: { name: '空中戦', icon: '🦅', desc: 'FWはヘディングで点を取り、DFはクリアが増える', ok: (p) => (p.pos === 'FW' || p.pos === 'DF') && p.stats.phy >= 80, m: (p) => p.stats.phy - 80 },
    leader: { name: 'リーダーシップ', icon: '📣', desc: '出ているとチーム全体が少し強くなる', ok: (p) => p.age >= 29 && ovr(p) >= 72, m: (p) => ovr(p) - 72 + (p.age - 29) },
    pk: { name: 'PKキッカー', icon: '⚽', desc: 'PKを任され、決めやすい', ok: (p) => p.pos !== 'GK' && p.stats.sht >= 80 && p.stats.phy >= 60, m: (p) => p.stats.sht - 80 },
    bigsave: { name: 'ビッグセーブ', icon: '🧤', desc: '好セーブが増える', ok: (p) => p.pos === 'GK' && p.stats.gk >= 80, m: (p) => p.stats.gk - 80 },
  };
  function skillsOf(p) {
    if (!p || !p.stats) return [];
    return Object.entries(SKILLS).filter(([, d]) => d.ok(p)).sort((a, b) => b[1].m(p) - a[1].m(p)).slice(0, 3).map(([k]) => k);
  }

  // ----- チーム内の立ち位置：同じポジションで何番手か、先発（4-4-2）に入っているか -----
  // me：{ pos, ovr }。humans：同じクラブの本物のプレイヤー（自分以外。{ pos, ovr }）。本物のプレイヤーは選ばれやすい（+3）ぶんも入れる
  const XI = { GK: 1, DF: 4, MF: 4, FW: 2 };
  function depthOf(npcs, clubId, me, humans = []) {
    const seats = humans.concat([me]).map((h) => ({ pos: h.pos }));
    const sq = clubSquad(npcs, clubId, seats);
    const list = sq.npcs.filter((p) => p.pos === me.pos).map((p) => ovr(p)).concat(humans.filter((h) => h.pos === me.pos).map((h) => h.ovr + 3));
    list.sort((a, b) => b - a);
    const mine = me.ovr + 3, rank = list.filter((v) => v > mine).length + 1, slots = XI[me.pos];
    const starter = rank <= slots;
    const gap = starter ? 0 : Math.max(1, (list[slots - 1] || 0) - mine + 1);
    const label = starter ? (rank === 1 ? 'エース格のレギュラー' : 'レギュラー') : rank <= slots + 2 ? 'レギュラー争い' : '控え';
    return { rank, slots, starter, gap, label, text: `${me.pos} ${rank}番手（先発${slots}枠）・${label}${starter ? '' : `・先発まで総合+${gap}`}` };
  }

  // 画面に見せる1人分（能力の細かい値は出さない）
  function npcView(p) { return { id: p.id, type: 'npc', name: p.name, nat: p.nat, pos: p.pos, age: p.age, ovr: ovr(p), style: STYLES[p.style] ? STYLES[p.style].name : '', no: p.no, skills: skillsOf(p), reborn: p.reborn || 0 }; }

  // 保存済みの世界を新しい形にする（一人用のセーブ v1→v2、オンラインの世界 v1→v2 で共通）。何度呼んでも同じ結果
  // クラブは ID ごとに名前・色・特徴を付け直す（所属リーグと今の強さはそのまま）。NPCがいなければ、その世界に決まったシードで作る
  function upgradeWorld(s, seed) {
    SL._.applyClubData(s.clubs);
    if (!Array.isArray(s.npcs)) s.npcs = newNpcWorld(s.clubs, seed != null ? seed : hashStr(`${s.p ? s.p.name : ''}:${s.year}:${s.gen || 1}`));
    return s;
  }

  Object.assign(SL, { depthOf, SKILLS, skillsOf, SQUAD_SIZE, upgradeWorld, SQUAD_QUOTA, STYLES, NAME_POOLS, FAMOUS_COUNT: FAMOUS.length, styleOf, newNpcWorld, clubSquad, npcView });
  SL._.worldRng = makeRng; SL._.hashStr = hashStr; SL._.FAMOUS = FAMOUS; SL._.npcName = fullName; SL._.makeNpc = makeNpc; SL._.awkwardName = awkward; SL._.ABROAD = { EU: ABROAD_EU, JP: ABROAD_JP };
})(typeof SL !== 'undefined' ? SL : require('./core.js'));
