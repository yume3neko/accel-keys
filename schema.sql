CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_name TEXT NOT NULL CHECK(length(player_name) BETWEEN 1 AND 12),
  score INTEGER NOT NULL CHECK(score > 0),
  mode TEXT NOT NULL CHECK(mode IN ('time', 'hits')),
  max_speed REAL NOT NULL,
  best_combo INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_scores_ranking ON scores(score DESC, created_at ASC);
