/**
 * SINT MCP — Resources tests.
 */

import { describe, it, expect } from "vitest";
import { getSintResources, readSintResource, type ResourceContext } from "../src/resources/sint-resources.js";
import { DownstreamManager } from "../src/downstream.js";
import { ApprovalQueue } from "@sint/gate-policy-gateway";
import { LedgerWriter } from "@sint/gate-evidence-ledger";
import type { SintCapabilityToken } from "@sint/core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

function createResourceContext(): ResourceContext {
  const downstream = new DownstreamManager();
  const mockClient = {} as Client;
  downstream.addConnectedClient("test-server", mockClient, [
    { name: "tool1", inputSchema: { type: "object" } },
  ]);

  return {
    downstream,
    approvalQueue: new ApprovalQueue(),
    ledger: new LedgerWriter(),
    tokenStore: new Map<string, SintCapabilityToken>(),
  };
}

describe("SINT Resources", () => {
  describe("getSintResources", () => {
    it("returns list of resource definitions", () => {
      const resources = getSintResources();
      expect(resources.length).toBeGreaterThan(0);
      for (const r of resources) {
        expect(r.uri).toBeTruthy();
        expect(r.name).toBeTruthy();
        expect(r.mimeType).toBe("application/json");
      }
    });

    it("includes ledger, tokens, approvals, servers, decisions", () => {
      const resources = getSintResources();
      const uris = resources.map((r) => r.uri);
      expect(uris).toContain("sint://ledger/recent");
      expect(uris).toContain("sint://tokens/active");
      expect(uris).toContain("sint://approvals/pending");
      expect(uris).toContain("sint://servers/list");
      expect(uris).toContain("sint://policy/decisions");
    });
  });

  describe("readSintResource", () => {
    it("reads ledger/recent resource", () => {
      const ctx = createResourceContext();
      ctx.ledger.append({
        eventType: "policy.evaluated" as any,
        agentId: "agent1",
        payload: { test: true },
      });

      const result = readSintResource("sint://ledger/recent", ctx);
      expect(result).toBeDefined();
      expect(result!.contents).toHaveLength(1);

      const data = JSON.parse(result!.contents[0]!.text);
      expect(data).toHaveLength(1);
      expect(data[0].eventType).toBe("policy.evaluated");
    });

    it("reads empty tokens/active resource", () => {
      const ctx = createResourceContext();
      const result = readSintResource("sint://tokens/active", ctx);
      expect(result).toBeDefined();

      const data = JSON.parse(result!.contents[0]!.text);
      expect(data).toEqual([]);
    });

    it("reads approvals/pending resource", () => {
      const ctx = createResourceContext();
      const result = readSintResource("sint://approvals/pending", ctx);
      expect(result).toBeDefined();

      const data = JSON.parse(result!.contents[0]!.text);
      expect(data).toEqual([]);
    });

    it("reads servers/list resource", () => {
      const ctx = createResourceContext();
      const result = readSintResource("sint://servers/list", ctx);
      expect(result).toBeDefined();

      const data = JSON.parse(result!.contents[0]!.text);
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe("test-server");
    });

    it("returns undefined for unknown resource", () => {
      const ctx = createResourceContext();
      const result = readSintResource("sint://nonexistent", ctx);
      expect(result).toBeUndefined();
    });
  });
});
