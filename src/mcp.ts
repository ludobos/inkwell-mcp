/** JSON-RPC dispatcher + tool registry */

import type { McpTool, AuthContext, Env, JsonRpcRequest, JsonRpcResponse } from './types.js';
import { articleTools } from './tools/articles.js';
import { expertTools } from './tools/experts.js';
import { tagTools } from './tools/tags.js';
import { noteTools } from './tools/notes.js';
import { sourceTools } from './tools/sources.js';
import { briefTools } from './tools/brief.js';
import { statsTools } from './tools/stats.js';
import { importTools } from './tools/import.js';
import { writeTools } from './tools/write.js';

const ALL_TOOLS: McpTool[] = [
  ...articleTools,
  ...expertTools,
  ...tagTools,
  ...noteTools,
  ...sourceTools,
  ...briefTools,
  ...statsTools,
  ...importTools,
  ...writeTools,
];

const TOOL_MAP = new Map<string, McpTool>(ALL_TOOLS.map(t => [t.name, t]));

function mcpError(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function mcpResult(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

export async function handleJsonRpc(
  req: JsonRpcRequest,
  ctx: AuthContext | null,
  env: Env,
): Promise<JsonRpcResponse> {
  const { id, method, params } = req;

  try {
    switch (method) {
      case 'initialize': {
        return mcpResult(id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: {
            name: env.config.name,
            version: '0.1.0',
            description: env.config.description,
          },
        });
      }

      case 'tools/list': {
        const tools = ALL_TOOLS.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        }));
        return mcpResult(id, { tools });
      }

      case 'tools/call': {
        const toolName = params?.name as string;
        const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

        if (!toolName) {
          return mcpError(id, -32602, 'Missing tool name');
        }

        const tool = TOOL_MAP.get(toolName);
        if (!tool) {
          return mcpError(id, -32601, `Unknown tool: ${toolName}`);
        }

        try {
          const result = await tool.handler(toolArgs, ctx, env);
          return mcpResult(id, {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          });
        } catch (err: unknown) {
          if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
            const e = err as { code: number; message: string };
            return mcpError(id, e.code, e.message);
          }
          const message = err instanceof Error ? err.message : String(err);
          return mcpError(id, -32603, `Tool error: ${message}`);
        }
      }

      case 'notifications/initialized':
      case 'ping': {
        return mcpResult(id, {});
      }

      default:
        return mcpError(id, -32601, `Method not found: ${method}`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return mcpError(id, -32603, `Internal error: ${message}`);
  }
}

export { ALL_TOOLS };
