"""SINT Protocol Python SDK.

Zero-dependency (httpx only) async HTTP client for the SINT Protocol gateway.
Mirrors the TypeScript SDK: sdks/typescript/src/index.ts
"""

from .client import SintClient, create_sint_client
from .errors import SintError
from .types import (
    SintClientConfig,
    SintInterceptRequest,
    SintDecision,
    SintPendingApproval,
    SintDiscovery,
    SintSchemaIndex,
    SintBatchResult,
    SintApprovalResolutionResponse,
    SintHealth,
)

__all__ = [
    "SintClient",
    "create_sint_client",
    "SintError",
    "SintClientConfig",
    "SintInterceptRequest",
    "SintDecision",
    "SintPendingApproval",
    "SintDiscovery",
    "SintSchemaIndex",
    "SintBatchResult",
    "SintApprovalResolutionResponse",
    "SintHealth",
]
