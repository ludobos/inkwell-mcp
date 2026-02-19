/**
 * stdio transport for MCP — reads JSON-RPC from stdin, writes to stdout.
 * Supports both Content-Length framed and line-delimited JSON.
 * Compatible with Claude Desktop and other MCP clients.
 */

import type { Env, JsonRpcRequest, JsonRpcResponse, AuthContext } from '../types.js';
import { handleJsonRpc } from '../mcp.js';

export async function startStdioServer(env: Env, ctx: AuthContext | null): Promise<void> {
  // Write a JSON-RPC response to stdout
  function send(response: JsonRpcResponse): void {
    const json = JSON.stringify(response);
    const header = `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n`;
    process.stdout.write(header + json);
  }

  let buffer = '';

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => {
    buffer += chunk;
    processBuffer();
  });

  async function processBuffer(): Promise<void> {
    while (buffer.length > 0) {
      // Try Content-Length framed protocol first
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd !== -1) {
        const header = buffer.slice(0, headerEnd);
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (match) {
          const contentLength = parseInt(match[1], 10);
          const bodyStart = headerEnd + 4;
          const available = buffer.length - bodyStart;
          if (available < contentLength) return; // Wait for more data

          const body = buffer.slice(bodyStart, bodyStart + contentLength);
          buffer = buffer.slice(bodyStart + contentLength);

          await handleMessage(body);
          continue;
        }
      }

      // Fall back to line-delimited JSON
      const lineEnd = buffer.indexOf('\n');
      if (lineEnd === -1) return; // Wait for complete line

      const line = buffer.slice(0, lineEnd).trim();
      buffer = buffer.slice(lineEnd + 1);

      if (line) {
        await handleMessage(line);
      }
    }
  }

  async function handleMessage(body: string): Promise<void> {
    try {
      const req = JSON.parse(body) as JsonRpcRequest;
      const response = await handleJsonRpc(req, ctx, env);
      // Notifications have null id — don't send response
      if (req.id !== null && req.id !== undefined) {
        send(response);
      }
    } catch {
      // Skip malformed messages
    }
  }

  // Keep process alive
  process.stdin.resume();

  // Graceful shutdown
  const cleanup = () => {
    env.db.close();
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}
