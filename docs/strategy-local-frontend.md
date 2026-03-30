# Strategy: Local Frontend — Image → Gemini → Three.js Renderer

## Overview

A locally-hosted web app that accepts an image upload, sends it to the Gemini API with the structured decode prompt, receives a JSON scene description, and renders it interactively in Three.js — all in one browser session.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Browser (localhost)               │
│                                                     │
│  ┌──────────────┐    ┌──────────────────────────┐   │
│  │  Upload UI   │───▶│   Three.js Render Panel  │   │
│  │  + Status    │    │   (interactive scene)    │   │
│  └──────┬───────┘    └──────────────────────────┘   │
│         │  fetch()                    ▲              │
└─────────│────────────────────────────│──────────────┘
          │                            │ JSON scene
          ▼                            │
┌─────────────────────────────────────┤
│        FastAPI Server (Python)       │
│        localhost:8000                │
│                                     │
│  POST /render                        │
│   • receives image bytes             │
│   • loads decode_prompt.txt          │
│   • calls Gemini API (multimodal)    │
│   • extracts + validates JSON        │
│   • returns scene JSON               │
└─────────────────┬───────────────────┘
                  │
                  ▼
         Google Gemini API
         (gemini-2.5-pro or configured model)
```

**Single Python process, no database, no build step.** The server serves the HTML frontend as a static file and handles the API proxy call.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Backend | FastAPI + Uvicorn | Async, minimal, already in Python ecosystem |
| Frontend | Vanilla HTML/CSS/JS | No build toolchain; consistent with examples |
| 3D Rendering | Three.js v0.160.0 | Matches existing examples exactly |
| LLM | Google Gemini (multimodal) | Supports image + text in one API call |
| API client | `google-generativeai` Python SDK | Official SDK, handles auth cleanly |

---

## Component Breakdown

### 1. Backend — `src/renderer/server.py`

A FastAPI app with two routes:

**`GET /`**
Serves `frontend/index.html` as a static file.

**`POST /render`**
- Accepts `multipart/form-data` with an image file
- Loads `examples/decode_prompt.txt` (the structured analysis prompt)
- Calls `gemini.generate_content([prompt_text, image_part])`
- Extracts the JSON block from the LLM response (the response will contain analysis text followed by a JSON code fence)
- Validates the JSON is parseable
- Returns `{ "parts": [...] }` to the browser

**`GET /prompt`** *(optional, useful for debugging)*
Returns the current decode prompt text so you can inspect it from the browser.

### 2. Frontend — `src/renderer/frontend/index.html`

A single HTML file with three panels:

**Upload Panel**
- Drag-and-drop or click-to-browse image input
- Image preview
- "Render" button
- Status indicator (idle / loading / error)

**Three.js Render Panel**
- Takes up the bulk of the screen
- Receives the JSON from the server response
- Builds the scene using the same pattern as `example2.html`
- OrbitControls for camera, ground grid, standard lighting rig
- "Reset camera" button

**Debug Panel** *(collapsible)*
- Shows raw JSON returned from API
- Shows any error messages from the server

### 3. Prompt Loader — `src/renderer/prompt.py`

A small utility that loads `examples/decode_prompt.txt` and prepends any runtime instructions (e.g. "Output ONLY a JSON code fence after your analysis — no prose after the JSON block.").

### 4. JSON Extractor — `src/renderer/extractor.py`

Parses the Gemini response text to extract the JSON. The LLM will output analysis followed by a fenced JSON block. Strategy:

1. Find the last ` ```json ` fence in the response
2. Extract content between fences
3. `json.loads()` to validate
4. If that fails, try regex for the outermost `[...]` or `{...}` block as a fallback

---

## Data Flow (step by step)

```
1. User drops image onto Upload Panel
2. Browser previews the image
3. User clicks "Render"
4. Browser POSTs FormData { image: <file> } to localhost:8000/render
5. Server reads image bytes → base64 encodes for Gemini
6. Server builds prompt: decode_prompt.txt + output format instruction
7. Server calls Gemini API → streams or awaits response
8. Server extracts JSON from response text
9. Server returns { "scene": { "parts": [...] } } with HTTP 200
   (or { "error": "...", "raw": "..." } with HTTP 422 on parse failure)
10. Browser receives JSON
11. Browser clears existing Three.js scene
12. Browser iterates parts[], builds geometries, adds to scene
13. Three.js renders the interactive scene
14. User can orbit, inspect, and upload another image
```

---

## Implementation Phases

### Phase 1 — Scaffold & Serve (no LLM yet)
- Add `fastapi` and `uvicorn` to `pyproject.toml`
- Create `src/renderer/server.py` with `GET /` and a stub `POST /render` that returns hardcoded JSON from `example1.html`
- Create `src/renderer/frontend/index.html` with upload UI + Three.js renderer that consumes the stub JSON
- Verify the end-to-end render pipeline works locally before touching the LLM

### Phase 2 — Gemini Integration
- Add `google-generativeai` to `pyproject.toml`
- Create `src/renderer/prompt.py` and `src/renderer/extractor.py`
- Wire `POST /render` to call Gemini with the image and decode prompt
- Test with a known image (one of the bowing-men reference images) and compare output to example1.html

### Phase 3 — Error Handling & UX
- Handle Gemini API errors (rate limit, invalid image, malformed JSON)
- Show a loading spinner during the API call (Gemini can take 10–30s for complex scenes)
- Display the raw LLM response in the debug panel so failures are diagnosable
- Add a retry button

### Phase 4 — Quality of Life
- "Download JSON" button to save the scene description
- "Download HTML" button to produce a standalone file like the examples
- Environment variable config for API key (`GEMINI_API_KEY`) via a `.env` file + `python-dotenv`
- Simple CLI entry point: `poetry run renderer` starts the server

---

## Key Decisions & Risks

| Decision | Rationale |
|---|---|
| API key stays server-side | Never expose the Gemini key in browser JS |
| Single HTML file frontend | No npm, no bundler — stays consistent with examples |
| Reuse `decode_prompt.txt` verbatim | The prompt was hard-won (see agent-memories); don't paraphrase it |
| Extract JSON from last code fence | Gemini tends to put analysis first; the JSON block is always last |
| Three.js served from CDN | Consistent with examples; no local copy to maintain |

**Main risk:** Gemini response JSON may have connectivity errors (floating limbs) despite the joint-chain prompt. Plan: surface raw JSON in debug panel so failures are visible and the prompt can be iterated.

---

## File Layout After Implementation

```
src/renderer/
├── __init__.py
├── server.py          # FastAPI app
├── prompt.py          # Loads + assembles decode prompt
├── extractor.py       # Pulls JSON from LLM response text
└── frontend/
    └── index.html     # Single-file UI + Three.js renderer

examples/
├── decode_prompt.txt  # Source of truth for LLM prompt (read-only)
├── example1.html
└── example2.html
```

---

## Running Locally

```bash
# Install deps
poetry install

# Set API key — create a .env file in the project root:
# GEMINI_API_KEY=your_key_here
cp .env.example .env   # then fill in your key

# Start server
poetry run uvicorn renderer.server:app --reload --port 8000

# Open browser
open http://localhost:8000
```

The server loads `GEMINI_API_KEY` from a `.env` file in the project root via `python-dotenv`. The `.env` file must never be committed — ensure `.env` is in `.gitignore`.
