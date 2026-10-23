import json
import sys

import pytest

import ai


def use_fake_cli(monkeypatch, script: str):
    """Replaces the claude CLI with a Python one-liner so the real subprocess path runs."""
    monkeypatch.setattr(ai, "BASE_ARGS", [sys.executable, "-c", script])


def test_format_conversation():
    history = [{"role": "user", "content": "Hi"}, {"role": "model", "content": "Hello"}]
    text = ai.format_conversation(history, "Next")
    assert text == (
        "Conversation so far:\n\nUser: Hi\n\nAssistant: Hello\n\nUser: Next"
        "\n\nRespond to the last user message."
    )


async def test_run_claude_passes_prompt_and_schema(monkeypatch):
    use_fake_cli(
        monkeypatch,
        "import json, sys; print(json.dumps({'result': sys.stdin.read(), 'args': sys.argv[1:]}))",
    )
    result = await ai.run_claude("the prompt", "the system", {"type": "object"})
    assert result["result"] == "the prompt"
    assert result["args"] == ["--system-prompt", "the system", "--json-schema", json.dumps({"type": "object"})]


async def test_generate_simple_completion_strips_output(monkeypatch):
    use_fake_cli(monkeypatch, "import json; print(json.dumps({'result': '  4\\n'}))")
    assert await ai.generate_simple_completion("2+2?") == "4"


async def test_run_claude_raises_on_nonzero_exit(monkeypatch):
    use_fake_cli(monkeypatch, "import sys; sys.stderr.write('not logged in'); sys.exit(1)")
    with pytest.raises(RuntimeError, match="claude exited 1: not logged in"):
        await ai.run_claude("p", "s")


async def test_run_claude_raises_on_reported_error(monkeypatch):
    use_fake_cli(monkeypatch, "import json; print(json.dumps({'is_error': True, 'result': 'rate limited'}))")
    with pytest.raises(RuntimeError, match="claude error: rate limited"):
        await ai.run_claude("p", "s")


async def test_run_claude_times_out(monkeypatch):
    use_fake_cli(monkeypatch, "import time; time.sleep(10)")
    monkeypatch.setattr(ai, "TIMEOUT_SECONDS", 0.2)
    with pytest.raises(RuntimeError, match="timed out"):
        await ai.run_claude("p", "s")


async def test_generate_structured_chat_validates_output(monkeypatch):
    async def fake(prompt, system_prompt, json_schema=None):
        return {"structured_output": {"message": "ok", "board_update": None}}

    monkeypatch.setattr(ai, "run_claude", fake)
    output = await ai.generate_structured_chat("hi", "system")
    assert output.message == "ok"
    assert output.board_update is None
