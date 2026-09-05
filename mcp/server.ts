#!/usr/bin/env node
/**
 * Leverage MCP server.
 *
 * This is the surface a host model talks to. It is deliberately five tools, not
 * forty: the host is a strategist, and a strategist needs to state an outcome,
 * watch it, stop it, and inspect the evidence. Everything else is Leverage's job.
 *
 * `leverage.run` returns as soon as the mission is admitted. A mission takes
 * minutes; holding a synchronous MCP call open for that long would make the host
 * unusable and would lose all the work if the socket blinked.
 *
 * Install:
 *   claude mcp add leverage -- node <abs-path>/mcp/server.ts
 * or in a host config:
 *   { "mcpServers": { "leverage": { "command": "node", "args": ["<abs>/mcp/server.ts"],
 *     "env": { "LEVERAGE_API_URL": "http://localhost:3000" } } } }
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  CreateMessageRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { API, TOOLS, dispatch } from './tools';

const server = new Server(
  { name: 'leverage', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

// Referenced so the schema import is not dropped; the host is the one that
// implements sampling, we only call it.
void CreateMessageRequestSchema;

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  try {
    const result = await dispatch(name, args as Record<string, unknown>);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    // Surface the failure to the host as content rather than a protocol error, so
    // the strategist can reason about it instead of just seeing a dead tool.
    return {
      isError: true,
      content: [{ type: 'text', text: `leverage error: ${(err as Error).message}` }],
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
// stderr only: stdout is the protocol channel and anything written there corrupts it.
process.stderr.write(`leverage mcp server ready (api ${API})\n`);
