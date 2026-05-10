"""Type definitions for the SINT Protocol SDK."""

from __future__ import annotations

from typing import Any, Literal, NotRequired, TypedDict


class SintClientConfig(TypedDict, total=False):
    baseUrl: str
    apiKey: str
    timeoutMs: int


class PhysicalContext(TypedDict, total=False):
    currentVelocityMps: float
    currentForceNewtons: float
    humanDetected: bool
    currentPosition: dict[str, float]  # {"x": 0.0, "y": 0.0, "z": 0.0}


class SintInterceptRequest(TypedDict, total=False):
    requestId: str
    timestamp: str
    agentId: str
    tokenId: str
    resource: str
    action: str
    params: dict[str, Any]
    physicalContext: PhysicalContext
    recentActions: list[str]
    executionContext: dict[str, Any]


class Denial(TypedDict):
    reason: str
    policyViolated: str
    suggestedAlternative: NotRequired[str]


class Escalation(TypedDict):
    requiredTier: str
    reason: str
    timeoutMs: int
    fallbackAction: str


class SintDecision(TypedDict, total=False):
    action: Literal["allow", "deny", "escalate", "transform"]
    assignedTier: str
    assignedRisk: str
    denial: Denial
    escalation: Escalation
    approvalRequestId: str


class ApprovalQuorum(TypedDict):
    required: int
    authorized: list[str]


class SintPendingApproval(TypedDict):
    requestId: str
    reason: str
    requiredTier: str
    resource: str
    action: str
    agentId: str
    fallbackAction: Literal["deny", "safe-stop"]
    approvalQuorum: NotRequired[ApprovalQuorum]
    approvalCount: int
    createdAt: str
    expiresAt: str


class DeploymentProfile(TypedDict):
    name: str
    tier: str


class Bridge(TypedDict):
    name: str
    protocol: str


class SchemaEntry(TypedDict):
    name: str
    path: str


class SintDiscovery(TypedDict):
    name: str
    version: str
    boundary: str
    identityMethods: list[str]
    attestationModes: list[str]
    deploymentProfiles: list[dict[str, Any]]
    supportedBridges: list[dict[str, Any]]
    schemaCatalog: list[SchemaEntry]
    openapi: str


class SintSchemaIndex(TypedDict):
    total: int
    schemas: list[SchemaEntry]


class SintBatchResult(TypedDict, total=False):
    status: int
    decision: SintDecision
    approvalRequestId: str
    error: str
    details: Any


class SintApprovalResolutionResponseResolved(TypedDict):
    requestId: str
    resolution: dict[str, Any]  # {"status": "approved"|"denied", "by": str, "reason": str}


class SintApprovalResolutionResponsePending(TypedDict):
    requestId: str
    status: Literal["pending"]
    requiredApprovals: int
    approvalCount: int


SintApprovalResolutionResponse = (
    SintApprovalResolutionResponseResolved | SintApprovalResolutionResponsePending
)


class SintHealth(TypedDict):
    status: str
    version: str
    protocol: str
    tokens: int
    ledgerEvents: int
    revokedTokens: int
