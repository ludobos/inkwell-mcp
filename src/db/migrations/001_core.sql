-- Inkwell MCP — Core schema
-- Articles, experts, tags, and junction tables

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  title TEXT NOT NULL,
  subtitle TEXT,
  content TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  type TEXT NOT NULL DEFAULT 'edition' CHECK (type IN ('edition', 'analysis', 'special')),
  number INTEGER UNIQUE,
  published_at TEXT,
  views INTEGER NOT NULL DEFAULT 0,
  open_rate REAL NOT NULL DEFAULT 0,
  click_rate REAL NOT NULL DEFAULT 0,
  substack_url TEXT,
  editorial_angle TEXT,
  tl_dr TEXT,
  conclusion_signal TEXT CHECK (conclusion_signal IN ('bullish', 'bearish', 'neutral')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS experts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  affiliation TEXT,
  expertise TEXT, -- JSON array stored as text
  country TEXT,
  tier INTEGER DEFAULT 2 CHECK (tier BETWEEN 1 AND 3),
  times_cited INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL UNIQUE,
  category TEXT CHECK (category IN ('platform', 'business', 'trend', 'tech', 'event')),
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS article_experts (
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  expert_id TEXT NOT NULL REFERENCES experts(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, expert_id)
);

CREATE TABLE IF NOT EXISTS article_tags (
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, tag_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at);
CREATE INDEX IF NOT EXISTS idx_articles_number ON articles(number);
CREATE INDEX IF NOT EXISTS idx_experts_name ON experts(name);
CREATE INDEX IF NOT EXISTS idx_tags_category ON tags(category);
