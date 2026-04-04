# SINT v0.2 Release Notes

## Highlights

- Protocol discovery and schema surfaces:
  - `GET /.well-known/sint.json`
  - `GET /v1/schemas`
  - `GET /v1/schemas/:name`
  - `GET /v1/openapi.json`
- Capability token extensions for model governance and attestation:
  - `modelConstraints`
  - `attestationRequirements`
  - `executionEnvelope`
  - `constraints.quorum`
- Request/evidence execution metadata via `executionContext`.
- Edge control-plane hooks for split deployments:
  - central escalation gating for T2/T3 (`EDGE_CENTRAL_UNAVAILABLE` fail-closed behavior)
  - revocation relay hook
  - evidence replication hook
- Avatar/CSML escalation is now enabled by default in gateway server contexts.
- Industrial interoperability bridges added:
  - `@sint/bridge-mqtt-sparkplug`
  - `@sint/bridge-opcua`
  - `@sint/bridge-open-rmf`
- SDK starters added:
  - `sdks/python/sint_client.py`
  - `sdks/go/sintclient/client.go`
  - `sdks/typescript` (`@sint/sdk`) contract-aligned with gateway v0.2
- Added industrial interoperability conformance fixture:
  - `packages/conformance-tests/src/industrial-interoperability.test.ts`
- Added industrial benchmark scenario fixture set:
  - `packages/conformance-tests/src/industrial-benchmark-scenarios.test.ts`
- Added canonical industrial certification fixtures:
  - `packages/conformance-tests/fixtures/industrial/warehouse-move-equivalence.v1.json`
  - `packages/conformance-tests/fixtures/industrial/opcua-safety-control.v1.json`
  - `packages/conformance-tests/src/canonical-fixtures-conformance.test.ts`
- Added protocol/persistence certification fixtures:
  - `packages/conformance-tests/fixtures/protocol/well-known-sint.v0.2.example.json`
  - `packages/conformance-tests/fixtures/persistence/postgres-adapter-cert.v1.json`
  - `packages/persistence-postgres/src/__tests__/certification-fixtures.test.ts`
- Added security/IoT certification fixtures:
  - `packages/conformance-tests/fixtures/security/supply-chain-verification.v1.json`
  - `packages/conformance-tests/fixtures/iot/mqtt-gateway-session.v1.json`
  - `packages/conformance-tests/src/security-iot-fixtures-conformance.test.ts`
- Hardened `@sint/bridge-iot` session semantics:
  - MQTT publish/subscribe now execute only on gateway `allow`
  - T2/T3 `escalate` responses are fail-closed until approval resolution
- Added edge and compatibility conformance fixtures:
  - `packages/conformance-tests/src/edge-mode-conformance.test.ts`
  - `packages/conformance-tests/src/backward-compatibility-v0-clients.test.ts`
- Added benchmark report generation and CI artifact workflow:
  - `scripts/generate-industrial-benchmark-report.mjs`
  - `.github/workflows/industrial-benchmark-report.yml`

## Deployment Profiles

- `warehouse-amr`
- `industrial-cell`
- `edge-gateway`

Policy templates for these profiles are published in `docs/profiles/`.

## Governance

- SIP process introduced:
  - `docs/SIPS.md`
  - `docs/sips/0000-template.md`
  - `docs/sips/0001-protocol-surface-v0.2.md`
