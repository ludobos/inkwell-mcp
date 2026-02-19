/**
 * Ghost connector — imports via Content API or JSON export.
 *
 * Content API: read-only, requires API key (simple hex string)
 * Admin API: CRUD, requires JWT (for future publish support)
 */

import { readFileSync, existsSync } from 'fs';
import type { NewsletterConnector, ConnectorConfig, ImportResult, ImportedArticle } from './interface.js';

interface GhostPost {
  id: string;
  uuid: string;
  title: string;
  custom_excerpt: string | null;
  html: string;
  status: string;
  published_at: string | null;
  url: string;
  tags?: Array<{ name: string; slug: string }>;
  authors?: Array<{ name: string; slug: string }>;
}

interface GhostAPIResponse {
  posts: GhostPost[];
  meta: { pagination: { page: number; pages: number; total: number } };
}

export class GhostConnector implements NewsletterConnector {
  platform = 'ghost';
  displayName = 'Ghost';

  async validate(config: ConnectorConfig): Promise<{ valid: boolean; message: string }> {
    // Mode 1: JSON export file
    if (config.exportPath) {
      if (!existsSync(config.exportPath)) {
        return { valid: false, message: `Export file not found: ${config.exportPath}` };
      }
      return { valid: true, message: 'Ghost JSON export file found' };
    }

    // Mode 2: Content API
    if (!config.apiUrl || !config.apiKey) {
      return { valid: false, message: 'Provide apiUrl + apiKey (Content API) or exportPath (JSON export)' };
    }

    try {
      const url = `${config.apiUrl}/ghost/api/content/posts/?key=${config.apiKey}&limit=1`;
      const res = await fetch(url);
      if (!res.ok) {
        return { valid: false, message: `API returned ${res.status}: ${await res.text()}` };
      }
      return { valid: true, message: 'Ghost Content API connection successful' };
    } catch (err) {
      return { valid: false, message: `Connection failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  async import(config: ConnectorConfig): Promise<ImportResult> {
    if (config.exportPath) {
      return this.importFromJSON(config.exportPath);
    }
    return this.importFromAPI(config.apiUrl!, config.apiKey!);
  }

  private async importFromJSON(exportPath: string): Promise<ImportResult> {
    const messages: string[] = [];
    const articles: ImportedArticle[] = [];
    let errors = 0;

    const content = readFileSync(exportPath, 'utf-8');
    const data = JSON.parse(content);

    // Ghost export format: { db: [{ data: { posts: [...] } }] }
    const posts: GhostPost[] = data?.db?.[0]?.data?.posts ?? data?.posts ?? [];
    messages.push(`Found ${posts.length} posts in Ghost export`);

    for (const post of posts) {
      try {
        if (post.status !== 'published') continue;

        const article: ImportedArticle = {
          title: post.title,
          subtitle: post.custom_excerpt || undefined,
          content: post.html || undefined,
          status: 'published',
          type: 'edition',
          published_at: post.published_at || undefined,
          url: post.url || undefined,
          external_id: post.uuid || post.id,
        };
        articles.push(article);
      } catch (err) {
        messages.push(`Error: ${err instanceof Error ? err.message : String(err)}`);
        errors++;
      }
    }

    return {
      articles,
      stats: { total: posts.length, imported: articles.length, skipped: posts.length - articles.length - errors, errors },
      messages,
    };
  }

  private async importFromAPI(apiUrl: string, apiKey: string): Promise<ImportResult> {
    const messages: string[] = [];
    const articles: ImportedArticle[] = [];
    let errors = 0;
    let page = 1;
    let totalFetched = 0;

    while (true) {
      const url = `${apiUrl}/ghost/api/content/posts/?key=${apiKey}&include=tags,authors&limit=100&page=${page}&filter=status:published`;

      const res = await fetch(url);
      if (!res.ok) {
        messages.push(`API error on page ${page}: ${res.status}`);
        errors++;
        break;
      }

      const data = await res.json() as GhostAPIResponse;
      totalFetched += data.posts.length;

      for (const post of data.posts) {
        try {
          const article: ImportedArticle = {
            title: post.title,
            subtitle: post.custom_excerpt || undefined,
            content: post.html || undefined,
            status: 'published',
            type: 'edition',
            published_at: post.published_at || undefined,
            url: post.url || undefined,
            external_id: post.uuid || post.id,
          };
          articles.push(article);
        } catch (err) {
          messages.push(`Error: ${err instanceof Error ? err.message : String(err)}`);
          errors++;
        }
      }

      if (page >= data.meta.pagination.pages) break;
      page++;
    }

    messages.push(`Fetched ${totalFetched} posts from Ghost Content API`);

    return {
      articles,
      stats: { total: totalFetched, imported: articles.length, skipped: 0, errors },
      messages,
    };
  }
}
