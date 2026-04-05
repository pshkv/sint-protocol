import pytest
from sint.client import SintClient

@pytest.mark.asyncio
async def test_intercept(httpx_mock):
    httpx_mock.add_response(
        method="POST",
        url="https://api.example.com/intercept",
        json={"decision": "PERMIT", "reason": "OK"},
        status_code=200
    )
    
    client = SintClient("https://api.example.com", "test-key")
    result = await client.intercept({"action": "read"})
    assert result["decision"] == "PERMIT"