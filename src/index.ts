/** Inkwell MCP — Entry point */

export { handleJsonRpc, ALL_TOOLS } from './mcp.js';
export { SqliteAdapter } from './db/sqlite.js';
export { loadConfig } from './config.js';
export { startStdioServer } from './local/stdio.js';
export { resolveAuth } from './auth.js';
export type { InkwellConfig } from './config.js';
export type {
  McpTool,
  AuthContext,
  Env,
  DatabaseAdapter,
  QueryOptions,
  Filter,
  Row,
  JsonRpcRequest,
  JsonRpcResponse,
} from './types.js';
