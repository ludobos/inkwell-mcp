/**
 * Beehiiv connector — imports via REST API v2.
 *
 * API docs: https://developers.beehiiv.com
 * Requires: API key + publication ID
 * Stats available via ?expand=stats
 */

import type { NewsletterConnector, ConnectorConfig, ImportResult, ImportedArticle } from './interface.js';

interface BeehiivPost {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  publish_date: number; // Unix timestamp
  web_url: string;
  stats?: {
    email_recipients: number;
    email_open_rate: number;
    email_click_rate: number;
  };
  content_html?: string;
}

interface BeehiivResponse {
  data: BeehiivPost[];
  page: number;
  limit: number;
  total_results: number;
  total_pages: number;
}

export class BeehiivConnector implements NewsletterConnector {
  platform = 'beehiiv';
  displayName = 'Beehiiv';

  async validate(config: ConnectorConfig): Promise<{ valid: boolean; message: string }> {
    if (!config.apiKey) {
      return { valid: false, message: 'apiKey is required (Beehiiv API key)' };
    }
    if (!config.publicationId) {
      return { valid: false, message: 'publicationId is required' };
    }

    try {
      const res = await fetch(
        `https://api.beehiiv.com/v2/publications/${config.publicationId}/posts?limit=1`,
        { headers: { Authorization: `Bearer ${config.apiKey}` } }
      );
      if (!res.ok) {
        return { valid: false, message: `API returned ${res.status}: ${await res.text()}` };
      }
      return { valid: true, message: 'Beehiiv API connection successful' };
    } catch (err) {
      return { valid: false, message: `Connection failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  async import(config: ConnectorConfig): Promise<ImportResult> {
    const { apiKey, publicationId } = config;
    const messages: string[] = [];
    const articles: ImportedArticle[] = [];
    let errors = 0;
    let page = 1;
    let totalFetched = 0;

    while (true) {
      const url = `https://api.beehiiv.com/v2/publications/${publicationId}/posts?expand=stats&status=confirmed&limit=100&page=${page}`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!res.ok) {
        messages.push(`API error on page ${page}: ${res.status}`);
        errors++;
        break;
      }

      const data = await res.json() as BeehiivResponse;
      totalFetched += data.data.length;

      for (const post of data.data) {
        try {
          const article: ImportedArticle = {
            title: post.title,
            subtitle: post.subtitle || undefined,
            content: post.content_html || undefined,
            status: 'published',
            type: 'edition',
            published_at: post.publish_date
              ? new Date(post.publish_date * 1000).toISOString()
              : undefined,
            views: post.stats?.email_recipients,
            open_rate: post.stats?.email_open_rate
              ? Math.round(post.stats.email_open_rate * 1000) / 10
              : undefined,
            click_rate: post.stats?.email_click_rate
              ? Math.round(post.stats.email_click_rate * 1000) / 10
              : undefined,
            url: post.web_url,
            external_id: post.id,
          };
          articles.push(article);
        } catch (err) {
          messages.push(`Error processing "${post.title}": ${err instanceof Error ? err.message : String(err)}`);
          errors++;
        }
      }

      if (page >= data.total_pages) break;
      page++;
    }

    messages.push(`Fetched ${totalFetched} posts from Beehiiv API`);

    return {
      articles,
      stats: {
        total: totalFetched,
        imported: articles.length,
        skipped: 0,
        errors,
      },
      messages,
    };
  }
}
