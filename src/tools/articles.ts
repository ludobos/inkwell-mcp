/** Article tools — list, get, search, get_since */

import type { McpTool, AuthContext, Env, Filter } from '../types.js';
import { formatArticleMd, getWatermark } from '../utils.js';

export const articleTools: McpTool[] = [
  {
    name: 'list_articles',
    description: 'List newsletter articles with optional filters by status, type, and pagination.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by status', enum: ['published', 'draft', 'archived'] },
        type: { type: 'string', description: 'Filter by content type', enum: ['edition', 'analysis', 'special'] },
        limit: { type: 'number', description: 'Max results (default 20, max 50)', minimum: 1, maximum: 50 },
        offset: { type: 'number', description: 'Pagination offset (default 0)', minimum: 0 },
      },
    },
    handler: async (args, _ctx: AuthContext | null, env: Env) => {
      const limit = Math.min(Number(args.limit ?? 20), 50);
      const offset = Number(args.offset ?? 0);
      const filters: Filter[] = [];

      if (args.status) filters.push({ column: 'status', op: 'eq', value: String(args.status) });
      if (args.type) filters.push({ column: 'type', op: 'eq', value: String(args.type) });

      const rows = await env.db.query({
        table: 'articles',
        select: ['id', 'number', 'title', 'subtitle', 'status', 'type', 'published_at', 'views', 'open_rate', 'substack_url', 'editorial_angle'],
        filters,
        order: [{ column: 'published_at', direction: 'desc', nulls: 'last' }],
        limit,
        offset,
      });

      const watermark = getWatermark(env.config);
      const markdown = rows.map(a => formatArticleMd(a)).join('\n') + '\n\n' + watermark;
      return { articles: rows, count: rows.length, offset, markdown };
    },
  },

  {
    name: 'get_article',
    description: 'Get a single article by ID or edition number, including linked experts.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Article UUID' },
        number: { type: 'number', description: 'Edition number' },
      },
    },
    handler: async (args, _ctx: AuthContext | null, env: Env) => {
      if (!args.id && args.number == null) {
        throw { code: 400, message: 'Provide either id or number' };
      }

      const filters: Filter[] = [];
      if (args.id) filters.push({ column: 'id', op: 'eq', value: String(args.id) });
      else filters.push({ column: 'number', op: 'eq', value: Number(args.number) });

      const article = await env.db.queryOne({ table: 'articles', filters });
      if (!article) throw { code: 404, message: 'Article not found' };

      // Fetch linked experts
      let experts: Record<string, unknown>[] = [];
      try {
        const links = await env.db.raw(
          `SELECT e.id, e.name, e.affiliation, e.country
           FROM experts e
           JOIN article_experts ae ON ae.expert_id = e.id
           WHERE ae.article_id = ?`,
          [article.id]
        );
        experts = links;
      } catch {
        // Junction table may not exist yet
      }

      const watermark = getWatermark(env.config);
      const markdown = formatArticleMd({ ...article, experts: experts.map(e => String(e.name)) }) + '\n\n' + watermark;
      return { ...article, experts, experts_count: experts.length, markdown };
    },
  },

  {
    name: 'search_articles',
    description: 'Full-text search across articles (title, subtitle, editorial_angle). Returns matching articles.',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'Search terms', minLength: 2 },
        limit: { type: 'number', description: 'Max results (default 10, max 30)', minimum: 1, maximum: 30 },
      },
    },
    handler: async (args, _ctx: AuthContext | null, env: Env) => {
      const q = String(args.query).trim();
      const limit = Math.min(Number(args.limit ?? 10), 30);
      const pattern = `%${q}%`;

      const rows = await env.db.raw(
        `SELECT id, number, title, subtitle, status, type, published_at, views, substack_url, editorial_angle
         FROM articles
         WHERE status = 'published'
           AND (title LIKE ?1 COLLATE NOCASE OR subtitle LIKE ?1 COLLATE NOCASE OR editorial_angle LIKE ?1 COLLATE NOCASE)
         ORDER BY published_at DESC
         LIMIT ?2`,
        [pattern, limit]
      );

      const watermark = getWatermark(env.config);
      const markdown = rows.map(a => formatArticleMd(a)).join('\n') + '\n\n' + watermark;
      return { query: q, articles: rows, count: rows.length, markdown };
    },
  },

  {
    name: 'get_articles_since',
    description: 'Get articles published since a given date.',
    inputSchema: {
      type: 'object',
      required: ['since_date'],
      properties: {
        since_date: { type: 'string', description: 'ISO 8601 date (e.g. "2026-02-01")' },
        limit: { type: 'number', description: 'Max results (default 20, max 50)', minimum: 1, maximum: 50 },
      },
    },
    handler: async (args, _ctx: AuthContext | null, env: Env) => {
      const since = String(args.since_date).trim();
      if (!since.match(/^\d{4}-\d{2}-\d{2}/)) {
        throw { code: 400, message: 'since_date must be ISO 8601 (e.g. "2026-02-01")' };
      }
      const limit = Math.min(Number(args.limit ?? 20), 50);

      const rows = await env.db.query({
        table: 'articles',
        select: ['id', 'number', 'title', 'subtitle', 'type', 'published_at', 'views', 'open_rate', 'substack_url', 'editorial_angle'],
        filters: [
          { column: 'status', op: 'eq', value: 'published' },
          { column: 'published_at', op: 'gte', value: since },
        ],
        order: [{ column: 'published_at', direction: 'desc' }],
        limit,
      });

      const watermark = getWatermark(env.config);
      const markdown = rows.map(a => formatArticleMd(a)).join('\n') + '\n\n' + watermark;
      return { since_date: since, articles: rows, count: rows.length, markdown };
    },
  },
];
