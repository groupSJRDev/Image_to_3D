# Code Plan: Image → Gemini → Three.js Renderer

> This document is the detailed implementation guide. Read [strategy-local-frontend.md](strategy-local-frontend.md) first for the architectural rationale.

---

## Revised Tech Stack

| Layer | Choice |
|---|---|
| Backend | FastAPI + Uvicorn (Python) |
| Frontend framework | React 18 (Vite dev server) |
| 3D rendering | Three.js v0.160.0 via `@react-three/fiber` + `@react-three/drei` |
| Styling | Tailwind CSS |
| HTTP client | `fetch` (native) |
| LLM SDK | `google-generativeai` (Python, server-side) |
| Config | `python-dotenv` — reads `GEMINI_API_KEY` from `.env` |
| Database (local) | SQLite via SQLModel |
| Database (production) | PostgreSQL via SQLModel (same ORM, swap connection string) |
| Container | Docker + Docker Compose |

**Ports:**
- `localhost:8010` — FastAPI backend
- `localhost:3010` — React / Vite frontend

Vite proxies `/api/*` to `localhost:8010` so the browser never deals with CORS and the API key stays server-side.

---

## Repository Layout

```
/
├── .env                        # GEMINI_API_KEY=... (git-ignored)
├── .env.example                # template — safe to commit
├── .gitignore
├── docker-compose.yml          # orchestrates backend + frontend
├── pyproject.toml              # Python deps
├── README.md
│
├── examples/
│   ├── decode_prompt.txt       # Source of truth — read-only
│   ├── example1.html
│   └── example2.html
│
├── src/
│   └── renderer/               # Python package
│       ├── __init__.py
│       ├── server.py           # FastAPI app + all routes
│       ├── prompt.py           # Loads & assembles the decode prompt
│       ├── extractor.py        # Pulls JSON out of Gemini response text
│       ├── database.py         # SQLModel engine + session factory
│       └── models.py           # ORM models: StoredModel, Scene, SceneInstance
│
├── frontend/                   # React app (Vite)
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── types.ts            # TypeScript types for scene JSON + DB records
│       ├── api.ts              # fetch wrappers for all /api/* routes
│       ├── components/
│       │   ├── UploadPanel.tsx
│       │   ├── StatusBar.tsx
│       │   ├── DebugPanel.tsx
│       │   ├── ToolBar.tsx
│       │   ├── ModelLibrary.tsx     # Sidebar: stored models list
│       │   ├── ModelCard.tsx        # Single stored model card
│       │   └── SceneComposer.tsx    # Place + arrange models in a shared scene
│       ├── three/
│       │   ├── SceneCanvas.tsx      # R3F Canvas wrapper
│       │   ├── ScenePart.tsx        # Renders one geometry part
│       │   ├── ModelGroup.tsx       # A stored model at a scene-level transform
│       │   ├── GroundGrid.tsx
│       │   ├── Lighting.tsx
│       │   └── geometryFactory.ts  # geometryType → THREE.BufferGeometry
│       └── hooks/
│           ├── useModels.ts         # fetch + cache /api/models
│           └── useScene.ts          # local scene composition state
│
└── docs/
    ├── strategy-local-frontend.md
    ├── code-plan.md             # this file
    └── agent-memories.md
```

---

## Phase 1 — Python Backend

### 1.1 Python dependencies

Add to `pyproject.toml`:

```toml
[project]
dependencies = [
    "fastapi>=0.111.0",
    "uvicorn[standard]>=0.29.0",
    "python-multipart>=0.0.9",
    "google-generativeai>=0.7.0",
    "python-dotenv>=1.0.0",
    "sqlmodel>=0.0.19",
]
```

Run `poetry install` after updating.

---

### 1.2 `src/renderer/prompt.py`

Loads `examples/decode_prompt.txt` and appends a strict output-format suffix:

```
load_prompt()
  → resolves path as: Path(__file__).parent.parent.parent / "examples" / "decode_prompt.txt"
      (i.e. relative to the module file, not the caller's working directory)
      This is safe whether running locally or inside Docker at /app
  → appends:
      "After your analysis, output ONLY a single ```json code fence
       containing the parts array. No prose after the JSON block."
  → returns the full prompt string
```

**Why the suffix matters:** Gemini writes analysis first. The extractor depends on the JSON fence being last. The suffix enforces this.

**Why path-relative-to-module matters:** `os.getcwd()` varies depending on how the server is started (Poetry, Docker, pytest). Anchoring to `__file__` is stable in all environments.

---

### 1.3 `src/renderer/extractor.py`

```
extract_scene_json(response_text: str) -> dict
```

Algorithm:
1. Find the **last** ` ```json ` fence in the response
2. Extract content up to the closing ` ``` `
3. `json.loads()` → return `{"parts": [...]}`
4. Fallback: regex sweep for the last `[...]` or `{...}` block
5. Both fail → raise `ExtractionError` with raw response attached

Always returns `{"parts": [...]}` — a consistent envelope for the frontend.

---

### 1.4 `src/renderer/database.py`

```python
# SQLite for local dev; swap DATABASE_URL in .env for Postgres in production
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./renderer.db")

engine = create_engine(DATABASE_URL)

def get_session() -> Session: ...   # FastAPI dependency
def init_db(): ...                  # called at startup to create tables
```

---

### 1.5 `src/renderer/models.py`

Three ORM tables:

**`StoredModel`** — a single model generated from an image
```
id            int (PK)
name          str           — user-supplied or auto-generated from filename
parts_json    str           — JSON-serialised parts array
source_image  bytes | None  — optional: store the original image
created_at    datetime
```

**`Scene`** — a named composition of multiple models
```
id         int (PK)
name       str
created_at datetime
```

**`SceneInstance`** — one model placed in a scene with a world transform
```
id         int (PK)
scene_id   int (FK → Scene)
model_id   int (FK → StoredModel)
pos_x, pos_y, pos_z    float   — position offset for the whole model group
rot_x, rot_y, rot_z    float   — rotation offset
scale_x, scale_y, scale_z float
```

This means a single `StoredModel` can appear in many scenes at different positions.

---

### 1.6 `src/renderer/server.py` — full route list

#### Render
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/render` | Upload image → call Gemini → return parts JSON |
| `GET` | `/api/prompt` | Return the assembled decode prompt (debug) |

#### Model library
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/models` | Save a rendered model to the DB |
| `GET` | `/api/models` | List all stored models (id, name, created_at, part count) |
| `GET` | `/api/models/{id}` | Return full parts JSON for one model |
| `DELETE` | `/api/models/{id}` | Delete a stored model |
| `PATCH` | `/api/models/{id}` | Rename a model |

#### Scene composer
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/scenes` | Create a new named scene |
| `GET` | `/api/scenes` | List all scenes |
| `GET` | `/api/scenes/{id}` | Return scene with all instances + their parts |
| `DELETE` | `/api/scenes/{id}` | Delete a scene (instances cascade) |
| `POST` | `/api/scenes/{id}/instances` | Add a model to a scene with a transform |
| `PATCH` | `/api/scenes/{id}/instances/{iid}` | Update instance transform |
| `DELETE` | `/api/scenes/{id}/instances/{iid}` | Remove a model from a scene |

#### System
| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | `{"status": "ok"}` — used by frontend on startup |

---

### 1.7 Entry point

```toml
[project.scripts]
renderer = "renderer.server:start"
```

`start()` calls `uvicorn.run("renderer.server:app", host="0.0.0.0", port=8010, reload=True)`.

---

## Phase 2 — React Frontend

### 2.1 Bootstrap

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install -D tailwindcss @tailwindcss/vite
npm install three @react-three/fiber @react-three/drei
npm install @types/three
```

### 2.2 `vite.config.ts`

```ts
server: {
  port: 3010,
  proxy: {
    '/api': 'http://localhost:8010'
  }
}
```

---

### 2.3 TypeScript types — `src/types.ts`

Mirrors the JSON schema exactly, plus DB record shapes:

```ts
export type GeometryType =
  | 'box' | 'cylinder' | 'sphere' | 'cone'
  | 'torus' | 'lathe' | 'tube' | 'extrude';

export interface Vec3 { x: number; y: number; z: number; }
export interface Vec2 { x: number; y: number; }

export interface ScenePart {
  label: string;
  geometryType: GeometryType;
  color: string;
  position: Vec3;
  rotation: Vec3;
  scale?: Vec3;
  // box
  width?: number; height?: number; depth?: number;
  // cylinder / cone
  radiusTop?: number; radiusBottom?: number; radius?: number; radialSegments?: number;
  // sphere
  widthSegments?: number; heightSegments?: number;
  // torus
  tubeRadius?: number; tubularSegments?: number;
  // lathe
  profilePoints?: Vec2[]; segments?: number;
  // tube
  tubePoints?: Vec3[];
  // extrude
  pathCommands?: PathCommand[]; bevelEnabled?: boolean;
}

export interface PathCommand {
  op: 'M' | 'L' | 'Q' | 'C';
  x: number; y: number;
  cp1x?: number; cp1y?: number; cp2x?: number; cp2y?: number;
}

// Render response from /api/render
export interface RenderResponse {
  parts: ScenePart[];
  raw_response: string;
}

// Stored model record from DB
export interface StoredModel {
  id: number;
  name: string;
  part_count: number;
  created_at: string;
  parts?: ScenePart[];   // included on GET /api/models/{id} only
}

// Scene composition
export interface SceneInstance {
  id: number;
  model_id: number;
  model_name: string;
  parts: ScenePart[];
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
}

export interface ComposedScene {
  id: number;
  name: string;
  instances: SceneInstance[];
}
```

---

### 2.4 API layer — `src/api.ts`

```ts
renderImage(file: File): Promise<RenderResponse>
saveModel(name: string, parts: ScenePart[]): Promise<StoredModel>
listModels(): Promise<StoredModel[]>
getModel(id: number): Promise<StoredModel>
deleteModel(id: number): Promise<void>
renameModel(id: number, name: string): Promise<StoredModel>

createScene(name: string): Promise<ComposedScene>
listScenes(): Promise<ComposedScene[]>
getScene(id: number): Promise<ComposedScene>
addModelToScene(sceneId: number, modelId: number, transform: Transform): Promise<SceneInstance>
updateInstance(sceneId: number, instanceId: number, transform: Transform): Promise<SceneInstance>
removeInstance(sceneId: number, instanceId: number): Promise<void>
```

---

### 2.5 App layout — `src/App.tsx`

```
┌──────────────────────────────────────────────────────────────────────┐
│  ToolBar: title | Save Model | Download JSON | Download HTML         │
├──────────────┬───────────────────────────────────┬───────────────────┤
│              │                                   │                   │
│ UploadPanel  │       SceneCanvas (R3F)            │  ModelLibrary     │
│              │       Renders either:              │                   │
│ [drop image] │       • a freshly rendered model   │  [stored models]  │
│ [preview]    │       • a composed scene of many   │  [drag to scene]  │
│ [Render btn] │         stored models              │                   │
│              │                                   │  SceneComposer    │
│ StatusBar    │                                   │  [instances list] │
│              │                                   │  [transforms]     │
├──────────────┴───────────────────────────────────┴───────────────────┤
│  DebugPanel (collapsible) — Scene JSON | Raw LLM Response            │
└──────────────────────────────────────────────────────────────────────┘
```

Two canvas modes toggled via a tab or button:
- **Single model** — the freshly rendered `parts[]` from `/api/render`
- **Composed scene** — multiple `SceneInstance` objects from `/api/scenes/{id}`

---

### 2.6 Three.js components

**`SceneCanvas.tsx`** — R3F Canvas. Accepts either `parts: ScenePart[]` (single model) or `instances: SceneInstance[]` (composed scene). Renders `<ScenePart>` or `<ModelGroup>` accordingly.

**`ScenePart.tsx`** — renders one geometry part (mesh + wireframe overlay). Unchanged from single-model use case.

**`ModelGroup.tsx`** — wraps a `SceneInstance`: applies `position/rotation/scale` to a `<group>` and renders all the model's `ScenePart` children inside it. This is what makes multi-model scenes work — each model is an independently-transformed group.

```tsx
<group
  position={[inst.position.x, inst.position.y, inst.position.z]}
  rotation={[inst.rotation.x, inst.rotation.y, inst.rotation.z]}
  scale={[inst.scale.x, inst.scale.y, inst.scale.z]}
>
  {inst.parts.map(p => <ScenePart key={p.label} part={p} />)}
</group>
```

**`geometryFactory.ts`** — pure function, maps all 8 geometry types to Three.js constructors.

**`resolveColor.ts`** — pure function, mirrors the `resolveColor(label, orig)` logic from the examples. Maps label patterns to material colors (skin, hair, clothing, shoes) overriding the raw JSON `color` field. Called inside `ScenePart.tsx` before setting `meshStandardMaterial color`. Without this, human figures render with flat block colors rather than the resolved skin/clothing tones the examples produce.

```ts
resolveColor(label: string, orig: string): string
// e.g. "manA-head-cranium" → FLESH, "manA-hair" → "#222222", "manA-tie" → orig
```

**`Lighting.tsx`** / **`GroundGrid.tsx`** — shared across both canvas modes.

---

### 2.7 Model Library — `ModelLibrary.tsx`

Right sidebar panel:
- Lists all models from `GET /api/models` (via `useModels` hook)
- Each `ModelCard` shows: name, part count, date, thumbnail (optional)
- **"Add to Scene"** button on each card — calls `addModelToScene` and places the model at origin
- **Delete** / **Rename** actions per card

---

### 2.8 Scene Composer — `SceneComposer.tsx`

Below the library, shows all instances in the current composed scene:
- Instance list with model name + XYZ position inputs
- Numeric inputs for `pos_x/y/z`, `rot_y` (yaw is usually enough for placement)
- Calls `updateInstance` on change (debounced)
- "Remove" button per instance
- "New Scene" / "Load Scene" / "Save Scene" controls at top

---

### 2.9 Save Model flow

After a successful render, the ToolBar shows a **"Save to Library"** button:
1. Prompts user for a model name (default: source filename without extension)
2. Calls `POST /api/models` with `{ name, parts }`
3. On success, `useModels` refetches — model appears in the library immediately

---

## Phase 3 — Docker

### `docker-compose.yml`

```yaml
services:
  backend:
    build: .
    ports:
      - "8010:8010"
    env_file: .env
    volumes:
      - ./renderer.db:/app/renderer.db   # persist SQLite across restarts
      - ./examples:/app/examples         # decode_prompt.txt
    command: uvicorn renderer.server:app --host 0.0.0.0 --port 8010

  frontend:
    build: ./frontend
    ports:
      - "3010:3010"
    depends_on:
      - backend
    environment:
      # Inside Docker, containers reach each other by service name — NOT localhost.
      # "backend" here is the Compose service name above, not a hostname.
      - VITE_API_URL=http://backend:8010
```

### Backend `Dockerfile` (project root)

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY pyproject.toml poetry.lock ./
RUN pip install poetry && poetry install --no-root
COPY src/ ./src/
COPY examples/ ./examples/
CMD ["poetry", "run", "uvicorn", "renderer.server:app", "--host", "0.0.0.0", "--port", "8010"]
```

### Frontend `Dockerfile` (`frontend/`)

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3010
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3010"]
```

Note: the frontend Dockerfile runs the Vite **dev server** (not a production build). This is intentional for a local-only tool — hot reload works normally.

**Docker networking note:** The Vite proxy target must differ between local dev and Docker. Inside a Docker network, containers communicate via service name, not `localhost`. `vite.config.ts` reads `VITE_API_URL` to handle both cases:

```ts
// vite.config.ts
proxy: {
  '/api': process.env.VITE_API_URL ?? 'http://localhost:8010'
  //      ↑ 'http://backend:8010' when in Docker
  //                               ↑ 'http://localhost:8010' when running locally
}
```

Without this, the frontend container will silently fail to reach the backend — `localhost` inside the frontend container refers to the frontend container itself, not the backend.

---

## Phase 4 — Wiring Order

1. **Backend stub** — `POST /api/render` returns hardcoded JSON from `example1.html`
2. **React scaffold** — `UploadPanel`, `SceneCanvas`, `StatusBar` consuming stub. Verify Three.js renders the hardcoded scene.
3. **`geometryFactory`** — all 8 types, tested against both example files
4. **Gemini wiring** — real `generate_content` call; `extractor.py` tested against known responses
5. **DB layer** — `StoredModel` table, `POST /api/models` + `GET /api/models`, "Save to Library" button
6. **Model Library UI** — `ModelLibrary`, `ModelCard`, `useModels` hook
7. **Scene composer backend** — `Scene` + `SceneInstance` tables, scene routes
8. **Scene composer UI** — `ModelGroup`, `SceneComposer`, `useScene` hook, composed canvas mode
9. **Docker** — `docker-compose.yml`, both Dockerfiles; verify both ports work
10. **Error states** — 422/500 surfaced in `StatusBar` and `DebugPanel`
11. **Download buttons** — JSON export, standalone HTML export

---

## Running Locally

### Without Docker (two terminals)

```bash
# Terminal 1 — backend
poetry install
poetry run renderer      # → http://localhost:8010

# Terminal 2 — frontend
cd frontend
npm install
npm run dev              # → http://localhost:3010
```

### With Docker

```bash
docker compose up --build
# Backend → http://localhost:8010
# Frontend → http://localhost:3010
```

`.env` (project root, git-ignored):
```
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.0-pro-exp    # optional
DATABASE_URL=sqlite:///./renderer.db  # swap for postgres:// in production
```

---

## Key Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Gemini takes 20–40s for complex scenes | Spinner with timing message; no fetch timeout |
| LLM returns malformed JSON | Two-pass extraction; 422 surfaces raw response in debug panel |
| Floating/disconnected limbs | Joint chain system baked into `decode_prompt.txt` — do not modify |
| SQLite not suitable long-term | `DATABASE_URL` env var makes Postgres a one-line swap |
| Multiple models overlap in scene | Default placement at origin with Y-offset per instance; user adjusts via composer |
| R3F geometry disposal on re-render | R3F handles automatically when `parts` / `instances` prop changes |
| API key accidentally committed | `.env` in `.gitignore` — confirmed before first push |
| Docker frontend can't reach backend | `VITE_API_URL=http://backend:8010` in Compose; `http://localhost:8010` for local dev — proxy target reads from env |
| `decode_prompt.txt` not found in Docker | `prompt.py` resolves path via `Path(__file__)` not `os.getcwd()` — stable in all environments |
| Human figures render wrong colors | `resolveColor.ts` mirrors examples' label-pattern color map — called in `ScenePart.tsx` before material is set |
