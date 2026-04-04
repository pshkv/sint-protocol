/**
 * SINT Protocol TypeScript SDK v0.2
 *
 * Zero-dependency HTTP client for the SINT Protocol gateway.
 * Works in Node.js (18+) and browser environments via fetch.
 *
 * @example
 * const sint = new SintClient({ baseUrl: "http://localhost:3000" });
 * const decision = await sint.intercept({
 *   agentId: "agent-public-key-hex",
 *   tokenId: "uuid-v7",
 *   resource: "ros2:///cmd_vel",
 *   action: "publish",
 *   params: { linear: { x: 0.5 } },
 * });
 *
 * @module @sint/sdk
 */

// ---------------------------------------------------------------------------
// Configuration & Request types
// ---------------------------------------------------------------------------

export interface SintClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}

export interface SintInterceptRequest {
  agentId: string;
  tokenId: string;
  resource: string;
  action: string;
  params?: Record<string, unknown>;
  physicalContext?: {
    currentVelocityMps?: number;
    currentForceNewtons?: number;
    humanDetected?: boolean;
    currentPosition?: { x: number; y: number; z?: number };
  };
  recentActions?: string[];
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface SintDecision {
  action: "allow" | "deny" | "escalate" | "transform";
  assignedTier: string;
  assignedRisk: string;
  denial?: { reason: string; policyViolated: string; suggestedAlternative?: string };
  escalation?: {
    requiredTier: string;
    reason: string;
    timeoutMs: number;
    fallbackAction: string;
  };
  approvalRequestId?: string;
}

export interface SintApproval {
  requestId: string;
  status: "pending" | "approved" | "denied" | "timed_out";
  request: SintInterceptRequest;
  resolution?: {
    status: "approved" | "denied";
    by: string;
    reason?: string;
    resolvedAt: string;
  };
}

export interface SintDiscovery {
  protocol: string;
  version: string;
  bridges: string[];
  profiles: string[];
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

/**
 * SintError is thrown when the gateway returns a 4xx or 5xx response.
 */
export class SintError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SintError";
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build headers for every request. */
function buildHeaders(apiKey: string): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }
  return headers;
}

/** Parse an error body from a failed response and throw SintError. */
async function throwSintError(res: Response): Promise<never> {
  let code = "GATEWAY_ERROR";
  let message = `HTTP ${res.status}`;
  try {
    const body = await res.json() as Record<string, unknown>;
    if (typeof body["code"] === "string") code = body["code"];
    if (typeof body["message"] === "string") message = body["message"];
    else if (typeof body["error"] === "string") message = body["error"];
  } catch {
    // body is not JSON — keep defaults
  }
  throw new SintError(res.status, code, message);
}

// ---------------------------------------------------------------------------
// Main client
// ---------------------------------------------------------------------------

export class SintClient {
  private readonly config: Required<SintClientConfig>;

  constructor(config: SintClientConfig) {
    this.config = {
      baseUrl: config.baseUrl.replace(/\/$/, ""),
      apiKey: config.apiKey ?? "",
      timeoutMs: config.timeoutMs ?? 10_000,
    };
  }

  // -------------------------------------------------------------------------
  // Low-level fetch wrapper
  // -------------------------------------------------------------------------

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    let res: Response;
    try {
      res = await fetch(`${this.config.baseUrl}${path}`, {
        method,
        headers: buildHeaders(this.config.apiKey),
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      await throwSintError(res);
    }

    // 204 No Content — return empty object cast to T
    if (res.status === 204) {
      return undefined as unknown as T;
    }

    return res.json() as Promise<T>;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Fetch the SINT well-known discovery document. */
  async discovery(): Promise<SintDiscovery> {
    return this.request<SintDiscovery>("GET", "/.well-known/sint.json");
  }

  /** Health check — returns gateway status and uptime. */
  async health(): Promise<{ status: string; uptime: number }> {
    return this.request<{ status: string; uptime: number }>("GET", "/v1/health");
  }

  /**
   * Intercept a single agent action.
   *
   * A `requestId` (crypto.randomUUID) is automatically added for tracing.
   */
  async intercept(req: SintInterceptRequest): Promise<SintDecision> {
    const payload = {
      requestId: crypto.randomUUID(),
      ...req,
    };
    return this.request<SintDecision>("POST", "/v1/intercept", payload);
  }

  /** Intercept multiple actions in a single round-trip. */
  async interceptBatch(
    requests: SintInterceptRequest[],
  ): Promise<{ results: SintDecision[] }> {
    return this.request<{ results: SintDecision[] }>("POST", "/v1/intercept/batch", {
      requests,
    });
  }

  /** List approvals currently waiting for human resolution. */
  async pendingApprovals(): Promise<{ approvals: SintApproval[] }> {
    return this.request<{ approvals: SintApproval[] }>("GET", "/v1/approvals/pending");
  }

  /**
   * Resolve a pending approval (approve or deny).
   *
   * @param requestId - The approval request ID to resolve
   * @param resolution - The resolution details
   */
  async resolveApproval(
    requestId: string,
    resolution: { status: "approved" | "denied"; by: string; reason?: string },
  ): Promise<void> {
    return this.request<void>(
      "POST",
      `/v1/approvals/${encodeURIComponent(requestId)}/resolve`,
      resolution,
    );
  }

  /**
   * Retrieve ledger events for audit.
   *
   * @param agentId - Filter by agent (optional)
   * @param limit - Max events to return (default: 100)
   */
  async ledger(agentId?: string, limit = 100): Promise<{ events: unknown[] }> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (agentId) params.set("agentId", agentId);
    return this.request<{ events: unknown[] }>("GET", `/v1/ledger?${params}`);
  }

  /** Fetch all JSON schemas served by the gateway. */
  async schemas(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("GET", "/v1/schemas");
  }

  /**
   * Fetch a single JSON schema by name.
   *
   * @param name - Schema name (e.g. "SintRequest", "PolicyDecision")
   */
  async schema(name: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      "GET",
      `/v1/schemas/${encodeURIComponent(name)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Convenience factory
// ---------------------------------------------------------------------------

/**
 * Create a SintClient instance.
 *
 * @example
 * const sint = createSintClient({ baseUrl: "http://localhost:3000" });
 */
export function createSintClient(config: SintClientConfig): SintClient {
  return new SintClient(config);
}
