/** Expert tools — list, get */

import type { McpTool, AuthContext, Env, Filter } from '../types.js';
import { formatArticleMd, getWatermark } from '../utils.js';

export const expertTools: McpTool[] = [
  {
    name: 'list_experts',
    description: 'List experts cited in the newsletter with optional filters by tier or country.',
    inputSchema: {
      type: 'object',
      properties: {
        tier: { type: 'number', description: 'Expert tier (1=top, 2=mid, 3=emerging)', enum: [1, 2, 3] },
        country: { type: 'string', description: 'ISO country code (e.g. "US", "FR")' },
        limit: { type: 'number', description: 'Max results (default 20, max 50)', minimum: 1, maximum: 50 },
      },
    },
    handler: async (args, _ctx: AuthContext | null, env: Env) => {
      const limit = Math.min(Number(args.limit ?? 20), 50);
      const filters: Filter[] = [];

      if (args.tier != null) filters.push({ column: 'tier', op: 'eq', value: Number(args.tier) });
      if (args.country) filters.push({ column: 'country', op: 'eq', value: String(args.country).toUpperCase() });

      const rows = await env.db.query({
        table: 'experts',
        select: ['id', 'name', 'affiliation', 'expertise', 'country', 'tier', 'times_cited'],
        filters,
        order: [{ column: 'times_cited', direction: 'desc' }],
        limit,
      });

      return { experts: rows, count: rows.length };
    },
  },

  {
    name: 'get_expert',
    description: 'Get a single expert by ID or name (partial match), including linked articles.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Expert UUID' },
        name: { type: 'string', description: 'Expert name (partial match)' },
      },
    },
    handler: async (args, _ctx: AuthContext | null, env: Env) => {
      if (!args.id && !args.name) {
        throw { code: 400, message: 'Provide either id or name' };
      }

      let expert: Record<string, unknown> | null;
      if (args.id) {
        expert = await env.db.queryOne({
          table: 'experts',
          filters: [{ column: 'id', op: 'eq', value: String(args.id) }],
        });
      } else {
        expert = await env.db.queryOne({
          table: 'experts',
          filters: [{ column: 'name', op: 'ilike', value: `%${String(args.name).trim()}%` }],
        });
      }

      if (!expert) throw { code: 404, message: 'Expert not found' };

      // Fetch linked articles
      let articles: Record<string, unknown>[] = [];
      try {
        articles = await env.db.raw(
          `SELECT a.id, a.title, a.published_at, a.substack_url, a.editorial_angle, a.number, a.type
           FROM articles a
           JOIN article_experts ae ON ae.article_id = a.id
           WHERE ae.expert_id = ?`,
          [expert.id]
        );
      } catch {
        // Junction table may not exist yet
      }

      const watermark = getWatermark(env.config);
      const articlesMd = articles.map(a => formatArticleMd(a)).join('\n');
      const markdown = `## ${expert.name}\n${expert.affiliation ? `_${expert.affiliation}_` : ''}${expert.country ? ` (${expert.country})` : ''}\n\n### Articles (${articles.length})\n${articlesMd || '_No linked articles_'}\n\n${watermark}`;

      return { expert, articles, articles_count: articles.length, markdown };
    },
  },
];
