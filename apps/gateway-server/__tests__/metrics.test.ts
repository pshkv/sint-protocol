/**
 * SINT Gateway Server — Metrics tests.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createApp, createContext, type ServerContext } from "../src/server.js";
import type { Hono } from "hono";

describe("Metrics", () => {
  let ctx: ServerContext;
  let app: Hono;

  beforeEach(() => {
    ctx = createContext();
    app = createApp(ctx);
  });

  it("GET /v1/metrics returns Prometheus format", async () => {
    // Generate some requests first
    await app.request("/v1/health");
    await app.request("/v1/keypair", { method: "POST" });

    const res = await app.request("/v1/metrics");
    expect(res.status).toBe(200);

    const body = await res.text();
    expect(body).toContain("sint_requests_total");
    expect(body).toContain("# TYPE sint_requests_total counter");
    expect(body).toContain("sint_approval_queue_size");
    expect(body).toContain("sint_token_operations_total");
  });

  it("metrics track request counts", async () => {
    await app.request("/v1/health");
    await app.request("/v1/health");

    const res = await app.request("/v1/metrics");
    const body = await res.text();
    // Should have counts for /v1/health requests
    expect(body).toContain('method="GET"');
    expect(body).toContain('path="/v1/health"');
  });

  it("metrics include histogram for approvals", async () => {
    const res = await app.request("/v1/metrics");
    const body = await res.text();
    expect(body).toContain("sint_approval_resolution_ms");
    expect(body).toContain("# TYPE sint_approval_resolution_ms histogram");
    expect(body).toContain('le="+Inf"');
  });

  it("metrics content-type is text/plain", async () => {
    const res = await app.request("/v1/metrics");
    const ct = res.headers.get("content-type");
    expect(ct).toContain("text/plain");
  });
});
