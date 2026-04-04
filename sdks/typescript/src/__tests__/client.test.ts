/**
 * SINT SDK — Client unit tests.
 *
 * All network I/O is intercepted via vi.spyOn(globalThis, 'fetch').
 * No real HTTP connections are made.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SintClient,
  SintError,
  createSintClient,
  type SintDecision,
  type SintApproval,
  type SintDiscovery,
} from "../index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(status: number, body: unknown): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function mockFetchNoBody(status: number): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, { status }),
  );
}

const BASE_URL = "http://localhost:3000";
let client: SintClient;

beforeEach(() => {
  client = new SintClient({ baseUrl: BASE_URL, apiKey: "test-key" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SintClient", () => {
  // 1. discovery()
  it("discovery() returns protocol metadata", async () => {
    const payload: SintDiscovery = {
      protocol: "SINT",
      version: "0.2",
      bridges: ["mcp", "ros2", "mavlink"],
      profiles: ["industrial", "medical"],
    };
    mockFetch(200, payload);

    const result = await client.discovery();

    expect(result.protocol).toBe("SINT");
    expect(result.version).toBe("0.2");
    expect(result.bridges).toContain("mcp");
  });

  // 2. health()
  it("health() returns status and uptime", async () => {
    mockFetch(200, { status: "ok", uptime: 12345 });

    const result = await client.health();

    expect(result.status).toBe("ok");
    expect(result.uptime).toBe(12345);
  });

  // 3. intercept() — allow
  it("intercept() allow returns decision with assignedTier", async () => {
    const decision: SintDecision = {
      action: "allow",
      assignedTier: "T0_OBSERVE",
      assignedRisk: "LOW",
    };
    mockFetch(200, decision);

    const result = await client.intercept({
      agentId: "agent-key-hex",
      tokenId: "tok-uuid",
      resource: "ros2:///camera/front",
      action: "subscribe",
    });

    expect(result.action).toBe("allow");
    expect(result.assignedTier).toBe("T0_OBSERVE");
  });

  // 4. intercept() — deny with policyViolated
  it("intercept() deny returns denial with policyViolated", async () => {
    const decision: SintDecision = {
      action: "deny",
      assignedTier: "T2_ACT",
      assignedRisk: "HIGH",
      denial: {
        reason: "Speed limit exceeded",
        policyViolated: "MAX_VELOCITY_MPS",
        suggestedAlternative: "Reduce linear.x to ≤1.0",
      },
    };
    mockFetch(200, decision);

    const result = await client.intercept({
      agentId: "agent-key-hex",
      tokenId: "tok-uuid",
      resource: "ros2:///cmd_vel",
      action: "publish",
      params: { linear: { x: 5.0 } },
    });

    expect(result.action).toBe("deny");
    expect(result.denial?.policyViolated).toBe("MAX_VELOCITY_MPS");
    expect(result.denial?.suggestedAlternative).toContain("Reduce");
  });

  // 5. intercept() — server error throws SintError
  it("intercept() server error throws SintError with status and code", async () => {
    // Mock fetch to always return a 500 with a JSON error body
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: "INTERNAL_ERROR", message: "Database unavailable" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );

    let caught: unknown;
    try {
      await client.intercept({
        agentId: "agent-key-hex",
        tokenId: "tok-uuid",
        resource: "ros2:///cmd_vel",
        action: "publish",
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(SintError);
    const err = caught as SintError;
    expect(err.status).toBe(500);
    expect(err.code).toBe("INTERNAL_ERROR");
    expect(err.message).toBe("Database unavailable");
  });

  // 6. interceptBatch() returns array of decisions
  it("interceptBatch() returns array of decisions", async () => {
    const results: SintDecision[] = [
      { action: "allow", assignedTier: "T0_OBSERVE", assignedRisk: "LOW" },
      { action: "deny", assignedTier: "T2_ACT", assignedRisk: "HIGH", denial: { reason: "Forbidden", policyViolated: "ACL" } },
    ];
    const spy = mockFetch(200, { results });

    const response = await client.interceptBatch([
      { agentId: "a", tokenId: "t1", resource: "ros2:///camera", action: "subscribe" },
      { agentId: "a", tokenId: "t2", resource: "ros2:///cmd_vel", action: "publish" },
    ]);

    expect(response.results).toHaveLength(2);
    expect(response.results[0]?.action).toBe("allow");
    expect(response.results[1]?.action).toBe("deny");

    // Verify the correct endpoint was called
    const url = (spy.mock.calls[0]?.[0] as string) ?? "";
    expect(url).toContain("/v1/intercept/batch");
  });

  // 7. pendingApprovals() returns approval list
  it("pendingApprovals() returns approval list", async () => {
    const approvals: SintApproval[] = [
      {
        requestId: "req-1",
        status: "pending",
        request: {
          agentId: "agent-key",
          tokenId: "tok-1",
          resource: "ros2:///arm/gripper",
          action: "publish",
        },
      },
    ];
    mockFetch(200, { approvals });

    const result = await client.pendingApprovals();

    expect(result.approvals).toHaveLength(1);
    expect(result.approvals[0]?.requestId).toBe("req-1");
    expect(result.approvals[0]?.status).toBe("pending");
  });

  // 8. resolveApproval() sends correct payload
  it("resolveApproval() sends correct payload to correct endpoint", async () => {
    const spy = mockFetchNoBody(204);

    await client.resolveApproval("req-abc-123", {
      status: "approved",
      by: "operator-alice",
      reason: "Emergency override",
    });

    expect(spy).toHaveBeenCalledOnce();
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v1/approvals/req-abc-123/resolve");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body["status"]).toBe("approved");
    expect(body["by"]).toBe("operator-alice");
    expect(body["reason"]).toBe("Emergency override");
  });

  // 9. schema(name) fetches specific schema
  it("schema(name) fetches specific schema by name", async () => {
    const schemaBody = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      title: "SintRequest",
      type: "object",
    };
    const spy = mockFetch(200, schemaBody);

    const result = await client.schema("SintRequest");

    expect(result["title"]).toBe("SintRequest");
    const [url] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v1/schemas/SintRequest");
  });

  // 10. createSintClient() convenience function works
  it("createSintClient() convenience function creates a working client", async () => {
    const sint = createSintClient({ baseUrl: BASE_URL });
    expect(sint).toBeInstanceOf(SintClient);

    mockFetch(200, { status: "ok", uptime: 99 });
    const health = await sint.health();
    expect(health.status).toBe("ok");
  });
});
