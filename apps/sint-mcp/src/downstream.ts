/**
 * SINT MCP — Downstream MCP Connection Manager.
 *
 * Manages connections to multiple downstream MCP servers.
 * Each downstream is connected via the MCP SDK Client and can
 * be queried for tools and called for tool execution.
 *
 * @module @sint/mcp/downstream
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { DownstreamServerConfig } from "./config.js";

/** Tool schema from a downstream MCP server. */
export interface DownstreamTool {
  /** Original tool name on the downstream server. */
  readonly name: string;
  /** Tool description. */
  readonly description?: string;
  /** JSON Schema for the tool's input. */
  readonly inputSchema: Record<string, unknown>;
}

/** Connection status for a downstream server. */
export type ConnectionStatus = "connected" | "connecting" | "disconnected" | "error";

/** Information about a downstream server. */
export interface DownstreamInfo {
  readonly name: string;
  readonly status: ConnectionStatus;
  readonly toolCount: number;
  readonly config: DownstreamServerConfig;
  readonly error?: string;
}

/** A connected downstream server with its client and cached tools. */
interface DownstreamEntry {
  name: string;
  config: DownstreamServerConfig;
  client: Client;
  transport: StdioClientTransport | SSEClientTransport | null;
  tools: DownstreamTool[];
  status: ConnectionStatus;
  error?: string;
  reconnectAttempts: number;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  healthTimer?: ReturnType<typeof setInterval>;
}

/** Max reconnect delay in milliseconds. */
const MAX_RECONNECT_DELAY_MS = 30_000;

/** Health check interval in milliseconds (60s). */
const HEALTH_CHECK_INTERVAL_MS = 60_000;

/**
 * Manages connections to multiple downstream MCP servers.
 *
 * Supports both stdio (spawned process) and SSE (remote HTTP) transports.
 * Automatically reconnects on disconnect with exponential backoff and
 * performs periodic health checks.
 *
 * @example
 * ```ts
 * const manager = new DownstreamManager();
 * await manager.addServer("filesystem", {
 *   command: "npx",
 *   args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
 * });
 *
 * const tools = manager.getAllTools();
 * const result = await manager.callTool("filesystem", "readFile", { path: "/tmp/test.txt" });
 * ```
 */
export class DownstreamManager {
  private readonly servers = new Map<string, DownstreamEntry>();
  private _autoReconnect = true;

  /** Enable or disable automatic reconnection. */
  set autoReconnect(value: boolean) { this._autoReconnect = value; }
  get autoReconnect(): boolean { return this._autoReconnect; }

  /**
   * Add and connect to a downstream MCP server.
   * Supports stdio (command) and SSE (url) transports.
   */
  async addServer(name: string, config: DownstreamServerConfig): Promise<void> {
    if (this.servers.has(name)) {
      throw new Error(`Server "${name}" already exists`);
    }

    const client = new Client(
      { name: `sint-mcp-client-${name}`, version: "0.1.0" },
      { capabilities: {} },
    );

    const entry: DownstreamEntry = {
      name,
      config,
      client,
      transport: null,
      tools: [],
      status: "connecting",
      reconnectAttempts: 0,
    };
    this.servers.set(name, entry);

    try {
      await this.connectEntry(entry);
    } catch (error) {
      entry.status = "error";
      entry.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * Connect (or reconnect) a downstream entry.
   */
  private async connectEntry(entry: DownstreamEntry): Promise<void> {
    const { config, client } = entry;

    if (config.command) {
      // Stdio transport — spawn a child process
      const envVars = config.env
        ? Object.fromEntries(
            Object.entries({ ...process.env, ...config.env })
              .filter((e): e is [string, string] => e[1] !== undefined),
          )
        : undefined;
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args ? [...config.args] : [],
        env: envVars,
      });
      entry.transport = transport;

      // Wire disconnect handler for auto-reconnect
      transport.onclose = () => this.handleDisconnect(entry);

      await client.connect(transport);
    } else if (config.url) {
      // SSE transport — connect to remote HTTP endpoint
      const sseUrl = new URL(config.url);
      const transport = new SSEClientTransport(sseUrl);
      entry.transport = transport;

      // Wire disconnect handler for auto-reconnect
      transport.onclose = () => this.handleDisconnect(entry);

      await client.connect(transport);
    } else {
      throw new Error("Server config must specify either command or url");
    }

    // Fetch tools from the downstream
    const toolsResult = await client.listTools();
    entry.tools = (toolsResult.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown>,
    }));
    entry.status = "connected";
    entry.reconnectAttempts = 0;
    entry.error = undefined;

    // Start health check timer
    this.startHealthCheck(entry);
  }

  /**
   * Handle a downstream disconnect — schedule reconnection.
   */
  private handleDisconnect(entry: DownstreamEntry): void {
    if (!this._autoReconnect) return;
    if (!this.servers.has(entry.name)) return; // already removed

    entry.status = "disconnected";
    this.stopHealthCheck(entry);
    this.scheduleReconnect(entry);
  }

  /**
   * Schedule an automatic reconnection with exponential backoff.
   */
  private scheduleReconnect(entry: DownstreamEntry): void {
    const delay = Math.min(
      1_000 * Math.pow(2, entry.reconnectAttempts),
      MAX_RECONNECT_DELAY_MS,
    );
    entry.reconnectAttempts++;

    entry.reconnectTimer = setTimeout(async () => {
      try {
        // Create a fresh client for reconnection
        entry.client = new Client(
          { name: `sint-mcp-client-${entry.name}`, version: "0.1.0" },
          { capabilities: {} },
        );
        entry.status = "connecting";
        await this.connectEntry(entry);
      } catch (error) {
        entry.status = "error";
        entry.error = error instanceof Error ? error.message : String(error);
        // Schedule another retry
        if (this._autoReconnect && this.servers.has(entry.name)) {
          this.scheduleReconnect(entry);
        }
      }
    }, delay);
  }

  /**
   * Start periodic health checks for a connected entry.
   */
  private startHealthCheck(entry: DownstreamEntry): void {
    this.stopHealthCheck(entry);
    entry.healthTimer = setInterval(async () => {
      if (entry.status !== "connected") return;
      try {
        // Refresh tools as a lightweight health check
        const toolsResult = await entry.client.listTools();
        entry.tools = (toolsResult.tools ?? []).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema as Record<string, unknown>,
        }));
      } catch {
        // Connection is broken — trigger disconnect handler
        this.handleDisconnect(entry);
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  /**
   * Stop health checks for an entry.
   */
  private stopHealthCheck(entry: DownstreamEntry): void {
    if (entry.healthTimer) {
      clearInterval(entry.healthTimer);
      entry.healthTimer = undefined;
    }
  }

  /**
   * Add a pre-connected client (useful for testing).
   */
  addConnectedClient(
    name: string,
    client: Client,
    tools: DownstreamTool[],
    config?: DownstreamServerConfig,
  ): void {
    this.servers.set(name, {
      name,
      config: config ?? {},
      client,
      transport: null,
      tools,
      status: "connected",
      reconnectAttempts: 0,
    });
  }

  /**
   * Remove and disconnect a downstream server.
   * Cleans up reconnection timers, health checks, and transport.
   */
  async removeServer(name: string): Promise<boolean> {
    const entry = this.servers.get(name);
    if (!entry) return false;

    // Clean up timers
    if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
    this.stopHealthCheck(entry);

    try {
      await entry.client.close();
    } catch {
      // Ignore close errors
    }
    this.servers.delete(name);
    return true;
  }

  /**
   * Get all tools from all connected downstream servers.
   * Returns tuples of [serverName, tool].
   */
  getAllTools(): Array<[string, DownstreamTool]> {
    const result: Array<[string, DownstreamTool]> = [];
    for (const entry of this.servers.values()) {
      if (entry.status !== "connected") continue;
      for (const tool of entry.tools) {
        result.push([entry.name, tool]);
      }
    }
    return result;
  }

  /**
   * Call a tool on a specific downstream server.
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ content: Array<{ type: string; text?: string }>; isError?: boolean }> {
    const entry = this.servers.get(serverName);
    if (!entry) {
      return {
        content: [{ type: "text", text: `Server "${serverName}" not found` }],
        isError: true,
      };
    }
    if (entry.status !== "connected") {
      return {
        content: [{ type: "text", text: `Server "${serverName}" is ${entry.status}` }],
        isError: true,
      };
    }

    const result = await entry.client.callTool({ name: toolName, arguments: args });
    return result as { content: Array<{ type: string; text?: string }>; isError?: boolean };
  }

  /**
   * Refresh tools for a specific server.
   */
  async refreshTools(serverName: string): Promise<void> {
    const entry = this.servers.get(serverName);
    if (!entry || entry.status !== "connected") return;

    const toolsResult = await entry.client.listTools();
    entry.tools = (toolsResult.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown>,
    }));
  }

  /**
   * List all servers with their status.
   */
  listServers(): DownstreamInfo[] {
    return Array.from(this.servers.values()).map((entry) => ({
      name: entry.name,
      status: entry.status,
      toolCount: entry.tools.length,
      config: entry.config,
      error: entry.error,
    }));
  }

  /**
   * Get a specific server's config.
   */
  getServerConfig(name: string): DownstreamServerConfig | undefined {
    return this.servers.get(name)?.config;
  }

  /**
   * Check if a server exists.
   */
  hasServer(name: string): boolean {
    return this.servers.has(name);
  }

  /**
   * Get the number of connected servers.
   */
  get size(): number {
    return this.servers.size;
  }

  /**
   * Disconnect all downstream servers and clean up all timers.
   */
  async dispose(): Promise<void> {
    this._autoReconnect = false; // Prevent reconnection during disposal
    const names = Array.from(this.servers.keys());
    await Promise.allSettled(names.map((n) => this.removeServer(n)));
  }
}
