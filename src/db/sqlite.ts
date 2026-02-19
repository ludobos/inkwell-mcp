/**
 * SQLite adapter using better-sqlite3.
 * Translates QueryOptions into SQL queries.
 */

import Database from 'better-sqlite3';
import { dirname } from 'path';
import { mkdirSync, existsSync } from 'fs';
import type { DatabaseAdapter, QueryOptions, Filter, Row } from '../types.js';

// Inline migrations (TypeScript doesn't copy .sql files to dist/)
const MIGRATIONS: Array<{ name: string; sql: string }> = [
  {
    name: '001_core.sql',
    sql: `
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
  expertise TEXT,
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
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at);
CREATE INDEX IF NOT EXISTS idx_articles_number ON articles(number);
CREATE INDEX IF NOT EXISTS idx_experts_name ON experts(name);
CREATE INDEX IF NOT EXISTS idx_tags_category ON tags(category);
`,
  },
  {
    name: '002_editorial.sql',
    sql: `
CREATE TABLE IF NOT EXISTS editorial_notes (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  type TEXT NOT NULL CHECK (type IN ('idea', 'angle', 'quote', 'fact', 'todo', 'outline')),
  content TEXT NOT NULL,
  target_article TEXT REFERENCES articles(id) ON DELETE SET NULL,
  tags TEXT,
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
`,
  },
  {
    name: '003_usage.sql',
    sql: `
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
`,
  },
];

export class SqliteAdapter implements DatabaseAdapter {
  private db: Database.Database;

  constructor(dbPath: string) {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  /** Run all migrations in order */
  migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    const applied = new Set(
      this.db.prepare('SELECT name FROM _migrations').all()
        .map((r: unknown) => (r as { name: string }).name)
    );

    for (const migration of MIGRATIONS) {
      if (applied.has(migration.name)) continue;
      this.db.exec(migration.sql);
      this.db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migration.name);
    }
  }

  async query(opts: QueryOptions): Promise<Row[]> {
    const { sql, params } = this.buildSelect(opts);
    return this.db.prepare(sql).all(...params) as Row[];
  }

  async queryOne(opts: QueryOptions): Promise<Row | null> {
    const results = await this.query({ ...opts, limit: 1 });
    return results[0] ?? null;
  }

  async insert(table: string, data: Row): Promise<Row> {
    if (!data.id) {
      data.id = this.generateId();
    }

    const columns = Object.keys(data);
    const placeholders = columns.map(() => '?');
    const values = columns.map(c => this.serializeValue(data[c]));

    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
    const result = this.db.prepare(sql).get(...values) as Row | undefined;
    return result ?? data;
  }

  async update(table: string, filters: Filter[], data: Row): Promise<Row[]> {
    const setClauses: string[] = [];
    const setParams: unknown[] = [];

    for (const [col, val] of Object.entries(data)) {
      setClauses.push(`${col} = ?`);
      setParams.push(this.serializeValue(val));
    }

    const { where, params: whereParams } = this.buildWhere(filters);
    const sql = `UPDATE ${table} SET ${setClauses.join(', ')} ${where} RETURNING *`;
    return this.db.prepare(sql).all(...setParams, ...whereParams) as Row[];
  }

  async delete(table: string, filters: Filter[]): Promise<Row[]> {
    const { where, params } = this.buildWhere(filters);
    const sql = `DELETE FROM ${table} ${where} RETURNING *`;
    return this.db.prepare(sql).all(...params) as Row[];
  }

  async count(table: string, filters?: Filter[]): Promise<number> {
    const { where, params } = filters ? this.buildWhere(filters) : { where: '', params: [] };
    const sql = `SELECT COUNT(*) as cnt FROM ${table} ${where}`;
    const row = this.db.prepare(sql).get(...params) as { cnt: number };
    return row.cnt;
  }

  async raw(sql: string, params?: unknown[]): Promise<Row[]> {
    return this.db.prepare(sql).all(...(params ?? [])) as Row[];
  }

  close(): void {
    this.db.close();
  }

  // --- Private helpers ---

  private generateId(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private serializeValue(val: unknown): unknown {
    if (val === null || val === undefined) return null;
    if (Array.isArray(val)) return JSON.stringify(val);
    if (typeof val === 'object') return JSON.stringify(val);
    if (typeof val === 'boolean') return val ? 1 : 0;
    return val;
  }

  private buildSelect(opts: QueryOptions): { sql: string; params: unknown[] } {
    const select = opts.select?.join(', ') ?? '*';
    const { where, params } = opts.filters ? this.buildWhere(opts.filters) : { where: '', params: [] };

    let orderBy = '';
    if (opts.order?.length) {
      const clauses = opts.order.map(o => {
        let clause = `${o.column} ${o.direction}`;
        if (o.nulls === 'last') clause += ' NULLS LAST';
        if (o.nulls === 'first') clause += ' NULLS FIRST';
        return clause;
      });
      orderBy = `ORDER BY ${clauses.join(', ')}`;
    }

    let limitClause = '';
    if (opts.limit != null) {
      limitClause = `LIMIT ${opts.limit}`;
      if (opts.offset != null) {
        limitClause += ` OFFSET ${opts.offset}`;
      }
    }

    const sql = `SELECT ${select} FROM ${opts.table} ${where} ${orderBy} ${limitClause}`.trim();
    return { sql, params };
  }

  private buildWhere(filters: Filter[]): { where: string; params: unknown[] } {
    if (!filters.length) return { where: '', params: [] };

    const clauses: string[] = [];
    const params: unknown[] = [];

    for (const f of filters) {
      switch (f.op) {
        case 'eq':
          clauses.push(`${f.column} = ?`);
          params.push(this.serializeValue(f.value));
          break;
        case 'neq':
          clauses.push(`${f.column} != ?`);
          params.push(this.serializeValue(f.value));
          break;
        case 'gt':
          clauses.push(`${f.column} > ?`);
          params.push(f.value);
          break;
        case 'gte':
          clauses.push(`${f.column} >= ?`);
          params.push(f.value);
          break;
        case 'lt':
          clauses.push(`${f.column} < ?`);
          params.push(f.value);
          break;
        case 'lte':
          clauses.push(`${f.column} <= ?`);
          params.push(f.value);
          break;
        case 'like':
          clauses.push(`${f.column} LIKE ?`);
          params.push(f.value);
          break;
        case 'ilike':
          clauses.push(`${f.column} LIKE ? COLLATE NOCASE`);
          params.push(f.value);
          break;
        case 'is':
          if (f.value === null) clauses.push(`${f.column} IS NULL`);
          else {
            clauses.push(`${f.column} IS ?`);
            params.push(f.value);
          }
          break;
        case 'in':
          if (Array.isArray(f.value) && f.value.length > 0) {
            const placeholders = f.value.map(() => '?').join(', ');
            clauses.push(`${f.column} IN (${placeholders})`);
            params.push(...f.value);
          }
          break;
        case 'cs':
          clauses.push(`${f.column} LIKE ?`);
          params.push(`%${String(f.value)}%`);
          break;
      }
    }

    return { where: `WHERE ${clauses.join(' AND ')}`, params };
  }
}
