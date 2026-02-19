/** Stats tool — newsletter aggregate statistics */

import type { McpTool, AuthContext, Env } from '../types.js';
import { requireOwner } from '../auth.js';

export const statsTools: McpTool[] = [
  {
    name: 'get_stats',
    description: 'Get aggregate newsletter statistics: article counts, engagement, top articles. Owner only.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    handler: async (_args, ctx: AuthContext | null, env: Env) => {
      requireOwner(ctx);

      const [allArticles, topArticles] = await Promise.all([
        env.db.raw('SELECT id, views, open_rate, status FROM articles'),
        env.db.raw('SELECT id, title, number, views, substack_url FROM articles WHERE status = ? ORDER BY views DESC LIMIT 5', ['published']),
      ]);

      const published = allArticles.filter(a => a.status === 'published');
      const totalViews = published.reduce((sum, a) => sum + (Number(a.views) || 0), 0);
      const avgOpenRate = published.length
        ? published.reduce((sum, a) => sum + (Number(a.open_rate) || 0), 0) / published.length
        : 0;

      const [notesCount, sourcesCount] = await Promise.all([
        env.db.count('editorial_notes', [{ column: 'status', op: 'eq', value: 'active' }]),
        env.db.count('editorial_sources', [{ column: 'status', op: 'eq', value: 'active' }]),
      ]);

      return {
        total_articles: allArticles.length,
        published: published.length,
        draft: allArticles.filter(a => a.status === 'draft').length,
        archived: allArticles.filter(a => a.status === 'archived').length,
        total_views: totalViews,
        avg_open_rate: Math.round(avgOpenRate * 10) / 10,
        top_5_by_views: topArticles,
        active_notes: notesCount,
        active_sources: sourcesCount,
      };
    },
  },
];
