/**
 * SINT MCP — Aggregator tests.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ToolAggregator, parseNamespace, makeNamespace, NAMESPACE_SEPARATOR } from "../src/aggregator.js";
import { DownstreamManager } from "../src/downstream.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

describe("Aggregator", () => {
  let downstream: DownstreamManager;
  let aggregator: ToolAggregator;

  beforeEach(() => {
    downstream = new DownstreamManager();
    aggregator = new ToolAggregator(downstream);
  });

  describe("parseNamespace", () => {
    it("parses serverName__toolName correctly", () => {
      const result = parseNamespace("filesystem__readFile");
      expect(result).toEqual({
        serverName: "filesystem",
        toolName: "readFile",
      });
    });

    it("returns undefined for names without separator", () => {
      expect(parseNamespace("readFile")).toBeUndefined();
    });

    it("handles double underscores in tool names", () => {
      const result = parseNamespace("server__tool__sub");
      expect(result).toEqual({
        serverName: "server",
        toolName: "tool__sub",
      });
    });
  });

  describe("makeNamespace", () => {
    it("joins server and tool name with separator", () => {
      expect(makeNamespace("filesystem", "readFile")).toBe("filesystem__readFile");
    });

    it("uses correct separator constant", () => {
      expect(NAMESPACE_SEPARATOR).toBe("__");
    });
  });

  describe("ToolAggregator", () => {
    it("returns empty list when no downstreams", () => {
      const tools = aggregator.listTools();
      expect(tools).toHaveLength(0);
    });

    it("aggregates tools from mock downstream", () => {
      // Add mock connected client
      const mockClient = {} as Client;
      downstream.addConnectedClient("filesystem", mockClient, [
        { name: "readFile", description: "Read a file", inputSchema: { type: "object" } },
        { name: "writeFile", description: "Write a file", inputSchema: { type: "object" } },
      ]);

      const tools = aggregator.refresh();
      expect(tools).toHaveLength(2);
      expect(tools[0]!.name).toBe("filesystem__readFile");
      expect(tools[1]!.name).toBe("filesystem__writeFile");
    });

    it("namespaces tools with server context in description", () => {
      const mockClient = {} as Client;
      downstream.addConnectedClient("github", mockClient, [
        { name: "create_issue", description: "Create an issue", inputSchema: { type: "object" } },
      ]);

      const tools = aggregator.refresh();
      expect(tools[0]!.description).toContain("[github]");
      expect(tools[0]!.description).toContain("Create an issue");
    });

    it("aggregates from multiple servers", () => {
      const mockClient = {} as Client;
      downstream.addConnectedClient("fs", mockClient, [
        { name: "read", inputSchema: { type: "object" } },
      ]);
      downstream.addConnectedClient("db", mockClient, [
        { name: "query", inputSchema: { type: "object" } },
        { name: "insert", inputSchema: { type: "object" } },
      ]);

      const tools = aggregator.refresh();
      expect(tools).toHaveLength(3);

      const names = tools.map((t) => t.name);
      expect(names).toContain("fs__read");
      expect(names).toContain("db__query");
      expect(names).toContain("db__insert");
    });

    it("toMCPToolsList returns MCP-compatible format", () => {
      const mockClient = {} as Client;
      downstream.addConnectedClient("test", mockClient, [
        { name: "hello", description: "Say hello", inputSchema: { type: "object", properties: {} } },
      ]);

      aggregator.refresh();
      const mcpTools = aggregator.toMCPToolsList();
      expect(mcpTools).toHaveLength(1);
      expect(mcpTools[0]).toEqual({
        name: "test__hello",
        description: "[test] Say hello",
        inputSchema: { type: "object", properties: {} },
      });
    });
  });
});
