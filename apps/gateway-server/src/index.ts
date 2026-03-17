/**
 * SINT Gate — Standalone Policy Gateway HTTP Server.
 *
 * Exposes the Policy Gateway as an HTTP API using Hono.
 * This is the entry point for deploying SINT Gate as a service.
 *
 * Endpoints:
 *   POST /v1/intercept    — Submit a request for policy evaluation
 *   POST /v1/tokens       — Issue a new capability token
 *   POST /v1/tokens/revoke — Revoke a capability token
 *   GET  /v1/ledger       — Query the Evidence Ledger
 *   GET  /v1/health       — Health check
 *
 * @module @sint/gateway-server
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import type { SintCapabilityToken, SintRequest } from "@sint/core";
import { sintRequestSchema } from "@sint/core";
import {
  generateKeypair,
  issueCapabilityToken,
  RevocationStore,
} from "@sint/gate-capability-tokens";
import { PolicyGateway } from "@sint/gate-policy-gateway";
import { LedgerWriter, queryLedger } from "@sint/gate-evidence-ledger";

// ── In-memory stores (replaced by PostgreSQL/Redis in production) ──

const tokenStore = new Map<string, SintCapabilityToken>();
const revocationStore = new RevocationStore();
const ledger = new LedgerWriter();

// ── Gateway instance ──

const gateway = new PolicyGateway({
  resolveToken: (id) => tokenStore.get(id),
  revocationStore,
  emitLedgerEvent: (event) => {
    ledger.append({
      eventType: event.eventType as any,
      agentId: event.agentId,
      tokenId: event.tokenId,
      payload: event.payload,
    });
  },
});

// ── HTTP Server ──

const app = new Hono();

// Health check
app.get("/v1/health", (c) => {
  return c.json({
    status: "ok",
    version: "0.1.0",
    protocol: "SINT Gate",
    tokens: tokenStore.size,
    ledgerEvents: ledger.length,
    revokedTokens: revocationStore.size,
  });
});

// Policy interception — THE core endpoint
app.post("/v1/intercept", async (c) => {
  const body = await c.req.json();
  const parsed = sintRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Invalid request", details: parsed.error.issues },
      400,
    );
  }

  const decision = gateway.intercept(parsed.data as SintRequest);

  // Log the request to the ledger
  ledger.append({
    eventType: "request.received",
    agentId: parsed.data.agentId,
    tokenId: parsed.data.tokenId,
    payload: {
      resource: parsed.data.resource,
      action: parsed.data.action,
      decision: decision.action,
    },
  });

  return c.json(decision);
});

// Issue a new capability token
app.post("/v1/tokens", async (c) => {
  const body = await c.req.json();
  const { request, privateKey } = body;

  const result = issueCapabilityToken(request, privateKey);
  if (!result.ok) {
    return c.json({ error: result.error }, 400);
  }

  tokenStore.set(result.value.tokenId, result.value);

  ledger.append({
    eventType: "agent.capability.granted",
    agentId: request.subject,
    tokenId: result.value.tokenId,
    payload: {
      resource: request.resource,
      actions: request.actions,
    },
  });

  return c.json(result.value, 201);
});

// Revoke a capability token
app.post("/v1/tokens/revoke", async (c) => {
  const { tokenId, reason, revokedBy } = await c.req.json();

  if (!tokenId || !reason || !revokedBy) {
    return c.json({ error: "tokenId, reason, and revokedBy are required" }, 400);
  }

  revocationStore.revoke(tokenId, reason, revokedBy);

  const token = tokenStore.get(tokenId);
  ledger.append({
    eventType: "agent.capability.revoked",
    agentId: token?.subject ?? "unknown",
    tokenId,
    payload: { reason, revokedBy },
  });

  return c.json({ status: "revoked", tokenId });
});

// Query the Evidence Ledger
app.get("/v1/ledger", (c) => {
  const agentId = c.req.query("agentId");
  const eventType = c.req.query("eventType") as any;
  const limit = parseInt(c.req.query("limit") ?? "100", 10);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  const events = queryLedger(ledger.getAll(), {
    agentId: agentId ?? undefined,
    eventType: eventType ?? undefined,
    limit,
    offset,
  });

  // Serialize bigint for JSON
  const serialized = events.map((e) => ({
    ...e,
    sequenceNumber: e.sequenceNumber.toString(),
  }));

  return c.json({
    events: serialized,
    total: ledger.length,
    chainIntegrity: ledger.verifyChain().ok,
  });
});

// Generate a keypair (utility endpoint for development)
app.post("/v1/keypair", (c) => {
  const keypair = generateKeypair();
  return c.json(keypair);
});

// ── Start server ──

const PORT = parseInt(process.env["PORT"] ?? "3100", 10);

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`
  ╔═══════════════════════════════════════════════╗
  ║         SINT GATE — Policy Gateway            ║
  ║         Security Wedge for Physical AI        ║
  ╠═══════════════════════════════════════════════╣
  ║  Server:  http://localhost:${info.port}              ║
  ║  Health:  http://localhost:${info.port}/v1/health     ║
  ╚═══════════════════════════════════════════════╝
  `);
});
