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
  Both examples use **Three.js v0.160.0** via unpkg CDN. Conventions to preserve in generated output:
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
