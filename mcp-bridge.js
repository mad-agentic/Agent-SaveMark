#!/usr/bin/env node

/**
 * MCP Bridge for Agent-SaveMark
 * Connects to a remote MCP server (HTTP) and exposes it to Claude Desktop via stdio.
 * 
 * Usage:
 *   node mcp-bridge.js --url http://localhost:4040/mcp --token YOUR_PAT_TOKEN
 */

const http = require('http');
const https = require('https');
const url = require('url');

// Parse command-line arguments
const args = process.argv.slice(2);
let mcpUrl = 'http://localhost:4040/mcp';
let mcpToken = '';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--url' && i + 1 < args.length) {
    mcpUrl = args[i + 1];
  }
  if (args[i] === '--token' && i + 1 < args.length) {
    mcpToken = args[i + 1];
  }
}

if (!mcpToken) {
  console.error('Error: --token is required');
  process.exit(1);
}

console.error(`[MCP Bridge] Connecting to ${mcpUrl} with token ${mcpToken.substring(0, 20)}...`);

/**
 * Forward MCP requests from stdio to the remote HTTP server and back.
 */
let buffer = '';

process.stdin.on('data', (chunk) => {
  buffer += chunk.toString();

  // Process complete JSON-RPC messages (delimited by newlines)
  const lines = buffer.split('\n');
  buffer = lines.pop() || ''; // Keep incomplete line

  for (const line of lines) {
    if (!line.trim()) continue;

    try {
      const request = JSON.parse(line);
      handleJsonRpc(request);
    } catch (e) {
      console.error(`[MCP Bridge] Failed to parse JSON-RPC: ${e.message}`);
    }
  }
});

process.stdin.on('end', () => {
  console.error('[MCP Bridge] stdin closed, exiting');
  process.exit(0);
});

/**
 * Handle a single JSON-RPC request by forwarding to the remote MCP server.
 */
function handleJsonRpc(request) {
  const parsedUrl = url.parse(mcpUrl);
  const protocol = parsedUrl.protocol === 'https:' ? https : http;

  const postData = JSON.stringify(request);

  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port,
    path: parsedUrl.path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'Authorization': `Bearer ${mcpToken}`,
    },
  };

  const req = protocol.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      try {
        const response = JSON.parse(data);
        // Send response back to Claude Desktop via stdout
        console.log(JSON.stringify(response));
      } catch (e) {
        console.error(`[MCP Bridge] Failed to parse response: ${e.message}`);
        console.log(JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32603,
            message: `Failed to parse MCP server response: ${e.message}`,
          },
        }));
      }
    });
  });

  req.on('error', (e) => {
    console.error(`[MCP Bridge] HTTP request failed: ${e.message}`);
    console.log(JSON.stringify({
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32603,
        message: `Failed to connect to MCP server: ${e.message}`,
      },
    }));
  });

  req.write(postData);
  req.end();
}
