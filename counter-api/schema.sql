CREATE TABLE IF NOT EXISTS counters (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game TEXT NOT NULL,
  ms INTEGER NOT NULL,
  name TEXT,
  token TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scores_game_ms ON scores (game, ms, id);

CREATE TABLE IF NOT EXISTS bushou (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  power INTEGER NOT NULL,
  rarity TEXT NOT NULL,
  runs INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bushou_streak ON bushou (hidden, best_streak DESC);
CREATE INDEX IF NOT EXISTS idx_bushou_power ON bushou (hidden, power DESC);

-- 順位を数えるための「点数の帯ごとの記録数」（帯 b = floor(ln(点数)*100)：1%きざみ）。
-- 順位＝自分より上の帯の記録数の合計＋同じ帯で自分より上の記録数。全部の記録を数えずに済む（D1の読み取り行数を減らす）
-- ゲームごとに counters の 'hist:ゲーム名' があれば作ってある。なければ最初の1回だけ scores から作る
CREATE TABLE IF NOT EXISTS hist (
  game TEXT NOT NULL,
  b INTEGER NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (game, b)
);
