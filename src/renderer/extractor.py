import json
import re


class ExtractionError(Exception):
    def __init__(self, message: str, raw_response: str):
        super().__init__(message)
        self.raw_response = raw_response


def extract_scene_json(response_text: str) -> dict:
    """
    Pull the JSON parts array out of a Gemini response.

    Strategy:
      1. Find the last ```json fence and extract its contents.
      2. Fallback: grab the last top-level [ ... ] or { ... } block via regex.
      3. Both fail → raise ExtractionError with the raw response attached.

    Always returns {"parts": [...]}.
    """
    # Pass 1 — last ```json fence
    fence_matches = list(re.finditer(r"```json\s*([\s\S]*?)```", response_text))
    if fence_matches:
        candidate = fence_matches[-1].group(1).strip()
        parsed = _try_parse(candidate)
        if parsed is not None:
            return _normalise(parsed)

    # Pass 2 — last bare JSON array or object
    array_matches = list(re.finditer(r"(\[[\s\S]*?\]|\{[\s\S]*?\})", response_text))
    if array_matches:
        candidate = array_matches[-1].group(1).strip()
        parsed = _try_parse(candidate)
        if parsed is not None:
            return _normalise(parsed)

    raise ExtractionError(
        "Could not extract valid JSON from model response",
        raw_response=response_text,
    )


def _try_parse(text: str):
    try:
        return json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return None


def _normalise(parsed) -> dict:
    if isinstance(parsed, list):
        return {"parts": parsed}
    if isinstance(parsed, dict):
        if "parts" in parsed:
            return parsed
        # Some responses wrap in {"objects": [...]} or similar
        for key, val in parsed.items():
            if isinstance(val, list):
                return {"parts": val}
    return {"parts": []}
