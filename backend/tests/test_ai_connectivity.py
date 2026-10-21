import shutil
import pytest
from httpx import ASGITransport, AsyncClient
from ai import generate_simple_completion
from main import app


@pytest.mark.asyncio
async def test_ai_test_endpoint_mock(monkeypatch):
    async def mock_completion(prompt: str):
        return "4"

    monkeypatch.setattr("main.generate_simple_completion", mock_completion)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/ai/test")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["response"] == "4"


@pytest.mark.asyncio
async def test_live_claude_completion():
    if not shutil.which("claude"):
        pytest.skip("claude CLI not installed")
    response = await generate_simple_completion("What is 2+2? Return only the digit.")
    assert "4" in response
