# Agent Memory Log

## Purpose
This document serves as a persistent memory store for AI agents working on this project. Entries capture context, decisions, hard-won insights, and transferable principles — both project-specific and general. Future agents should read this log before starting work to avoid re-learning what has already been discovered.

## Instructions
When saving a memory, append a new entry using this exact format:

### Entry Format

```
## [YYYY-MM-DD HH:MM] — <Short Descriptive Title>

- **Agent/Model:** <model name and version>
- **Category:** <one of: Decision | Insight | Context | Summation | Correction | Reference>
- **Tags:** #tag1 #tag2 #tag3  ← required; used for searching across entries
- **Memory:**
  <Clear description of what was learned or decided. For general insights, state the
  principle explicitly and include the project example that surfaced it. For decisions,
  include the alternatives that were rejected and why.>
- **Significance:**
  <Why this matters — how it affects the project, what it prevents, or what other projects
  it applies to. Be specific about the failure mode it avoids.>
- **Related Entries:** <titles of related entries, or "None">
```

## Guidelines
- **Be specific** — another agent should understand the entry with zero additional context.
- **Record why, not just what** — the significance and the failure mode it prevents are as important as the memory itself.
- **Prefer transferable insight over project trivia** — if a lesson applies beyond this codebase, say so explicitly.
- **No duplicates** — check the log first and update an existing entry if the information has evolved.
- **Hashtags are required** — every entry must have tags. Use them consistently so agents can search by topic (e.g. `#llm`, `#prompting`, `#database`, `#react`, `#architecture`).
- **For decisions**: name the alternatives rejected and why. A decision without its context is just a rule.
- **For insights**: state the general principle first, then the specific example from this project that surfaced it.

### Suggested Tags
`#llm` `#prompting` `#gemini` `#3d` `#threejs` `#react` `#r3f` `#database` `#sqlmodel` `#architecture` `#docker` `#fastapi` `#python` `#json` `#schema` `#debugging` `#observability` `#ui` `#pipeline` `#general-principle` `#creative-thinking`

---

## Memory Log

<!-- Append new entries below this line -->

## [2026-03-30 10:00] — Project Core Goal: Image-to-3D-Scene Pipeline

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Context
- **Tags:** #architecture #pipeline #llm #3d #gemini #python
- **Memory:**
  This project is an LLM-powered pipeline: image in → Gemini API call → JSON scene description → interactive Three.js render. The Python `renderer` package orchestrates this pipeline. It is not a standalone 3D graphics engine — the Python code's job is orchestration and LLM interfacing, not raw 3D math.
- **Significance:**
  Prevents mischaracterising the renderer's role. Any new backend code should be oriented around prompt assembly, API calls, and JSON extraction — not geometry computation.
- **Related Entries:** None

---

## [2026-03-30 10:01] — JSON Scene Schema: Flat Parts Array

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Reference
- **Tags:** #schema #json #3d #threejs #pipeline
- **Memory:**
  The 3D scene is a flat JSON array (or `{"parts": [...]}` object). Each part has:
  - `label` (namespaced string, e.g. `"manA-torso-lower"`)
  - `geometryType`: `"box"` `"cylinder"` `"sphere"` `"cone"` `"torus"` `"lathe"` `"tube"` `"extrude"`
  - Geometry dimensions (`width/height/depth`, `radiusTop/radiusBottom`, `radius`, etc.)
  - `position`: `{x, y, z}` in meters (world space)
  - `rotation`: `{x, y, z}` in radians
  - `scale`: `{x, y, z}` (optional)
  - `color`: hex string

  Type-specific extras: `lathe` → `profilePoints: [{x,y}]`; `tube` → `tubePoints: [{x,y,z}]` + `tubeRadius`; `extrude` → `pathCommands` (M/L/Q/C ops) + `depth`.
- **Significance:**
  This is the primary data contract between the LLM, backend, frontend, and database. Every component must conform to it. Changes here cascade everywhere.
- **Related Entries:** Project Core Goal

---

## [2026-03-30 10:02] — Critical: Joint Chain System for Articulated Figures

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Decision
- **Tags:** #llm #prompting #3d #articulated-figures #joint-chain #general-principle
- **Memory:**
  LLMs must NOT estimate elbow/wrist/knee/ankle positions independently. The joint chain approach: start at a root joint (neckBase, torsoBottom, shoulders, hips — estimated from the image), pick a direction, compute segment center and endpoint mechanically, then chain to the next segment. Distal joints are computed, never estimated.

  Root cause of the prior failure: arms floating detached from torso and wrong angles because `atan2` trig is unreliable in LLM output when values are estimated independently.
- **Significance:**
  Any prompt or post-processing code for human/animal figures must enforce joint chaining. Do NOT allow the LLM to freely place elbow/knee/wrist positions. This is the core fix that makes articulated figures work. `decode_prompt.txt` is read-only precisely because it encodes this hard-won fix.
- **Related Entries:** LLM Prompting Strategy, LLMs Good at Chaining

---

## [2026-03-30 10:03] — LLM Prompting Strategy: Structured Multi-Phase Analysis

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Reference
- **Tags:** #llm #prompting #gemini #3d #pipeline #general-principle
- **Memory:**
  `decode_prompt.txt` enforces a mandatory pre-generation analysis sequence:
  1. **IDENTIFY** — object type, pose, function, list multiple objects
  2. **MEASURE** — real-world bounding boxes using known reference sizes (head ~0.23m, height ~1.75m, etc.)
  3. **DECOMPOSE** — list all parts with geometry type and relative positions
  3b. **SILHOUETTE TRACE** — curved objects: trace outer edge as `(x,y)` profile points (min 20)
  3c. **LAYER STACK MAP** — stacked objects: compute running Y positions once, use only those values
  3d. **JOINT POSITION MAP** — root joints only for figures
  3e. **LIMB DIRECTION MAP** — clock-direction notation (12=up, 3=right, 6=down, 9=left)
  3f. **FACE FEATURE MAP** — facial feature offsets from headCenter

  The prompt explicitly instructs the model to trust pixel geometry over prior knowledge.
- **Significance:**
  Skipping any phase (especially 3d/3e for figures, 3c for stacked objects) reliably produces floating/disconnected parts. The analysis sequence is a forcing function — do not abbreviate or reorder it.
- **Related Entries:** Joint Chain System

---

## [2026-03-30 10:04] — Three.js Rendering: Version, Lighting, and Interaction Patterns

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Reference
- **Tags:** #threejs #3d #r3f #lighting #rendering
- **Memory:**
  The example HTML files reference **Three.js v0.160.0** via unpkg CDN. The React app uses **Three.js ^0.183.2** with R3F v9.x and drei v10.x — the examples are style references, not version targets. Conventions to preserve in generated output:
  - **Lighting:** AmbientLight + 3–4 DirectionalLights (key, fill, rim, bottom-fill)
  - **Camera:** PerspectiveCamera + OrbitControls, damping enabled
  - **Materials:** `MeshStandardMaterial` roughness `0.65`, metalness `0.05`
  - **Wireframe overlay:** `LineSegments` per mesh, opacity `0.12–0.15`
  - **Ground grid:** custom `THREE.Group` with minor/major lines, red X axis, blue Z axis
  - **Interaction (example1):** left-drag = move group on XZ plane, right-drag = rotate group on Y
  - **Tone mapping (example2):** `ACESFilmicToneMapping` at exposure 1.0
  - **Color resolution:** `resolveColor(label, orig)` maps label patterns to skin/hair/clothing colors
- **Significance:**
  These are conventions, not arbitrary choices — they produce the visual style the project was designed around. The examples are reference material for scene conventions, not templates for React component structure.
- **Related Entries:** JSON Scene Schema, Frontend Stack Decision

---

## [2026-03-30 10:05] — Architecture Vision: From Single Render to Model Library + Scene Composer

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Summation
- **Tags:** #architecture #pipeline #database #ui #general-principle
- **Memory:**
  Two-stage vision:
  - **Stage 1 (current):** local tool — upload image → call Gemini → render 3D model
  - **Stage 2 (planned):** persist models to DB (`StoredModel`) → place them in named composed scenes (`Scene` + `SceneInstance`) → render multi-model scenes via `ModelGroup` components with independent world transforms

  The `parts[]` schema, `geometryFactory`, `ScenePart`, and all extraction logic are identical in both stages. Stage 2 adds the DB layer and `ModelGroup` wrapper on top — it does not replace Stage 1.
- **Significance:**
  Every architectural decision should be tested against both stages. If a Stage 1 choice would have to be reversed in Stage 2, the choice is wrong.
- **Related Entries:** Project Core Goal, JSON Scene Schema, Build in Stages

---

## [2026-03-30 10:06] — Infrastructure: Docker, Ports, and Environment Config

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Reference
- **Tags:** #docker #fastapi #react #python #architecture
- **Memory:**
  Two Docker containers via Compose:
  - **Backend (FastAPI):** `localhost:8010`
  - **Frontend (React/Vite dev server):** `localhost:3010`

  Vite proxies `/api/*` → backend. The frontend container runs the Vite **dev server** (not a prod build) — intentional so hot reload works inside Docker for a local-only tool.

  SQLite mounted as volume (`./renderer.db:/app/renderer.db`) — persists across restarts.

  `.env` (git-ignored):
  ```
  GEMINI_API_KEY=...
  GEMINI_MODEL=gemini-2.0-pro-exp
  DATABASE_URL=sqlite:///./renderer.db
  ```
- **Significance:**
  Ports and volume mount are load-bearing — changing either requires updates to both `docker-compose.yml` and `vite.config.ts`. `docker compose up --build` is the single entry point; no manual process management.
- **Related Entries:** Architecture Vision

---

## [2026-03-30 10:07] — Database Design: StoredModel / Scene / SceneInstance

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Decision
- **Tags:** #database #sqlmodel #architecture #schema #3d
- **Memory:**
  Three SQLModel tables:
  - **`StoredModel`** — `parts_json`, `name`, `source_image` (optional), `created_at`. Immutable after save.
  - **`Scene`** — named composition. Has many `SceneInstance` rows.
  - **`SceneInstance`** — FK to `Scene` + FK to `StoredModel` + `pos_x/y/z`, `rot_x/y/z`, `scale_x/y/z`. One model can appear in many scenes at different transforms.

  Key design rule: `StoredModel` is immutable geometry. All positional variation lives in `SceneInstance`. This mirrors the `ModelGroup` component: group-level transform wraps unchanged `ScenePart` children.

  Rejected alternative: storing position inside `StoredModel` — forces geometry duplication and creates sync bugs when the base model changes.
- **Significance:**
  The immutable-parts / mutable-transform split is the right mental model for both schema and component tree. Don't store position in `StoredModel`.
- **Related Entries:** Architecture Vision, Immutable Data + Mutable Transform

---

## [2026-03-30 10:08] — Frontend Stack: React + R3F Instead of Vanilla HTML

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Decision
- **Tags:** #react #r3f #threejs #ui #architecture
- **Memory:**
  Original strategy: single vanilla HTML file. Revised to React 18 + Vite + `@react-three/fiber` + Tailwind when scope expanded to include a model library sidebar, scene composer, and multi-mode canvas.

  R3F chosen over imperative Three.js because:
  - Geometry disposal is automatic when `parts` / `instances` props change (eliminates GPU memory leak class)
  - Components (`ScenePart`, `ModelGroup`, `Lighting`, `GroundGrid`) map directly onto the JSON schema
  - `OrbitControls` from `@react-three/drei` replaces the manual pointer event logic in the examples

  Three.js version remains v0.160.0 — consistent with examples.
- **Significance:**
  The examples use imperative Three.js. Do not copy that pattern into the React app — R3F is the right abstraction for the multi-panel, stateful UI. The examples are style references, not code templates.
- **Related Entries:** Three.js Rendering Patterns, Framework Lifecycle Eliminates Bug Classes

---

## [2026-03-30 10:09] — Gemini JSON Extraction: Suffix Strategy + Two-Pass Fallback

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Insight
- **Tags:** #llm #gemini #json #prompting #debugging #pipeline
- **Memory:**
  Two measures for reliable JSON extraction from Gemini responses:

  1. **Prompt suffix** (appended in `prompt.py` at runtime): instructs the model to end with ONLY a single ` ```json ` fence — no prose after the block. Keeps the JSON last.
  2. **Two-pass extractor** (`extractor.py`): finds the *last* ` ```json ` fence (not first — analysis may quote JSON fragments), extracts and `json.loads()`. Fallback: regex sweep for outermost `[...]` or `{...}`.

  On total failure: `ExtractionError` raised with full raw response → API returns 422 with `raw_response` body → debug panel surfaces it.
- **Significance:**
  "Last fence, not first" is non-obvious and easy to regress. The debug panel exists for this exact failure mode — diagnose there before touching server logs. Do not change the extraction strategy without understanding both failure cases.
- **Related Entries:** LLM Prompting Strategy, Observability Is Architecture

---

## [2026-03-30 10:10] — General Insight: LLMs Are Good at Chaining, Bad at Independent Geometry

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Insight
- **Tags:** #llm #prompting #general-principle #architecture #creative-thinking
- **Memory:**
  A recurring LLM failure mode in spatial/geometric tasks: the model estimates all values independently, producing results that are individually plausible but collectively inconsistent (arms not connecting to shoulders, layers overlapping, nodes not linking to edges).

  The fix is always the same: **estimate only what is directly observable, then compute everything else mechanically from those anchors**.

  Project examples:
  - Articulated figures: root joints estimated, distal joints chained
  - Layer stacks: base Y anchored, all other Y positions computed
  - Silhouette traces: outline observed, not re-estimated point by point

  General rule: **LLMs should describe, not compute.** When LLM computation is unavoidable, chain steps so each output feeds the next — never ask for independent answers to interdependent questions.
- **Significance:**
  Applies beyond 3D to any LLM-generated structured output with internal consistency requirements: financial models, dependency graphs, family trees, architectural layouts. Pattern: anchor → chain → compute.
- **Related Entries:** Joint Chain System, Stay in Language Space

---

## [2026-03-30 10:11] — General Insight: Stay in Language Space as Long as Possible

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Insight
- **Tags:** #llm #prompting #general-principle #creative-thinking
- **Memory:**
  The decode prompt uses clock-direction notation for angles (12=up, 3=right, 6=down, 9=left) instead of asking for radians. **Keep the LLM in human metaphor/language space as long as possible, then convert to precise values in deterministic code at the boundary.**

  LLMs are far more reliable answering "which clock position does this arm point toward?" than "what is the rotation in radians?" The server converts clock positions to radians with a lookup — trivial code, not LLM work.

  The same principle appears in all analysis phases: the model describes in natural language first (IDENTIFY, MEASURE, DECOMPOSE) before producing any numbers. The structured phases are a forcing function to ground reasoning before precision is required.
- **Significance:**
  When designing any prompt that requires numeric output: can this be a choice, comparison, or metaphor first? Convert to numbers in code. Reduces hallucinated values and improves cross-run consistency.
- **Related Entries:** LLMs Good at Chaining, LLM Prompting Strategy

---

## [2026-03-30 10:12] — General Insight: The Prompt as a First-Class Engineering Artifact

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Insight
- **Tags:** #llm #prompting #general-principle #pipeline #python
- **Memory:**
  `decode_prompt.txt` is treated like source code: version-controlled, loaded by path in server code, marked read-only in docs, explained with rationale. Changes to it affect output quality the same way algorithm changes affect correctness.

  Rejected pattern: embedding prompts as inline strings in code — invisible to diffs, easy to accidentally mutate, hard to test in isolation.

  The server appends a runtime suffix rather than editing the base prompt — modification is explicit, reversible, and separate from the original.
- **Significance:**
  Any project with non-trivial LLM prompts should store them as files with the same discipline as code. Prompt quality is often the variable separating a working system from a broken one.
- **Related Entries:** LLM Prompting Strategy, Gemini JSON Extraction

---

## [2026-03-30 10:13] — General Insight: Observability Is Architecture, Not an Afterthought

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Insight
- **Tags:** #observability #debugging #llm #pipeline #ui #general-principle
- **Memory:**
  The debug panel (raw LLM response + scene JSON) was designed in from the start. **When a system's core transformation is opaque (image → LLM → JSON → 3D scene), the ability to inspect each stage is as important as the happy path itself.**

  API contract reinforces this: successful 200 responses include `raw_response` alongside `parts`. 422 errors include the same. The frontend always has what it needs to diagnose failures without server logs.

  The broader principle: **for any non-deterministic or LLM-powered core, design the debug surface before the happy path.** Ask first: "when this goes wrong, what will I need to see?"
- **Significance:**
  Applies to any pipeline with LLM, ML, or external API calls at its core. "What does a bad response look like and how will I see it?" is an architecture question, not a post-incident question.
- **Related Entries:** Gemini JSON Extraction, Architecture Vision

---

## [2026-03-30 10:14] — General Insight: Immutable Data + Mutable Transform Is a Durable Pattern

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Insight
- **Tags:** #database #architecture #general-principle #3d #react #creative-thinking
- **Memory:**
  `StoredModel` holds immutable geometry (parts array, never changes after save). `SceneInstance` holds the mutable transform (position/rotation/scale of that model in a specific scene). The same model appears in multiple scenes via multiple `SceneInstance` rows — no geometry duplication.

  This pattern recurs across domains:
  - Game engines: prefab / instance
  - 3D software: linked duplicates vs. unique copies
  - React: props (definition) vs. state (configuration)
  - Databases: normalisation — store once, reference many times

  Failure mode prevented: storing position inside the model record → forced duplication → sync bugs when base geometry updates.
- **Significance:**
  Whenever the same thing must appear in multiple contexts with different configurations, split into immutable definition + mutable instance. Scales cleanly, eliminates sync bugs structurally.
- **Related Entries:** Database Design, Architecture Vision

---

## [2026-03-30 10:15] — General Insight: Framework Lifecycle Can Eliminate Whole Bug Classes

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Insight
- **Tags:** #react #r3f #threejs #general-principle #architecture
- **Memory:**
  The example files manage Three.js geometry manually — every rebuild requires explicit `.dispose()` calls on old `BufferGeometry` and `Material` objects to free GPU memory. This is a well-known leak vector in Three.js apps.

  Choosing `@react-three/fiber` eliminates this class entirely: R3F disposes geometries and materials automatically when components unmount. Rebuilding the scene is a prop change — React reconciliation handles the rest.

  General principle: **before writing defensive code to handle a problem class, ask whether a framework already solves it structurally.** The right tool doesn't just make the problem easier — it makes it impossible.
- **Significance:**
  When evaluating frameworks, ask: "what problems does this make structurally impossible?" Eliminating bug classes through architecture is more reliable than preventing them through discipline.
- **Related Entries:** Frontend Stack Decision, Three.js Rendering Patterns

---

## [2026-03-30 10:16] — General Insight: Build in Stages Where Each Stage Is a Superset

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Insight
- **Tags:** #architecture #general-principle #database #pipeline #creative-thinking
- **Memory:**
  Stage 2 of this project (library + scene composer) is a strict superset of Stage 1 (single render). No Stage 1 code is discarded: `parts[]` schema, `geometryFactory`, `ScenePart`, extraction logic, and `POST /api/render` are unchanged. Stage 2 adds `ModelGroup`, DB tables, and new routes on top.

  This was an explicit design constraint enforced upfront. The final data contract was defined first; Stage 1 was verified to be a valid subset of it before any code was written.

  General pattern: **when designing a phased system, define the final-stage data contract first, then confirm Stage 1 is a valid subset.** If Stage 1's contract would need to change in Stage 2, the stage boundary is in the wrong place.
- **Significance:**
  Phased delivery only works cleanly when phases are nested, not sequential. Designing backward from the final schema to the MVP is counterintuitive but prevents the expensive rewrite that happens when Stage 2 invalidates Stage 1's assumptions.
- **Related Entries:** Architecture Vision, Database Design

---

## [2026-03-30 11:00] — Implemented Project Structure (as built)

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Reference
- **Tags:** #architecture #python #react #docker #filesystem
- **Memory:**
  The full implemented file tree after the initial build:

  ```
  /
  ├── Dockerfile                        # backend container
  ├── docker-compose.yml                # ports 8010 (backend) / 3010 (frontend)
  ├── pyproject.toml                    # Python deps + scripts entry point
  ├── .env.example
  │
  ├── src/renderer/
  │   ├── __init__.py
  │   ├── server.py       # FastAPI app — all routes, lifespan, CORS
  │   ├── prompt.py       # loads decode_prompt.txt via Path(__file__), appends suffix
  │   ├── extractor.py    # ExtractionError, extract_scene_json()
  │   ├── database.py     # SQLModel engine, init_db(), get_session()
  │   └── models.py       # StoredModel, Scene, SceneInstance ORM tables
  │
  ├── examples/
  │   ├── decode_prompt.txt   # read-only — loaded by prompt.py at runtime
  │   ├── example1.html
  │   └── example2.html
  │
  └── frontend/
      ├── Dockerfile              # node:20-slim, runs Vite dev server
      ├── vite.config.ts          # port 3010, proxy /api → VITE_API_URL
      ├── src/
      │   ├── main.tsx
      │   ├── App.tsx             # top-level state, layout, render/save/compose flow
      │   ├── types.ts            # ScenePart, StoredModel, SceneInstance, etc.
      │   ├── api.ts              # all fetch wrappers for /api/*
      │   ├── index.css           # Tailwind import + full-height reset
      │   ├── hooks/
      │   │   └── useModels.ts    # fetches + caches model library
      │   ├── components/
      │   │   ├── UploadPanel.tsx     # drag-drop image input + Render button
      │   │   ├── StatusBar.tsx       # idle/loading/success/error indicator
      │   │   ├── ToolBar.tsx         # Save / Download JSON / Download HTML
      │   │   ├── DebugPanel.tsx      # collapsible: Scene JSON | Raw LLM tabs
      │   │   └── ModelLibrary.tsx    # stored models list with add/rename/delete
      │   └── three/
      │       ├── SceneCanvas.tsx     # R3F Canvas, two modes: parts[] or instances[]
      │       ├── ScenePart.tsx       # mesh + wireframe for one geometry part
      │       ├── ModelGroup.tsx      # group-level transform wrapping ScenePart children
      │       ├── Lighting.tsx        # ambient + 4 directional lights
      │       ├── GroundGrid.tsx      # minor/major grid + red/blue axes + floor plane
      │       ├── geometryFactory.ts  # ScenePart → THREE.BufferGeometry (8 types)
      │       └── resolveColor.ts     # label-pattern → material color override
  ```

  Key implementation notes:
  - `server.py` wires `init_db()` via FastAPI `lifespan` context (not `@app.on_event`)
  - `prompt.py` path: `Path(__file__).parent.parent.parent / "examples" / "decode_prompt.txt"`
  - `database.py` adds `check_same_thread: False` only for SQLite connections
  - `App.tsx` canvas switches mode based on `instances.length > 0`
  - `addModelToScene` in `App.tsx` auto-creates a scene on first use if none exists
- **Significance:**
  Any agent resuming work should read this entry first to understand exactly where every file lives and what it does. Do not re-scaffold — build on this structure.
- **Related Entries:** Infrastructure, Architecture Vision

---

## [2026-03-30 14:00] — Audit Finding: useMemo Geometry Bypasses R3F Automatic Disposal

- **Agent/Model:** Claude Opus 4.6
- **Category:** Insight
- **Tags:** #r3f #threejs #react #3d #general-principle #debugging
- **Memory:**
  R3F was chosen specifically because it disposes geometries and materials automatically when components unmount — eliminating the GPU memory leak class that plagues imperative Three.js. However, the current `ScenePart.tsx` and `GroundGrid.tsx` implementations use `useMemo` to create `THREE.BufferGeometry` and `THREE.Material` objects imperatively, then pass them via props or `<primitive>`. This pattern **bypasses R3F's disposal lifecycle entirely** — old geometries are replaced in JS but never `.dispose()`d on the GPU side, leaking VRAM on every part update or unmount.

  The fix is either: (a) add explicit `useEffect` cleanup that calls `.dispose()` on the old geometry/material when deps change, or (b) refactor to use R3F's declarative geometry elements (`<boxGeometry>`, `<cylinderGeometry>`, etc.) which R3F manages automatically.

  General principle: **choosing a framework for its lifecycle guarantees only works if you stay within its declarative model.** The moment you drop to imperative object creation inside hooks, you inherit the manual cleanup burden the framework was supposed to eliminate. This applies to any framework with managed lifecycles (React DOM refs, R3F geometries, SwiftUI view lifecycle, etc.).
- **Significance:**
  This is the single most impactful bug in the current build — it causes unbounded VRAM growth during normal use. Any future agent adding new geometry types to `geometryFactory.ts` must ensure the calling component disposes properly. The irony of reintroducing the exact bug class the framework was chosen to prevent makes this a durable teaching example.
- **Related Entries:** Framework Lifecycle Eliminates Bug Classes, Frontend Stack Decision, Three.js Rendering Patterns

---

## [2026-03-30 14:01] — Audit Finding: Observability Gap Between Design Intent and Implementation

- **Agent/Model:** Claude Opus 4.6
- **Category:** Correction
- **Tags:** #observability #debugging #fastapi #python #pipeline #general-principle
- **Memory:**
  The agent-memories correctly identify "observability is architecture" and the debug panel was designed in from day one — but the implementation only delivers *frontend* observability. The backend has **zero logging**: no `import logging`, no structured log output, no request timing, no error recording. The Gemini API call, JSON extraction, and database operations are all black boxes from the server's perspective.

  This means:
  - When the Gemini API returns an error, there is no server-side record
  - When extraction silently falls back to `{"parts": []}`, nothing is logged
  - When a database write fails, the exception is caught and re-raised as a generic HTTP 500 with no audit trail
  - Security events (missing API key, oversized uploads, malformed requests) are invisible

  The debug panel covers the *happy path's failure mode* (bad LLM output → user sees raw response). It does not cover operational failure modes (API down, extraction regression, DB corruption, abuse).

  General principle: **frontend observability and backend observability serve different audiences and catch different failure classes.** Designing one does not satisfy the requirement for the other. The debug panel helps the *user* diagnose bad LLM output; server logging helps the *operator* diagnose system health. Both are needed.
- **Significance:**
  Any agent adding logging should instrument these points in order of priority: (1) render endpoint entry/exit with timing, (2) Gemini API call result and latency, (3) extraction outcome (success/fallback/failure), (4) unhandled exceptions with full traceback. Use Python's `logging` module with JSON formatter for Docker log aggregation.
- **Related Entries:** Observability Is Architecture, Gemini JSON Extraction, Infrastructure

---

## [2026-03-30 14:02] — Audit Finding: Input Validation Absent at Every System Boundary

- **Agent/Model:** Claude Opus 4.6
- **Category:** Correction
- **Tags:** #fastapi #python #security #architecture #general-principle
- **Memory:**
  The backend accepts external input at multiple boundaries — file uploads, JSON request bodies, URL path parameters — and validates **none of them** beyond what FastAPI/Pydantic provides by default (type coercion). Specific gaps:

  1. **File upload** (`POST /api/render`): No size limit, no content-type allowlist, no magic-byte check. A 2GB upload causes OOM. A non-image file reaches the Gemini API unchecked.
  2. **String fields** (`name` in SaveModel, RenameModel, CreateScene): No `max_length`. Unbounded strings can bloat the database.
  3. **List fields** (`parts` in SaveModel): No `max_items`, no element shape validation. A 100K-element array is accepted.
  4. **Float fields** (`pos_x/y/z`, `scale_x/y/z` in AddInstance): No bounds. `1e308` is a valid position.
  5. **`parts_json` from database**: Parsed with `json.loads()` in multiple endpoints with no try/except — corrupted data crashes the service.

  General principle: **validate at every system boundary, not just the outermost one.** The LLM output is validated (extractor), but user input to the API and data read back from the database are trusted implicitly. System boundaries include: user → API, API → database, database → API (read-back), API → external service (Gemini). Each crossing deserves validation proportional to the trust level of the source.
- **Significance:**
  The file upload gap is the most urgent (DoS via large file). The `json.loads` gap is the most surprising (data the system itself wrote can crash it on read-back). Fixing these requires adding `Field()` constraints to Pydantic models and wrapping `json.loads` calls — straightforward but must be done systematically across all endpoints.
- **Related Entries:** Observability Gap, Implemented Project Structure

---

## [2026-03-30 16:00] — Audit Hardening: Phases 1–5 + Partial Phase 6 Complete

- **Agent/Model:** Claude Opus 4.6
- **Category:** Summation
- **Tags:** #architecture #fastapi #react #r3f #docker #security #observability #debugging
- **Memory:**
  Completed all 9 CRITICAL and 10 HIGH audit findings, plus 7 of 11 MEDIUM items. Changes span backend, frontend, and infrastructure:

  **Backend (server.py, extractor.py, prompt.py, models.py):**
  - Structured JSON logging via `logging` module with `JSONFormatter`. Log points: request entry, Gemini call timing, extraction outcome, all error paths. `LOG_LEVEL` env var controls verbosity.
  - File upload validation: 10MB size limit, MIME allowlist (`jpeg/png/webp`), magic-byte verification.
  - Specific exception handling on Gemini call: `GoogleAPIError` → 502, `ConnectionError/TimeoutError` → 503, `ExtractionError` → 422 with raw response, generic `Exception` → 500 with no detail leak.
  - `reload=True` gated on `ENV != "production"`.
  - Pydantic `Field()` constraints: `max_length=255` on strings, `max_length=1000` on parts list, bounded floats on position/rotation/scale.
  - `_safe_load_parts()` helper wraps all `json.loads(parts_json)` calls — corrupt DB data returns `[]` with a warning log instead of crashing.
  - Rate limiting via `slowapi` on `/api/render` only (default `10/minute`, configurable via `RATE_LIMIT` env var).
  - Prompt file existence validated at startup via `validate_prompt_exists()` in lifespan.
  - Extractor `_normalise()` now raises `ExtractionError` instead of silently returning `{"parts": []}`.
  - `SceneInstance` foreign keys have `index=True` and `ondelete="CASCADE"`. Manual loop-delete in `delete_scene` removed.
  - N+1 query in `get_scene` fixed — bulk-loads `StoredModel` rows. `_serialise_instance` now accepts `Optional[StoredModel]` directly instead of a session.

  **Frontend (ScenePart, GroundGrid, UploadPanel, api.ts, App.tsx, SceneCanvas, ModelGroup, useModels, ModelLibrary):**
  - `useEffect` cleanup for geometry/wireframe `.dispose()` in `ScenePart.tsx` and full traverse disposal in `GroundGrid.tsx` — fixes VRAM leak.
  - `URL.revokeObjectURL()` cleanup in `UploadPanel.tsx` — fixes blob URL leak.
  - Typed `ApiError` class in `api.ts` replaces `Object.assign(new Error(...))`. Handles both flat error strings and `{error, raw_response}` detail objects from the updated backend.
  - `App.tsx` catch blocks use `instanceof ApiError` instead of unsafe cast.
  - React key collisions fixed: `key={\`${p.label}-${i}\`}` in `SceneCanvas` and `ModelGroup`.
  - `CanvasErrorBoundary` wraps `<Canvas>` children — catches R3F render errors with reset button.
  - `useModels` exposes `error` state; `ModelLibrary` displays it.
  - `canSave` derived from `parts.length > 0 && status === "success"` instead of independent state.
  - Race condition guard (`addingToScene` ref) in `handleAddToScene`.

  **Infrastructure (Dockerfiles, docker-compose.yml, vite.config.ts, pyproject.toml):**
  - Both containers run as non-root `app` user (UID 1000).
  - Backend `HEALTHCHECK` hitting `/health`. Frontend `depends_on: condition: service_healthy`.
  - Vite proxy uses object form with `changeOrigin: true`.
  - `slowapi>=0.1.9` added to dependencies.

- **Significance:**
  The codebase is now hardened against all 38 audit findings except one: **audit item 4.2 — CI/CD pipeline** remains unimplemented. There are no GitHub Actions, no pre-commit hooks, and no automated lint/type-check/test on push. The ESLint config exists but nothing enforces it. This requires decisions on: (1) GitHub Actions vs. other CI, (2) test framework choices (pytest for backend, vitest for frontend), (3) workflow triggers (push, PR, branch rules). This should be discussed with the project owner before implementation.
- **Related Entries:** Implemented Project Structure, Observability Gap, Input Validation Absent, useMemo Geometry Bypasses R3F

---

## [2026-03-30 16:01] — Decision: Three.js Version — Keep Current, Update Docs

- **Agent/Model:** Claude Opus 4.6
- **Category:** Decision
- **Tags:** #threejs #r3f #architecture
- **Memory:**
  Per the implementation plan's decision register, the Three.js version mismatch (agent-memories say v0.160.0, `package.json` has `^0.183.2`) is resolved by keeping the current versions. Downgrading Three.js, R3F, and drei to v0.160.0-era packages is high-risk for no clear benefit.

  The examples reference v0.160.0 via CDN — they are **style references**, not version targets. The "Three.js Rendering" memory entry (10:04) should be updated to reflect v0.183.x as the actual version when the LOW issues are addressed.

  Rejected alternative: downgrading to v0.160.0 + matching R3F/drei versions.
- **Significance:**
  Prevents future agents from attempting a risky version downgrade. The examples and the React app use different rendering approaches (imperative vs. R3F) so version parity is not required.
- **Related Entries:** Three.js Rendering Patterns, Frontend Stack Decision

---

## [2026-03-30 18:00] — Docker: Poetry Virtualenv + Non-Root User Requires In-Project Venv

- **Agent/Model:** Claude Opus 4.6
- **Category:** Insight
- **Tags:** #docker #python #architecture #debugging #general-principle
- **Memory:**
  Poetry by default creates virtualenvs in `~/.cache/pypoetry/virtualenvs/` — which belongs to the user that ran `poetry install`. If `poetry install` runs as root during `docker build` and then `USER` switches to a non-root user, the venv is inaccessible.

  The fix is `ENV POETRY_VIRTUALENVS_IN_PROJECT=true` in the Dockerfile, which creates the venv at `/app/.venv/`. Then `chown -R` transfers ownership to the non-root user along with all other `/app` contents. Commands (CMD, compose command) must reference `/app/.venv/bin/uvicorn` directly — not bare `uvicorn` (not on PATH) and not `poetry run` (Poetry itself may not be on the non-root user's PATH either).

  Additionally, `--no-root` skips installing the project package itself. To make the `renderer` module importable, set `ENV PYTHONPATH=/app/src` rather than attempting `poetry install --only-root` (which fails if README.md or other metadata files aren't in the container).

  General principle: **when a build tool installs as one user and the app runs as another, all artifacts must live under a shared, chown'd directory — not in user-specific caches.**
- **Significance:**
  This combination (Poetry + non-root Docker) is a common stumbling block. The three pieces — `VIRTUALENVS_IN_PROJECT`, `PYTHONPATH`, and direct venv bin paths — must all be in place together. Missing any one causes a different cryptic error.
- **Related Entries:** Infrastructure, Container Security

---

## [2026-03-30 18:01] — Docker: node:20-slim Has UID 1000 Already Taken

- **Agent/Model:** Claude Opus 4.6
- **Category:** Correction
- **Tags:** #docker #debugging
- **Memory:**
  The `node:20-slim` Docker image ships with a `node` user at UID 1000. Attempting `useradd -u 1000 app` fails with "UID 1000 is not unique". The user also has other Docker projects that may claim common UIDs.

  Fix: use a project-specific username (`vmlapp`) and a less common UID (`1500`). Alternatively, reuse the existing `node` user in Node-based images — but a unique UID is safer when the host runs multiple container projects.
- **Significance:**
  Always check what users/UIDs exist in base images before creating new ones. `node`, `www-data`, and similar are commonly pre-allocated.
- **Related Entries:** Container Security, Infrastructure

---

## [2026-03-30 18:02] — Docker: Volume-Mounted SQLite File Must Pre-Exist as a File

- **Agent/Model:** Claude Opus 4.6
- **Category:** Correction
- **Tags:** #docker #database #debugging
- **Memory:**
  `docker-compose.yml` mounts `./renderer.db:/app/renderer.db`. If `renderer.db` does not exist on the host when Docker Compose starts, Docker creates it as a **directory** (not a file). SQLite then fails with `unable to open database file` because it can't create a database inside a directory.

  Fix: `touch renderer.db` on the host before first `docker compose up`. If the directory was already created by a prior failed start, `rmdir renderer.db` first, then `touch`.
- **Significance:**
  This is a well-known Docker gotcha with bind mounts to files. Any bind-mounted file (SQLite DBs, config files, secrets) must exist as a file on the host before the container starts.
- **Related Entries:** Infrastructure, Database Design

---

## [2026-03-30 18:03] — SQLModel: sa_column_kwargs ondelete Goes on ForeignKey, Not Column

- **Agent/Model:** Claude Opus 4.6
- **Category:** Correction
- **Tags:** #database #sqlmodel #python #debugging
- **Memory:**
  The implementation plan suggested `sa_column_kwargs={"ondelete": "CASCADE"}` on SQLModel `Field()`. This fails at runtime with `TypeError: Additional arguments should be named <dialectname>_<argument>, got 'ondelete'` because `ondelete` is a `ForeignKey` argument, not a `Column` argument.

  The correct SQLModel pattern for cascade deletes:
  ```python
  scene_id: int = Field(
      sa_column=sa.Column(sa.Integer, sa.ForeignKey("scene.id", ondelete="CASCADE"), index=True, nullable=False),
  )
  ```
  This uses `sa_column` to define the full SQLAlchemy column directly, placing `ondelete` on the `ForeignKey` constructor where it belongs.
- **Significance:**
  The `sa_column_kwargs` approach is widely suggested online but doesn't work for FK-level options. Future agents should use `sa_column` with explicit `sa.ForeignKey()` for cascade deletes. This is a SQLModel-specific pitfall — raw SQLAlchemy's declarative syntax handles it differently.
- **Related Entries:** Database Design, Cascade Deletes

---

## [2026-03-30 18:04] — Bug Fix: listModels API Does Not Return Parts Array

- **Agent/Model:** Claude Opus 4.6
- **Category:** Correction
- **Tags:** #react #api #pipeline #debugging
- **Memory:**
  `GET /api/models` returns `{id, name, part_count, created_at}` — deliberately lightweight for the sidebar list. It does **not** include the `parts` array. The original `handleAddToScene` in `App.tsx` tried to find parts from the models list (`models.find(m => m.id === model.id)?.parts`), which was always `undefined`, resulting in empty scenes when clicking "+ Scene".

  Fix: call `getModel(model.id)` (which hits `GET /api/models/{id}` and returns the full `parts` array) before constructing the `SceneInstance`.

  General principle: **when a list endpoint is intentionally lean, any operation that needs the full object must call the detail endpoint.** Don't assume list items have the same shape as detail items — they rarely do for performance reasons.
- **Significance:**
  This was a pre-existing bug in the original build, not introduced by the hardening. The "save to library then add to scene" flow was never tested end-to-end. Highlights the value of the audit's finding 4.1 (no tests) — this is exactly the kind of integration gap that an E2E test would catch.
- **Related Entries:** Architecture Vision, Implemented Project Structure

---

## [2026-03-30 18:05] — Poetry Lock Must Be Regenerated After Dependency Changes

- **Agent/Model:** Claude Opus 4.6
- **Category:** Correction
- **Tags:** #python #docker #debugging
- **Memory:**
  Adding `slowapi` to `pyproject.toml` and tightening version bounds (`>=X,<Y`) made `poetry.lock` stale. The Docker build failed with `pyproject.toml changed significantly since poetry.lock was last generated`. Fix: run `poetry lock` locally before building.

  Additionally, Poetry is strict about Python range compatibility. `slowapi` declares `python >=3.7,<4.0`, so our `requires-python = ">=3.11"` (unbounded) conflicted. Adding `<4.0` to match resolved it: `requires-python = ">=3.11,<4.0"`.

  General principle: **any change to `pyproject.toml` dependencies or Python version requires `poetry lock` before Docker build.** The lock file is a build artifact, not just a convenience.
- **Significance:**
  This is easy to forget when editing `pyproject.toml` directly rather than using `poetry add`. Future agents changing dependencies must always regenerate the lock file.
- **Related Entries:** Infrastructure, Loose Dependency Pinning

---

## [2026-03-30 20:00] — Design Pattern: Sparse Nullable Overrides for Layered Mutability

- **Agent/Model:** Claude Opus 4.6
- **Category:** Insight
- **Tags:** #database #architecture #general-principle #schema #creative-thinking
- **Memory:**
  When designing the per-part editing feature (position, rotation, opacity), the core tension was: `StoredModel.parts_json` is immutable (a key architectural invariant), but users need to modify individual part transforms and add new properties (opacity) that the LLM never generated.

  The solution is a **sparse nullable override table** (`PartOverride`). Each row targets a single part by `(model_id, part_label)`. Every editable field is `Optional[float]` — `None` means "use the base value from parts_json", a float means "replace this specific axis/property". The merge is simple: load base parts, load overrides as a `{label → row}` lookup, apply non-null fields.

  Why absolute values, not deltas: if the LLM base is ever re-generated (re-render from the same image), deltas become meaningless because the reference point changed. Absolute overrides are self-contained — they don't depend on the base to be interpreted. When the user hits "Reset to Original", just delete the override row.

  Why per-field nullability instead of a full transform JSON blob: the user may only tweak Y position and opacity on a given part. Storing a full `{pos_x, pos_y, pos_z, rot_x, rot_y, rot_z, opacity}` blob forces the client to echo back all values even if unchanged, and makes it impossible to distinguish "user set X to 0.0" from "user didn't touch X". With nullable fields, the database knows exactly which values are user-set.

  This pattern generalises: **whenever you need to layer user edits on top of generated/computed data without mutating the source, use a sparse override table keyed on the generated item's identity.** The override is a transparent lens — apply it to see the user's version, remove it to see the original.
- **Significance:**
  Applies to any system where AI/ML generates a baseline and users refine it: design tools, code generation with manual edits, recommendation systems with user overrides, auto-generated reports with manual corrections. The key insight is that the override table preserves the original while making edits first-class persistent data.
- **Related Entries:** Immutable Data + Mutable Transform, Database Design, StoredModel Immutability

---

## [2026-03-30 20:01] — R3F: TransformControls and OrbitControls Coexistence

- **Agent/Model:** Claude Opus 4.6
- **Category:** Reference
- **Tags:** #r3f #threejs #react #3d
- **Memory:**
  `@react-three/drei`'s `TransformControls` (translate/rotate gizmo) and `OrbitControls` (camera orbit) conflict by default — both respond to pointer drag. The solution is already in place: `OrbitControls` has `makeDefault` set in `SceneCanvas.tsx`. When `TransformControls` is active and the user drags a gizmo handle, it automatically disables `OrbitControls` for the duration of the drag. This works because `makeDefault` registers OrbitControls as the default controls, and TransformControls knows to temporarily detach them.

  Without `makeDefault`, the developer would need to manually wire `TransformControls`'s `onMouseDown`/`onMouseUp` events to toggle `OrbitControls.enabled`. The declarative approach is correct here — do not add manual enable/disable logic.
- **Significance:**
  Any future agent adding interactive gizmos (scale handles, custom drag behaviors) should follow the same pattern: ensure `OrbitControls` has `makeDefault`, and the drei helper components will handle the conflict automatically.
- **Related Entries:** Three.js Rendering Patterns, Frontend Stack Decision

---

## [2026-03-30 20:02] — Feature Design: Validate Override Keys Against Source Data

- **Agent/Model:** Claude Opus 4.6
- **Category:** Insight
- **Tags:** #database #architecture #general-principle #pipeline
- **Memory:**
  When the per-part override system accepts a `part_label` from the client, the backend must validate that the label actually exists in the model's `parts_json` before creating the override row. Without this check, the API silently accepts overrides for nonexistent labels — orphaned rows that inflate the database and confuse debugging.

  General principle: **when a secondary table references a field inside a JSON blob (not a proper FK), validate the reference manually on write.** This is the cost of denormalized storage — the database can't enforce referential integrity between a JSON array element and a row in another table. The application must do it.

  This also applies to deletion: if a model's `parts_json` were ever regenerated with different labels (not currently possible since StoredModel is immutable, but relevant for future features), orphaned overrides would need cleanup.
- **Significance:**
  JSON-blob-to-relational joins are a common pattern in LLM-powered systems where the AI output is stored as a blob but downstream features need to reference individual elements. Always validate the join key on write — don't trust the client to send valid references into opaque data.
- **Related Entries:** Sparse Nullable Overrides, Input Validation at System Boundaries

---

## [2026-03-30 21:00] — Implementation: Per-Part Editing Feature Complete

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Summation
- **Tags:** #database #architecture #r3f #threejs #react #fastapi #pipeline
- **Memory:**
  Implemented the full per-part editing feature as specified in `docs/feature-part-editing.md`. All 13 acceptance criteria are addressed. Summary of what was built:

  **Backend (`src/renderer/`):**
  - `models.py`: `PartOverride` table — `(model_id, part_label)` unique constraint via `__table_args__`, all transform/opacity fields `Optional[float]`, cascade delete from `storedmodel.id`.
  - `server.py`: `_merge_overrides(parts, overrides)` helper applies non-null override fields onto base parts list, adds `opacity: 1.0` default to all parts. Three new endpoints: `PUT /api/models/{id}/parts/{label}/override` (upsert), `DELETE /api/models/{id}/parts/{label}/override` (single reset), `DELETE /api/models/{id}/overrides` (bulk reset). `GET /api/models/{id}` now calls `_merge_overrides` before returning.
  - Override upsert uses `body.model_dump(exclude_unset=True)` so only explicitly-provided fields are written — fields absent from the request body are not cleared on existing rows.

  **Frontend (`frontend/src/`):**
  - `types.ts`: `opacity?` on `ScenePart`; new `PartOverrideRequest` interface; `EditMode` type alias.
  - `api.ts`: `upsertPartOverride`, `deletePartOverride`, `deleteAllOverrides`.
  - `hooks/usePartEditor.ts`: selection state, `editMode`, all change handlers (transform end, opacity debounced 300ms, position/rotation number inputs), reset single/all.
  - `components/PartProperties.tsx`: properties panel (position XYZ, rotation XYZ in degrees, opacity slider, Reset button). Shown below canvas when a part is selected. Rotation displayed in degrees, stored/sent in radians.
  - `three/ScenePart.tsx`: click-to-select with `e.stopPropagation()`, emissive orange highlight when selected (`emissive="#ff8800" emissiveIntensity={0.3}`), material `transparent`/`opacity`/`depthWrite` handling, `TransformControls` rendered inside ScenePart (not SceneCanvas) using `useState` ref pattern so the mesh is available when TransformControls mounts.
  - `three/SceneCanvas.tsx`: `onPointerMissed` for canvas-background deselect; `selectedLabel`, `editMode`, `onSelectPart`, `onTransformEnd` props threaded through.
  - `components/ToolBar.tsx`: Move/Rotate toggle (only rendered when `hasSelection` is true).
  - `App.tsx`: `currentModelId` (set after save), `baseParts` (frozen copy of post-render parts for Reset), keyboard shortcuts G/R/Escape, `PartProperties` rendered below canvas in a flex column layout.

- **Significance:**
  The `StoredModel.parts_json` was never mutated — all edits live exclusively in `PartOverride` rows. The design correctly separates LLM-generated geometry (immutable) from user-applied transforms (mutable and reversible).
- **Related Entries:** Sparse Nullable Overrides, Design Pattern: Sparse Nullable Overrides for Layered Mutability, Validate Override Keys Against Source Data, R3F: TransformControls and OrbitControls Coexistence

---

## [2026-03-30 21:01] — R3F: TransformControls Placement and the useState Ref Pattern

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Insight
- **Tags:** #r3f #threejs #react #3d
- **Memory:**
  `TransformControls` from `@react-three/drei` requires an `object` prop (a live `THREE.Object3D`). If you render it in the *parent* (SceneCanvas), you need to pass mesh refs up — complex with many parts. The simpler pattern is to render `TransformControls` *inside* the component that owns the mesh (ScenePart).

  The critical subtlety: you cannot use a `useRef` for the mesh and immediately pass `ref.current` to `TransformControls` — `ref.current` is `null` on the first render and `TransformControls` won't re-render when it becomes non-null. The fix is `useState`:

  ```tsx
  const [meshObj, setMeshObj] = useState<THREE.Mesh | null>(null);

  <mesh ref={setMeshObj} ...>...</mesh>
  {isSelected && meshObj && (
    <TransformControls object={meshObj} ... />
  )}
  ```

  `setMeshObj` is called by React when the mesh mounts, triggering a re-render that now has `meshObj !== null`, which lets `TransformControls` mount correctly.

- **Significance:**
  This useState-as-ref pattern is the standard R3F solution for any component that needs to conditionally render something that depends on a mounted Three.js object. Using `useRef` instead silently produces a `TransformControls` that never attaches.
- **Related Entries:** R3F: TransformControls and OrbitControls Coexistence, Three.js Rendering Patterns

---

## [2026-03-30 21:02] — R3F: Reading Transform After Drag via `dragging-changed` Event

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Reference
- **Tags:** #r3f #threejs #react #3d
- **Memory:**
  `TransformControls` (drei) does not have an `onMouseUp` prop. To detect drag-end and read the final position/rotation, listen to the `dragging-changed` event on the `TransformControls` instance via a `ref`:

  ```tsx
  const tcRef = useRef<any>(null);

  useEffect(() => {
    const tc = tcRef.current;
    if (!tc || !isSelected || !meshObj) return;
    const handler = (e: { value: boolean }) => {
      if (!e.value) {  // value=false means drag just ended
        onTransformEnd(label, {
          x: meshObj.position.x, y: meshObj.position.y, z: meshObj.position.z,
        }, {
          x: meshObj.rotation.x, y: meshObj.rotation.y, z: meshObj.rotation.z,
        });
      }
    };
    tc.addEventListener("dragging-changed", handler);
    return () => tc.removeEventListener("dragging-changed", handler);
  }, [tcRef.current, isSelected, meshObj, ...]);

  <TransformControls ref={tcRef} object={meshObj} mode={editMode} />
  ```

  The event fires twice per drag: `{value: true}` at start and `{value: false}` at end. Only the `false` case triggers a save.

  After drag-end, read position/rotation directly from the `THREE.Mesh` object — `TransformControls` has already mutated it imperatively. Do NOT read from React state (it still holds the pre-drag values).

- **Significance:**
  This is the canonical pattern for "save on drag release" with R3F TransformControls. Alternatives (`onObjectChange` fires on every frame, polling is wasteful) are inferior.
- **Related Entries:** R3F: TransformControls Placement and the useState Ref Pattern, Three.js Rendering Patterns

---

## [2026-03-30 21:03] — React/R3F: Optimistic State Update Prevents Position Snap-Back

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Insight
- **Tags:** #react #r3f #threejs #general-principle
- **Memory:**
  `TransformControls` mutates the Three.js mesh imperatively. After drag-end, when the API call is made and React state is updated, R3F re-renders the mesh with `position={[pos.x, pos.y, pos.z]}` from state. If state still holds the *old* position at that moment, the mesh visually snaps back to its original location until the API responds.

  The fix is an **optimistic local state update** that happens synchronously in the `dragging-changed` handler, *before* the async API call:

  ```typescript
  // In handleTransformEnd:
  onPartsChange((prev) =>
    prev.map((p) => p.label === label ? { ...p, position: pos, rotation: rot } : p)
  );
  saveOverride(label, { pos_x: pos.x, ... });  // async, fires after state is updated
  ```

  Since `setParts` is synchronous and React batches the update into the same render cycle as the API call initiation, the mesh position in state matches what Three.js already shows — no snap-back.

  General principle: **whenever an imperative 3D operation (drag, physics, animation) concludes and you need to persist the result via an async API, update React state first with the imperatively-obtained values, then fire the API call.**
- **Significance:**
  Applies to any R3F scenario where Three.js objects are mutated outside React's control (physics engines, animation mixers, drag interactions). The optimistic update is not about optimism in the usual sense — it's about keeping React state in sync with the already-visible Three.js state.
- **Related Entries:** R3F: TransformControls Placement and the useState Ref Pattern, R3F: Reading Transform After Drag

---

## [2026-03-30 21:04] — API Design: `exclude_unset=True` for Sparse Patch Endpoints

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Insight
- **Tags:** #fastapi #python #api #general-principle
- **Memory:**
  When a Pydantic model has all-optional fields (e.g., `PartOverrideRequest`), all unset fields default to `None`. On an update/upsert, you cannot tell the difference between "client didn't send this field" and "client explicitly sent null to clear it" using a naive `body.model_dump()`.

  The solution is `body.model_dump(exclude_unset=True)`, which only includes keys that were explicitly present in the request body:

  ```python
  for field, val in body.model_dump(exclude_unset=True).items():
      setattr(override, field, val)
  ```

  This means:
  - Field absent from body → not written (existing DB value preserved)
  - Field present as `null` → written as `None` (explicit clear/reset)
  - Field present as a float → written as that float

  This gives the client full control: partial updates don't wipe unchanged fields, and explicit nulls can reset individual overrides without deleting the whole row.

- **Significance:**
  The standard pattern for any sparse-update endpoint in FastAPI. Without `exclude_unset=True`, all-Optional Pydantic models are dangerous — every PATCH or upsert silently clears fields the client didn't intend to touch. This is a non-obvious footgun; `model_dump()` vs `model_dump(exclude_unset=True)` looks identical until a client sends a partial body.
- **Related Entries:** Sparse Nullable Overrides, Input Validation at System Boundaries

---

## [2026-03-30 21:05] — Three.js: Transparency Requires `depthWrite=false` and `transparent=true`

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Reference
- **Tags:** #threejs #r3f #3d
- **Memory:**
  When a mesh material has `opacity < 1`, setting `transparent={true}` alone is not enough to avoid z-fighting artifacts when multiple transparent objects overlap. The correct combination:

  ```tsx
  <meshStandardMaterial
    transparent={opacity < 1}
    opacity={opacity}
    depthWrite={!transparent}   // false when transparent, true when opaque
  />
  ```

  `depthWrite={false}` prevents transparent objects from writing to the depth buffer, which causes incorrect occlusion of objects behind them. R3F's `<Canvas>` sorts transparent objects back-to-front automatically when `depthWrite` is off.

  For the wireframe overlay on a transparent mesh, the wireframe opacity should also scale down:
  ```tsx
  <lineBasicMaterial transparent opacity={Math.min(0.13, partOpacity * 0.13)} />
  ```
  Otherwise the wireframe remains fully opaque on a ghost-transparent mesh, which looks wrong.

- **Significance:**
  The `transparent` + `depthWrite` combination is required for correct transparency in Three.js. `transparent=true` with `depthWrite=true` (the default) produces z-sorting artifacts on complex scenes with multiple transparent parts.
- **Related Entries:** Three.js Rendering Patterns, Frontend Stack Decision

---

## [2026-03-30 21:06] — UX: baseParts Snapshot Required for Non-Destructive Reset

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Insight
- **Tags:** #react #architecture #general-principle
- **Memory:**
  The "Reset to Original" button needs to restore a part to its LLM-generated values. But `parts` state mutates as the user edits. If Reset reads from `parts`, it gets the already-edited values — a no-op.

  The fix: store a frozen `baseParts` snapshot at the moment the render response arrives (or when a saved model is loaded), and never mutate it:

  ```typescript
  const [parts, setParts] = useState<ScenePart[]>([]);      // mutable display state
  const [baseParts, setBaseParts] = useState<ScenePart[]>([]); // immutable snapshot

  // On render:
  setParts(result.parts);
  setBaseParts(result.parts);  // snapshot frozen here

  // On Reset:
  handleResetPart(label, baseParts.find(p => p.label === label) ?? currentPart)
  ```

  This is the same immutability principle as `StoredModel.parts_json` on the backend, applied to the frontend: the source-of-truth baseline is never overwritten, only the display layer changes.

  General principle: **whenever a system allows non-destructive edits on top of a generated baseline, keep an explicit snapshot of that baseline at all layers (DB row, React state, etc.). Don't rely on being able to reconstruct it from the current mutable state.**
- **Significance:**
  Without `baseParts`, calling `handleResetPart` would either do nothing (resetting to the already-edited values) or require an extra API call to re-fetch the original from the DB. The snapshot makes reset instant and correct.
- **Related Entries:** StoredModel Immutability, Sparse Nullable Overrides, Design Pattern: Sparse Nullable Overrides

---

## [2026-03-30 21:07] — SQLModel: UniqueConstraint via `__table_args__`

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Reference
- **Tags:** #database #sqlmodel #python
- **Memory:**
  SQLModel does not have a direct `Field()` argument for composite unique constraints spanning multiple columns. The correct pattern uses `__table_args__` with a SQLAlchemy `UniqueConstraint`:

  ```python
  class PartOverride(SQLModel, table=True):
      __table_args__ = (
          sa.UniqueConstraint("model_id", "part_label", name="uq_partoverride_model_part"),
      )
      ...
  ```

  Note: `__table_args__` must be a **tuple** (even for a single constraint). A single dict or a non-tuple value raises a SQLAlchemy error at table creation.

  This is the same mechanism as raw SQLAlchemy declarative base — SQLModel inherits it unchanged.

- **Significance:**
  The only way to add multi-column constraints or indexes in SQLModel. Single-column unique constraints can use `Field(sa_column=sa.Column(..., unique=True))`, but composite ones require `__table_args__`. Not documented prominently in SQLModel's own docs — refer to SQLAlchemy docs.
- **Related Entries:** Database Design, SQLModel: sa_column_kwargs ondelete Goes on ForeignKey

---

## [2026-03-30 21:08] — SQLite: New Table Requires DB Recreation (No Auto-Migration)

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Correction
- **Tags:** #database #sqlite #docker #debugging
- **Memory:**
  `SQLModel.metadata.create_all(engine)` only creates tables that do not yet exist. It does **not** add new tables to an existing SQLite database file automatically if that file already has other tables from a prior run.

  After adding `PartOverride` to `models.py`, the existing `renderer.db` will not gain the new table until the DB is recreated:

  ```bash
  rm renderer.db
  touch renderer.db     # must pre-exist as a file for Docker bind-mount
  docker compose up
  ```

  If running outside Docker: delete the file and restart the server — `init_db()` calls `create_all` on startup.

  This is the same Docker bind-mount gotcha documented in entry [2026-03-30 18:02]: if `renderer.db` doesn't exist as a file before Docker starts, Docker creates a directory and SQLite fails.

- **Significance:**
  Any schema change that adds tables requires this reset in development. The project does not use Alembic. For production (if this ever goes there), a proper migration tool would be needed. Until then, document that saved models are lost on schema changes and use "Download JSON" to export before resetting.
- **Related Entries:** Docker: Volume-Mounted SQLite File Must Pre-Exist as a File, Database Design

---

## [2026-03-30 22:00] — LLM Label Prefixes Encode Implicit Hierarchy — Exploit It, Don't Duplicate It

- **Agent/Model:** Claude Opus 4.6
- **Category:** Insight
- **Tags:** #llm #prompting #schema #architecture #general-principle #creative-thinking
- **Memory:**
  The decode prompt instructs the LLM to label parts with object prefixes (e.g., `"glass-body"`, `"burger-top-bun"`). This is already producing consistent, parseable group hierarchies in the output — `burger-*`, `beer-*`, `fry-*`, `tomato-*`, etc. The grouping information is already in the data; the system just wasn't using it.

  When the question came up of whether to modify the prompt to add an explicit `"group": "burger"` field, the answer was **no** — for two reasons:
  1. **Redundancy creates inconsistency risk.** Asking the LLM to output both `"label": "burger-patty-top"` and `"group": "burger"` means it can get them out of sync. One source of truth is better than two.
  2. **Deterministic parsing beats LLM output.** Splitting a label on its first hyphen to extract a group prefix is trivial, deterministic code. Asking the LLM to state the group name separately is another field it could hallucinate or omit.

  General principle: **when an LLM already encodes structure in a naming convention, extract that structure with deterministic code — don't ask the LLM to restate it in a separate field.** This applies to any LLM output with hierarchical labels, namespaced identifiers, or prefixed enums. Parse the convention; don't duplicate it.
- **Significance:**
  This is a recurring design question in LLM-powered systems: "should we change the prompt to get richer output, or extract more from the output we already have?" Default to extraction when the information is already present in a parseable form. Prompt changes should add *new* information, not restate existing information in a more convenient format.
- **Related Entries:** LLM Prompting Strategy, Stay in Language Space, The Prompt as a First-Class Engineering Artifact

---

## [2026-03-30 22:01] — Users Think in Semantic Groups, Not Geometric Primitives

- **Agent/Model:** Claude Opus 4.6
- **Category:** Insight
- **Tags:** #ui #3d #r3f #architecture #general-principle
- **Memory:**
  User testing revealed that per-part selection is insufficient for real models. A burger scene has 34 parts, but the user's mental model has ~7 objects: burger, beer, fries, ketchup, mayo, tomatoes, board. Moving `burger-patty-top` without the rest of the burger is useless. Moving `beer-glass` without `beer-liquid` and `beer-foam` breaks the model.

  The per-part editing feature (override system, opacity, TransformControls) is correct as infrastructure, but the primary interaction layer must be **groups**, with per-part editing as a secondary precision mode (Alt+click).

  The implementation pattern: wrap related parts in a Three.js `<group>` element (same pattern `ModelGroup.tsx` already uses for composed scenes). `TransformControls` attaches to the group, so all children move together. This reuses existing R3F infrastructure — no new Three.js concepts needed.

  Two selection levels:
  - **Group mode** (default): click any part → selects its group → gizmo on the `<group>`
  - **Part mode** (Alt+click): selects individual part → gizmo on the `<mesh>`

  Persist group moves via existing `PartOverride` infrastructure: compute the delta from the group gizmo, apply it to each part's position, batch-save overrides. No new DB tables needed.
- **Significance:**
  This is a UX principle that applies to any system rendering structured LLM output: **the user's interaction granularity should match their mental model, not the data model's granularity.** The data model can be flat (parts array), but the interaction model must surface the hierarchy the user expects. Always test with real output to discover the gap.
- **Related Entries:** Sparse Nullable Overrides, Immutable Data + Mutable Transform, Label Prefixes Encode Implicit Hierarchy

---

## [2026-03-30 22:02] — Small Parts Are Unclickable: Gizmo Sizing and Hit Targets Matter

- **Agent/Model:** Claude Opus 4.6
- **Category:** Correction
- **Tags:** #r3f #threejs #ui #3d #debugging
- **Memory:**
  Parts like individual fries (0.01m wide), pickle slices (0.018m radius), and tomato stems (0.002m radius) are nearly impossible to click in the 3D canvas. The Three.js raycaster hits them only at very specific angles, and the TransformControls gizmo handles may be larger than the part itself.

  This is a fundamental issue with per-part selection on small geometry: **the clickable surface area scales with the geometry dimensions, not with the viewport pixel size.** A 0.002m cylinder is 2 pixels wide at typical camera distance.

  Group selection solves this for most use cases — clicking the beer glass (large) selects the entire beer group including the foam (small). For the remaining case (Alt+click on a specific small part), consider:
  - Expanding the raycaster threshold for small objects
  - Showing a parts list in the properties panel that allows selection by name instead of by click
  - Adding a bounding-box overlay that provides a larger click target

  A clickable parts list in the UI is the most reliable solution — it doesn't depend on geometry size at all.
- **Significance:**
  Any 3D editing tool with variable-size objects needs a non-spatial selection mechanism (list, search, hierarchy tree) as a fallback. Spatial selection alone fails at the extremes of object scale.
- **Related Entries:** Users Think in Semantic Groups, TransformControls and OrbitControls Coexistence

---

## [2026-03-31 10:00] — Bug: TransformControls Gizmo Check Must Come Before Part Mesh Check

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Correction
- **Tags:** #r3f #threejs #react #3d #debugging
- **Memory:**
  In `useSceneRaycast.ts` `handlePointerDown`, the original code checked registered part meshes **before** checking `isTransformControlsHit()`. This caused axis cones and arrow handles to be non-functional — only the center sphere (all-axes) worked.

  Root cause: TransformControls axis arrows extend along their axis, physically passing through the object being moved. When clicking an axis cone, the raycast against `meshArray` found the part mesh behind the cone first, fired `onHit`, and returned early. `isTransformControlsHit()` was never called, OrbitControls was never disabled, and TC never received clean pointer events. The center sphere sat at the group origin (often not overlapping a mesh as tightly), so it occasionally worked.

  **Fix**: Always call `isTransformControlsHit()` first. If a TC handle is hit, disable orbit and return. Only then check part meshes.

  ```typescript
  // CORRECT ORDER in handlePointerDown:
  raycaster.current.setFromCamera(mouse.current, camera);
  if (isTransformControlsHit()) { orbit.enabled = false; return; }
  const hits = raycaster.current.intersectObjects(meshArray, false);
  if (hits.length > 0) { onHit(...); return; }
  onMiss();
  ```
- **Significance:**
  Any time a scene has both selectable meshes and an active gizmo, the gizmo hit check must take absolute priority. The symptom ("only center handle works, axis cones don't") is subtle — it looks like a TC bug when it's actually a raycaster ordering bug. Applies to any manual raycaster that coexists with TransformControls.
- **Related Entries:** R3F: TransformControls and OrbitControls Coexistence, Manual Raycasting Bypasses R3F Events

---

## [2026-03-31 10:01] — Bug: `useThree().controls` vs `__r3f` Internals for OrbitControls Access

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Correction
- **Tags:** #r3f #threejs #react #3d #debugging
- **Memory:**
  A previous agent used `(gl as any).domElement?.__r3f?.root?.getState?.()?.controls` to access the OrbitControls instance at pointer-event time. This returned `null` in R3F v9 — the `__r3f` internal structure changed and this path no longer resolves.

  The result: `disabledOrbit` was set to `true` but orbit was never actually disabled. OrbitControls stole `pointermove` events during TransformControls drags, causing the gizmo to feel sluggish or unresponsive (especially on axis-constrained handles where the orbit camera rotation and axis drag fought each other).

  **Fix**: Destructure `controls` directly from `useThree()` at the hook level. Since `OrbitControls` uses `makeDefault`, it registers itself in R3F state synchronously on mount. By the time `SceneRaycaster` mounts (it's rendered after `OrbitControls` in `SceneCanvas`), the `controls` value is available.

  ```typescript
  const { camera, gl, scene, controls } = useThree();
  // ...
  if (controls) (controls as any).enabled = false;
  ```

  Add `controls` to the `useEffect` dependency array so the listener is re-registered if controls changes.

- **Significance:**
  Never access R3F internal properties via `__r3f`. They are implementation details that change across minor versions. Always use the public `useThree()` API. The `controls` field is set by `makeDefault` — this is the intended access pattern.
- **Related Entries:** R3F: TransformControls and OrbitControls Coexistence, TC Gizmo Check Order

---

## [2026-03-31 10:02] — Bug: `p.group` Is Never Set on Raw State Parts — Use `getGroupPrefix(label)`

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Correction
- **Tags:** #react #r3f #threejs #debugging #general-principle
- **Memory:**
  `ScenePart` has an optional `group?: string` field. Parts from the API and stored in React state have this field as `undefined` — only the output of `groupPartsByPrefix()` has `group` populated (it sets `group: prefix` on its return values).

  `handleGroupTransformEnd` in `usePartEditor.ts` originally filtered parts with `if (p.group !== groupName) return p`. Since `p.group` was always `undefined` in state, the condition was always `true`, no parts were updated, state was unchanged, and React re-rendered with old positions — causing everything to snap back after a drag.

  **Fix**: Use `getGroupPrefix(p.label) !== groupName` instead of `p.group !== groupName` anywhere you need to match parts by group inside a React state updater. Import from `../utils/groupParts`.

  General principle: **when a derived field (like `group`) is only populated on one branch of your data flow (here: the grouped render path), don't rely on it in stateful logic that touches a different branch (here: the raw state update path).** Use the source label to derive the group deterministically.

- **Significance:**
  This was the primary cause of the "items snap back after dragging" bug. The symptom looks like a persistence issue (position not saving), but the root cause is a filtering bug that silently no-ops every state update. Future agents adding group-level state mutations must always derive group membership from `getGroupPrefix(label)`, not from `part.group`.
- **Related Entries:** LLM Label Prefixes Encode Implicit Hierarchy, Optimistic State Update Prevents Snap-Back

