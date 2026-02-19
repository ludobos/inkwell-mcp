/** Note tools — add, list, update, clear */

import type { McpTool, AuthContext, Env, Filter } from '../types.js';
import { requireOwner } from '../auth.js';
import { formatNoteMd, getWatermark, parseJsonArray } from '../utils.js';

export const noteTools: McpTool[] = [
  {
    name: 'add_note',
    description: 'Add an editorial note (idea, angle, quote, fact, todo, outline) for an article or backlog. Owner only.',
    inputSchema: {
      type: 'object',
      required: ['type', 'content'],
      properties: {
        type:           { type: 'string', enum: ['idea', 'angle', 'quote', 'fact', 'todo', 'outline'], description: 'Note type' },
        content:        { type: 'string', description: 'Note content', minLength: 1 },
        target_article: { type: 'string', description: 'Target article ID (omit for backlog)' },
        tags:           { type: 'array', items: { type: 'string' }, description: 'Tags for filtering' },
        priority:       { type: 'number', minimum: 1, maximum: 5, description: 'Priority 1-5 (default 3)' },
      },
    },
    handler: async (args, ctx: AuthContext | null, env: Env) => {
      requireOwner(ctx);

      const note = await env.db.insert('editorial_notes', {
        type: String(args.type),
        content: String(args.content),
        target_article: args.target_article ? String(args.target_article) : null,
        tags: Array.isArray(args.tags) ? args.tags.map(String) : [],
        priority: args.priority != null ? Number(args.priority) : 3,
        status: 'active',
      });

      return {
        ...note,
        message: `Note added${note.target_article ? ` for article ${note.target_article}` : ' to backlog'}`,
      };
    },
  },

  {
    name: 'list_notes',
    description: 'List editorial notes with filters. Owner only.',
    inputSchema: {
      type: 'object',
      properties: {
        target_article: { type: 'string', description: 'Filter by article ID (use "backlog" for unassigned)' },
        type:           { type: 'string', enum: ['idea', 'angle', 'quote', 'fact', 'todo', 'outline'] },
        status:         { type: 'string', enum: ['active', 'used', 'discarded'], description: 'Default: active' },
        tag:            { type: 'string', description: 'Filter by tag' },
        limit:          { type: 'number', minimum: 1, maximum: 100, description: 'Max results (default 50)' },
      },
    },
    handler: async (args, ctx: AuthContext | null, env: Env) => {
      requireOwner(ctx);

      const limit = Math.min(Number(args.limit ?? 50), 100);
      const filters: Filter[] = [];

      if (args.target_article != null) {
        if (String(args.target_article) === 'backlog') {
          filters.push({ column: 'target_article', op: 'is', value: null });
        } else {
          filters.push({ column: 'target_article', op: 'eq', value: String(args.target_article) });
        }
      }
      if (args.type) filters.push({ column: 'type', op: 'eq', value: String(args.type) });
      if (args.status) filters.push({ column: 'status', op: 'eq', value: String(args.status) });
      else filters.push({ column: 'status', op: 'eq', value: 'active' });
      if (args.tag) filters.push({ column: 'tags', op: 'cs', value: String(args.tag) });

      const rows = await env.db.query({
        table: 'editorial_notes',
        filters,
        order: [{ column: 'priority', direction: 'asc' }, { column: 'created_at', direction: 'desc' }],
        limit,
      });

      // Parse JSON tags for display
      const parsed = rows.map(r => ({ ...r, tags: parseJsonArray(r.tags) }));

      const watermark = getWatermark(env.config);
      const markdown = parsed.length
        ? parsed.map(formatNoteMd).join('\n') + '\n\n' + watermark
        : `_No notes found_\n\n${watermark}`;

      return { notes: parsed, count: parsed.length, markdown };
    },
  },

  {
    name: 'update_note',
    description: 'Update an editorial note. Owner only.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id:             { type: 'string', description: 'Note UUID' },
        content:        { type: 'string' },
        type:           { type: 'string', enum: ['idea', 'angle', 'quote', 'fact', 'todo', 'outline'] },
        target_article: { type: 'string', description: 'Article ID or "backlog" to unassign' },
        status:         { type: 'string', enum: ['active', 'used', 'discarded'] },
        priority:       { type: 'number', minimum: 1, maximum: 5 },
        tags:           { type: 'array', items: { type: 'string' } },
      },
    },
    handler: async (args, ctx: AuthContext | null, env: Env) => {
      requireOwner(ctx);

      const id = String(args.id);
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

      if (args.content != null) patch.content = String(args.content);
      if (args.type != null) patch.type = String(args.type);
      if (args.status != null) patch.status = String(args.status);
      if (args.priority != null) patch.priority = Number(args.priority);
      if (args.tags != null) patch.tags = (args.tags as string[]).map(String);
      if (args.target_article != null) {
        patch.target_article = String(args.target_article) === 'backlog' ? null : String(args.target_article);
      }

      if (Object.keys(patch).length === 1) {
        throw { code: 400, message: 'No fields to update' };
      }

      const rows = await env.db.update('editorial_notes', [{ column: 'id', op: 'eq', value: id }], patch);
      if (!rows.length) throw { code: 404, message: 'Note not found' };

      return { ...rows[0], message: 'Note updated' };
    },
  },

  {
    name: 'clear_notes',
    description: 'Delete notes by ID, by article, or batch by status. Batch requires confirm=true. Owner only.',
    inputSchema: {
      type: 'object',
      properties: {
        id:             { type: 'string', description: 'Delete a single note by UUID' },
        target_article: { type: 'string', description: 'Delete all notes for this article' },
        status:         { type: 'string', enum: ['used', 'discarded'], description: 'Delete all notes with this status' },
        confirm:        { type: 'boolean', description: 'Confirm batch deletion', default: false },
      },
    },
    handler: async (args, ctx: AuthContext | null, env: Env) => {
      requireOwner(ctx);

      const confirm = Boolean(args.confirm);

      // Mode 1: delete by ID
      if (args.id) {
        const deleted = await env.db.delete('editorial_notes', [{ column: 'id', op: 'eq', value: String(args.id) }]);
        if (!deleted.length) throw { code: 404, message: 'Note not found' };
        return { deleted: 1, message: 'Note deleted' };
      }

      // Build filters for batch
      const filters: Filter[] = [];
      if (args.target_article != null) {
        filters.push({ column: 'target_article', op: 'eq', value: String(args.target_article) });
      }
      if (args.status) {
        filters.push({ column: 'status', op: 'eq', value: String(args.status) });
      }

      if (!filters.length) {
        throw { code: 400, message: 'Provide id, target_article, or status to specify what to delete' };
      }

      const count = await env.db.count('editorial_notes', filters);
      if (count === 0) return { deleted: 0, message: 'No matching notes found' };

      if (!confirm) {
        return {
          preview: true,
          count,
          message: `${count} note(s) will be deleted. Call again with confirm: true to proceed.`,
        };
      }

      await env.db.delete('editorial_notes', filters);
      return { deleted: count, message: `${count} note(s) cleared.` };
    },
  },
];
