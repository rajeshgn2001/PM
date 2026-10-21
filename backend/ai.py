import json
import os
from pathlib import Path
import re
import httpx

CANDIDATE_MODELS = [
    "gemini-3.8-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-flash-latest",
]
API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"


def parse_json_response(raw_text: str) -> dict:
    cleaned = raw_text.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()

    try:
        return json.loads(cleaned)
    except Exception:
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise


def get_api_key() -> str:
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        env_file = Path(__file__).resolve().parent.parent / ".env"
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.startswith("GEMINI_API_KEY="):
                    key = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    return key or ""


async def generate_simple_completion(prompt: str) -> str:
    key = get_api_key()
    if not key:
        raise ValueError("GEMINI_API_KEY not configured")

    payload = {
        "contents": [
            {
                "parts": [{"text": prompt}]
            }
        ]
    }

    last_err = None
    async with httpx.AsyncClient(timeout=15.0) as client:
        for model in CANDIDATE_MODELS:
            url = f"{API_BASE_URL}/models/{model}:generateContent?key={key}"
            try:
                response = await client.post(url, json=payload)
                if response.status_code == 200:
                    data = response.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        for part in parts:
                            text = part.get("text")
                            if text:
                                return text.strip()
                last_err = Exception(f"HTTP {response.status_code}: {response.text}")
            except Exception as e:
                last_err = e
                continue

    if last_err:
        raise last_err
    return ""


async def generate_structured_chat(
    user_prompt: str,
    system_instruction: str,
    history: list[dict] | None = None,
) -> dict:
    key = get_api_key()
    if not key:
        raise ValueError("GEMINI_API_KEY not configured")

    contents = []
    if history:
        for item in history:
            role = "user" if item.get("role") == "user" else "model"
            contents.append({"role": role, "parts": [{"text": item.get("content", "")}]})

    contents.append({"role": "user", "parts": [{"text": user_prompt}]})

    payload = {
        "systemInstruction": {
            "parts": [{"text": system_instruction}]
        },
        "contents": contents,
        "generationConfig": {
            "responseMimeType": "application/json",
        },
    }

    last_err = None
    fallback_text = None
    async with httpx.AsyncClient(timeout=20.0) as client:
        for model in CANDIDATE_MODELS:
            url = f"{API_BASE_URL}/models/{model}:generateContent?key={key}"
            try:
                response = await client.post(url, json=payload)
                if response.status_code == 200:
                    data = response.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        for part in parts:
                            text = part.get("text")
                            if text:
                                fallback_text = text.strip()
                                try:
                                    return parse_json_response(fallback_text)
                                except Exception:
                                    continue
                last_err = Exception(f"HTTP {response.status_code}: {response.text}")
            except Exception as e:
                last_err = e
                continue

    if fallback_text:
        return {"message": fallback_text, "board_update": None}
    if last_err:
        raise last_err
    return {"message": "No response generated", "board_update": None}
