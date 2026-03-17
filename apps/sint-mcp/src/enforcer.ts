/**
 * SINT MCP — Policy Enforcement Layer.
 *
 * Every tool call from the upstream MCP client passes through here
 * before reaching any downstream server. The enforcer maps tool calls
 * to SINT requests and routes them through the PolicyGateway.
 *
 * @module @sint/mcp/enforcer
 */

import type { SintRequest, PolicyDecision } from "@sint/core";
import type { PolicyGateway } from "@sint/gate-policy-gateway";
import type { ApprovalQueue } from "@sint/gate-policy-gateway";
import { generateUUIDv7, nowISO8601 } from "@sint/gate-capability-tokens";
import { toResourceUri, toSintAction } from "@sint/bridge-mcp";
import type { MCPToolCall } from "@sint/bridge-mcp";
import type { ParsedNamespace } from "./aggregator.js";
import type { DownstreamManager } from "./downstream.js";

/** Result of enforcing policy on a tool call. */
export interface EnforcementResult {
  /** Whether the call was allowed. */
  readonly allowed: boolean;
  /** The policy decision. */
  readonly decision: PolicyDecision;
  /** If denied, the reason. */
  readonly denyReason?: string;
  /** If escalated, the approval request ID for tracking. */
  readonly approvalRequestId?: string;
  /** The downstream result (only if allowed and forwarded). */
  readonly result?: { content: Array<{ type: string; text?: string }>; isError?: boolean };
}

/**
 * Policy Enforcer — intercepts every tool call through SINT.
 *
 * @example
 * ```ts
 * const enforcer = new PolicyEnforcer(gateway, approvalQueue, downstream, agentId, tokenId);
 * const result = await enforcer.enforce(
 *   { serverName: "filesystem", toolName: "writeFile" },
 *   { path: "/tmp/test.txt", content: "hello" },
 * );
 * if (result.allowed) {
 *   // result.result contains the downstream response
 * }
 * ```
 */
export class PolicyEnforcer {
  private readonly recentActions: string[] = [];

  constructor(
    private readonly gateway: PolicyGateway,
    private readonly approvalQueue: ApprovalQueue,
    private readonly downstream: DownstreamManager,
    private readonly agentId: string,
    private readonly tokenId: string,
  ) {}

  /**
   * Enforce SINT policy on a tool call.
   *
   * Flow:
   * 1. Map tool call to SintRequest
   * 2. PolicyGateway.intercept()
   * 3. allow → forward to downstream
   * 4. deny → return error
   * 5. escalate → enqueue and wait
   */
  async enforce(
    parsed: ParsedNamespace,
    args: Record<string, unknown>,
  ): Promise<EnforcementResult> {
    // Build MCP tool call
    const toolCall: MCPToolCall = {
      callId: generateUUIDv7(),
      serverName: parsed.serverName,
      toolName: parsed.toolName,
      arguments: args,
      timestamp: nowISO8601(),
    };

    // Map to SintRequest
    const sintRequest: SintRequest = {
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: this.agentId,
      tokenId: this.tokenId,
      resource: toResourceUri(toolCall),
      action: toSintAction(toolCall),
      params: args,
      recentActions: [...this.recentActions],
    };

    // Route through PolicyGateway
    const decision = this.gateway.intercept(sintRequest);

    // Record action for combo detection
    this.recentActions.push(`${parsed.serverName}.${parsed.toolName}`);
    if (this.recentActions.length > 20) {
      this.recentActions.shift();
    }

    switch (decision.action) {
      case "allow": {
        // Forward to downstream
        const result = await this.downstream.callTool(
          parsed.serverName,
          parsed.toolName,
          args,
        );
        return { allowed: true, decision, result };
      }

      case "deny": {
        const reason = decision.denial?.reason ?? "Denied by SINT policy";
        return { allowed: false, decision, denyReason: reason };
      }

      case "escalate": {
        // Enqueue for human approval
        const approvalReq = this.approvalQueue.enqueue(sintRequest, decision);
        const reason = decision.escalation?.reason ?? "Requires human approval";

        // Wait for resolution with timeout
        const resolution = await this.waitForResolution(approvalReq.requestId);

        if (resolution === "approved") {
          const result = await this.downstream.callTool(
            parsed.serverName,
            parsed.toolName,
            args,
          );
          return {
            allowed: true,
            decision,
            approvalRequestId: approvalReq.requestId,
            result,
          };
        }

        return {
          allowed: false,
          decision,
          denyReason: `Escalated: ${reason}. Use sint__approve to approve pending actions.`,
          approvalRequestId: approvalReq.requestId,
        };
      }

      case "transform": {
        // Transform actions — apply transformations and forward
        const result = await this.downstream.callTool(
          parsed.serverName,
          parsed.toolName,
          args,
        );
        return { allowed: true, decision, result };
      }

      default: {
        return {
          allowed: false,
          decision,
          denyReason: `Unknown decision action: ${decision.action}`,
        };
      }
    }
  }

  /**
   * Wait for an approval resolution (approve/deny/timeout).
   * Returns immediately if already resolved, otherwise waits.
   */
  private waitForResolution(requestId: string): Promise<"approved" | "denied" | "timeout"> {
    return new Promise((resolve) => {
      // Check if already resolved
      const existing = this.approvalQueue.get(requestId);
      if (!existing) {
        resolve("timeout");
        return;
      }

      // Subscribe to resolution events
      const unsub = this.approvalQueue.on((event) => {
        if (event.type === "resolved" && event.requestId === requestId) {
          unsub();
          if (event.resolution.status === "approved") {
            resolve("approved");
          } else if (event.resolution.status === "denied") {
            resolve("denied");
          } else {
            resolve("timeout");
          }
        }
        if (event.type === "timeout" && event.requestId === requestId) {
          unsub();
          resolve("timeout");
        }
      });
    });
  }
}
