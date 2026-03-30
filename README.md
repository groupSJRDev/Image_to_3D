# VML 3D Renderer

An LLM-powered pipeline that converts images into interactive 3D scenes. Upload a photo, and the system uses Google's Gemini API to analyze it, decompose it into geometric primitives, and render an interactive Three.js scene in the browser.

## How It Works

```
Image (upload) --> Gemini API --> JSON scene description --> Three.js render
```

1. **Upload** an image through the browser UI
2. The backend sends the image to the **Gemini API** along with a structured prompt (`decode_prompt.txt`) that guides the LLM through a multi-phase analysis: identify objects, measure real-world dimensions, decompose into geometric parts, and map joint chains for articulated figures
3. The LLM returns a **JSON scene description** — a flat array of parts, each with a geometry type, dimensions, position, rotation, and color
4. The backend **extracts** valid JSON from the LLM response (last-fence strategy with regex fallback) and returns it to the frontend
5. The frontend **renders** the scene using React Three Fiber with interactive orbit controls, wireframe overlays, and a ground grid

The system supports two modes:

- **Single render** (Stage 1): upload an image, get a 3D model
- **Model library + scene composer** (Stage 2): save models to a database, place them in named scenes with independent transforms

## Architecture

```
frontend/                          src/renderer/
+-----------------------+          +-------------------------+
| React 19 + Vite 8     |  /api/*  | FastAPI + Uvicorn       |
| React Three Fiber 9   | ------> | Gemini API integration  |
| Three.js 0.183        |  proxy   | SQLModel + SQLite       |
| Tailwind CSS 4        |          | JSON extraction engine  |
+-----------------------+          +-------------------------+
       :3010                              :8010
```

Both services run in Docker containers via `docker compose`.

### Backend (`src/renderer/`)

| File | Purpose |
|------|---------|
| `server.py` | FastAPI app — all routes, CORS, lifespan, rate limiting |
| `prompt.py` | Loads `decode_prompt.txt`, appends runtime suffix for JSON output |
| `extractor.py` | Two-pass JSON extraction from LLM responses (last fence, then regex fallback) |
| `database.py` | SQLModel engine init, session dependency |
| `models.py` | `StoredModel`, `Scene`, `SceneInstance` ORM tables |

### Frontend (`frontend/src/`)

| File | Purpose |
|------|---------|
| `App.tsx` | Top-level state, layout, render/save/compose flow |
| `api.ts` | Typed fetch wrappers for all `/api/*` endpoints |
| `types.ts` | `ScenePart`, `StoredModel`, `SceneInstance` TypeScript interfaces |
| `three/SceneCanvas.tsx` | R3F Canvas — renders parts (single mode) or instances (composed mode) |
| `three/ScenePart.tsx` | Mesh + wireframe overlay for one geometric part |
| `three/ModelGroup.tsx` | Group-level transform wrapping ScenePart children |
| `three/geometryFactory.ts` | Maps `ScenePart` to `THREE.BufferGeometry` (8 geometry types) |
| `three/resolveColor.ts` | Label-pattern to material color override (skin, hair, clothing) |
| `three/Lighting.tsx` | Ambient + 4 directional lights (key, fill, rim, bottom-fill) |
| `three/GroundGrid.tsx` | Minor/major grid lines + red X axis, blue Z axis |
| `components/UploadPanel.tsx` | Drag-and-drop image upload + render button |
| `components/StatusBar.tsx` | Idle / loading / success / error indicator |
| `components/ToolBar.tsx` | Save model, download JSON, download HTML |
| `components/DebugPanel.tsx` | Collapsible panel: Scene JSON and Raw LLM response tabs |
| `components/ModelLibrary.tsx` | Stored models sidebar with rename/delete/add-to-scene |
| `hooks/useModels.ts` | Fetches and caches the model library |

### Key Design Decisions

**Immutable model / mutable instance split.** `StoredModel` holds immutable geometry (parts JSON, never changes after save). `SceneInstance` holds the mutable transform (position, rotation, scale of that model in a specific scene). The same model can appear in multiple scenes via multiple `SceneInstance` rows — no geometry duplication.

**Joint chain system for articulated figures.** The LLM prompt enforces that distal joints (elbows, wrists, knees, ankles) are *computed* by chaining from root joints — never estimated independently. This prevents the common failure mode where arms float detached from the torso.

**Clock-direction notation.** The prompt uses clock positions (12=up, 3=right, 6=down, 9=left) instead of asking the LLM for radians. The server converts to radians in deterministic code. LLMs are more reliable with spatial metaphors than numeric precision.

**Prompt as first-class artifact.** `examples/decode_prompt.txt` is version-controlled and loaded at runtime. It is not an inline string. Changes to it affect output quality the same way algorithm changes affect correctness. Treat it as read-only unless you understand the multi-phase analysis structure it encodes.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- A [Google Gemini API key](https://ai.google.dev/)

## Quick Start

1. **Clone the repository:**

   ```bash
   git clone <repo-url>
   cd 2026-03030_VML_3D_Renderer
   ```

2. **Create your environment file:**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and add your Gemini API key:

   ```
   GEMINI_API_KEY=your_actual_key_here
   ```

3. **Start the application:**

   ```bash
   docker compose up --build
   ```

   The backend starts first. The frontend waits for the backend health check to pass before starting.

4. **Open the app:**

   - Frontend: [http://localhost:3010](http://localhost:3010)
   - Backend API: [http://localhost:8010](http://localhost:8010)
   - Health check: [http://localhost:8010/health](http://localhost:8010/health)

5. **Upload an image** and click Render. The 3D scene appears in the canvas. Use the debug panel to inspect the raw LLM output and extracted JSON.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | Yes | — | Google Gemini API key |
| `GEMINI_MODEL` | No | `gemini-2.0-pro-exp` | Gemini model name |
| `DATABASE_URL` | No | `sqlite:///./renderer.db` | SQLAlchemy database URL |
| `ENV` | No | `development` | Set to `production` to disable auto-reload |
| `LOG_LEVEL` | No | `INFO` | Python logging level (`DEBUG`, `INFO`, `WARNING`, `ERROR`) |
| `RATE_LIMIT` | No | `10/minute` | Rate limit on the render endpoint (per IP) |
| `CORS_ORIGINS` | No | `http://localhost:3010,http://frontend:3010` | Comma-separated allowed origins |
| `VITE_API_URL` | No | `http://backend:8010` | Backend URL for Vite proxy (Docker internal) |

## API Endpoints

### Render

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/render` | Upload an image, get back a 3D scene JSON. Rate limited. |

### Models (Library)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/models` | List all saved models |
| `GET` | `/api/models/:id` | Get a single model with its parts |
| `POST` | `/api/models` | Save a new model (name + parts JSON) |
| `PATCH` | `/api/models/:id` | Rename a model |
| `DELETE` | `/api/models/:id` | Delete a model |

### Scenes (Composer)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/scenes` | List all scenes |
| `GET` | `/api/scenes/:id` | Get a scene with all its instances |
| `POST` | `/api/scenes` | Create a new scene |
| `DELETE` | `/api/scenes/:id` | Delete a scene and its instances |
| `POST` | `/api/scenes/:id/instances` | Add a model instance to a scene |
| `PATCH` | `/api/scenes/:sid/instances/:iid` | Update an instance's transform |
| `DELETE` | `/api/scenes/:sid/instances/:iid` | Remove an instance from a scene |

### Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Returns `{"status": "ok"}` |

## JSON Scene Schema

The 3D scene is described as a flat array of parts. This is the data contract between the LLM, backend, frontend, and database.

```jsonc
{
  "parts": [
    {
      "label": "manA-torso-upper",        // namespaced identifier
      "geometryType": "box",               // box | cylinder | sphere | cone | torus | lathe | tube | extrude
      "width": 0.35,                       // geometry-specific dimensions
      "height": 0.4,
      "depth": 0.2,
      "position": { "x": 0, "y": 1.2, "z": 0 },   // meters, world space
      "rotation": { "x": 0, "y": 0, "z": 0 },      // radians
      "scale": { "x": 1, "y": 1, "z": 1 },          // optional, defaults to 1
      "color": "#4a90d9"                              // hex string
    }
  ]
}
```

### Geometry-specific fields

| Type | Fields |
|------|--------|
| `box` | `width`, `height`, `depth` |
| `cylinder` | `radiusTop`, `radiusBottom`, `height` |
| `sphere` | `radius` |
| `cone` | `radius`, `height` |
| `torus` | `radius`, `tube` |
| `lathe` | `profilePoints: [{x, y}]` (min 20 points for smooth curves) |
| `tube` | `tubePoints: [{x, y, z}]`, `tubeRadius` |
| `extrude` | `pathCommands` (M/L/Q/C operations), `depth` |

## Database Schema

Three SQLModel tables with an immutable-geometry / mutable-transform split:

```
StoredModel (immutable after save)
  id, name, parts_json, source_image (optional), created_at

Scene
  id, name, created_at

SceneInstance (mutable transforms)
  id, scene_id (FK), model_id (FK)
  pos_x, pos_y, pos_z
  rot_x, rot_y, rot_z
  scale_x, scale_y, scale_z
```

A single `StoredModel` can appear in multiple scenes at different positions via multiple `SceneInstance` rows. Position is never stored inside the model itself.

## Project Structure

```
/
├── Dockerfile                     # Backend container (Python 3.11)
├── docker-compose.yml             # Orchestration: backend :8010, frontend :3010
├── pyproject.toml                 # Python dependencies (Poetry)
├── .env.example                   # Environment variable template
│
├── src/renderer/                  # Python backend package
│   ├── server.py                  # FastAPI app — routes, middleware, lifespan
│   ├── prompt.py                  # Prompt loading + runtime suffix
│   ├── extractor.py               # JSON extraction from LLM responses
│   ├── database.py                # SQLModel engine + session
│   └── models.py                  # ORM table definitions
│
├── examples/
│   ├── decode_prompt.txt          # LLM prompt (read-only, version-controlled)
│   ├── example1.html              # Reference: vanilla Three.js with interaction
│   └── example2.html              # Reference: vanilla Three.js with tone mapping
│
├── frontend/
│   ├── Dockerfile                 # Frontend container (Node 20)
│   ├── vite.config.ts             # Dev server :3010, proxy /api -> backend
│   ├── package.json               # React 19, R3F 9, Three.js 0.183, Tailwind 4
│   └── src/
│       ├── App.tsx                # Top-level state and layout
│       ├── api.ts                 # Typed API client
│       ├── types.ts               # Shared TypeScript interfaces
│       ├── hooks/                 # useModels
│       ├── components/            # UploadPanel, StatusBar, ToolBar, DebugPanel, ModelLibrary
│       └── three/                 # SceneCanvas, ScenePart, ModelGroup, Lighting, GroundGrid,
│                                  # geometryFactory, resolveColor
│
└── docs/
    ├── agent-memories.md          # Persistent context for AI agents
    ├── code-audit.md              # Full code audit (2026-03-30)
    └── implementation-plan.md     # Hardening plan from audit findings
```

## Development

### Running locally without Docker

**Backend:**

```bash
# Create virtual environment
python -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install poetry
poetry install

# Start the server
poetry run renderer
```

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

The frontend dev server runs on `:3010` and proxies `/api/*` to `http://localhost:8010`.

### Infrastructure notes

- The frontend container runs the Vite **dev server** (not a production build). This is intentional — hot reload works inside Docker for a local-only tool.
- SQLite is mounted as a volume (`./renderer.db:/app/renderer.db`) and persists across container restarts.
- Ports `8010` (backend) and `3010` (frontend) are load-bearing — changing either requires updates to `docker-compose.yml`, `vite.config.ts`, and CORS configuration.
- The backend health check must pass before the frontend container starts (`depends_on: condition: service_healthy`).

## Observability

**Frontend:** The debug panel (bottom of the UI) shows two tabs — **Scene JSON** (the parsed parts array) and **Raw LLM** (the full Gemini response). When the LLM produces bad output, diagnose here first.

**Backend:** Structured JSON logs are written to stdout. Log level is controlled by the `LOG_LEVEL` environment variable. Key events logged:
- Render request received (content type, file size)
- Gemini API call duration
- Extraction outcome (part count or failure reason)
- Errors with full tracebacks (server-side only — clients get generic messages)

View logs with:

```bash
docker compose logs -f backend
```

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Backend | Python | 3.11+ |
| Backend | FastAPI | 0.111+ |
| Backend | SQLModel | 0.0.19+ |
| Backend | Google Generative AI | 0.7+ |
| Frontend | React | 19.x |
| Frontend | React Three Fiber | 9.x |
| Frontend | Three.js | 0.183.x |
| Frontend | Tailwind CSS | 4.x |
| Frontend | Vite | 8.x |
| Frontend | TypeScript | 5.9.x |
| Infra | Docker Compose | v2 |
| Database | SQLite | (bundled) |

## Documentation

- [Code Audit](docs/code-audit.md) — Full audit of the initial build (2026-03-30)
- [Implementation Plan](docs/implementation-plan.md) — Phased hardening plan from audit findings
- [Agent Memories](docs/agent-memories.md) — Persistent context, decisions, and insights for AI agents working on this project
