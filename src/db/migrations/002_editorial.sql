-- Inkwell MCP — Editorial workflow
-- Notes and sources for article preparation

CREATE TABLE IF NOT EXISTS editorial_notes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  type TEXT NOT NULL CHECK (type IN ('idea', 'angle', 'quote', 'fact', 'todo', 'outline')),
  content TEXT NOT NULL,
  target_article TEXT REFERENCES articles(id) ON DELETE SET NULL,
  tags TEXT, -- JSON array stored as text
  priority INTEGER NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'discarded')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS editorial_sources (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  type TEXT CHECK (type IN ('article', 'report', 'dataset', 'interview', 'video', 'podcast', 'social', 'other')),
  published_date TEXT,
  target_article TEXT REFERENCES articles(id) ON DELETE SET NULL,
  description TEXT,
  key_quotes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  used_in_article TEXT REFERENCES articles(id) ON DELETE SET NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notes_status ON editorial_notes(status);
CREATE INDEX IF NOT EXISTS idx_notes_target ON editorial_notes(target_article);
CREATE INDEX IF NOT EXISTS idx_notes_type ON editorial_notes(type);
CREATE INDEX IF NOT EXISTS idx_sources_status ON editorial_sources(status);
CREATE INDEX IF NOT EXISTS idx_sources_target ON editorial_sources(target_article);
CREATE INDEX IF NOT EXISTS idx_sources_url ON editorial_sources(url);
