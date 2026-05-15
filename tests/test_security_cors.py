import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_cors_headers_restricted(async_client: AsyncClient):
    # Test with an arbitrary unauthorized origin
    origin = "http://evil.com"
    response = await async_client.options(
        "/api/status",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
        }
    )

    # It should NOT allow evil.com
    assert response.headers.get("access-control-allow-origin") != origin
    assert response.headers.get("access-control-allow-origin") != "*"

@pytest.mark.asyncio
async def test_cors_headers_allowed(async_client: AsyncClient):
    # Test with an authorized origin
    origin = "http://localhost:8932"
    response = await async_client.options(
        "/api/status",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
        }
    )

    # It should allow localhost:8932
    assert response.headers.get("access-control-allow-origin") == origin
