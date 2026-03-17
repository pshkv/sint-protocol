/**
 * SINT Gateway Server — Server factory.
 *
 * Creates a testable Hono app instance with all routes
 * and middleware configured.
 *
 * @module @sint/gateway-server/server
 */

import { Hono } from "hono";
import type { SintCapabilityToken } from "@sint/core";
import { RevocationStore } from "@sint/gate-capability-tokens";
import { PolicyGateway, ApprovalQueue } from "@sint/gate-policy-gateway";
import { LedgerWriter } from "@sint/gate-evidence-ledger";
import { applyMiddleware } from "./middleware.js";
import { ed25519Auth, apiKeyAuth, rateLimit } from "./middleware/auth.js";
import { structuredLogging } from "./middleware/logging.js";
import { metricsMiddleware, metricsRoutes } from "./middleware/metrics.js";
import { healthRoutes } from "./routes/health.js";
import { interceptRoutes } from "./routes/intercept.js";
import { tokenRoutes } from "./routes/tokens.js";
import { ledgerRoutes } from "./routes/ledger.js";
import { approvalRoutes } from "./routes/approvals.js";

/** Shared server state — injectable for testing. */
export interface ServerContext {
  readonly tokenStore: Map<string, SintCapabilityToken>;
  readonly revocationStore: RevocationStore;
  readonly ledger: LedgerWriter;
  readonly gateway: PolicyGateway;
  readonly approvalQueue: ApprovalQueue;
}

/** Create a default server context with in-memory stores. */
export function createContext(): ServerContext {
  const tokenStore = new Map<string, SintCapabilityToken>();
  const revocationStore = new RevocationStore();
  const ledger = new LedgerWriter();
  const approvalQueue = new ApprovalQueue();

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

  return { tokenStore, revocationStore, ledger, gateway, approvalQueue };
}

/** Server configuration options. */
export interface ServerOptions {
  /** API key for admin endpoints. If unset, admin auth is disabled (dev mode). */
  apiKey?: string;
  /** Enable Ed25519 request signing on agent endpoints. Default: false. */
  requireSignatures?: boolean;
  /** Rate limit: max requests per window. Default: 100. */
  rateLimitMax?: number;
  /** Rate limit: window duration in ms. Default: 60000. */
  rateLimitWindowMs?: number;
}

/** Create a fully configured Hono app. */
export function createApp(ctx?: ServerContext, opts?: ServerOptions): Hono {
  const context = ctx ?? createContext();
  const options = opts ?? {};
  const app = new Hono();

  applyMiddleware(app);

  // Logging & metrics
  app.use("*", structuredLogging());
  app.use("*", metricsMiddleware());

  // Auth middleware (opt-in per config)
  if (options.requireSignatures) {
    app.use("*", ed25519Auth());
  }
  if (options.apiKey) {
    app.use("*", apiKeyAuth(options.apiKey));
  }
  app.use("*", rateLimit(options.rateLimitMax, options.rateLimitWindowMs));

  app.route("", healthRoutes(context));
  app.route("", interceptRoutes(context));
  app.route("", tokenRoutes(context));
  app.route("", ledgerRoutes(context));
  app.route("", approvalRoutes(context));
  app.route("", metricsRoutes());

  return app;
}
