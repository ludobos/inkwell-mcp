/**
 * Substack connector — imports from Substack export ZIP (CSV + HTML files).
 *
 * Substack has no public API. Import is via export ZIP only.
 * Export contains: posts.csv + posts/{post_id}.{slug}.html + posts/{post_id}.delivers.csv etc.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import type { NewsletterConnector, ConnectorConfig, ImportResult, ImportedArticle } from './interface.js';

interface SubstackPost {
  post_id: string;
  title: string;
  subtitle: string;
  type: string;
  is_published: string;
  email_sent_at: string;
  post_date: string;
  slug: string;
  audience: string;
}

export class SubstackConnector implements NewsletterConnector {
  platform = 'substack';
  displayName = 'Substack';

  async validate(config: ConnectorConfig): Promise<{ valid: boolean; message: string }> {
    if (!config.exportPath) {
      return { valid: false, message: 'exportPath is required (path to extracted Substack export)' };
    }
    const postsCSV = join(config.exportPath, 'posts.csv');
    if (!existsSync(postsCSV)) {
      return { valid: false, message: `posts.csv not found in ${config.exportPath}` };
    }
    return { valid: true, message: 'Substack export directory found' };
  }

  async import(config: ConnectorConfig): Promise<ImportResult> {
    const exportPath = config.exportPath!;
    const postsDir = join(exportPath, 'posts');
    const postsCSV = join(exportPath, 'posts.csv');

    const messages: string[] = [];
    const articles: ImportedArticle[] = [];
    let skipped = 0;
    let errors = 0;

    // Parse posts.csv
    const csvContent = readFileSync(postsCSV, 'utf-8');
    const posts = this.parseCSV(csvContent);

    const publishedPosts = posts.filter(
      p => p.is_published === 'true' && ['newsletter', 'podcast'].includes(p.type)
    );

    messages.push(`Found ${posts.length} total posts, ${publishedPosts.length} published`);

    for (const post of publishedPosts) {
      try {
        const postId = post.post_id.split('.')[0];
        const slug = post.post_id.includes('.') ? post.post_id.split('.')[1] : post.slug;

        // Compute open rate from delivers/opens CSVs
        const openRate = this.computeOpenRate(postsDir, postId);

        // Extract editorial angle from HTML
        const editorialAngle = this.extractEditorialAngle(postsDir, postId, slug);

        const article: ImportedArticle = {
          title: post.title.trim(),
          subtitle: post.subtitle?.trim() || undefined,
          status: 'published',
          type: post.type === 'newsletter' ? 'edition' : 'special',
          published_at: post.email_sent_at || post.post_date || undefined,
          open_rate: openRate ?? undefined,
          editorial_angle: editorialAngle ?? undefined,
          external_id: postId,
        };

        articles.push(article);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        messages.push(`Error processing ${post.title}: ${msg}`);
        errors++;
      }
    }

    return {
      articles,
      stats: {
        total: publishedPosts.length,
        imported: articles.length,
        skipped,
        errors,
      },
      messages,
    };
  }

  private parseCSV(content: string): SubstackPost[] {
    const lines = content.split('\n');
    if (lines.length < 2) return [];

    const headers = this.parseCSVLine(lines[0]);
    const rows: SubstackPost[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = this.parseCSVLine(line);
      const row: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        row[headers[j]] = values[j] ?? '';
      }
      rows.push(row as unknown as SubstackPost);
    }

    return rows;
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
    }
    result.push(current.trim());
    return result;
  }

  private computeOpenRate(postsDir: string, postId: string): number | null {
    const deliversFile = join(postsDir, `${postId}.delivers.csv`);
    const opensFile = join(postsDir, `${postId}.opens.csv`);

    if (!existsSync(deliversFile)) return null;

    const deliversContent = readFileSync(deliversFile, 'utf-8');
    const delivers = deliversContent.split('\n').filter(l => l.trim()).length - 1; // minus header

    if (delivers <= 0) return null;

    if (!existsSync(opensFile)) return 0;

    const opensContent = readFileSync(opensFile, 'utf-8');
    const opens = opensContent.split('\n').filter(l => l.trim()).length - 1;

    return Math.round((opens / delivers) * 1000) / 10;
  }

  private extractEditorialAngle(postsDir: string, postId: string, slug?: string): string | null {
    if (!existsSync(postsDir)) return null;

    // Find HTML file
    let htmlPath: string | null = null;
    if (slug) {
      const candidate = join(postsDir, `${postId}.${slug}.html`);
      if (existsSync(candidate)) htmlPath = candidate;
    }

    if (!htmlPath) {
      // Fallback: find any file matching postId.*.html
      try {
        const files = readdirSync(postsDir);
        const match = files.find(f => f.startsWith(`${postId}.`) && f.endsWith('.html'));
        if (match) htmlPath = join(postsDir, match);
      } catch {
        return null;
      }
    }

    if (!htmlPath) return null;

    const content = readFileSync(htmlPath, 'utf-8');
    return this.extractTextFromHtml(content, 2000);
  }

  private extractTextFromHtml(html: string, maxLength: number): string | null {
    // Simple HTML text extraction without external dependency
    // Remove script/style tags
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // Extract text from paragraphs and headings (keep significant content)
    const paragraphs: string[] = [];
    const tagRegex = /<(?:p|h[1-6])[^>]*>([\s\S]*?)<\/(?:p|h[1-6])>/gi;
    let match;
    while ((match = tagRegex.exec(text)) !== null) {
      const clean = match[1].replace(/<[^>]+>/g, '').trim();
      if (clean.length > 50) {
        paragraphs.push(clean);
      }
    }

    const result = paragraphs.join(' ');
    return result ? result.slice(0, maxLength) : null;
  }
}
