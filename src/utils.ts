/** Utility functions for formatting */

import type { Row } from './types.js';

export function getWatermark(config: { watermark: string }): string {
  return `---\n_${config.watermark}_`;
}

export function formatArticleMd(a: Row): string {
  const num = a.number != null ? `#${a.number}` : '';
  const title = a.title ?? 'Untitled';
  const type = a.type ? ` [${a.type}]` : '';
  const date = a.published_at ? ` (${String(a.published_at).slice(0, 10)})` : '';
  const url = a.substack_url ? ` — [Read](${a.substack_url})` : '';
  const angle = a.editorial_angle ? `\n  _${a.editorial_angle}_` : '';
  const stats = [];
  if (a.views) stats.push(`${a.views} views`);
  if (a.open_rate) stats.push(`${a.open_rate}% open`);
  const statsStr = stats.length ? ` | ${stats.join(', ')}` : '';

  return `- **${num} ${title}**${type}${date}${statsStr}${url}${angle}`;
}

export function formatNoteMd(n: Row): string {
  const article = n.target_article ? `Article ${n.target_article}` : 'Backlog';
  const tags = Array.isArray(n.tags) ? n.tags : parseJsonArray(n.tags);
  const tagsStr = tags.length ? ` [${tags.join(', ')}]` : '';
  const prio = n.priority !== 3 ? ` P${n.priority}` : '';
  return `- **[${String(n.type).toUpperCase()}]** ${n.content}\n  _${article}${prio} | ${n.status}${tagsStr} | ${n.id}_`;
}

export function formatSourceMd(s: Row): string {
  const date = s.published_date ?? '?';
  let prefix: string;
  if (s.status === 'inactive') prefix = '[INACTIVE]';
  else if (s.used_in_article) prefix = `[USED in ${s.used_in_article}]`;
  else prefix = '[UNUSED]';
  return `- ${prefix} ${s.title} (${date})\n  ${s.url}\n  _${s.type ?? 'other'} | ${s.id}_`;
}

export function parseJsonArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string' && val.startsWith('[')) {
    try { return JSON.parse(val) as string[]; } catch { return []; }
  }
  return [];
}
