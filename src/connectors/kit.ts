/**
 * Kit (ConvertKit) connector — imports via API v3.
 *
 * API docs: https://developers.kit.com
 * Requires: API secret
 * Stats available per broadcast via /broadcasts/{id}/stats
 */

import type { NewsletterConnector, ConnectorConfig, ImportResult, ImportedArticle } from './interface.js';

interface KitBroadcast {
  id: number;
  subject: string;
  description: string | null;
  content: string | null;
  published_at: string | null;
  send_at: string | null;
}

interface KitBroadcastStats {
  stats: {
    recipients: number;
    open_rate: number;
    click_rate: number;
    unsubscribes: number;
  };
}

export class KitConnector implements NewsletterConnector {
  platform = 'kit';
  displayName = 'Kit (ConvertKit)';

  async validate(config: ConnectorConfig): Promise<{ valid: boolean; message: string }> {
    if (!config.apiKey) {
      return { valid: false, message: 'apiKey is required (Kit API secret)' };
    }

    try {
      const res = await fetch(`https://api.kit.com/v3/broadcasts?api_secret=${config.apiKey}&page=1&per_page=1`);
      if (!res.ok) {
        return { valid: false, message: `API returned ${res.status}: ${await res.text()}` };
      }
      return { valid: true, message: 'Kit API connection successful' };
    } catch (err) {
      return { valid: false, message: `Connection failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  async import(config: ConnectorConfig): Promise<ImportResult> {
    const apiSecret = config.apiKey!;
    const messages: string[] = [];
    const articles: ImportedArticle[] = [];
    let errors = 0;
    let page = 1;
    let totalFetched = 0;

    // Fetch broadcasts
    while (true) {
      const url = `https://api.kit.com/v3/broadcasts?api_secret=${apiSecret}&page=${page}&per_page=50`;

      const res = await fetch(url);
      if (!res.ok) {
        messages.push(`API error on page ${page}: ${res.status}`);
        errors++;
        break;
      }

      const data = await res.json() as { broadcasts: KitBroadcast[]; total_count: number };
      totalFetched += data.broadcasts.length;

      for (const broadcast of data.broadcasts) {
        try {
          // Fetch stats for each broadcast
          let openRate: number | undefined;
          let clickRate: number | undefined;
          let recipients: number | undefined;

          try {
            const statsRes = await fetch(
              `https://api.kit.com/v3/broadcasts/${broadcast.id}/stats?api_secret=${apiSecret}`
            );
            if (statsRes.ok) {
              const statsData = await statsRes.json() as KitBroadcastStats;
              openRate = statsData.stats?.open_rate
                ? Math.round(statsData.stats.open_rate * 1000) / 10
                : undefined;
              clickRate = statsData.stats?.click_rate
                ? Math.round(statsData.stats.click_rate * 1000) / 10
                : undefined;
              recipients = statsData.stats?.recipients;
            }
          } catch {
            // Stats fetch is best-effort
          }

          const article: ImportedArticle = {
            title: broadcast.subject,
            subtitle: broadcast.description || undefined,
            content: broadcast.content || undefined,
            status: 'published',
            type: 'edition',
            published_at: broadcast.published_at || broadcast.send_at || undefined,
            views: recipients,
            open_rate: openRate,
            click_rate: clickRate,
            external_id: String(broadcast.id),
          };
          articles.push(article);
        } catch (err) {
          messages.push(`Error: ${err instanceof Error ? err.message : String(err)}`);
          errors++;
        }
      }

      if (data.broadcasts.length < 50) break;
      page++;
    }

    messages.push(`Fetched ${totalFetched} broadcasts from Kit API`);

    return {
      articles,
      stats: { total: totalFetched, imported: articles.length, skipped: 0, errors },
      messages,
    };
  }
}
