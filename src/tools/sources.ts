/** Source tools — save, list, deactivate, mark_used */

import type { McpTool, AuthContext, Env, Filter } from '../types.js';
import { requireOwner } from '../auth.js';
import { formatSourceMd, getWatermark } from '../utils.js';

export const sourceTools: McpTool[] = [
  {
    name: 'save_source',
    description: 'Save a dated editorial source for research. Deduplicates by URL. Owner only.',
    inputSchema: {
      type: 'object',
      required: ['url', 'title'],
      properties: {
        url:            { type: 'string', description: 'Full URL of the source' },
        title:          { type: 'string', description: 'Source title', minLength: 1 },
        published_date: { type: 'string', description: 'Publication date YYYY-MM-DD' },
        target_article: { type: 'string', description: 'Target article ID' },
        type:           { type: 'string', enum: ['article', 'report', 'dataset', 'interview', 'video', 'podcast', 'social', 'other'] },
        description:    { type: 'string', description: 'Relevance notes' },
        key_quotes:     { type: 'string', description: 'Notable quotes' },
      },
    },
    handler: async (args, ctx: AuthContext | null, env: Env) => {
      requireOwner(ctx);

      const url = String(args.url).trim();

      // Dedup check
      const existing = await env.db.query({
        table: 'editorial_sources',
        filters: [{ column: 'url', op: 'eq', value: url }],
        limit: 1,
      });

      if (existing.length) {
        return {
          duplicate: true,
          existing_id: existing[0].id,
          existing_title: existing[0].title,
          message: 'This URL already exists in editorial sources',
        };
      }

      const source = await env.db.insert('editorial_sources', {
        url,
        title: String(args.title).trim(),
        published_date: args.published_date ? String(args.published_date) : null,
        target_article: args.target_article ? String(args.target_article) : null,
        type: args.type ? String(args.type) : null,
        description: args.description ? String(args.description) : null,
        key_quotes: args.key_quotes ? String(args.key_quotes) : null,
        status: 'active',
      });

      return {
        ...source,
        message: `Source saved${source.target_article ? ` for article ${source.target_article}` : ''}`,
      };
    },
  },

  {
    name: 'list_sources',
    description: 'List editorial sources with used/unused indicator. Owner only.',
    inputSchema: {
      type: 'object',
      properties: {
        target_article: { type: 'string', description: 'Filter by article ID (use "backlog" for unassigned)' },
        status: { type: 'string', enum: ['active', 'inactive'] },
        type: { type: 'string', enum: ['article', 'report', 'dataset', 'interview', 'video', 'podcast', 'social', 'other'] },
        used: { type: 'boolean', description: 'true = only used, false = only unused' },
        limit: { type: 'number', minimum: 1, maximum: 100, description: 'Max results (default 50)' },
      },
    },
    handler: async (args, ctx: AuthContext | null, env: Env) => {
      requireOwner(ctx);

      const limit = Math.min(Number(args.limit ?? 50), 100);
      const filters: Filter[] = [];

      if (args.target_article != null) {
        if (String(args.target_article) === 'backlog') {
          filters.push({ column: 'target_article', op: 'is', value: null });
        } else {
          filters.push({ column: 'target_article', op: 'eq', value: String(args.target_article) });
        }
      }
      if (args.status) filters.push({ column: 'status', op: 'eq', value: String(args.status) });
      if (args.type) filters.push({ column: 'type', op: 'eq', value: String(args.type) });

      // used/unused filter requires raw query for IS NULL / IS NOT NULL
      let rows;
      if (args.used === true) {
        rows = await env.db.raw(
          `SELECT * FROM editorial_sources WHERE used_in_article IS NOT NULL ${filters.length ? 'AND ' + filters.map(f => `${f.column} = ?`).join(' AND ') : ''} ORDER BY published_date DESC LIMIT ?`,
          [...filters.map(f => f.value), limit]
        );
      } else if (args.used === false) {
        rows = await env.db.raw(
          `SELECT * FROM editorial_sources WHERE used_in_article IS NULL ${filters.length ? 'AND ' + filters.map(f => `${f.column} = ?`).join(' AND ') : ''} ORDER BY published_date DESC LIMIT ?`,
          [...filters.map(f => f.value), limit]
        );
      } else {
        rows = await env.db.query({
          table: 'editorial_sources',
          filters,
          order: [{ column: 'published_date', direction: 'desc', nulls: 'last' }, { column: 'created_at', direction: 'desc' }],
          limit,
        });
      }

      const watermark = getWatermark(env.config);
      const markdown = rows.length
        ? rows.map(formatSourceMd).join('\n') + '\n\n' + watermark
        : `_No sources found_\n\n${watermark}`;

      return { sources: rows, count: rows.length, markdown };
    },
  },

  {
    name: 'deactivate_source',
    description: 'Mark an editorial source as inactive. Does not delete. Owner only.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id:     { type: 'string', description: 'Source UUID' },
        reason: { type: 'string', description: 'Reason for deactivation' },
      },
    },
    handler: async (args, ctx: AuthContext | null, env: Env) => {
      requireOwner(ctx);

      const id = String(args.id);

      const existing = await env.db.queryOne({
        table: 'editorial_sources',
        filters: [{ column: 'id', op: 'eq', value: id }],
      });
      if (!existing) throw { code: 404, message: 'Source not found' };

      const patch: Record<string, unknown> = {
        status: 'inactive',
        updated_at: new Date().toISOString(),
      };

      if (args.reason) {
        const prev = existing.description ? String(existing.description) : '';
        patch.description = prev
          ? `${prev}\n[DEACTIVATED: ${String(args.reason)}]`
          : `[DEACTIVATED: ${String(args.reason)}]`;
      }

      const rows = await env.db.update('editorial_sources', [{ column: 'id', op: 'eq', value: id }], patch);
      return { ...rows[0], message: `Source deactivated: ${existing.title}` };
    },
  },

  {
    name: 'mark_source_used',
    description: 'Mark an editorial source as used in a specific article. Owner only.',
    inputSchema: {
      type: 'object',
      required: ['id', 'article_id'],
      properties: {
        id:         { type: 'string', description: 'Source UUID' },
        article_id: { type: 'string', description: 'Article ID where the source was used' },
      },
    },
    handler: async (args, ctx: AuthContext | null, env: Env) => {
      requireOwner(ctx);

      const id = String(args.id);
      const articleId = String(args.article_id);

      const rows = await env.db.update(
        'editorial_sources',
        [{ column: 'id', op: 'eq', value: id }],
        {
          used_in_article: articleId,
          used_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      );

      if (!rows.length) throw { code: 404, message: 'Source not found' };
      return { id: rows[0].id, title: rows[0].title, used_in_article: articleId, message: `Source marked as used` };
    },
  },
];
