/** Writing tools — draft_article, list_voice_templates */

import type { McpTool, AuthContext, Env } from '../types.js';
import { requireOwner } from '../auth.js';
import { loadVoiceTemplates } from '../voice/loader.js';
import { getWatermark } from '../utils.js';
import { resolve } from 'path';

export const writeTools: McpTool[] = [
  {
    name: 'list_voice_templates',
    description: 'List available voice/style templates for article drafting. Owner only.',
    inputSchema: {
      type: 'object',
      properties: {
        templates_dir: { type: 'string', description: 'Custom templates directory path' },
      },
    },
    handler: async (args, ctx: AuthContext | null, env: Env) => {
      requireOwner(ctx);

      const dir = args.templates_dir
        ? String(args.templates_dir)
        : resolve('templates', 'voice');

      const templates = loadVoiceTemplates(dir);

      const watermark = getWatermark(env.config);
      const markdown = templates.length
        ? templates.map(t => `- **${t.name}**: ${t.description}\n  Tone: ${t.tone}`).join('\n') + '\n\n' + watermark
        : `_No voice templates found in ${dir}_\n\n${watermark}`;

      return {
        templates: templates.map(t => ({
          name: t.name,
          description: t.description,
          tone: t.tone,
          structure_points: t.structure.length,
          style_points: t.style.length,
        })),
        count: templates.length,
        directory: dir,
        markdown,
      };
    },
  },

  {
    name: 'draft_article',
    description: 'Generate a structured article draft from a brief (notes + sources) using a voice template. Returns a markdown draft with sections based on collected material. Owner only.',
    inputSchema: {
      type: 'object',
      required: ['target_article'],
      properties: {
        target_article: { type: 'string', description: 'Article ID to draft for (must have notes/sources via prepare_brief)' },
        voice:          { type: 'string', description: 'Voice template name (default: "default"). Use list_voice_templates to see options.' },
        templates_dir:  { type: 'string', description: 'Custom templates directory' },
        title:          { type: 'string', description: 'Override article title' },
        focus:          { type: 'string', description: 'Specific angle or focus for this draft' },
      },
    },
    handler: async (args, ctx: AuthContext | null, env: Env) => {
      requireOwner(ctx);

      const articleId = String(args.target_article);
      const voiceName = String(args.voice ?? 'default');

      // Load voice template
      const dir = args.templates_dir
        ? String(args.templates_dir)
        : resolve('templates', 'voice');
      const templates = loadVoiceTemplates(dir);
      const voice = templates.find(t => t.name === voiceName) ?? templates[0];

      if (!voice) {
        throw { code: 400, message: `Voice template "${voiceName}" not found. Available: ${templates.map(t => t.name).join(', ')}` };
      }

      // Fetch article
      const article = await env.db.queryOne({
        table: 'articles',
        filters: [{ column: 'id', op: 'eq', value: articleId }],
      });

      const articleTitle = String(args.title ?? article?.title ?? 'Untitled');

      // Fetch notes
      const notes = await env.db.raw(
        `SELECT * FROM editorial_notes
         WHERE status = 'active' AND (target_article = ? OR target_article IS NULL)
         ORDER BY priority ASC, type ASC`,
        [articleId]
      );

      // Fetch sources
      const sources = await env.db.raw(
        `SELECT * FROM editorial_sources
         WHERE status = 'active' AND (target_article = ? OR target_article IS NULL)
           AND used_in_article IS NULL
         ORDER BY published_date DESC`,
        [articleId]
      );

      // Build the draft structure
      const lines: string[] = [];
      lines.push(`# ${articleTitle}`);
      lines.push('');

      if (args.focus) {
        lines.push(`> **Focus**: ${args.focus}`);
        lines.push('');
      }

      // Voice guidance
      lines.push(`> **Voice**: ${voice.name} — ${voice.tone}`);
      lines.push('');

      // TL;DR section
      const factNotes = notes.filter(n => n.type === 'fact' || n.type === 'quote');
      if (factNotes.length) {
        lines.push('## Key Facts');
        for (const n of factNotes) {
          lines.push(`- ${n.content}`);
        }
        lines.push('');
      }

      // Main angles
      const angleNotes = notes.filter(n => n.type === 'angle' || n.type === 'idea');
      if (angleNotes.length) {
        lines.push('## Angles to Explore');
        for (const n of angleNotes) {
          const prio = n.priority !== 3 ? ` (P${n.priority})` : '';
          lines.push(`- ${n.content}${prio}`);
        }
        lines.push('');
      }

      // Outline if available
      const outlineNotes = notes.filter(n => n.type === 'outline');
      if (outlineNotes.length) {
        lines.push('## Outline');
        for (const n of outlineNotes) {
          lines.push(String(n.content));
        }
        lines.push('');
      }

      // Draft sections based on voice structure
      if (voice.structure.length) {
        lines.push('## Draft');
        lines.push('');
        for (const point of voice.structure) {
          lines.push(`### ${point}`);
          lines.push('');
          lines.push('_[Write this section]_');
          lines.push('');
        }
      }

      // Sources to cite
      if (sources.length) {
        lines.push('## Sources Available');
        for (const s of sources) {
          lines.push(`- [${s.title}](${s.url}) (${s.published_date ?? '?'})`);
          if (s.key_quotes) {
            lines.push(`  > ${s.key_quotes}`);
          }
        }
        lines.push('');
      }

      // TODOs
      const todoNotes = notes.filter(n => n.type === 'todo');
      if (todoNotes.length) {
        lines.push('## TODOs');
        for (const n of todoNotes) {
          lines.push(`- [ ] ${n.content}`);
        }
        lines.push('');
      }

      // Style reminders
      if (voice.style.length) {
        lines.push('---');
        lines.push(`_Style reminders (${voice.name}):_`);
        for (const s of voice.style) {
          lines.push(`_- ${s}_`);
        }
      }

      const watermark = getWatermark(env.config);
      lines.push('', watermark);
      const markdown = lines.join('\n');

      return {
        target_article: articleId,
        title: articleTitle,
        voice: voice.name,
        notes_used: notes.length,
        sources_available: sources.length,
        draft_length: markdown.length,
        markdown,
      };
    },
  },
];
