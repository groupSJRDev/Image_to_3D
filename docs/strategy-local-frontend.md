# Strategy: Local Frontend — Image → Gemini → Three.js Renderer

## Overview

A locally-hosted web app that accepts an image upload, sends it to the Gemini API with the structured decode prompt, receives a JSON scene description, and renders it interactively in Three.js. Rendered models are persisted to a database and can be composed together into larger multi-model scenes — all running locally via Docker.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    Browser (localhost:3010)                       │
│                                                                  │
│  ┌──────────────┐   ┌──────────────────────────┐  ┌───────────┐ │
│  │  Upload UI   │──▶│   Three.js Scene Canvas  │  │  Model    │ │
│  │  + Status    │   │   (single or composed)   │  │  Library  │ │
│  └──────┬───────┘   └──────────────────────────┘  │  + Scene  │ │
│         │  fetch()                    ▲            │  Composer │ │
└─────────│────────────────────────────│────────────┴───────────┘─┘
          │                            │ JSON scene
          ▼                            │
┌─────────────────────────────────────┴───────────────────────────┐
│              FastAPI Server  (localhost:8010)                    │
│                                                                  │
│  POST /api/render      — image → Gemini → parts JSON            │
│  POST /api/models      — save rendered model to DB              │
│  GET  /api/models      — list stored models                     │
│  GET  /api/models/{id} — fetch a model's parts                  │
│  POST /api/scenes      — create a named scene                   │
│  POST /api/scenes/{id}/instances — place a model in a scene     │
│  PATCH/DELETE …        — update transforms, remove instances     │
└─────────────────────────────┬───────────────────────────────────┘
                              │
               ┌──────────────┴──────────────┐
               │                             │
               ▼                             ▼
      Google Gemini API               SQLite (local)
      (multimodal LLM)               → PostgreSQL (production)
```

**Two Docker containers, no manual process management.** `docker compose up` starts everything.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Backend | FastAPI + Uvicorn | Async, minimal, fits Python ecosystem |
| Frontend framework | React 18 + Vite | Component model suits the multi-panel UI |
| 3D rendering | Three.js v0.160.0 via `@react-three/fiber` | Matches existing examples; R3F handles disposal |
| Styling | Tailwind CSS | Fast to iterate without a design system |
| LLM | Google Gemini (multimodal) | Supports image + text in one API call |
| LLM SDK | `google-generativeai` Python SDK | Official SDK, server-side only |
| Database | SQLModel + SQLite (local) | Lightweight, zero config; `DATABASE_URL` swaps to Postgres |
| Container | Docker + Docker Compose | Single command startup; reproducible environment |

---

## Ports

| Service | Port |
|---|---|
| FastAPI backend | `8010` |
| React / Vite frontend | `3010` |

Vite proxies `/api/*` → `localhost:8010`. The API key never touches the browser.

---

## Component Breakdown

### 1. Backend — `src/renderer/`

**`server.py`** — FastAPI app. Full route list in [code-plan.md](code-plan.md).

**`prompt.py`** — loads `examples/decode_prompt.txt` (read-only, never modified) and appends a strict output-format suffix so Gemini always terminates its response with a fenced JSON block.

**`extractor.py`** — two-pass JSON extractor: finds the last ` ```json ` fence, falls back to regex on failure. Raises `ExtractionError` with the raw response attached so failures are diagnosable.

**`database.py`** — SQLModel engine + session factory. `DATABASE_URL` defaults to `sqlite:///./renderer.db`; set it in `.env` to switch to PostgreSQL.

**`models.py`** — three ORM tables:
- `StoredModel` — parts JSON + metadata for each generated model
- `Scene` — a named collection of model placements
- `SceneInstance` — one model in a scene with its own position/rotation/scale transform

### 2. Frontend — `frontend/src/`

**Upload flow** — `UploadPanel` (drag-and-drop) → `POST /api/render` → parts JSON → `SceneCanvas` renders the model. A "Save to Library" button in the toolbar calls `POST /api/models` to persist it.

**Model Library** — right sidebar. `ModelLibrary` lists all stored models (via `useModels` hook). Each `ModelCard` has "Add to Scene" and delete/rename actions.

**Scene Composer** — below the library. Shows instances in the current composed scene with position/rotation inputs. Calls `PATCH /api/scenes/{id}/instances/{iid}` on change. New/Load/Save scene controls at the top.

**`SceneCanvas`** — R3F Canvas. Two modes:
- *Single model* — renders `ScenePart[]` from a fresh render
- *Composed scene* — renders `SceneInstance[]`, each wrapped in a `ModelGroup` that applies a group-level transform before rendering its parts

**`geometryFactory.ts`** — maps all 8 geometry types (`box`, `cylinder`, `sphere`, `cone`, `torus`, `lathe`, `tube`, `extrude`) to Three.js constructors.

**`DebugPanel`** — collapsible bottom panel. Two tabs: Scene JSON and raw Gemini response text.

---

## Data Flow

### Render a new model
```
1.  User drops image → UploadPanel
2.  Click "Render" → POST /api/render (multipart)
3.  Server: load prompt → call Gemini API → extract JSON
4.  Server returns { parts: [...], raw_response: "..." }
5.  SceneCanvas rebuilds scene from parts[]
6.  User clicks "Save to Library" → POST /api/models { name, parts }
7.  Model appears in ModelLibrary sidebar
```

### Compose a multi-model scene
```
1.  User clicks "Add to Scene" on a ModelCard
2.  POST /api/scenes/{id}/instances { model_id, position, rotation, scale }
3.  SceneInstance returned → SceneComposer adds it to the list
4.  SceneCanvas switches to composed mode: renders ModelGroup per instance
5.  User adjusts position inputs → PATCH /api/scenes/{id}/instances/{iid}
6.  Scene updates live
```

---

## Implementation Phases

| Phase | Scope |
|---|---|
| 1 | Python backend: FastAPI, Gemini integration, prompt + extractor |
| 2 | React frontend: upload UI, SceneCanvas, geometryFactory, debug panel |
| 3 | Docker: `docker-compose.yml`, backend + frontend Dockerfiles |
| 4 | Database: StoredModel, model library routes + UI |
| 5 | Scene composer: Scene + SceneInstance tables, composer routes + UI |

Full per-phase detail in [code-plan.md](code-plan.md).

---

## Key Decisions

| Decision | Rationale |
|---|---|
| API key server-side only | Never exposed in browser JS |
| `decode_prompt.txt` is read-only | Joint chain system is hard-won; the prompt must not be paraphrased |
| Extract JSON from last code fence | Gemini always puts analysis before the JSON block |
| SQLite → Postgres via env var | Zero-config local dev; one-line swap for production |
| Vite dev server in Docker | Local-only tool — hot reload is more useful than a prod build |
| `ModelGroup` wraps each scene instance | Lets the same stored model appear at different positions/rotations in any scene |

**Main risk:** Gemini response JSON may have connectivity issues despite the joint-chain prompt. The debug panel surfaces the raw response so the prompt can be iterated without code changes.

---

## Running Locally

### Docker (recommended)
```bash
docker compose up --build
# Frontend → http://localhost:3010
# Backend  → http://localhost:8010
```

### Without Docker (two terminals)
```bash
# Terminal 1
poetry install && poetry run renderer   # → http://localhost:8010

# Terminal 2
cd frontend && npm install && npm run dev  # → http://localhost:3010
```

`.env` (project root — git-ignored):
```
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.0-pro-exp        # optional
DATABASE_URL=sqlite:///./renderer.db   # swap for postgres:// in production
```

The `.env` file must never be committed — it is listed in `.gitignore`.
