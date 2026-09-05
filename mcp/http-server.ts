#!/usr/bin/env node
/**
 * Leverage MCP over Streamable HTTP.
 *
 * The same five tools as the stdio host, for hosts that connect to a URL rather
 * than spawn a process: a chat application's custom connector, or any client
 * behind a tunnel. Stateless: every request builds a fresh server over the
 * shared tool list, so there is no session table to leak or to lose.
 *
 *   LEVERAGE_API_URL=http://127.0.0.1:3000 MCP_PORT=3200 node --import tsx mcp/http-server.ts
 *   cloudflared tunnel --url http://127.0.0.1:3200     # then add https://<host>/mcp as a connector
 */
import { createServer } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { TOOLS, dispatch } from './tools';

const PORT = Number(process.env.MCP_PORT ?? 3200);

function buildServer(): Server {
  const server = new Server({ name: 'leverage', version: '1.0.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    try {
      const result = await dispatch(name, args as Record<string, unknown>);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `leverage error: ${(err as Error).message}` }] };
    }
  });
  return server;
}

const http = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, tools: TOOLS.map((t) => t.name), api: process.env.LEVERAGE_API_URL ?? 'http://localhost:3000' }));
    return;
  }
  if (url.pathname !== '/mcp') {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('leverage mcp: POST /mcp');
    return;
  }
  // One server and transport per request: stateless, so a tunnel that drops a
  // connection loses nothing but that request.
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = buildServer();
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  let body: unknown = undefined;
  if (req.method === 'POST') {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks).toString('utf8');
    body = raw ? JSON.parse(raw) : undefined;
  }
  await transport.handleRequest(req, res, body);
});

http.listen(PORT, '127.0.0.1', () => {
  process.stderr.write(`leverage mcp (streamable http) on http://127.0.0.1:${PORT}/mcp -> ${process.env.LEVERAGE_API_URL ?? 'http://localhost:3000'}\n`);
});
