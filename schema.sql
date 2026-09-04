CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_name TEXT NOT NULL CHECK(length(player_name) BETWEEN 1 AND 12),
  score INTEGER NOT NULL CHECK(score > 0),
  mode TEXT NOT NULL CHECK(mode IN ('time', 'hits')),
  max_speed REAL NOT NULL,
  best_combo INTEGER NOT NULL,
  player_id TEXT,
  perfect_count INTEGER NOT NULL DEFAULT 0,
  great_count INTEGER NOT NULL DEFAULT 0,
  good_count INTEGER NOT NULL DEFAULT 0,
  miss_count INTEGER NOT NULL DEFAULT 0,
  high_speed REAL NOT NULL DEFAULT 1,
  replay_data TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_scores_ranking ON scores(score DESC, created_at ASC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_scores_player_id ON scores(player_id);
