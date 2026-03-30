# Implementation Plan: Code Audit Hardening

**Date:** 2026-03-30
**Author:** Claude Opus 4.6 (Senior Lead)
**Source:** [code-audit.md](code-audit.md)
**Target Developer:** Claude Sonnet (agent)

---

## Scope

This plan covers all **9 CRITICAL** and **10 HIGH** issues from the 2026-03-30 code audit, organized into 5 implementation phases. Each phase builds on the previous — do not skip ahead. MEDIUM issues are listed in Phase 6 as a backlog. LOW issues are a bullet list at the end.

## Decision Required Before Starting

**Three.js version contradiction (audit 3.5).** The agent-memories specify v0.160.0 but `package.json` has `three@^0.183.2`. Downgrading would also require downgrading `@react-three/fiber` and `@react-three/drei` to compatible versions — high risk for no clear benefit.

**Decision: Keep current versions. Update the agent-memories entry "Three.js Rendering: Version, Lighting, and Interaction Patterns" to reflect v0.183.x as the actual version. Note that the examples still reference v0.160.0 via CDN — they are style references, not version targets.**

## How to Verify Work

Since no tests exist yet, run `docker compose up --build` after each phase and manually verify the acceptance criteria. Phase 5 is infrastructure — verify with `docker ps` and `docker exec`.

---

## Phase 1: Backend Logging Foundation

**Why first:** Every subsequent phase produces events that need to be visible. Logging must exist before error handling, validation, and rate limiting can be verified.

**Issues addressed:** 1.1 (CRITICAL), 4.3 (cross-cutting)

### Files to Change

#### `src/renderer/server.py`

Add `import logging` and a module-level logger. Configure structured JSON logging in the `lifespan` function, before `init_db()`:

```python
import logging
import json as json_mod

logger = logging.getLogger(__name__)

class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_entry = {
            "timestamp": self.formatTime(record),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)
        return json_mod.dumps(log_entry)

# Inside lifespan(), before init_db():
handler = logging.StreamHandler()
handler.setFormatter(JSONFormatter())
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    handlers=[handler],
)
logger.info("Server started, database initialized")
```

Add log statements at these points in the render endpoint:
- Entry: `logger.info("Render request received, content_type=%s, size=%d", image.content_type, len(image_bytes))`
- Gemini call start: `logger.info("Calling Gemini API, model=%s", model_name)`
- Gemini call end: `logger.info("Gemini response received in %.1fms", duration_ms)` (wrap the API call in timing)
- Extraction result: `logger.info("Extraction complete, %d parts", len(parts))`
- All error paths: `logger.error(...)` with `exc_info=True`

Do NOT log file contents or the full raw LLM response at INFO level — use DEBUG.

#### `src/renderer/extractor.py`

Add `logger = logging.getLogger(__name__)`. Log:
- Which extraction pass succeeded (fence match vs. regex fallback)
- Extraction failure before raising `ExtractionError`

#### `src/renderer/prompt.py`

Add a log confirming prompt loaded: `logger.info("Prompt loaded, %d chars", len(text))`

### Acceptance Criteria

- [ ] `docker compose up` produces structured JSON log lines to stdout
- [ ] A successful render produces at least 3 log lines: request received, Gemini call completed (with duration ms), extraction succeeded (with part count)
- [ ] A failed render (e.g., missing API key) produces an ERROR log with exception type
- [ ] `LOG_LEVEL=DEBUG` increases verbosity; default INFO hides debug-level output

---

## Phase 2: Backend Security Hardening

**Why second:** Validation prevents the most severe attack vectors (OOM, info leaks). Must be in place before rate limiting (defense-in-depth).

**Issues addressed:** 1.2 (CRITICAL), 1.3 (CRITICAL), 1.4 (CRITICAL), 1.6 (HIGH), 1.7 (HIGH)

**Depends on:** Phase 1 (error paths must log)

### Files to Change

#### `src/renderer/server.py`

**Task 2a — File upload validation (issue 1.2)**

Define constants at module level:

```python
MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAGIC_BYTES = {
    "image/jpeg": b"\xff\xd8\xff",
    "image/png": b"\x89PNG\r\n\x1a\n",
    "image/webp": b"RIFF",  # also check bytes 8-12 == b"WEBP"
}
```

In the render endpoint, immediately after `image_bytes = await image.read()`:

```python
if len(image_bytes) > MAX_UPLOAD_SIZE:
    raise HTTPException(status_code=413, detail="File too large (max 10MB)")

content_type = image.content_type or ""
if content_type not in ALLOWED_MIME_TYPES:
    raise HTTPException(status_code=415, detail="Unsupported image type")

expected_magic = MAGIC_BYTES.get(content_type, b"")
if not image_bytes.startswith(expected_magic):
    logger.warning("Magic byte mismatch: claimed %s", content_type)
    raise HTTPException(status_code=415, detail="File content does not match declared type")

# Additional check for WebP (bytes 8-12)
if content_type == "image/webp" and image_bytes[8:12] != b"WEBP":
    logger.warning("WebP magic byte mismatch")
    raise HTTPException(status_code=415, detail="File content does not match declared type")
```

**Task 2b — Specific exception handling (issue 1.3)**

Replace the bare `except Exception as exc` around the Gemini API call:

```python
import google.api_core.exceptions  # add to imports

# Replace the existing except block:
except google.api_core.exceptions.GoogleAPIError as exc:
    logger.error("Gemini API error: %s", exc, exc_info=True)
    raise HTTPException(status_code=502, detail="AI model service error")
except (ConnectionError, TimeoutError) as exc:
    logger.error("Network error calling Gemini: %s", exc, exc_info=True)
    raise HTTPException(status_code=503, detail="AI model service unavailable")
except ExtractionError as exc:
    logger.warning("Extraction failed: %s", exc)
    raise HTTPException(
        status_code=422,
        detail={"error": str(exc), "raw_response": exc.raw_response},
    )
except Exception as exc:
    logger.exception("Unexpected error in render endpoint")
    raise HTTPException(status_code=500, detail="Internal server error")
```

Key rule: **never include `str(exc)` in client-facing detail for unexpected exceptions.** Log it server-side, return a generic message.

**Task 2c — Remove reload=True (issue 1.4)**

Change the `start()` function:

```python
def start():
    uvicorn.run(
        "renderer.server:app",
        host="0.0.0.0",
        port=8010,
        reload=os.getenv("ENV") != "production",
    )
```

**Task 2d — Pydantic field validation (issue 1.6)**

Update all request models:

```python
from pydantic import BaseModel, Field

class SaveModelRequest(BaseModel):
    name: str = Field(max_length=255)
    parts: list = Field(max_length=1000)

class RenameModelRequest(BaseModel):
    name: str = Field(max_length=255)

class CreateSceneRequest(BaseModel):
    name: str = Field(max_length=255)

class AddInstanceRequest(BaseModel):
    model_id: int
    pos_x: float = Field(default=0.0, ge=-1000, le=1000)
    pos_y: float = Field(default=0.0, ge=-1000, le=1000)
    pos_z: float = Field(default=0.0, ge=-1000, le=1000)
    rot_x: float = Field(default=0.0, ge=-6.284, le=6.284)
    rot_y: float = Field(default=0.0, ge=-6.284, le=6.284)
    rot_z: float = Field(default=0.0, ge=-6.284, le=6.284)
    scale_x: float = Field(default=1.0, ge=0.001, le=100)
    scale_y: float = Field(default=1.0, ge=0.001, le=100)
    scale_z: float = Field(default=1.0, ge=0.001, le=100)
```

Apply the same bounds to `UpdateInstanceRequest` (keeping fields `Optional`).

**Task 2e — Safe json.loads (issue 1.7)**

Create a helper function and replace all three bare `json.loads(r.parts_json)` calls:

```python
def _safe_load_parts(parts_json: str) -> list:
    try:
        data = json.loads(parts_json)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, TypeError):
        logger.warning("Corrupt parts_json in database: %s", parts_json[:200])
        return []
```

Three call sites: `list_models()`, `get_model()`, `_serialise_instance()`.

### Acceptance Criteria

- [ ] Uploading a file >10MB returns HTTP 413
- [ ] Uploading a `.txt` renamed to `.jpg` returns HTTP 415 (magic byte mismatch logged at WARNING)
- [ ] A Gemini API timeout returns HTTP 503 with generic message; full traceback in server logs only
- [ ] `name` longer than 255 chars to `POST /api/models` returns HTTP 422
- [ ] `pos_x: 1e308` to add-instance returns HTTP 422
- [ ] Manually corrupting `parts_json` in SQLite does not crash `GET /api/models`; returns `part_count: 0`, logs a warning

---

## Phase 3: Rate Limiting and Health Checks

**Why third:** Defense-in-depth on top of validated endpoints. Health checks are grouped here as short infrastructure tasks.

**Issues addressed:** 1.5 (HIGH), 3.2 (CRITICAL)

**Depends on:** Phase 2

### Files to Change

#### `pyproject.toml`

Add to dependencies: `"slowapi>=0.1.9"`

#### `src/renderer/server.py`

Add rate limiting to the render endpoint only:

```python
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# On the render endpoint:
@app.post("/api/render")
@limiter.limit(os.getenv("RATE_LIMIT", "10/minute"))
async def render(request: Request, image: UploadFile = File(...)):
    ...
```

Note: `slowapi` requires a `request: Request` parameter in the endpoint signature. Add it.

#### `Dockerfile`

Add before `CMD`:

```dockerfile
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8010/health')"]
```

#### `docker-compose.yml`

Update frontend `depends_on`:

```yaml
depends_on:
  backend:
    condition: service_healthy
```

### Acceptance Criteria

- [ ] 11th render request within 60 seconds from same IP returns HTTP 429
- [ ] `docker ps` shows backend as "healthy"
- [ ] Frontend container does not start until backend health check passes
- [ ] Non-render endpoints are not rate limited

---

## Phase 4: Frontend Memory Leaks and Error Handling

**Why fourth:** Independent of backend phases but sequenced here so the typed `ApiError` class (task 4d) works correctly with improved backend error responses from Phase 2.

**Issues addressed:** 2.1 (CRITICAL), 2.2 (CRITICAL), 2.3 (CRITICAL), 2.4 (HIGH), 2.5 (HIGH), 2.6 (HIGH), 2.7 (HIGH)

**Depends on:** Phase 2 (backend error responses)

### Files to Change

#### `frontend/src/three/ScenePart.tsx`

**Task 4a — Geometry disposal.** Add `useEffect` import. After the `wireframeGeo` useMemo, add:

```typescript
useEffect(() => {
  return () => {
    geometry?.dispose();
    wireframeGeo?.dispose();
  };
}, [geometry, wireframeGeo]);
```

#### `frontend/src/three/GroundGrid.tsx`

**Task 4b — GroundGrid disposal.** Add `useEffect` import. After the `group` useMemo, add:

```typescript
useEffect(() => {
  return () => {
    group.traverse((obj) => {
      if (obj instanceof THREE.Line || obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  };
}, [group]);
```

#### `frontend/src/components/UploadPanel.tsx`

**Task 4c — Blob URL revocation.** Add `useEffect` import. After state declarations:

```typescript
useEffect(() => {
  return () => {
    if (preview) URL.revokeObjectURL(preview);
  };
}, [preview]);
```

#### `frontend/src/api.ts`

**Task 4d — Typed ApiError class.** Add before the `request` function:

```typescript
export class ApiError extends Error {
  readonly raw_response: string;
  readonly status: number;

  constructor(message: string, status: number, raw_response: string = "") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.raw_response = raw_response;
  }
}
```

In the `request` function, replace the `Object.assign(new Error(...), ...)` throw with:

```typescript
throw new ApiError(body.error ?? res.statusText, res.status, body.raw_response ?? "");
```

#### `frontend/src/App.tsx`

**Task 4e — Use ApiError in catch blocks.** Import `ApiError` from `"./api"`. In `handleRender` catch:

```typescript
catch (err: unknown) {
  if (err instanceof ApiError) {
    setErrorMsg(err.message);
    setRawResponse(err.raw_response);
  } else {
    setErrorMsg(err instanceof Error ? err.message : "Unknown error");
    setRawResponse("");
  }
  setStatus("error");
}
```

#### `frontend/src/three/SceneCanvas.tsx` and `frontend/src/three/ModelGroup.tsx`

**Task 4f — Fix key collisions.** Change `key={p.label}` to `key={\`${p.label}-${i}\`}` in both files (add `i` as second parameter to `.map` callback).

#### New file: `frontend/src/three/CanvasErrorBoundary.tsx`

**Task 4g — Error boundary.** Create a React class component:

```typescript
import { Component, type ReactNode } from "react";

interface Props { children: ReactNode }
interface State { error: Error | null }

export class CanvasErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ color: "red", padding: "1rem" }}>
          <p>3D rendering error: {this.state.error.message}</p>
          <button onClick={() => this.setState({ error: null })}>Reset</button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

In `SceneCanvas.tsx`, wrap all children inside `<Canvas>` with `<CanvasErrorBoundary>`.

#### `frontend/src/hooks/useModels.ts`

**Task 4h — Surface errors.** Add error state:

```typescript
const [error, setError] = useState<string | null>(null);

const refresh = useCallback(async () => {
  try {
    setError(null);
    setModels(await listModels());
  } catch (err) {
    setError(err instanceof Error ? err.message : "Failed to load models");
  }
}, []);

return { models, error, refresh };
```

Update `ModelLibrary.tsx` to accept and display this error.

### Acceptance Criteria

- [ ] Rendering 5 different images in sequence: Chrome DevTools Performance tab shows no increasing GPU memory
- [ ] Uploading 10 images in sequence: no blob URL accumulation
- [ ] Two parts with identical labels render as separate meshes (not collapsed)
- [ ] Invalid `pathCommands` in a part shows fallback UI, not white screen
- [ ] Backend API errors display message in StatusBar and raw response in DebugPanel
- [ ] Unreachable model library API shows error message in sidebar

---

## Phase 5: Container Security

**Why last:** Dockerfile changes require full rebuild. Do them once, after all code changes are complete.

**Issues addressed:** 3.1 (CRITICAL), 3.3 (HIGH)

**Depends on:** Phases 1-4 (all code changes), Phase 3 (health check already in Dockerfile)

### Files to Change

#### `Dockerfile`

Add non-root user. Insert after all `COPY` and `RUN` commands, before `HEALTHCHECK` and `CMD`:

```dockerfile
RUN useradd -m -u 1000 app && chown -R app:app /app
USER app
```

Note: `poetry install` must run as root. The `USER` directive goes after install steps. The SQLite volume mount needs the host file to be writable by UID 1000.

#### `frontend/Dockerfile`

Same pattern. Insert after `COPY . .`, before `EXPOSE` and `CMD`:

```dockerfile
RUN groupadd -r app && useradd -r -g app -u 1000 app && chown -R app:app /app
USER app
```

#### `frontend/vite.config.ts`

Change proxy from string to object:

```typescript
proxy: {
  "/api": {
    target: process.env.VITE_API_URL ?? "http://localhost:8010",
    changeOrigin: true,
  },
},
```

### Acceptance Criteria

- [ ] `docker compose up --build` succeeds
- [ ] `docker exec <backend-container> whoami` returns `app`
- [ ] `docker exec <frontend-container> whoami` returns `app`
- [ ] API proxy works (render endpoint reachable from frontend)
- [ ] Backend health check passes
- [ ] SQLite database is readable/writable inside container

---

## Phase 6: Follow-up Backlog (MEDIUM — Before Stage 2)

These do not need full implementation detail. Address in order before starting Stage 2 work.

1. **Silent empty return in extractor (1.8)** — `extractor.py`: Change `return {"parts": []}` fallback in `_normalise()` to raise `ExtractionError`
2. **Database indices (1.9)** — `models.py`: Add `index=True` to `scene_id` and `model_id` on `SceneInstance`
3. **Cascade deletes (1.11)** — `models.py`: Add `sa_column_kwargs={"ondelete": "CASCADE"}` to both FKs. Remove manual loop-delete in `server.py`. Requires DB migration or recreation.
4. **N+1 queries (1.10)** — `server.py`: Bulk-load `StoredModel` rows in `get_scene()` with a single query + lookup dict
5. **Fragile prompt path (1.12)** — `prompt.py`: Validate file exists at startup in `lifespan`. Fail fast with clear error.
6. **Race condition in addToScene (2.8)** — `App.tsx`: Add `isCreatingScene` guard ref
7. **Fragmented state (2.9)** — `App.tsx`: Derive `canSave` from `parts.length > 0 && status === "success"`. Consider `useReducer` for Stage 2.
8. **Loading states on library ops (2.10)** — `ModelLibrary.tsx`: Disable buttons during API calls
9. **CORS from environment (3.8)** — `server.py`: Read `CORS_ORIGINS` from env, split on comma, fallback to current defaults
10. **Incomplete .env.example (3.6)** — Add `VITE_API_URL`, `CORS_ORIGINS`, `LOG_LEVEL`, `ENV`
11. **.gitignore gaps (3.7)** — Add `*.db`, `frontend/dist/`, verify `frontend/node_modules/` coverage

---

## Phase 7: LOW Issues (Bullet List)

- Update `pyproject.toml` metadata: description and author fields
- Tighten dependency pinning: add upper bounds (e.g., `fastapi>=0.111.0,<1.0.0`)
- Add return type hints to all route handlers
- Accessibility: `aria-label` on UploadPanel drop zone, library buttons; `role="status"` on StatusBar
- Fix `204` type lie in `api.ts`: `Promise<T | undefined>` or split into `requestVoid`
- Update `frontend/index.html` title to "VML 3D Renderer"
- Align ESLint `ecmaVersion: 2023` with tsconfig target
- Set up basic CI: lint + type check on push

---

## Decision Register

| Item | Context | Options | Recommendation |
|------|---------|---------|----------------|
| Three.js version (3.5) | Memories say 0.160.0, package.json has ^0.183.2 | A) Downgrade to 0.160.0 + R3F/drei B) Keep current, update memories | **B** — downgrade is high-risk, no benefit |
| Rate limit value | 10/min is a starting point | Configurable via `RATE_LIMIT` env var | Start at 10/min, adjust based on usage |
| SQLite volume permissions | Non-root user needs write access | Document in README, or pre-create file in Dockerfile | Document in README |

---

## Critical Files Summary

Files touched by multiple phases — merge carefully:

| File | Phases | Changes |
|------|--------|---------|
| `src/renderer/server.py` | 1, 2, 3 | Logging, validation, error handling, rate limiting, json.loads safety |
| `Dockerfile` | 3, 5 | Health check (P3), non-root user (P5) |
| `frontend/src/api.ts` | 4 | ApiError class, affects all frontend error handling downstream |
| `frontend/src/three/ScenePart.tsx` | 4 | VRAM leak fix — single highest-impact frontend change |
| `frontend/src/three/GroundGrid.tsx` | 4 | GPU leak requiring disposal traversal |

---

*Execute phases in order. Do not skip ahead. Mark acceptance criteria as you complete them.*
