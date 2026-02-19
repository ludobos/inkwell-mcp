# Local Setup

## Prerequisites

- Node.js 18+
- npm

## Install

```bash
npm install inkwell-mcp
```

## Start

```bash
npx inkwell-mcp serve
```

This creates a SQLite database at `./data/inkwell.db` and starts the MCP server using stdio transport.

## Connect to Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json` (or `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

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

## Custom Options

```bash
# Custom database path
npx inkwell-mcp serve --db ./my-newsletter.db

# Custom name
npx inkwell-mcp serve --name "My Newsletter" --watermark "Source: My Newsletter"
```

## What Next

1. Import your existing newsletter: ask Claude to `import_newsletter` from Substack, Beehiiv, Ghost, or Kit
2. Save sources as you research: use `save_source` via Claude or the browser extension
3. Add notes as ideas come to you: use `add_note`
4. When ready to write: `prepare_brief` then `draft_article`
