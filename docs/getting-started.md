# Getting Started with SINT Protocol

**Enforce every AI agent action in under 5 minutes.**

This guide walks you through installing SINT Protocol, creating a capability token, setting up policy enforcement, and intercepting an MCP tool call — all in ~30 lines of TypeScript.

---

## Prerequisites

- Node.js >= 22
- npm or pnpm

## Install

```bash
npm install @sint/core @sint/gate-capability-tokens @sint/gate-policy-gateway @sint/gate-evidence-ledger @sint/bridge-mcp
```

## 1. Create a Capability Token

Capability tokens are Ed25519-signed permissions that define what an agent can do.

```typescript
import {
  generateKeypair,
  issueCapabilityToken,
  validateCapabilityToken,
  keyToDid,
} from "@sint/gate-capability-tokens";

// Generate an Ed25519 keypair for the agent
const issuerKeys = await generateKeypair();
const agentKeys = await generateKeypair();

// Issue a scoped capability token
const token = await issueCapabilityToken({
  issuerPrivateKey: issuerKeys.privateKey,
  issuerDid: keyToDid(issuerKeys.publicKey),
  subjectDid: keyToDid(agentKeys.publicKey),
  permissions: {
    resources: ["file:///workspace/**"],   // What the agent can access
    actions: ["read", "write"],            // What it can do
    maxTier: 1,                            // Maximum approval tier (T0-T4)
  },
  ttlSeconds: 3600, // Expires in 1 hour
});

console.log("Token issued:", token.id);

// Validate the token
const result = await validateCapabilityToken(token, issuerKeys.publicKey);
console.log("Valid:", result.valid); // true
```

## 2. Set Up the Policy Gateway

The Policy Gateway is the single enforcement point. Every agent action flows through it.

```typescript
import { PolicyGateway } from "@sint/gate-policy-gateway";
import { Tier } from "@sint/core";

const gateway = new PolicyGateway({
  // Resolve tokens from your store (or inline for this example)
  tokenResolver: async (tokenId) => token,

  // Define policy rules
  rules: [
    {
      // Auto-approve read operations (T0)
      match: { actions: ["read"] },
      tier: Tier.T0_OBSERVE,
      approve: "auto",
    },
    {
      // Write operations need review (T1)
      match: { actions: ["write"] },
      tier: Tier.T1_PREPARE,
      approve: "auto",
    },
    {
      // Shell execution requires human approval (T3)
      match: { actions: ["execute"] },
      tier: Tier.T3_COMMIT,
      approve: "human",
    },
  ],

  // Physical constraints (optional — for robotics)
  physicalConstraints: {
    maxVelocity: 1.0,      // m/s
    maxForce: 50,           // Newtons
    geofence: null,         // No geofence for software-only
  },
});
```

## 3. Intercept an MCP Tool Call

The MCP Bridge wraps any MCP server and enforces SINT policy on every tool call.

```typescript
import { MCPInterceptor } from "@sint/bridge-mcp";

const interceptor = new MCPInterceptor({
  gateway,
  // Session tracking for forbidden combo detection
  sessionId: "agent-session-001",
});

// Simulate an MCP tool call from an AI agent
const toolCall = {
  name: "write_file",
  arguments: {
    path: "/workspace/output.txt",
    content: "Hello from a governed agent",
  },
};

// Intercept and evaluate
const decision = await interceptor.intercept({
  tool: toolCall,
  tokenId: token.id,
});

console.log("Decision:", decision.action);  // "allow" | "deny" | "escalate"
console.log("Tier:", decision.tier);         // T1_PREPARE
console.log("Reason:", decision.reason);     // Why this decision was made
```

## 4. Check the Evidence Ledger

Every decision is recorded in a tamper-evident, SHA-256 hash-chained audit log.

```typescript
import { EvidenceLedger } from "@sint/gate-evidence-ledger";

const ledger = new EvidenceLedger();

// The gateway automatically appends decisions, but you can also query:
const entries = await ledger.query({
  sessionId: "agent-session-001",
  limit: 10,
});

for (const entry of entries) {
  console.log(`[${entry.timestamp}] ${entry.action} → ${entry.decision}`);
  console.log(`  Hash: ${entry.hash}`);
  console.log(`  Previous: ${entry.previousHash}`);
  // Each entry's hash includes the previous hash — tamper-evident chain
}

// Verify chain integrity
const integrity = await ledger.verifyChain();
console.log("Chain intact:", integrity.valid); // true
```

## 5. Token Delegation

Agents can delegate scoped permissions to sub-agents — with attenuation only (never escalate).

```typescript
import { delegateCapabilityToken } from "@sint/gate-capability-tokens";

const subAgentKeys = await generateKeypair();

// Agent delegates a subset of its permissions to a sub-agent
const delegatedToken = await delegateCapabilityToken({
  parentToken: token,
  delegatorPrivateKey: agentKeys.privateKey,
  delegateeDid: keyToDid(subAgentKeys.publicKey),
  permissions: {
    resources: ["file:///workspace/output/**"],  // Narrower scope
    actions: ["read"],                           // Read-only (attenuated)
    maxTier: 0,                                  // Lower tier ceiling
  },
  ttlSeconds: 600, // Shorter lifetime
});

// Delegation chain depth is tracked and enforced (max 3 hops)
console.log("Delegation depth:", delegatedToken.delegationDepth); // 1
```

---

## What's Next?

- **[Full API Reference](../packages/core/README.md)** — Types, schemas, and tier constants
- **[Architecture Guide](./architecture.md)** — How all the pieces fit together
- **[Whitepaper](./WHITEPAPER.md)** — Formal specification and security analysis
- **[Conformance Tests](../packages/conformance-tests/)** — Security regression suite
- **[Gateway Server](../apps/gateway-server/)** — HTTP API with approval dashboard

## Approval Tiers

| Tier | Name | Authorization | Use Case |
|------|------|--------------|----------|
| T0 | OBSERVE | Auto-approved, logged | Read files, list directories |
| T1 | PREPARE | Auto-approved, audited | Write files, create branches |
| T2 | ACT | Requires review | Physical movement, API calls |
| T3 | COMMIT | Requires human | Execute code, transfer funds |
| T4 | CRITICAL | Multi-party approval | Safety-critical actuator control |

## Running from Source

If you want to work with the full monorepo:

```bash
git clone https://github.com/sint-ai/sint-protocol
cd sint-protocol
pnpm install
pnpm run build
pnpm run test
```

---

**Questions?** Open an issue on [GitHub](https://github.com/sint-ai/sint-protocol/issues) or join the discussion.
