"""SINT Protocol Python client — mirrors TypeScript SDK."""

from __future__ import annotations

import uuid
import time
from datetime import datetime, timezone
from typing import Any

import httpx

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


def _now_iso_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def _uuid_v7() -> str:
    """Generate a UUID v7 (timestamp-ordered)."""
    u = uuid.uuid4()
    ts_ms = int(time.time() * 1000)
    # Encode timestamp into first 6 bytes (48 bits of millisecond timestamp)
    ts_bytes = ts_ms.to_bytes(8, "big")[2:]  # 6 bytes
    b = bytearray(u.bytes)
    b[:6] = ts_bytes
    # Set version to 7
    b[6] = (b[6] & 0x0F) | 0x70
    # Set variant to 10xx
    b[8] = (b[8] & 0x3F) | 0x80
    u2 = uuid.UUID(bytes=bytes(b))
    return str(u2)


class SintClient:
    """Async HTTP client for the SINT Protocol gateway."""

    def __init__(self, config: SintClientConfig) -> None:
        base_url = config.get("baseUrl", "").rstrip("/")
        api_key = config.get("apiKey", "")
        timeout = config.get("timeoutMs", 10_000) / 1000.0

        self._base_url = base_url
        self._api_key = api_key
        self._client = httpx.AsyncClient(
            base_url=base_url,
            timeout=httpx.Timeout(timeout),
            headers=self._build_headers(),
        )

    def _build_headers(self) -> dict[str, str]:
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self._api_key:
            headers["X-API-Key"] = self._api_key
        return headers

    async def _request(
        self, method: str, path: str, body: dict[str, Any] | None = None
    ) -> Any:
        """Low-level request wrapper with error handling."""
        try:
            resp = await self._client.request(method, path, json=body)
        except httpx.TimeoutException:
            raise SintError(504, "TIMEOUT", f"Request to {path} timed out")

        if resp.is_success:
            if resp.status_code == 204:
                return None
            return resp.json()

        # Parse error body
        code = "GATEWAY_ERROR"
        message = f"HTTP {resp.status_code}"
        try:
            err_body = resp.json()
            if isinstance(err_body.get("code"), str):
                code = err_body["code"]
            if isinstance(err_body.get("message"), str):
                message = err_body["message"]
            elif isinstance(err_body.get("error"), str):
                message = err_body["error"]
        except Exception:
            pass

        raise SintError(resp.status_code, code, message)

    async def close(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "SintClient":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()

    # -------------------------------------------------------------------------
    # Public API
    # -------------------------------------------------------------------------

    async def discovery(self) -> SintDiscovery:
        """Fetch the SINT well-known discovery document."""
        return await self._request("GET", "/.well-known/sint.json")

    async def health(self) -> SintHealth:
        """Health check — returns gateway status and uptime."""
        return await self._request("GET", "/v1/health")

    async def intercept(self, req: SintInterceptRequest) -> SintDecision:
        """Intercept a single agent action.

        `requestId` (UUIDv7) and `timestamp` are auto-filled when omitted.
        """
        payload: dict[str, Any] = dict(req)
        if "requestId" not in payload:
            payload["requestId"] = _uuid_v7()
        if "timestamp" not in payload:
            payload["timestamp"] = _now_iso_utc()
        return await self._request("POST", "/v1/intercept", payload)

    async def intercept_batch(
        self, requests: list[SintInterceptRequest]
    ) -> list[SintBatchResult]:
        """Intercept multiple actions in a single round-trip."""
        payload: list[dict[str, Any]] = []
        for req in requests:
            p = dict(req)
            if "requestId" not in p:
                p["requestId"] = _uuid_v7()
            if "timestamp" not in p:
                p["timestamp"] = _now_iso_utc()
            payload.append(p)
        return await self._request("POST", "/v1/intercept/batch", payload)

    async def pending_approvals(self) -> dict[str, Any]:
        """List approvals currently waiting for human resolution."""
        return await self._request("GET", "/v1/approvals/pending")

    async def resolve_approval(
        self,
        request_id: str,
        resolution: dict[str, str],
    ) -> SintApprovalResolutionResponse:
        """Resolve a pending approval (approve or deny)."""
        from urllib.parse import quote
        return await self._request(
            "POST",
            f"/v1/approvals/{quote(request_id, safe='')}/resolve",
            resolution,
        )

    async def ledger(
        self, agent_id: str | None = None, limit: int = 100
    ) -> dict[str, Any]:
        """Retrieve ledger events for audit."""
        params = f"?limit={limit}"
        if agent_id:
            from urllib.parse import quote
            params += f"&agentId={quote(agent_id, safe='')}"
        return await self._request("GET", f"/v1/ledger{params}")

    async def schemas(self) -> SintSchemaIndex:
        """Fetch all JSON schemas served by the gateway."""
        return await self._request("GET", "/v1/schemas")

    async def schema(self, name: str) -> dict[str, Any]:
        """Fetch a single JSON schema by name."""
        from urllib.parse import quote
        return await self._request(
            "GET", f"/v1/schemas/{quote(name, safe='')}"
        )


def create_sint_client(config: SintClientConfig) -> SintClient:
    """Create a SintClient instance.

    Example:
        sint = create_sint_client({"baseUrl": "http://localhost:3000"})
    """
    return SintClient(config)
