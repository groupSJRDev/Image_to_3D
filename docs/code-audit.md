# Code Audit: VML 3D Renderer

**Date:** 2026-03-30
**Auditor:** Claude Opus 4.6 (Senior Lead Review)
**Branch:** `task/implement_initial_build-033026`
**Commit:** `1140c2f`

---

## Executive Summary

The initial build delivers a working image-to-3D pipeline with a clean separation between backend (FastAPI/Python) and frontend (React/R3F). The architecture aligns well with the two-stage vision documented in agent-memories. However, this audit surfaces **critical issues in five areas**: container security, resource leaks, input validation, error handling, and observability. None are exotic — they are the standard gaps that appear when an MVP ships fast and skips hardening.

The codebase is well-structured and the abstractions are sound. The problems below are fixable without architectural changes.

---

## Severity Definitions

| Level | Meaning |
|-------|---------|
| **CRITICAL** | Blocks production readiness. Security vulnerability, data loss risk, or crash-on-normal-use. |
| **HIGH** | Significant quality/reliability gap. Must fix before any external user touches it. |
| **MEDIUM** | Technical debt that will bite during Stage 2 or under moderate load. |
| **LOW** | Code quality, style, or hygiene. Fix opportunistically. |

---

## 1. Backend (Python / FastAPI)

### 1.1 CRITICAL: No Logging Anywhere

**Files:** All of `src/renderer/`

Not a single `import logging` or `logger.*` call exists in the backend. The agent-memories document explicitly calls out "observability is architecture, not an afterthought" and the debug panel was designed for frontend visibility — but the server itself is a black box. When the Gemini API fails, when extraction produces garbage, when a database write silently drops — there is no record.

**Impact:** Production debugging is impossible. Security events (missing API key, malformed uploads) are invisible.

**Fix:** Add structured logging to `server.py` (at minimum: request received, API call start/end, extraction result, errors). Use Python's `logging` module with JSON formatter for Docker log aggregation.

---

### 1.2 CRITICAL: File Upload Has No Validation

**File:** `server.py` — `POST /api/render`

```python
async def render(image: UploadFile = File(...)):
    image_bytes = await image.read()
```

- No file size limit — a 2GB upload causes OOM
- No content-type validation — `image.content_type` is passed directly to Gemini (`image_part = {"mime_type": image.content_type or "image/jpeg"...}`) and is trivially spoofable
- No file magic-byte validation

**Impact:** Denial-of-service via large uploads. Potential for unexpected behavior if non-image content reaches the Gemini API.

**Fix:** Add `max_size` check (e.g., 10MB), validate content-type against allowlist, optionally validate magic bytes.

---

### 1.3 CRITICAL: Bare Exception Catch Masks Bugs

**File:** `server.py`, render endpoint

```python
except Exception as exc:
    raise HTTPException(status_code=500, detail=f"Gemini API error: {exc}")
```

Catches *everything* — including `TypeError`, `KeyError`, programming errors. The error message includes the exception string, which can leak internal details (API keys in URL strings, stack frames, file paths).

**Fix:** Catch specific exceptions (`google.api_core.exceptions.GoogleAPIError`, `ConnectionError`, `Timeout`). Log the full traceback server-side. Return a generic message to the client.

---

### 1.4 CRITICAL: `reload=True` in Production Entry Point

**File:** `server.py`

```python
def start():
    uvicorn.run("renderer.server:app", host="0.0.0.0", port=8010, reload=True)
```

`reload=True` watches the filesystem and restarts on changes. In a Docker container with mounted volumes, this can cause restart loops. It also increases memory usage and CPU overhead.

**Fix:** Gate on environment: `reload=os.getenv("ENV") != "production"`.

---

### 1.5 HIGH: No Rate Limiting on `/api/render`

Every call to `/api/render` makes a Gemini API request. No rate limiting, no queue, no concurrency cap. A single user (or a script) can run up the Gemini bill indefinitely.

**Fix:** Add a simple in-memory rate limiter (e.g., `slowapi`) or at minimum a concurrency semaphore.

---

### 1.6 HIGH: No Input Validation on Request Bodies

**File:** `server.py` — Pydantic models

| Model | Field | Issue |
|-------|-------|-------|
| `SaveModelRequest` | `name: str` | No max length |
| `SaveModelRequest` | `parts: list` | No max items, no element validation |
| `RenameModelRequest` | `name: str` | No max length |
| `CreateSceneRequest` | `name: str` | No max length |
| `AddInstanceRequest` | `pos_x/y/z`, `rot_x/y/z`, `scale_x/y/z` | No bounds — `1e308` is valid |

**Fix:** Add `Field(max_length=255)` on strings, `Field(max_length=1000)` on lists, reasonable bounds on floats.

---

### 1.7 HIGH: JSON Parsing on Untrusted Data Without Try/Except

**File:** `server.py` — `list_models()`, `get_model()`, `_serialise_instance()`

```python
"part_count": len(json.loads(r.parts_json))
```

If `parts_json` in the database is corrupted or empty, this crashes the endpoint with an unhandled `json.JSONDecodeError`. Multiple endpoints are affected.

**Fix:** Wrap in try/except or validate on write.

---

### 1.8 MEDIUM: Silent Empty Return in Extraction Normalizer

**File:** `extractor.py` — `_normalise()`

```python
return {"parts": []}  # fallback
```

If the LLM returns valid JSON that doesn't match the expected shape, the extractor silently returns an empty parts array. The user sees an empty canvas with no error message.

**Fix:** Raise `ExtractionError` instead of returning empty. Let the frontend debug panel show what went wrong.

---

### 1.9 MEDIUM: No Database Indices on Foreign Keys

**File:** `models.py`

```python
scene_id: int = Field(foreign_key="scene.id")
model_id: int = Field(foreign_key="storedmodel.id")
```

No `index=True`. Querying instances by scene ID will full-table-scan as data grows.

**Fix:** `Field(foreign_key="scene.id", index=True)`.

---

### 1.10 MEDIUM: N+1 Query in Scene Serialization

**File:** `server.py` — `get_scene()`

For each `SceneInstance`, `_serialise_instance()` makes a separate `session.get(StoredModel, inst.model_id)` call. A scene with 20 instances = 21 queries.

**Fix:** Use a JOIN or bulk-load all referenced models in one query.

---

### 1.11 MEDIUM: No Cascade Deletes in Schema

**File:** `models.py`

Foreign keys lack `ondelete="CASCADE"`. The code manually loops and deletes instances before deleting a scene/model. This is fragile — if a new code path deletes without the loop, orphans accumulate.

**Fix:** Add `sa_column_kwargs={"ondelete": "CASCADE"}` and let the database enforce referential integrity.

---

### 1.12 MEDIUM: Prompt File Path Is Fragile

**File:** `prompt.py`

```python
_PROMPT_PATH = Path(__file__).parent.parent.parent / "examples" / "decode_prompt.txt"
```

No existence check, no error handling. If the file is missing (e.g., Docker COPY missed it), the endpoint crashes with an unhelpful `FileNotFoundError`.

**Fix:** Validate at startup (in `lifespan`), fail fast with a clear message.

---

### 1.13 LOW: Loose Dependency Pinning

**File:** `pyproject.toml`

All dependencies use `>=` only (e.g., `fastapi>=0.111.0`). A `pip install` six months from now could pull a breaking major version. The `poetry.lock` mitigates this for Poetry users, but the Dockerfile calls `poetry install` which respects the lock — so this is acceptable for now but should be tightened before others contribute.

---

### 1.14 LOW: Placeholder Project Metadata

**File:** `pyproject.toml`

```toml
description = ""
authors = [{name = "Your Name", email = "you@example.com"}]
```

---

### 1.15 LOW: Missing Type Hints on Route Handlers

Route handler return types are not annotated. FastAPI can generate better OpenAPI docs with explicit response models.

---

## 2. Frontend (React / R3F / TypeScript)

### 2.1 CRITICAL: Geometry Memory Leaks in ScenePart

**File:** `frontend/src/three/ScenePart.tsx`

```typescript
const geometry = useMemo(() => {
    const geo = buildGeometry(part);
    if (geo) geo.computeVertexNormals();
    return geo;
}, [part]);
```

When `part` changes, the old `BufferGeometry` is replaced but **never disposed**. Same for the `WireframeGeometry`. These are GPU-side allocations — they leak VRAM until the browser tab crashes.

The agent-memories note that R3F disposes geometries automatically on unmount — and that's true for *declarative* `<boxGeometry>` elements. But `useMemo` + `<primitive>` or manual geometry assignment bypasses R3F's disposal lifecycle. This is the exact bug class the framework was chosen to prevent, now reintroduced by the imperative pattern.

**Fix:** Add a `useEffect` cleanup:
```typescript
useEffect(() => {
    return () => {
        geometry?.dispose();
        wireframeGeo?.dispose();
    };
}, [geometry, wireframeGeo]);
```

Or better: refactor to use R3F's declarative geometry elements where possible.

---

### 2.2 CRITICAL: GroundGrid Geometry/Material Leak

**File:** `frontend/src/three/GroundGrid.tsx`

`useMemo` creates a `THREE.Group` containing dozens of `BufferGeometry` and `LineBasicMaterial` objects. None are disposed on unmount. Additionally, identical materials are created in a loop instead of being shared.

**Fix:** Add disposal cleanup. Create materials once and reuse.

---

### 2.3 CRITICAL: Blob URL Memory Leak in UploadPanel

**File:** `frontend/src/components/UploadPanel.tsx`

```typescript
setPreview(URL.createObjectURL(f));
```

Every image upload creates a blob URL that is never revoked. Memory grows with each upload.

**Fix:**
```typescript
useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
}, [preview]);
```

---

### 2.4 HIGH: Key Collisions in Part Lists

**Files:** `SceneCanvas.tsx`, `ModelGroup.tsx`

```typescript
{parts.map((p) => <ScenePart key={p.label} part={p} />)}
```

If two parts share a label (plausible — the LLM names them), React's reconciliation will silently drop one or corrupt state. The agent-memories schema shows labels like `"manA-torso-lower"` which are *intended* to be unique, but nothing enforces this.

**Fix:** Use `key={\`${p.label}-${i}\`}` with index fallback, or deduplicate/validate labels on the backend.

---

### 2.5 HIGH: No Error Boundary Around Canvas

**File:** `SceneCanvas.tsx`

If `buildGeometry()` throws (e.g., invalid `pathCommands` in an extrude part), the entire React tree crashes. R3F Canvas errors are notoriously hard to recover from without an error boundary.

**Fix:** Wrap `<Canvas>` children in a React error boundary that shows a fallback UI.

---

### 2.6 HIGH: Silent Error Swallowing in useModels

**File:** `frontend/src/hooks/useModels.ts`

```typescript
catch { }  // empty catch
```

If the model library API call fails, the user sees an empty sidebar with no indication of failure.

**Fix:** Surface the error to state and render it in the UI.

---

### 2.7 HIGH: API Error Handling Is Fragile

**File:** `frontend/src/api.ts`

```typescript
Object.assign(new Error(...), { raw_response: ... })
```

Attaching ad-hoc properties to `Error` objects is brittle. In `App.tsx`, the error is then cast:

```typescript
err as { message?: string; raw_response?: string }
```

This is effectively untyped. If the API layer changes, TypeScript won't catch the mismatch.

**Fix:** Create a typed `ApiError` class with explicit properties.

---

### 2.8 MEDIUM: Race Condition in handleAddToScene

**File:** `App.tsx`

`handleAddToScene` creates a new scene if `sceneId` is null. Rapid clicks can trigger this multiple times before state updates, creating duplicate scenes.

**Fix:** Add a loading guard or disable the button during the operation.

---

### 2.9 MEDIUM: Fragmented State in App.tsx

`parts`, `instances`, `sceneId`, `canSave`, `status`, `errorMsg`, and `rawResponse` are all independent `useState` calls. These are interdependent (e.g., `canSave` should be false when `status === "error"`) but nothing enforces consistency.

**Fix:** Consolidate into a `useReducer` with validated state transitions, or at minimum derive `canSave` from other state rather than tracking it independently.

---

### 2.10 MEDIUM: No Loading States on Library Operations

**File:** `ModelLibrary.tsx`

Rename and delete call the API with no loading indicator and no protection against double-submission.

---

### 2.11 LOW: Accessibility Gaps

- UploadPanel drop zone lacks `aria-label`
- ModelLibrary edit/delete buttons use unicode symbols (✎ ✕) with no `aria-label`
- StatusBar messages should use `role="status"` and `aria-live="polite"`
- Color-only status indicators need text fallback

---

### 2.12 LOW: `204` Returns `undefined as T`

**File:** `api.ts`

```typescript
if (res.status === 204) return undefined as T;
```

This is a type lie. The return type says `Promise<T>` but returns `undefined`. Should be `Promise<T | void>` or a separate function for delete operations.

---

## 3. Infrastructure (Docker / Config)

### 3.1 CRITICAL: Both Containers Run as Root

**Files:** `Dockerfile`, `frontend/Dockerfile`

Neither Dockerfile has a `USER` directive. Containers run as UID 0. If an attacker exploits a vulnerability in uvicorn or Vite, they have root access inside the container.

**Fix:** Add a non-root user:
```dockerfile
RUN useradd -m -u 1000 app
USER app
```

---

### 3.2 CRITICAL: No Health Checks

**Files:** `Dockerfile`, `docker-compose.yml`

Neither container has a health check. `depends_on: [backend]` in docker-compose only waits for the container to *start*, not for uvicorn to be *ready*. The frontend can start before the backend is accepting requests.

**Fix:** Add `HEALTHCHECK` to the backend Dockerfile targeting `/api/health`. Add `condition: service_healthy` to the frontend's `depends_on`.

---

### 3.3 HIGH: Vite Proxy Configuration Is Malformed

**File:** `frontend/vite.config.ts`

```typescript
proxy: {
    "/api": process.env.VITE_API_URL ?? "http://localhost:8010",
}
```

Passing a string works for simple cases but is missing `changeOrigin: true`, which means the `Host` header won't be rewritten. This can cause issues with backend routing/CORS.

**Fix:**
```typescript
proxy: {
    "/api": {
        target: process.env.VITE_API_URL ?? "http://localhost:8010",
        changeOrigin: true,
    },
}
```

---

### 3.4 HIGH: Frontend Dockerfile Runs Dev Server

**File:** `frontend/Dockerfile`

```dockerfile
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3010"]
```

The dev server is intentional per agent-memories ("intentional so hot reload works inside Docker for a local-only tool"). This is acceptable for the current scope but should be documented clearly as a conscious trade-off, not an oversight. If this tool is ever shared beyond local use, a production build stage is required.

---

### 3.5 HIGH: Three.js Version Mismatch with Agent-Memories

**File:** `frontend/package.json` vs. agent-memories

Agent-memories specify **Three.js v0.160.0** as the target version (consistent with examples). The actual installed version is **`three@^0.183.2`** — a 23-version jump. R3F `^9.5.0` and drei `^10.7.7` are also far newer than what v0.160.0 era packages would be.

This may be intentional (newer is often better), but it contradicts the spec and could cause subtle rendering differences vs. the example files. If the examples are visual references, the version gap matters.

**Action needed:** Decide whether to pin to 0.160.0 (matching examples) or update the agent-memories to reflect the actual version. Don't leave the contradiction.

---

### 3.6 MEDIUM: `.env.example` Is Incomplete

Missing variables:
- `VITE_API_URL` (frontend needs this in Docker)
- `CORS_ORIGINS` (currently hardcoded)
- `LOG_LEVEL`
- `ENV` / `ENVIRONMENT`

---

### 3.7 MEDIUM: `.gitignore` Missing Key Patterns

- `*.db` — SQLite databases should not be committed
- `frontend/dist/` — build output
- `frontend/node_modules/` — may not be covered by root-level pattern depending on git config

---

### 3.8 MEDIUM: CORS Is Partially Hardcoded

**File:** `server.py`

```python
allow_origins=["http://localhost:3010", "http://frontend:3010"]
```

Correct for local dev but should be configurable via environment variable for any other deployment.

---

### 3.9 LOW: Frontend `<title>` Is Generic

**File:** `frontend/index.html`

```html
<title>frontend</title>
```

Should be `VML 3D Renderer` or similar.

---

### 3.10 LOW: ESLint `ecmaVersion` Mismatches tsconfig

**File:** `frontend/eslint.config.js`

`ecmaVersion: 2020` while `tsconfig.app.json` targets `ES2023`.

---

## 4. Cross-Cutting Concerns

### 4.1 No Tests Exist

There are no test files anywhere in the project — no `pytest`, no `vitest`, no `@testing-library`. The `pyproject.toml` has no test dependencies. `package.json` has no test script.

For a pipeline with an LLM at its core (inherently non-deterministic), the *deterministic* parts — extraction, normalization, geometry factory, color resolution, database CRUD — are exactly what should have tests. They're pure functions with clear inputs and outputs.

---

### 4.2 No CI/CD Pipeline

No GitHub Actions, no pre-commit hooks, no lint-on-save configuration. The ESLint config exists but nothing enforces it.

---

### 4.3 Missing: Request/Response Logging Middleware

The agent-memories correctly identify observability as architecture. The debug panel covers the frontend. But there's no request logging middleware on the backend — no way to see request timing, status codes, or error rates without adding instrumentation.

---

## 5. Summary by Priority

### CRITICAL (Fix Now)

| # | Issue | Location |
|---|-------|----------|
| 1.1 | No logging in backend | `server.py` |
| 1.2 | File upload no size/type validation | `server.py` |
| 1.3 | Bare exception catch leaks details | `server.py` |
| 1.4 | `reload=True` in production path | `server.py` |
| 2.1 | ScenePart geometry VRAM leak | `ScenePart.tsx` |
| 2.2 | GroundGrid geometry/material leak | `GroundGrid.tsx` |
| 2.3 | Blob URL memory leak | `UploadPanel.tsx` |
| 3.1 | Containers run as root | Both Dockerfiles |
| 3.2 | No health checks | Dockerfiles + compose |

### HIGH (Fix Before Users Touch It)

| # | Issue | Location |
|---|-------|----------|
| 1.5 | No rate limiting on render endpoint | `server.py` |
| 1.6 | No input validation on request bodies | `server.py` |
| 1.7 | Unhandled `json.loads` on DB data | `server.py` |
| 2.4 | Key collisions in part lists | `SceneCanvas.tsx`, `ModelGroup.tsx` |
| 2.5 | No error boundary on Canvas | `SceneCanvas.tsx` |
| 2.6 | Silent error swallowing in useModels | `useModels.ts` |
| 2.7 | Fragile API error handling | `api.ts`, `App.tsx` |
| 3.3 | Vite proxy missing `changeOrigin` | `vite.config.ts` |
| 3.5 | Three.js version contradicts spec | `package.json` vs. memories |
| 4.1 | No tests whatsoever | Project-wide |

### MEDIUM (Fix Before Stage 2)

| # | Issue | Location |
|---|-------|----------|
| 1.8 | Silent empty return in extractor | `extractor.py` |
| 1.9 | No DB indices on foreign keys | `models.py` |
| 1.10 | N+1 queries in scene serialization | `server.py` |
| 1.11 | No cascade deletes | `models.py` |
| 1.12 | Fragile prompt file path | `prompt.py` |
| 2.8 | Race condition in addToScene | `App.tsx` |
| 2.9 | Fragmented state management | `App.tsx` |
| 2.10 | No loading states on library ops | `ModelLibrary.tsx` |
| 3.6 | Incomplete `.env.example` | `.env.example` |
| 3.7 | `.gitignore` missing patterns | `.gitignore` |
| 3.8 | CORS origins hardcoded | `server.py` |

### LOW (Opportunistic)

| # | Issue | Location |
|---|-------|----------|
| 1.13 | Loose dependency pinning | `pyproject.toml` |
| 1.14 | Placeholder project metadata | `pyproject.toml` |
| 1.15 | Missing type hints on routes | `server.py` |
| 2.11 | Accessibility gaps | Multiple components |
| 2.12 | `204` returns `undefined as T` | `api.ts` |
| 3.9 | Generic page title | `index.html` |
| 3.10 | ESLint/tsconfig ecmaVersion mismatch | Config files |
| 4.2 | No CI/CD pipeline | Project-wide |

---

## 6. What's Done Well

Credit where it's due:

- **Architecture is clean.** The pipeline stages (upload → prompt → extract → render) map directly onto code boundaries. The file tree is navigable.
- **The immutable model / mutable instance split** is correct and will scale to Stage 2 without rework.
- **TypeScript strict mode** is enabled with good compiler settings.
- **R3F was the right framework choice.** The component model maps naturally to the scene graph. The irony is that the imperative `useMemo` pattern partially undermines this — but the fix is straightforward.
- **The extraction strategy** (last fence, two-pass fallback) is well-thought-out and handles real LLM output patterns.
- **Debug panel designed in from day one** — exactly right for an LLM-powered system.
- **Vite proxy** keeps frontend/backend coupling minimal.
- **Docker Compose as single entry point** — correct for a local tool.

---

*End of audit. Recommendations are ordered by impact, not effort. Start with the CRITICAL list — most fixes are under 20 lines each.*
