import asyncio
import json

from models import ChatOutput

# Calls Claude through the Claude Code CLI in print mode, authenticated with the
# user's Claude subscription (CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`).
BASE_ARGS = ["claude", "-p", "--output-format", "json", "--tools", "", "--no-session-persistence"]


async def run_claude(prompt: str, system_prompt: str, json_schema: dict | None = None) -> dict:
    args = [*BASE_ARGS, "--system-prompt", system_prompt]
    if json_schema:
        args += ["--json-schema", json.dumps(json_schema)]
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate(prompt.encode())
    if proc.returncode != 0:
        raise RuntimeError(f"claude exited {proc.returncode}: {(stdout or stderr).decode()[:500]}")
    result = json.loads(stdout)
    if result.get("is_error"):
        raise RuntimeError(f"claude error: {result.get('result')}")
    return result


def format_conversation(history: list[dict] | None, user_prompt: str) -> str:
    lines = [
        f"{'User' if item['role'] == 'user' else 'Assistant'}: {item['content']}"
        for item in history or []
    ]
    lines.append(f"User: {user_prompt}")
    return "Conversation so far:\n\n" + "\n\n".join(lines) + "\n\nRespond to the last user message."


async def generate_simple_completion(prompt: str) -> str:
    result = await run_claude(prompt, "You are a helpful assistant.")
    return result["result"].strip()


async def generate_structured_chat(
    user_prompt: str,
    system_instruction: str,
    history: list[dict] | None = None,
) -> dict:
    result = await run_claude(
        format_conversation(history, user_prompt),
        system_instruction,
        ChatOutput.model_json_schema(),
    )
    return ChatOutput.model_validate(result["structured_output"]).model_dump()
