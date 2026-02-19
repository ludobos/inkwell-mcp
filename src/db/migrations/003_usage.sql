-- Inkwell MCP — Usage tracking

CREATE TABLE IF NOT EXISTS usage_stats (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tool_name TEXT NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS search_queries (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tool_name TEXT NOT NULL,
  query TEXT NOT NULL,
  result_count INTEGER,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_usage_tool ON usage_stats(tool_name);
CREATE INDEX IF NOT EXISTS idx_usage_ts ON usage_stats(timestamp);
CREATE INDEX IF NOT EXISTS idx_search_ts ON search_queries(timestamp);
