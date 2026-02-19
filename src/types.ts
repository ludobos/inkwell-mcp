/** Inkwell MCP — Type definitions */

export interface Env {
  db: DatabaseAdapter;
  config: InkwellConfig;
}

export interface InkwellConfig {
  name: string;
  description: string;
  watermark: string;
  database: {
    type: 'sqlite' | 'supabase';
    path?: string;
    supabaseUrl?: string;
    supabaseKey?: string;
  };
  auth: {
    enabled: boolean;
    ownerKey?: string;
  };
  tagPatterns?: TagPattern[];
}

export interface TagPattern {
  name: string;
  category: string;
  pattern: string;
}

export interface AuthContext {
  role: 'owner' | 'public';
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: object;
  handler: (args: Record<string, unknown>, ctx: AuthContext | null, env: Env) => Promise<unknown>;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// Database adapter types

export interface QueryOptions {
  table: string;
  select?: string[];
  filters?: Filter[];
  order?: OrderBy[];
  limit?: number;
  offset?: number;
}

export interface Filter {
  column: string;
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'is' | 'in' | 'cs';
  value: unknown;
}

export interface OrderBy {
  column: string;
  direction: 'asc' | 'desc';
  nulls?: 'first' | 'last';
}

export type Row = Record<string, unknown>;

export interface DatabaseAdapter {
  query(opts: QueryOptions): Promise<Row[]>;
  queryOne(opts: QueryOptions): Promise<Row | null>;
  insert(table: string, data: Row): Promise<Row>;
  update(table: string, filters: Filter[], data: Row): Promise<Row[]>;
  delete(table: string, filters: Filter[]): Promise<Row[]>;
  count(table: string, filters?: Filter[]): Promise<number>;
  raw(sql: string, params?: unknown[]): Promise<Row[]>;
  close(): void;
}
