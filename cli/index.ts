#!/usr/bin/env node

/**
 * Inkwell MCP CLI
 *
 * Usage:
 *   npx inkwell-mcp serve              Start MCP server (stdio)
 *   npx inkwell-mcp serve --db ./my.db  Custom database path
 */

import { resolve } from 'path';
import { SqliteAdapter } from '../src/db/sqlite.js';
import { loadConfig } from '../src/config.js';
import { startStdioServer } from '../src/local/stdio.js';
import { resolveAuth } from '../src/auth.js';
import type { Env } from '../src/types.js';

const args = process.argv.slice(2);
const command = args[0];

function printUsage(): void {
  console.error(`
inkwell-mcp — MCP server for newsletter creators

Commands:
  serve     Start the MCP server (stdio transport)

Options:
  --db <path>       SQLite database path (default: ./data/inkwell.db)
  --name <name>     Server name
  --watermark <wm>  Watermark text

Examples:
  npx inkwell-mcp serve
  npx inkwell-mcp serve --db ./my-newsletter.db
  `);
}

async function main(): Promise<void> {
  if (!command || command === '--help' || command === '-h') {
    printUsage();
    process.exit(0);
  }

  if (command === 'serve') {
    // Parse options
    const dbPath = getOption('--db') ?? './data/inkwell.db';
    const name = getOption('--name');
    const watermark = getOption('--watermark');

    const config = loadConfig({
      ...(name ? { name } : {}),
      ...(watermark ? { watermark } : {}),
      database: { type: 'sqlite', path: resolve(dbPath) },
    });

    // Initialize SQLite
    const db = new SqliteAdapter(resolve(dbPath));
    db.migrate();

    const env: Env = { db, config };
    const ctx = resolveAuth(config.auth.enabled, config.auth.ownerKey);

    console.error(`[inkwell-mcp] Server started (SQLite: ${resolve(dbPath)})`);
    console.error(`[inkwell-mcp] Waiting for MCP client connection via stdio...`);

    await startStdioServer(env, ctx);
  } else {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
  }
}

function getOption(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
