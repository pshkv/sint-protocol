"""Tests for SINT Protocol Python SDK."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from sint import SintClient, SintError
from sint.client import _uuid_v7, _now_iso_utc


class TestUuidV7:
    def test_generates_valid_uuid(self):
        u = _uuid_v7()
        parts = u.split("-")
        assert len(parts) == 5
        assert len(parts[0]) == 8
        assert u[14] == "7"

    def test_generates_unique(self):
        uuids = {_uuid_v7() for _ in range(100)}
        assert len(uuids) == 100


class TestNowIsoUtc:
    def test_returns_iso_format(self):
        ts = _now_iso_utc()
        assert "T" in ts
        assert "+00:00" in ts or "Z" in ts


class TestSintError:
    def test_contains_status_code_and_message(self):
        err = SintError(400, "BAD_REQUEST", "Something went wrong")
        assert err.status == 400
        assert err.code == "BAD_REQUEST"
        assert "BAD_REQUEST" in str(err)
        assert "400" in str(err)


class TestSintClient:
    """Test SintClient with mocked httpx.AsyncClient."""

    @pytest.fixture
    def client(self):
        with patch("sint.client.httpx.AsyncClient") as mock_client_cls:
            mock_http = MagicMock()
            mock_client_cls.return_value = mock_http
            c = SintClient({"baseUrl": "http://localhost:3000"})
            c._mock_http = mock_http
            yield c

    def _mock_response(self, client, status=200, json_body=None, is_success=True):
        resp = MagicMock()
        resp.is_success = is_success
        resp.status_code = status
        resp.json.return_value = json_body
        # Make request() return a coroutine-wrapped response
        async def _req(*a, **kw):
            return resp
        client._mock_http.request = _req
        return resp

    @pytest.mark.asyncio
    async def test_discovery(self, client):
        self._mock_response(client, json_body={"name": "sint", "version": "0.2"})
        result = await client.discovery()
        assert result["name"] == "sint"

    @pytest.mark.asyncio
    async def test_health(self, client):
        self._mock_response(client, json_body={"status": "ok", "version": "1.0"})
        result = await client.health()
        assert result["status"] == "ok"

    @pytest.mark.asyncio
    async def test_intercept_auto_fills_ids(self, client):
        self._mock_response(client, json_body={"action": "allow", "assignedTier": "T2"})
        result = await client.intercept({
            "agentId": "test-agent",
            "tokenId": "tok-1",
            "resource": "ros2:///cmd_vel",
            "action": "publish",
        })
        assert result["action"] == "allow"

    @pytest.mark.asyncio
    async def test_intercept_batch(self, client):
        self._mock_response(client, json_body=[
            {"status": 200, "decision": {"action": "allow"}},
            {"status": 200, "decision": {"action": "deny"}},
        ])
        results = await client.intercept_batch([
            {"agentId": "a", "tokenId": "t1", "resource": "r", "action": "x"},
            {"agentId": "b", "tokenId": "t2", "resource": "r", "action": "y"},
        ])
        assert len(results) == 2
        assert results[0]["status"] == 200

    @pytest.mark.asyncio
    async def test_resolve_approval(self, client):
        self._mock_response(client, json_body={
            "requestId": "req-1",
            "resolution": {"status": "approved", "by": "human-1"}
        })
        result = await client.resolve_approval("req-1", {
            "status": "approved", "by": "human-1"
        })
        assert result["requestId"] == "req-1"

    @pytest.mark.asyncio
    async def test_ledger(self, client):
        self._mock_response(client, json_body={"events": []})
        result = await client.ledger(limit=50)
        assert result["events"] == []

    @pytest.mark.asyncio
    async def test_schemas(self, client):
        self._mock_response(client, json_body={"total": 2, "schemas": []})
        result = await client.schemas()
        assert result["total"] == 2

    @pytest.mark.asyncio
    async def test_error_response_raises_sint_error(self, client):
        resp = MagicMock()
        resp.is_success = False
        resp.status_code = 403
        resp.json.return_value = {"code": "FORBIDDEN", "message": "Access denied"}

        async def _req(*a, **kw):
            return resp
        client._mock_http.request = _req

        with pytest.raises(SintError) as exc_info:
            await client.intercept({
                "agentId": "a", "tokenId": "t", "resource": "r", "action": "x"
            })
        assert exc_info.value.status == 403
        assert exc_info.value.code == "FORBIDDEN"

    @pytest.mark.asyncio
    async def test_204_no_content(self, client):
        resp = MagicMock()
        resp.is_success = True
        resp.status_code = 204

        async def _req(*a, **kw):
            return resp
        client._mock_http.request = _req

        result = await client._request("DELETE", "/v1/something")
        assert result is None

    @pytest.mark.asyncio
    async def test_pending_approvals(self, client):
        self._mock_response(client, json_body={"count": 1, "requests": []})
        result = await client.pending_approvals()
        assert result["count"] == 1


def test_create_sint_client():
    with patch("sint.client.httpx.AsyncClient"):
        from sint import create_sint_client
        client = create_sint_client({"baseUrl": "http://localhost:3000"})
        assert isinstance(client, SintClient)
        assert client._base_url == "http://localhost:3000"
