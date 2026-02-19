/**
 * Enrichment pipeline — auto-tags articles, links experts, detects signals.
 * Port of backfill_article_structure.py to TypeScript.
 */

import type { DatabaseAdapter } from '../types.js';

export interface TagPattern {
  name: string;
  category: string;
  pattern: string; // regex string
}

export interface EnrichmentResult {
  articleId: string;
  tags: number;
  experts: number;
  signal: string;
  tl_dr: number;
}

// Default signal detection patterns
const BULLISH_PATTERNS = [
  /\b(growth|opportunity|expansion|invest\w+|record|milestone|launch\w+|surge|winning|dominant|leader|boom)\b/gi,
  /\b(croissance|opportunit\w+|hausse|lancement|gagnant)\b/gi,
];

const BEARISH_PATTERNS = [
  /\b(decline|loss\w*|fail\w+|shutdown|withdrawal|bankruptcy|threat\w*|risk\w*|challenge\w*)\b/gi,
  /\b(déclin|pertes?|chute|fermeture|retrait|menace|risque|défi)\b/gi,
];

/**
 * Enrich a single article: detect tags, link experts, determine signal, extract TL;DR.
 */
export async function enrichArticle(
  db: DatabaseAdapter,
  articleId: string,
  content: string,
  tagPatterns: TagPattern[],
): Promise<EnrichmentResult> {
  const fullText = content.toLowerCase();

  // 1. Detect tags via patterns
  let tagCount = 0;
  for (const tp of tagPatterns) {
    const regex = new RegExp(tp.pattern, 'i');
    if (regex.test(fullText)) {
      // Ensure tag exists
      const existing = await db.queryOne({
        table: 'tags',
        filters: [{ column: 'name', op: 'eq', value: tp.name }],
      });

      let tagId: string;
      if (existing) {
        tagId = String(existing.id);
      } else {
        const created = await db.insert('tags', {
          name: tp.name,
          category: tp.category,
        });
        tagId = String(created.id);
      }

      // Link to article (ignore duplicate errors)
      try {
        await db.raw(
          'INSERT OR IGNORE INTO article_tags (article_id, tag_id) VALUES (?, ?)',
          [articleId, tagId]
        );
        tagCount++;
      } catch {
        // Already linked
      }
    }
  }

  // 2. Detect experts by name matching
  let expertCount = 0;
  const allExperts = await db.query({ table: 'experts' });
  for (const expert of allExperts) {
    const name = String(expert.name ?? '');
    const lastName = name.split(' ').pop() ?? '';
    if (lastName.length >= 3) {
      const escapedName = lastName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const nameRegex = new RegExp(`\\b${escapedName}\\b`, 'i');
      if (nameRegex.test(fullText)) {
        try {
          await db.raw(
            'INSERT OR IGNORE INTO article_experts (article_id, expert_id) VALUES (?, ?)',
            [articleId, String(expert.id)]
          );
          // Update citation count
          await db.update(
            'experts',
            [{ column: 'id', op: 'eq', value: String(expert.id) }],
            { times_cited: (Number(expert.times_cited) || 0) + 1 }
          );
          expertCount++;
        } catch {
          // Already linked
        }
      }
    }
  }

  // 3. Detect editorial signal
  const signal = detectSignal(fullText);

  // 4. Extract TL;DR (bullet points from content)
  const bullets = extractBullets(content);

  // 5. Update article
  const updatePayload: Record<string, unknown> = {
    conclusion_signal: signal,
    updated_at: new Date().toISOString(),
  };
  if (bullets.length) {
    updatePayload.tl_dr = JSON.stringify(bullets);
  }
  await db.update('articles', [{ column: 'id', op: 'eq', value: articleId }], updatePayload);

  return {
    articleId,
    tags: tagCount,
    experts: expertCount,
    signal,
    tl_dr: bullets.length,
  };
}

function detectSignal(text: string): string {
  let bullishCount = 0;
  let bearishCount = 0;

  for (const p of BULLISH_PATTERNS) {
    const matches = text.match(p);
    bullishCount += matches?.length ?? 0;
  }
  for (const p of BEARISH_PATTERNS) {
    const matches = text.match(p);
    bearishCount += matches?.length ?? 0;
  }

  if (bullishCount > bearishCount * 1.5) return 'bullish';
  if (bearishCount > bullishCount * 1.5) return 'bearish';
  return 'neutral';
}

function extractBullets(html: string): string[] {
  // Extract <li> content
  const bullets: string[] = [];
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let match;

  while ((match = liRegex.exec(html)) !== null) {
    const text = match[1].replace(/<[^>]+>/g, '').trim();
    if (text.length > 20 && text.length < 200) {
      bullets.push(text);
    }
  }

  // If few bullets, try blockquotes
  if (bullets.length < 3) {
    const bqRegex = /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi;
    while ((match = bqRegex.exec(html)) !== null) {
      const text = match[1].replace(/<[^>]+>/g, '').trim();
      if (text.length > 20 && text.length < 300) {
        bullets.push(text);
      }
    }
  }

  return bullets.slice(0, 8);
}
