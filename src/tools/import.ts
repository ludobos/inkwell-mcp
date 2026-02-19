/** Import tool — import newsletter from external platform */

import type { McpTool, AuthContext, Env } from '../types.js';
import { requireOwner } from '../auth.js';
import { SubstackConnector } from '../connectors/substack.js';
import { BeehiivConnector } from '../connectors/beehiiv.js';
import { GhostConnector } from '../connectors/ghost.js';
import { KitConnector } from '../connectors/kit.js';
import { enrichArticle } from '../connectors/enrichment.js';
import type { NewsletterConnector, ConnectorConfig } from '../connectors/interface.js';

const CONNECTORS: Record<string, NewsletterConnector> = {
  substack: new SubstackConnector(),
  beehiiv: new BeehiivConnector(),
  ghost: new GhostConnector(),
  kit: new KitConnector(),
};

export const importTools: McpTool[] = [
  {
    name: 'import_newsletter',
    description: 'Import articles from an external newsletter platform (Substack, Beehiiv, Ghost, Kit). Supports CSV/ZIP exports and API imports. Owner only.',
    inputSchema: {
      type: 'object',
      required: ['platform'],
      properties: {
        platform:       { type: 'string', enum: ['substack', 'beehiiv', 'ghost', 'kit'], description: 'Newsletter platform' },
        export_path:    { type: 'string', description: 'Path to export directory/file (Substack ZIP, Ghost JSON)' },
        api_key:        { type: 'string', description: 'API key (Beehiiv, Ghost, Kit)' },
        api_url:        { type: 'string', description: 'API base URL (Ghost only, e.g. https://myblog.ghost.io)' },
        publication_id: { type: 'string', description: 'Publication ID (Beehiiv only)' },
        enrich:         { type: 'boolean', description: 'Run enrichment (auto-tag, expert linking) after import. Default true.', default: true },
        dry_run:        { type: 'boolean', description: 'Preview without writing to database', default: false },
      },
    },
    handler: async (args, ctx: AuthContext | null, env: Env) => {
      requireOwner(ctx);

      const platform = String(args.platform);
      const connector = CONNECTORS[platform];
      if (!connector) {
        throw { code: 400, message: `Unknown platform: ${platform}. Supported: ${Object.keys(CONNECTORS).join(', ')}` };
      }

      const config: ConnectorConfig = {
        exportPath: args.export_path ? String(args.export_path) : undefined,
        apiKey: args.api_key ? String(args.api_key) : undefined,
        apiUrl: args.api_url ? String(args.api_url) : undefined,
        publicationId: args.publication_id ? String(args.publication_id) : undefined,
      };

      // Validate
      const validation = await connector.validate(config);
      if (!validation.valid) {
        throw { code: 400, message: `Validation failed: ${validation.message}` };
      }

      // Import
      const result = await connector.import(config);

      if (Boolean(args.dry_run)) {
        return {
          dry_run: true,
          platform,
          ...result.stats,
          messages: result.messages,
          preview: result.articles.slice(0, 5).map(a => ({
            title: a.title,
            published_at: a.published_at,
            open_rate: a.open_rate,
          })),
        };
      }

      // Insert articles
      let created = 0;
      let updated = 0;
      let skipped = 0;
      const enrichResults: Array<{ articleId: string; tags: number; experts: number; signal: string }> = [];

      for (const article of result.articles) {
        // Check for duplicates by external_id or title
        let existing = null;
        if (article.external_id) {
          const rows = await env.db.raw(
            'SELECT id FROM articles WHERE title = ? LIMIT 1',
            [article.title]
          );
          existing = rows[0] ?? null;
        }
        if (!existing) {
          const rows = await env.db.raw(
            'SELECT id FROM articles WHERE title = ? LIMIT 1',
            [article.title]
          );
          existing = rows[0] ?? null;
        }

        if (existing) {
          // Update with new data
          const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
          if (article.open_rate != null) patch.open_rate = article.open_rate;
          if (article.click_rate != null) patch.click_rate = article.click_rate;
          if (article.views != null) patch.views = article.views;
          if (article.editorial_angle) patch.editorial_angle = article.editorial_angle;
          if (article.url) patch.substack_url = article.url;

          if (Object.keys(patch).length > 1) {
            await env.db.update('articles', [{ column: 'id', op: 'eq', value: String(existing.id) }], patch);
            updated++;
          } else {
            skipped++;
          }

          // Enrich if requested
          if (args.enrich !== false && article.content) {
            const tagPatterns = (env.config.tagPatterns ?? []).map(tp => ({
              name: tp.name,
              category: tp.category,
              pattern: tp.pattern,
            }));
            const er = await enrichArticle(env.db, String(existing.id), article.content, tagPatterns);
            enrichResults.push(er);
          }
        } else {
          // Create new
          const inserted = await env.db.insert('articles', {
            title: article.title,
            subtitle: article.subtitle ?? null,
            content: article.content ?? null,
            status: article.status,
            type: article.type,
            number: article.number ?? null,
            published_at: article.published_at ?? null,
            views: article.views ?? 0,
            open_rate: article.open_rate ?? 0,
            click_rate: article.click_rate ?? 0,
            substack_url: article.url ?? null,
            editorial_angle: article.editorial_angle ?? null,
          });
          created++;

          // Enrich if requested
          if (args.enrich !== false && article.content) {
            const tagPatterns = (env.config.tagPatterns ?? []).map(tp => ({
              name: tp.name,
              category: tp.category,
              pattern: tp.pattern,
            }));
            const er = await enrichArticle(env.db, String(inserted.id), article.content, tagPatterns);
            enrichResults.push(er);
          }
        }
      }

      const totalTags = enrichResults.reduce((sum, r) => sum + r.tags, 0);
      const totalExperts = enrichResults.reduce((sum, r) => sum + r.experts, 0);

      return {
        platform,
        created,
        updated,
        skipped,
        errors: result.stats.errors,
        enrichment: args.enrich !== false ? {
          articles_enriched: enrichResults.length,
          total_tags_linked: totalTags,
          total_experts_linked: totalExperts,
        } : null,
        messages: result.messages,
      };
    },
  },
];
