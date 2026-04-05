# SINT Protocol: Runtime Authorization for Physical AI

**SINT** (Security, Integrity, Networks, Trust) is an open-source runtime authorization framework for physical AI systems. It enforces capability-based permissions, graduated approval tiers, and cryptographically verifiable audit logging at the boundary between AI agents and physical execution.

## Executive Summary

AI agents are moving from chatbots to robotic controllers. An agent can now:
- Execute shell commands on servers
- Control industrial robots and drones
- Move money via APIs
- Manipulate critical infrastructure

But there is no standard security layer between "the LLM decided to do X" and "X happened." SINT fills this gap.

### The Problem

Classical cybersecurity assumes adversaries *outside* the system trying to break in. Physical AI introduces a new threat model: an *authenticated, aligned agent* issuing a physically irreversible command without appropriate oversight, at the wrong moment, in a degraded environment.

**Empirical evidence:**
- Frontier LLMs exhibit up to **4.8× variation** in out-of-policy action proposal rates on identical safety tasks (ROSClaw, IROS 2026)
- **10 documented MCP breaches** in under 8 months, including a CVSS 9.6 command injection affecting 437,000 users
- **Unitree BLE worm (Sept 2025)**: hardcoded cryptographic keys enabled command injection across robot fleets — exactly the scenario token-based per-agent authorization prevents

Classical robot safety (IEC 62443, ISO 10218) and LLM alignment research both address pieces of this problem, but neither fully captures it: **a system must be both intent-aligned AND enforced at execution time.**

### The Solution

SINT is a **single choke point** through which every agent action flows:

```
Agent → SINT Bridge → PolicyGateway → Allow/Deny/Escalate → Physical Hardware
                            ↓
                      EvidenceLedger (SHA-256 hash-chained audit log)
```

Every action is authorized by a **capability token** — a signed, expiring credential scoped to a specific resource, action, and physical constraint envelope. No token, no action. Token revoked? Action blocked instantly. Bridge adapters exist for MCP, ROS 2, drones (MAVLink), industrial control (OPC-UA, MQTT Sparkplug), and multi-agent coordination (Google A2A).

### Core Guarantees

| Guarantee | Implementation |
|-----------|-----------------|
| **No bypass** | Physical actuation is only reachable from the ACTING state of a deterministic finite automaton, which is only reachable after policy evaluation |
| **Capability confinement** | Tokens are scoped to resource patterns, action sets, and physical constraint envelopes; delegation can only attenuate, never escalate |
| **Tamper evidence** | Every decision is recorded in a SHA-256 hash-chained append-only ledger; a gap or hash mismatch proves tampering |
| **E-stop universality** | A hardware or software emergency stop unconditionally transitions any non-terminal state to ROLLEDBACK |
| **Real-time revocation** | Token revocation is instant (ConsentPass endpoint) and does not require agent restart |

---

## Approval Tiers

Actions are classified into four tiers based on physical consequence severity:

| Tier | Name | Auto-Approved? | Example |
|------|------|---------------|---------
| T0 | OBSERVE | ✅ Yes (logged) | Read sensor, query database |
| T1 | PREPARE | ✅ Yes (audited) | Write file, stage plan |
| T2 | ACT | ⚠️ Requires review | Move robot, publish command |
| T3 | COMMIT | 🔒 Requires human sign-off | Execute trade, enter novel environment, irreversible action |

Tier escalation is dynamic and driven by real-time context:

```
Tier(action) = max(BaseTier(action), Δ_human, Δ_trust, Δ_env, Δ_novelty)
```

**Escalation factors:**
- `Δ_human`: Human in workspace → +1 tier
- `Δ_trust`: Agent trust score low or recent failures → +1 tier
- `Δ_env`: Agent near physical boundary or unstructured environment → +1 tier
- `Δ_novelty`: Action outside validated distribution → +1 tier

Example: A robot with permission to move at 0.5 m/s in a structured warehouse is normally tier T1. If a human walks into the workspace, tier escalates to T2 and requires approval before the same action is allowed.

---

## Technical Architecture

### Packages & Responsibilities

**Core (Security)**
- `@sint/core` — Types, Zod schemas, formal DFA state machine
- `@sint/gate-capability-tokens` — Ed25519 token issuance, delegation, revocation
- `@sint/gate-policy-gateway` — Authorization engine: tier assignment, constraint enforcement, rate limiting
- `@sint/gate-evidence-ledger` — SHA-256 hash-chained audit log

**Bridges (Protocol Integration)**
- `@sint/bridge-mcp` — MCP tool call interception and risk classification
- `@sint/bridge-ros2` — ROS 2 topic/service/action interception
- `@sint/bridge-a2a` — Google A2A multi-agent protocol
- `@sint/bridge-mavlink` — Drone/UAV command bridge
- `@sint/bridge-mqtt-sparkplug` — Industrial IoT command bridge
- `@sint/bridge-opcua` — OPC UA PLC control bridge
- `@sint/bridge-economy` — Economic enforcement (balance, billing, trust)

**Engine (Execution)**
- `@sint/engine-system1` — Perception: sensor fusion, anomaly detection
- `@sint/engine-system2` — Reasoning: planning, behavior trees, system 1/2 arbitration
- `@sint/engine-hal` — Hardware abstraction: auto-detect hardware, select deployment profile
- `@sint/avatar` — Behavioral identity profiles, tier escalation via mood/tone

**Infrastructure**
- `@sint/persistence` — Storage interfaces (in-memory, PostgreSQL, Redis)
- `@sint/dashboard` — Real-time approval UI with operator authentication
- `@sint/gateway-server` — Hono HTTP API (POST /v1/intercept, SSE approvals stream)
- `@sint/client` — TypeScript SDK for gateway integration

**Testing**
- `@sint/conformance-tests` — OWASP Agentic Top 10 regression suite (1,224 tests)

### Request Lifecycle

Every request passes through this deterministic finite automaton:

```
IDLE
  ↓
PENDING (incoming request queued)
  ↓
POLICY_EVAL (token validated, tier assigned, constraints checked)
  ├─ FAIL → FAILED (approval denied, timeout, invalid token)
  ├─ ESCALATING (tier T2+ requires human review)
  │  └→ FAILED (human denied)
  │  └→ AUTHORIZED (human approved)
  └─ AUTHORIZED (auto-approved tier T0/T1 or explicit approval)
  ↓
PLANNING (execution plan staged)
  ↓
OBSERVING/PREPARING/ACTING (execution in progress)
  │
  ├─ ESTOP triggered → ROLLEDBACK (emergency stop, no recovery)
  ├─ Execution error → ROLLEDBACK
  └─ Success → COMMITTING (result recorded to ledger)
     └→ COMPLETED (decision recorded, evidence finalized)
```

The **ACTING** state is only reachable from POLICY_EVAL. Physical actuation is structurally impossible without a valid token. This is not a configuration option — it is baked into the DFA.

### Capability Tokens

A capability token is a signed credential that authorizes a single class of actions.

**Token structure:**
```typescript
{
  id: string;                           // UUIDv7
  issuer: string;                       // Did:key of issuer
  subject: string;                      // Did:key of agent
  issuedAt: number;                     // Unix timestamp
  expiresAt: number;                    // Unix timestamp
  resources: string[];                  // Resource patterns (e.g., "ros2:///cmd_vel")
  actions: string[];                    // Action set (e.g., ["publish"])
  maxTier: number;                      // Tier ceiling (0–4)
  constraints: {
    maxVelocityMps?: number;            // Max velocity in m/s
    maxForcNewtons?: number;            // Max force in Newtons
    geofence?: { polygon: [lat, lng][] }; // No-go zone polygon
    maxRepetitionsPerWindow?: number;   // Rate limit
  };
  delegationChain: string[];            // Parent token IDs (max 3 hops)
  signature: string;                    // Ed25519 signature
}
```

**Key properties:**
- **Signed:** Ed25519 cryptographic signature. Tokens are unforgeable.
- **Scoped:** Resource patterns prevent over-broad access. A token for `ros2:///cmd_vel` cannot be used for `ros2:///shutdown`.
- **Attenuable:** Delegated tokens can only reduce permissions, never escalate (invariant I-T1).
- **Revocable:** Instant revocation via ConsentPass endpoint. No restart required.
- **Constraint-carrying:** Physical limits (velocity, force, geofence) live in the token, not in external configuration.

---

## Compliance & Safety

### OWASP Agentic Top 10 (2024)

SINT provides full or partial coverage of 10 agentic security vulnerabilities:

| Vulnerability | Coverage | SINT Mechanism |
|---|---|---|
| ASI01 — Goal hijack | ✅ Full | GoalHijackPlugin (5-layer detection: prompt injection, role override, semantic escalation, exfiltration, cross-agent) |
| ASI02 — Tool misuse | ✅ Full | MCP bridge with tool-use risk classification; shell/exec tools auto-escalated to T3 |
| ASI03 — Identity abuse | ✅ Full | W3C DID identity, Ed25519 signature verification, per-agent tokens |
| ASI04 — Supply chain | ✅ Full | DefaultSupplyChainVerifier: validates tool checksums, model fingerprints, model ID allowlists |
| ASI05 — Code execution | ⚠️ Partial | Code-execution tool names (bash, exec, eval) auto-escalate to T3; full sandbox pending |
| ASI06 — Memory poisoning | ⚠️ Partial | MemoryIntegrityChecker detects replay, privilege escalation, history overflow; full protocol hardening in progress |
| ASI07 — Inter-agent | ✅ Full | A2A bridge with per-message capability scoping; multi-agent token chains |
| ASI08 — Cascade | ✅ Full | CircuitBreakerPlugin: auto-trip after N denials or CSML threshold exceeded |
| ASI09 — Trust exploitation | ✅ Full | Trust-aware tier escalation; real-time trust score integration |
| ASI10 — Rogue agent | ✅ Full | Instant revocation; circuit breaker; behavioral anomaly detection via CSML |

### Standards Alignment

**IEC 62443 (Industrial Cybersecurity):**
- FR1 (Identification & Authentication) — DID identity + Ed25519
- FR2 (Use Control) — Tier-based approval gates
- FR3 (System Integrity) — SHA-256 hash-chained ledger
- FR4 (Data Confidentiality) — Zenoh TLS transport
- FR5 (Restricted Data Flow) — Policy allowlists per resource
- FR6 (Timely Response) — E-stop universality invariant
- FR7 (Resource Availability) — Per-token rate limiting

**EU AI Act Article 13 (Transparency & Oversight):**
- Logging and traceability — EvidenceLedger (tamper-evident)
- Human oversight — T2/T3 approval gate; human review is mandatory for risky actions
- Risk management — Dynamic tier escalation based on context

**NIST AI RMF:**
- Govern (risk categorization) — Tier-based consequence classification
- Measure (performance evaluation) — CSML (Composite Safety-Model Latency)
- Manage (incident response) — CircuitBreakerPlugin, instant revocation

---

## Formal Properties

### State Machine Invariants

| Invariant | Property | Proof |
|---|---|---|
| **I-T1** (Attenuation) | `scope(child_token) ⊆ scope(parent_token)` — delegation never escalates | Enforced in `delegateCapabilityToken()`: each delegated token is validated against parent scope |
| **I-T2** (Unforgeability) | Tokens are Ed25519-signed; no token is valid without cryptographically correct signature | Every `validateCapabilityToken()` call verifies `signature = Ed25519(sha256(token_payload), issuer_publicKey)` |
| **I-T3** (Physical Constraint Primacy) | Physical constraints in a token cannot be weakened by downstream layers | Constraints are enforced before bridge-specific logic in `PolicyGateway.intercept()` |
| **I-G1** (No Bypass) | Physical actuation is only reachable from ACTING state, which is only reachable via POLICY_EVAL | DFA transitions are hardcoded; `actuation()` is only called in ACTING state |
| **I-G2** (E-stop Universality) | `estop` event unconditionally transitions any non-terminal state to ROLLEDBACK | E-stop check is the first operation in the request handler |
| **I-G3** (Ledger Primacy) | COMMITTING → COMPLETED requires `ledger_committed`; no action completes without a ledger record | Completion is blocked until `EvidenceLedger.append()` succeeds |

### Threat Model

**Out of scope:**
- Supply-chain attacks on SINT itself (code review + signed releases mitigate)
- Quantum cryptanalysis (Ed25519 is post-quantum safe per NIST)
- Physical tampering (TEE attestation planned for T2+ decisions)
- Side-channel attacks on signature verification

**In scope — detected and enforced:**
- Token forgery (cryptographic signature requirement)
- Token replay (UUIDv7 + session context)
- Privilege escalation (attenuation-only delegation)
- Revocation bypass (instant ConsentPass endpoint)
- Decision tampering (SHA-256 hash chain)
- Behavioral drift (CSML anomaly detection)
- Multi-agent Byzantine coordination (SwarmCoordinator planned)

---

## Deployment & Operations

### Quick Start

```bash
# Prerequisites: Node.js 22+, pnpm 9+
git clone https://github.com/pshkv/sint-protocol
cd sint-protocol
pnpm install
pnpm run build
pnpm run test  # 1,224 tests

# Start the gateway
pnpm --filter @sint/gateway-server dev
# → http://localhost:3100/v1/health

# Start the approval dashboard
pnpm --filter @sint/dashboard dev
# → http://localhost:3201
```

### Production Deployment

Docker Compose with PostgreSQL and Redis:

```bash
docker-compose up
# Gateway:   http://localhost:3100
# Dashboard: http://localhost:3201
```

Railway deployment:

```bash
railway login
./scripts/railway-setup.sh
railway variables --set SINT_STORE=postgres SINT_CACHE=redis
railway up
```

### Monitoring & Observability

**Prometheus metrics** at `GET /v1/metrics`:
- `sint_policy_decisions_total` — cumulative decisions by tier
- `sint_approval_latency_ms` — human approval response time
- `sint_token_delegations_total` — delegation chain depth
- `sint_circuit_breaker_trips_total` — safety events triggered

**Evidence Ledger queries** at `GET /v1/ledger`:
```bash
# Query decisions by session
curl http://localhost:3100/v1/ledger \
  -X GET \
  -H "Authorization: Bearer $API_KEY" \
  --data '{"sessionId": "agent-001", "tier": 3}'

# Export to syslog/CEF for SIEM integration
curl http://localhost:3100/v1/ledger/export \
  -X POST \
  --data '{"format": "syslog", "filter": {"tier": 2, "decision": "deny"}}'
```

---

## Research Directions (2026–2031)

### Swarm Coordination Safety
Multi-agent systems introduce emergent behaviors not captured by per-agent tokens. Planned: SwarmToken with collective constraints (max density, inter-agent distance, total kinetic energy).

### Formal Verification
Planned: Formal specification in TLA+/Alloy with machine-checked proofs of I-G1, I-G2, I-G3 invariants.

### TEE Integration
Planned: Intel SGX / ARM TrustZone attestation for T2+ decisions, with proof receipts for compliance audits.

### Quantum Safety
Post-quantum signature schemes (CRYSTALS-Dilithium) under evaluation; migration path planned for 2027.

### Behavioral Modeling
CSML (Composite Safety-Model Latency) is currently heuristic. Planned: Probabilistic behavioral models with Bayesian inference over agent drift.

---

## References

- **ROSClaw:** Cardenas et al., "Empirical Safety Analysis of LLM-Controlled Physical AI," IROS 2026
- **MCP Security:** "Architectural Vulnerabilities in the Model Context Protocol," arXiv:2601.17549
- **IEC 62443:** Industrial Automation and Control Systems Cybersecurity
- **EU AI Act Article 13:** Transparency Requirements for AI Systems
- **NIST AI RMF:** AI Risk Management Framework
- **OWASP Agentic Top 10:** Agentic AI Security Vulnerabilities (2024)
- **W3C DID Core:** Decentralized Identifiers Specification

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contributor guidelines.

For agent contributors (Claude, GPT, Gemini), see [AGENTS.md](AGENTS.md) for protocol-specific patterns and anti-patterns.

## License

Apache-2.0
