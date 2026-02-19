/** Tag tools — list */

import type { McpTool, AuthContext, Env, Filter } from '../types.js';

export const tagTools: McpTool[] = [
  {
    name: 'list_tags',
    description: 'List tags used in the newsletter, optionally filtered by category.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Tag category', enum: ['platform', 'business', 'trend', 'tech', 'event'] },
        limit: { type: 'number', description: 'Max results (default 50)', minimum: 1, maximum: 200 },
      },
    },
    handler: async (args, _ctx: AuthContext | null, env: Env) => {
      const limit = Math.min(Number(args.limit ?? 50), 200);
      const filters: Filter[] = [];

      if (args.category) filters.push({ column: 'category', op: 'eq', value: String(args.category) });

      const rows = await env.db.query({
        table: 'tags',
        select: ['id', 'name', 'category', 'description'],
        filters,
        order: [{ column: 'name', direction: 'asc' }],
        limit,
      });

      return { tags: rows, count: rows.length };
    },
  },
];
