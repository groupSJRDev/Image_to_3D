from pathlib import Path

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


def load_prompt() -> str:
    text = _PROMPT_PATH.read_text(encoding="utf-8")
    return text + _OUTPUT_SUFFIX
