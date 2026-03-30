# Agent Memory Log

## Purpose
This document serves as a persistent memory store for AI agents working on this project. When instructed to save a memory, agents should record structured entries here to preserve context, decisions, insights, and summations of thought across sessions.

## Instructions
When saving a memory, append a new entry to the log below using this exact format:

### Entry Format

```
## [YYYY-MM-DD HH:MM] — <Short Descriptive Title>

- **Agent/Model:** <model name and version, e.g., Claude 3.5 Sonnet>
- **Category:** <one of: Decision | Insight | Context | Summation | Correction | Reference>
- **Memory:**
<Clear, concise description of the information being recorded.>
- **Significance:**
<Why this matters — how it impacts the project, future decisions, or other agents' work.>
- **Related Entries:** <optional — reference titles/dates of related memories, or "None">
```

## Guidelines
- Be **specific and concise** — another agent (or human) should understand the entry without additional context.
- Record **why**, not just **what** — the significance is as important as the memory itself.
- Do not duplicate existing entries — check the log first and update an existing entry if the information has evolved.
- Use the **Category** field consistently to make the log searchable and filterable.

---

## Memory Log

<!-- Append new entries below this line -->

## [2026-03-30 10:00] — Project Core Goal: Image-to-3D-Scene Pipeline

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Context
- **Memory:**
  This project is an LLM-powered pipeline that takes an image as input, uses a structured prompt to analyze it and output a JSON scene description, then renders that JSON as an interactive 3D HTML scene using Three.js. The Python `renderer` package likely orchestrates this pipeline (image in → LLM API call → JSON → HTML/Three.js out).
- **Significance:**
  Knowing the end-to-end data flow prevents misunderstanding the renderer as a standalone graphics engine. The Python code's job is orchestration and LLM interfacing, not raw 3D math.
- **Related Entries:** None

---

## [2026-03-30 10:01] — JSON Scene Schema: Flat Parts Array

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Reference
- **Memory:**
  The 3D scene is described as a flat JSON array (or `{"parts": [...]}` object) where each element is a part with these fields:
  - `label` (string, namespaced e.g. `"manA-torso-lower"`)
  - `geometryType`: `"box"`, `"cylinder"`, `"sphere"`, `"cone"`, `"torus"`, `"lathe"`, `"tube"`, `"extrude"`
  - Geometry-specific dimensions (`width/height/depth`, `radiusTop/radiusBottom/height`, `radius`, etc.)
  - `position`: `{x, y, z}` in meters (world space)
  - `rotation`: `{x, y, z}` in radians
  - `scale`: `{x, y, z}` (optional)
  - `color`: hex string

  Geometry-specific extras: `lathe` uses `profilePoints: [{x,y}]`; `tube` uses `tubePoints: [{x,y,z}]` + `tubeRadius`; `extrude` uses `pathCommands` (SVG-like ops M/L/Q/C) + `depth`.
- **Significance:**
  This is the renderer's primary data contract. Any Python code that generates or parses scenes must conform to this schema.
- **Related Entries:** Project Core Goal

---

## [2026-03-30 10:02] — Critical: Joint Chain System for Articulated Figures

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Decision
- **Memory:**
  The `decode_prompt.txt` documents a hard-won insight: LLMs must NOT estimate elbow/wrist/knee/ankle positions independently. Instead they use a "joint chain" approach — start at a root joint, pick a direction, mechanically compute segment center and endpoint, then chain to the next segment. Only root joints (neckBase, torsoBottom, shoulders, hips) are estimated from the image; distal joints are computed.

  Root cause of the previous failure mode: arms floating detached from torso and wrong angles because `atan2` trig is unreliable in LLM output.
- **Significance:**
  Any prompt generation or post-processing code must enforce joint chaining for human/animal figures. Do NOT allow the LLM to freely place elbow/knee/wrist positions. This is the core architectural decision that makes the renderer work.
- **Related Entries:** LLM Prompting Strategy

---

## [2026-03-30 10:03] — LLM Prompting Strategy: Structured Multi-Phase Analysis

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Reference
- **Memory:**
  The LLM prompt (in `examples/decode_prompt.txt`) enforces a rigid pre-generation analysis sequence before any JSON is output:
  1. **IDENTIFY** — object type, pose, function, list multiple objects
  2. **MEASURE** — real-world bounding boxes using known reference sizes (human head ~0.23m, full height ~1.75m, etc.)
  3. **DECOMPOSE** — list all parts with geometry type and relative positions
  3b. **SILHOUETTE TRACE** — for curved objects, trace outer edge as `(x,y)` profile points (min 20 points)
  3c. **LAYER STACK MAP** — for stacked objects (burgers, cakes), compute running Y positions once and use only those
  3d. **JOINT POSITION MAP** — root joints only for figures
  3e. **LIMB DIRECTION MAP** — clock-direction notation (12=up, 3=right, 6=down, 9=left) for each limb segment
  3f. **FACE FEATURE MAP** — facial feature offsets from headCenter

  The prompt instructs the LLM to trust pixel geometry over prior knowledge.
- **Significance:**
  This multi-phase approach is what produces accurate, connected geometry. Skipping phases (especially 3d/3e for figures, 3c for stacked objects) leads to floating/disconnected parts. The renderer's prompt-building code should preserve this structure.
- **Related Entries:** Joint Chain System

---

## [2026-03-30 10:04] — Three.js Rendering: Version, Lighting, and Interaction Patterns

- **Agent/Model:** Claude Sonnet 4.6
- **Category:** Reference
- **Memory:**
  Both examples use **Three.js v0.160.0** via unpkg CDN with ES module import maps. Common scene setup:
  - **Lighting:** AmbientLight + 3–4 DirectionalLights (key, fill, rim, bottom-fill)
  - **Camera:** PerspectiveCamera with OrbitControls, damping enabled
  - **Materials:** `MeshStandardMaterial` with `roughness: 0.65`, `metalness: 0.05`
  - **Wireframe overlay:** subtle `LineSegments` on each mesh (`opacity: 0.12–0.15`)
  - **Ground grid:** custom `THREE.Group` with minor/major grid lines and red/blue axis lines
  - **Interaction (example1):** left-drag = move group on XZ plane, right-drag = rotate group around Y axis
  - **Tone mapping (example2):** `THREE.ACESFilmicToneMapping` at exposure 1.0 for richer solid rendering
  - **Label-based color resolution:** a `resolveColor(label, orig)` function maps label patterns to material colors (skin, hair, clothing), overriding the raw JSON color
- **Significance:**
  Generated HTML output should follow these conventions for consistency. The Python renderer should know which Three.js version to target and what scene boilerplate to emit.
- **Related Entries:** JSON Scene Schema
