import shutil

import pytest

from ai import generate_simple_completion


async def test_ai_test_endpoint_mock(client, auth, monkeypatch):
    async def mock_completion(prompt: str):
        return "4"

    monkeypatch.setattr("main.generate_simple_completion", mock_completion)

    response = await client.post("/api/ai/test", headers=auth)
    assert response.status_code == 200
    assert response.json()["response"] == "4"
    assert (await client.post("/api/ai/test")).status_code == 401


async def test_ai_test_endpoint_reports_failure(client, auth, monkeypatch):
    async def failing(prompt: str):
        raise RuntimeError("claude exited 1")

    monkeypatch.setattr("main.generate_simple_completion", failing)
    response = await client.post("/api/ai/test", headers=auth)
    assert response.status_code == 500
    assert response.json()["detail"] == "claude exited 1"


async def test_live_claude_completion():
    if not shutil.which("claude"):
        pytest.skip("claude CLI not installed")
    response = await generate_simple_completion("What is 2+2? Return only the digit.")
    assert "4" in response
