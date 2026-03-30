import logging
from pathlib import Path

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).parent.parent.parent / "examples" / "decode_prompt.txt"

_OUTPUT_SUFFIX = """

=================================================================
OUTPUT FORMAT (mandatory)
=================================================================
After completing your full analysis above, output ONE code fence:

```json
[ ...parts array here... ]
```

Rules:
- The JSON must be a valid array of part objects.
- No prose, explanation, or commentary after the closing fence.
- The closing fence must be the very last characters in your response.
"""


def validate_prompt_exists() -> None:
    """Call at startup to fail fast if the prompt file is missing."""
    if not _PROMPT_PATH.exists():
        raise FileNotFoundError(
            f"Prompt file not found at {_PROMPT_PATH}. "
            "Ensure the examples/ directory is present."
        )


def load_prompt() -> str:
    text = _PROMPT_PATH.read_text(encoding="utf-8")
    logger.info("Prompt loaded, %d chars", len(text))
    return text + _OUTPUT_SUFFIX
