# inkwell-mcp

> **Status: Early stub** — core architecture is in place and type-checks, but not yet fully tested in production. Expect breaking changes. Contributions welcome!

> MCP server for newsletter creators — save sources, organize notes, draft articles with AI.

**Pocket + Notion + AI writing assistant** for anyone who writes a newsletter.

## What it does

- **Save sources** (URLs, PDFs, notes, quotes) — like Pocket used to
- **Organize with auto-tagging** and expert linking
- **Prepare article briefs** from collected notes and sources
- **Import your newsletter** (Substack, Beehiiv, Ghost, Kit)
- **Track stats** (views, open rates, engagement)
- **Draft articles** with AI assistance and voice cloning

Works as an [MCP server](https://modelcontextprotocol.io/) — connects to Claude Desktop, Claude.ai, or any MCP-compatible client.

## Quick start

```bash
# Install
npm install inkwell-mcp

# Start the MCP server (stdio transport)
npx inkwell-mcp serve

# Custom database path
npx inkwell-mcp serve --db ./my-newsletter.db
```

### Connect to Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "inkwell": {
      "command": "npx",
      "args": ["inkwell-mcp", "serve"]
    }
  }
}
```

Then ask Claude: *"List my articles"* or *"Save this source: https://example.com/article"*

## Tools

### Public (read-only)

| Tool | Description |
|------|-------------|
| `list_articles` | List articles with filters (status, type, pagination) |
| `get_article` | Get article by ID or edition number with linked experts |
| `search_articles` | Full-text search across title, subtitle, editorial angle |
| `get_articles_since` | Articles published since a date |
| `list_experts` | List cited experts (filter by tier, country) |
| `get_expert` | Expert details with linked articles |
| `list_tags` | List tags by category |

### Owner (requires auth in hosted mode)

| Tool | Description |
|------|-------------|
| `save_source` | Save a URL as editorial source (deduplicates) |
| `list_sources` | List sources with used/unused indicator |
| `deactivate_source` | Mark source as inactive |
| `mark_source_used` | Track which article used a source |
| `add_note` | Add editorial note (idea, angle, quote, fact, todo, outline) |
| `list_notes` | List notes with filters |
| `update_note` | Update note content, status, priority |
| `clear_notes` | Delete notes (single or batch with confirmation) |
| `prepare_brief` | Generate article brief from notes + sources |
| `get_stats` | Newsletter aggregate statistics |

## Database

Uses **SQLite** by default (zero-config, local file). No external services needed.

```
./data/inkwell.db   # Created automatically on first run
```

## Configuration

Create `inkwell.config.ts` in your project root:

```typescript
export default {
  name: 'My Newsletter',
  description: 'Editorial intelligence for my newsletter',
  watermark: 'Source: My Newsletter | me@example.com',

  database: {
    type: 'sqlite',
    path: './data/newsletter.db',
  },

  auth: { enabled: false },

  tagPatterns: [
    { name: 'AI', category: 'tech', pattern: '\\bAI|artificial intelligence\\b' },
  ],
};
```

## Architecture

```
src/
  mcp.ts          # JSON-RPC dispatcher + tool registry
  types.ts        # TypeScript interfaces
  auth.ts         # Simplified auth (owner/public)
  config.ts       # Config loader
  utils.ts        # Formatting helpers
  db/
    sqlite.ts     # SQLite adapter (better-sqlite3)
    migrations/   # Schema (articles, notes, sources)
  tools/          # MCP tools (articles, experts, tags, notes, sources, brief, stats)
  local/
    stdio.ts      # stdio transport for local use
cli/
  index.ts        # CLI entry point
templates/
  voice/          # Writing style templates
```

## Roadmap

- [ ] Newsletter import connectors (Substack, Beehiiv, Ghost, Kit)
- [ ] Voice/style templates for AI-assisted drafting
- [ ] Browser extension (web clipper)
- [ ] Cloudflare Worker deployment (hosted mode)
- [ ] Supabase adapter for multi-user
- [ ] Semantic search via Vectorize

## License

MIT
