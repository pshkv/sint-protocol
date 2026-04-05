import httpx
from typing import Any, Dict, List, Optional
from .errors import SintError
from .types import PolicyDecision, SintCapabilityToken

class SintClient:
    def __init__(self, base_url: str, api_key: str, timeout: float = 10.0):
        self.base_url = base_url.rstrip("/")
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        self.timeout = timeout

    async def _request(self, method: str, path: str, data: Optional[Dict] = None) -> Any:
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.request(
                method, 
                f"{self.base_url}{path}", 
                json=data, 
                headers=self.headers
            )
            if not response.is_success:
                try:
                    error_data = response.json()
                    raise SintError(
                        response.status_code, 
                        error_data.get("code", "UNKNOWN"), 
                        error_data.get("message", "An error occurred")
                    )
                except Exception:
                    raise SintError(response.status_code, "ERROR", response.text)
            return response.json()

    async def intercept(self, request_data: Dict[str, Any]) -> PolicyDecision:
        return await self._request("POST", "/intercept", data=request_data)

    async def issue_token(self, params: Dict[str, Any]) -> SintCapabilityToken:
        return await self._request("POST", "/tokens", data=params)

    async def revoke_token(self, token_id: str) -> None:
        await self._request("DELETE", f"/tokens/{token_id}")

    async def get_ledger(self, filters: Optional[Dict[str, Any]] = None) -> List[Any]:
        return await self._request("GET", "/ledger", data=filters)

    async def pending_approvals(self) -> List[Any]:
        return await self._request("GET", "/approvals/pending")

    async def resolve_approval(self, request_id: str, approved: bool) -> Any:
        return await self._request("POST", f"/approvals/{request_id}/resolve", data={"approved": approved})

    async def delegate_token(self, parent_token_id: str, params: Dict[str, Any]) -> Any:
        return await self._request("POST", f"/tokens/{parent_token_id}/delegate", data=params)