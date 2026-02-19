/** Brief tool — prepare article writing brief from notes + sources */

import type { McpTool, AuthContext, Env, Row } from '../types.js';
import { requireOwner } from '../auth.js';
import { getWatermark } from '../utils.js';

export const briefTools: McpTool[] = [
  {
    name: 'prepare_brief',
    description: 'Generate an article preparation brief: aggregated notes + sources, organized by type and status. Owner only.',
    inputSchema: {
      type: 'object',
      required: ['target_article'],
      properties: {
        target_article: { type: 'string', description: 'Article ID to prepare the brief for' },
        include_backlog: { type: 'boolean', description: 'Include backlog notes (default true)', default: true },
      },
    },
    handler: async (args, ctx: AuthContext | null, env: Env) => {
      requireOwner(ctx);

      const articleId = String(args.target_article);
      const includeBacklog = args.include_backlog !== false;

      // Fetch article title
      const article = await env.db.queryOne({
        table: 'articles',
        select: ['id', 'title', 'number'],
        filters: [{ column: 'id', op: 'eq', value: articleId }],
      });
      const articleLabel = article
        ? `${article.number ? `#${article.number} ` : ''}${article.title}`
        : articleId;

      // Fetch notes
      let notes: Row[];
      if (includeBacklog) {
        notes = await env.db.raw(
          `SELECT * FROM editorial_notes
           WHERE status = 'active' AND (target_article = ? OR target_article IS NULL)
           ORDER BY priority ASC, type ASC`,
          [articleId]
        );
      } else {
        notes = await env.db.query({
          table: 'editorial_notes',
          filters: [
            { column: 'target_article', op: 'eq', value: articleId },
            { column: 'status', op: 'eq', value: 'active' },
          ],
          order: [{ column: 'priority', direction: 'asc' }, { column: 'type', direction: 'asc' }],
        });
      }

      // Fetch sources for article
      const sources = await env.db.query({
        table: 'editorial_sources',
        filters: [{ column: 'target_article', op: 'eq', value: articleId }],
        order: [{ column: 'published_date', direction: 'desc', nulls: 'last' }],
      });

      // Fetch backlog sources if needed
      let backlogSources: Row[] = [];
      if (includeBacklog) {
        backlogSources = await env.db.raw(
          `SELECT * FROM editorial_sources WHERE target_article IS NULL AND status = 'active' ORDER BY published_date DESC`,
        );
      }

      // Combine sources
      const allSources = [...sources];
      const seenIds = new Set(sources.map(s => String(s.id)));
      for (const s of backlogSources) {
        if (!seenIds.has(String(s.id))) allSources.push(s);
      }

      // Categorize notes by type
      const notesByType: Record<string, Row[]> = {};
      for (const n of notes) {
        const type = String(n.type);
        (notesByType[type] ??= []).push(n);
      }

      // Categorize sources
      const activeUnused = allSources.filter(s => s.status === 'active' && !s.used_in_article);
      const used = allSources.filter(s => s.used_in_article != null);
      const inactive = allSources.filter(s => s.status === 'inactive');

      // Build markdown
      const lines: string[] = [`# Brief — ${articleLabel}`, ''];

      lines.push('## Notes');
      if (notes.length === 0) {
        lines.push('_No notes for this article_');
      } else {
        for (const [type, items] of Object.entries(notesByType)) {
          lines.push(`\n### ${type.charAt(0).toUpperCase() + type.slice(1)}s`);
          for (const n of items) {
            const fromBacklog = n.target_article == null ? ' _(backlog)_' : '';
            lines.push(`- P${n.priority} | ${n.content}${fromBacklog}`);
          }
        }
      }

      lines.push('', '## Sources — Active & Unused');
      if (activeUnused.length === 0) {
        lines.push('_No unused sources_');
      } else {
        for (const s of activeUnused) {
          const from = s.target_article == null ? ' _(backlog)_' : '';
          lines.push(`- ${s.title} (${s.published_date ?? '?'})${from}\n  ${s.url}`);
        }
      }

      if (used.length) {
        lines.push('', '## Sources — Already Used');
        for (const s of used) {
          lines.push(`- ~~${s.title}~~ — used in ${s.used_in_article}\n  ${s.url}`);
        }
      }

      if (inactive.length) {
        lines.push('', '## Sources — Inactive');
        for (const s of inactive) {
          lines.push(`- ~~${s.title}~~ — inactive\n  ${s.url}`);
        }
      }

      const watermark = getWatermark(env.config);
      lines.push('', watermark);
      const markdown = lines.join('\n');

      return {
        target_article: articleId,
        article_label: articleLabel,
        notes_count: notes.length,
        notes_by_type: Object.fromEntries(Object.entries(notesByType).map(([k, v]) => [k, v.length])),
        sources_active_unused: activeUnused.length,
        sources_used: used.length,
        sources_inactive: inactive.length,
        markdown,
      };
    },
  },
];
