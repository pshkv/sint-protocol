#!/usr/bin/env node
/**
 * SINT MCP — Entry Point.
 *
 * Security-first multi-MCP proxy server.
 * Connects to multiple downstream MCP servers and enforces
 * SINT policy on every tool call.
 *
 * Usage:
 *   npx @sint/mcp                           # stdio, default config
 *   npx @sint/mcp --sse --port 3200         # SSE remote
 *   npx @sint/mcp --config ./config.json    # custom config
 *
 * @module @sint/mcp
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { SintMCPServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();

  // Banner
  console.error("╔══════════════════════════════════════╗");
  console.error("║   🛡️  SINT MCP — Security Proxy      ║");
  console.error("║   Multi-MCP Policy Enforcement       ║");
  console.error("╚══════════════════════════════════════╝");
  console.error(`  Transport: ${config.transport}`);
  console.error(`  Servers:   ${Object.keys(config.servers).length} configured`);
  console.error(`  Policy:    ${config.defaultPolicy}`);
  console.error("");

  // Create and initialize server
  const sintMCP = new SintMCPServer(config);
  await sintMCP.initialize();

  const identity = sintMCP.getIdentity();
  if (identity) {
    console.error(`  Agent:     ${identity.publicKey.slice(0, 16)}...`);
    console.error(`  Token:     ${identity.defaultToken.tokenId.slice(0, 8)}...`);
  }

  const servers = sintMCP.downstream.listServers();
  const connected = servers.filter((s) => s.status === "connected");
  console.error(`  Connected: ${connected.length}/${servers.length} servers`);

  const totalTools = connected.reduce((sum, s) => sum + s.toolCount, 0);
  console.error(`  Tools:     ${totalTools} aggregated + 9 SINT built-in`);
  console.error("");

  // Connect transport
  if (config.transport === "stdio") {
    const transport = new StdioServerTransport();
    await sintMCP.server.connect(transport);
    console.error("  ✓ Listening on stdio");
  } else {
    // SSE transport — would need @modelcontextprotocol/sdk SSE server transport
    console.error(`  SSE transport on port ${config.port} — not yet implemented`);
    console.error("  Use --stdio for now");
    process.exit(1);
  }

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.error("\n  Shutting down...");
    await sintMCP.dispose();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await sintMCP.dispose();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
