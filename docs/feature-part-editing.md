# Feature: Per-Part Editing (Position, Rotation, Opacity)

**Date:** 2026-03-30
**Author:** Claude Opus 4.6 (Senior Lead)
**Target Developer:** Claude Sonnet (agent)
**Priority:** Feature work — builds on hardened codebase

---

## Overview

Users need the ability to select and manipulate **individual parts** within a rendered model. Currently, parts are rendered read-only — the LLM generates positions and the user can only orbit the camera. This feature adds:

1. **Click-to-select** any part in the 3D canvas
2. **Reposition** the selected part (translate on X/Y/Z)
3. **Rotate** the selected part (around X/Y/Z axes)
4. **Set opacity** on any part (0.0 = invisible, 1.0 = fully opaque)
5. **Persist edits** so reloading a saved model restores all user modifications

## Reference Example

See `examples/scene.json` — a burger-and-beer scene with 23 parts. Parts are namespaced by group prefix (e.g., `burger-*`, `glass-*`, `fries-*`, `dip-*`, `tomato-*`). The user should be able to, for example:
- Select `burger-cheese-1` and nudge it sideways
- Rotate `fries-cone` to tilt at a different angle
- Set `glass-body` to 30% opacity so the beer liquid inside is visible
- Save the model and reload it with all edits preserved

## Key Design Constraints (from Agent Memories)

### Immutable Geometry / Mutable Transform (#database #architecture)

> `StoredModel` holds immutable geometry (parts array, never changes after save). All positional variation lives in `SceneInstance`.

**This feature extends the mutable layer.** The original parts JSON from the LLM remains the base truth. User edits are stored as **overrides** — per-part deltas for position, rotation, and opacity. The base geometry (dimensions, geometry type, profile points, etc.) is never modified by user interaction.

### StoredModel Is Immutable After Save (#database #sqlmodel)

> Key design rule: `StoredModel` is immutable geometry. Don't store position in `StoredModel`.

**We must NOT mutate `parts_json` on `StoredModel` to persist edits.** The existing `parts_json` represents the LLM's original output and must remain unchanged — it serves as the baseline that can always be restored to. User edits live in a separate table.

### R3F Declarative Model (#r3f #threejs)

> Choosing a framework for its lifecycle guarantees only works if you stay within its declarative model.

Part selection, transform gizmos, and opacity changes should all flow through React state and props — not imperative Three.js manipulation. Use `@react-three/drei`'s `TransformControls` for the gizmo, not manual pointer math.

---

## Architecture

### Data Flow

```
StoredModel.parts_json (immutable base)
         ↓
    Part Overrides (per-part edits from DB)
         ↓
    Merged parts[] (base + overrides applied)
         ↓
    ScenePart components (render with final values)
         ↓
    User interaction → update override → save to DB
```

### New Database Table: `PartOverride`

A new table stores per-part edits. Each row represents a user's modifications to a single part within a stored model.

```python
class PartOverride(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    model_id: int = Field(
        sa_column=sa.Column(
            sa.Integer,
            sa.ForeignKey("storedmodel.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        ),
    )
    part_label: str              # matches ScenePart.label — the join key
    # Position overrides (absolute, replaces base position)
    pos_x: Optional[float] = None
    pos_y: Optional[float] = None
    pos_z: Optional[float] = None
    # Rotation overrides (absolute, replaces base rotation)
    rot_x: Optional[float] = None
    rot_y: Optional[float] = None
    rot_z: Optional[float] = None
    # Opacity override (not present in base schema — purely user-set)
    opacity: Optional[float] = None   # 0.0–1.0, null = use default (1.0)
```

**Why absolute values, not deltas:** Deltas require knowing the base to reconstruct the final value. If the base changes (re-render from a new image), deltas become meaningless. Absolute values are self-contained — the override IS the position. When an override field is `None`, the base value is used (no override for that axis).

**Why per-field nullability:** The user may only adjust Y position and opacity, leaving X/Z at the LLM's original values. `None` means "use base", a float means "use this instead". This is a sparse override — only changed fields are stored.

**Composite uniqueness:** `(model_id, part_label)` should be unique — one override row per part per model. Use a unique constraint.

### Merge Logic

When loading a model's parts for rendering:

```
1. Load parts_json from StoredModel (base)
2. Load all PartOverride rows where model_id matches
3. Build a lookup: { part_label → PartOverride }
4. For each part in parts[]:
   a. If override exists for this label:
      - Replace position.x/y/z with override pos_x/y/z where non-null
      - Replace rotation.x/y/z with override rot_x/y/z where non-null
      - Set opacity from override (default 1.0 if null)
   b. Else: use base values, opacity 1.0
5. Return merged parts[]
```

This merge can happen on the **backend** (in the `/api/models/:id` endpoint) or the **frontend** (fetch overrides separately and merge in JS). Recommendation: **backend merge** — keeps the frontend simple and the API contract clean. The client always receives ready-to-render parts with an `opacity` field.

### Updated API Contract

#### `GET /api/models/:id` — response gains `opacity` on each part

```jsonc
{
  "id": 1,
  "name": "Burger Scene",
  "parts": [
    {
      "label": "burger-bottom-bun",
      "geometryType": "lathe",
      // ... geometry fields unchanged ...
      "position": { "x": 0, "y": 0.04, "z": 0 },   // may be overridden
      "rotation": { "x": 0, "y": 0, "z": 0 },
      "color": "#D2A679",
      "opacity": 1.0                                   // NEW — always present
    },
    {
      "label": "glass-body",
      // ...
      "opacity": 0.3                                   // user set this to 30%
    }
  ]
}
```

#### `PUT /api/models/:id/parts/:label/override` — create or update override

```jsonc
// Request body — all fields optional, only send what changed
{
  "pos_x": 0.05,
  "pos_y": null,       // explicit null = reset to base
  "rot_z": 0.785,
  "opacity": 0.3
}

// Response: the merged part with overrides applied
{
  "label": "glass-body",
  "geometryType": "lathe",
  // ... full part with overrides merged ...
  "opacity": 0.3
}
```

#### `DELETE /api/models/:id/parts/:label/override` — reset part to base

Deletes the `PartOverride` row. Part reverts to LLM-generated values. Returns 204.

#### `DELETE /api/models/:id/overrides` — reset all parts to base

Bulk delete all overrides for a model. Returns 204.

---

## Frontend Implementation

### 1. Add `opacity` to `ScenePart` Type

In `types.ts`, add to the `ScenePart` interface:

```typescript
export interface ScenePart {
  // ... existing fields ...
  opacity?: number;   // 0.0–1.0, default 1.0
}
```

### 2. Part Selection State

In `App.tsx` (or a new `usePartEditor` hook), track:

```typescript
const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
```

Pass `selectedLabel` and `onSelectPart` down to `SceneCanvas` → `ScenePart`.

### 3. Click-to-Select on ScenePart

In `ScenePart.tsx`, add click handler on the `<mesh>`:

```typescript
<mesh
  onClick={(e) => {
    e.stopPropagation();   // prevent click-through to parts behind
    onSelect(part.label);
  }}
  // ... existing props ...
>
```

Visual feedback for selection: add a colored outline or emissive highlight on the selected part. Options:
- **Option A:** Set `emissive` and `emissiveIntensity` on the material when selected (simple, no extra geometry)
- **Option B:** Use `@react-three/drei`'s `<Outlines>` component (cleaner visual, slight perf cost)

Recommendation: **Option A** for simplicity. When `selected`:

```typescript
<meshStandardMaterial
  color={color}
  roughness={0.65}
  metalness={0.05}
  transparent={opacity < 1}
  opacity={opacity}
  emissive={isSelected ? "#ff8800" : "#000000"}
  emissiveIntensity={isSelected ? 0.3 : 0}
/>
```

Click on canvas background (not a part) should deselect:

```typescript
// In SceneCanvas, on the Canvas element:
<Canvas onPointerMissed={() => onSelectPart(null)}>
```

### 4. Transform Gizmo

Use `@react-three/drei`'s `TransformControls` to provide the move/rotate gizmo. This component attaches to a target mesh and provides standard 3-axis handles.

```typescript
import { TransformControls } from "@react-three/drei";

// In SceneCanvas, conditionally render when a part is selected:
{selectedPart && (
  <TransformControls
    object={selectedMeshRef}
    mode={editMode}           // "translate" | "rotate"
    onObjectChange={handleTransformChange}
  />
)}
```

**Mode toggle:** The UI needs a toggle between "translate" and "rotate" mode. Add this to the ToolBar or a new floating panel near the canvas. Keyboard shortcuts: `G` for grab/translate, `R` for rotate (Blender convention).

**Interaction with OrbitControls:** `TransformControls` and `OrbitControls` conflict — dragging the gizmo should NOT orbit the camera. `@react-three/drei`'s `TransformControls` handles this automatically by disabling OrbitControls while dragging, but only if OrbitControls has `makeDefault` set (which it already does in the current code).

**Getting a ref to the selected mesh:** `ScenePart` needs to expose a ref to its `<mesh>`. Use `forwardRef` or a ref callback pattern. When a part is selected, pass its ref to `TransformControls`.

### 5. Opacity Control

A slider in the UI (not the 3D canvas). When a part is selected, show an opacity slider (0–100%) in a properties panel.

**Where to put it:** A new `PartProperties` panel below or beside the canvas, visible only when a part is selected. Shows:
- Part label (read-only)
- Position X / Y / Z (editable number inputs)
- Rotation X / Y / Z (editable, display in degrees, store in radians)
- Opacity slider (0–100%)
- "Reset to Original" button (calls `DELETE /api/models/:id/parts/:label/override`)

### 6. Save Overrides on Change

When the user finishes a transform (releases the gizmo) or changes opacity:

1. Read the new position/rotation from the mesh (or from the slider value)
2. Call `PUT /api/models/:id/parts/:label/override` with the changed fields
3. Update local state with the response (merged part)

**Debounce:** Opacity slider changes should be debounced (300ms) to avoid flooding the API. Transform gizmo changes fire on `mouseup` (end of drag), which is naturally debounced.

### 7. Updated ScenePart Rendering for Opacity

The material needs `transparent={true}` when opacity < 1.0:

```typescript
const opacity = part.opacity ?? 1.0;

<meshStandardMaterial
  color={color}
  roughness={0.65}
  metalness={0.05}
  transparent={opacity < 1}
  opacity={opacity}
/>
```

The wireframe overlay should also respect opacity:

```typescript
<lineBasicMaterial
  color="#444444"
  transparent
  opacity={Math.min(0.13, opacity * 0.13)}
/>
```

---

## Backend Implementation

### 1. New Model: `PartOverride`

Add to `src/renderer/models.py` — see schema definition above.

### 2. New Endpoints

Add to `src/renderer/server.py`:

#### `PUT /api/models/{model_id}/parts/{part_label}/override`

```python
class PartOverrideRequest(BaseModel):
    pos_x: Optional[float] = Field(default=None, ge=-1000, le=1000)
    pos_y: Optional[float] = Field(default=None, ge=-1000, le=1000)
    pos_z: Optional[float] = Field(default=None, ge=-1000, le=1000)
    rot_x: Optional[float] = Field(default=None, ge=-6.284, le=6.284)
    rot_y: Optional[float] = Field(default=None, ge=-6.284, le=6.284)
    rot_z: Optional[float] = Field(default=None, ge=-6.284, le=6.284)
    opacity: Optional[float] = Field(default=None, ge=0.0, le=1.0)

@app.put("/api/models/{model_id}/parts/{part_label}/override")
def upsert_part_override(
    model_id: int,
    part_label: str,
    body: PartOverrideRequest,
    session: Session = Depends(get_session),
):
    # 1. Verify model exists
    # 2. Verify part_label exists in model's parts_json
    # 3. Upsert PartOverride row (insert or update on model_id + part_label)
    # 4. Return merged part
```

**Important:** Validate that `part_label` actually exists in the model's `parts_json`. Reject unknown labels with 404. This prevents orphaned overrides.

#### `DELETE /api/models/{model_id}/parts/{part_label}/override`

Delete one override row. Return 204.

#### `DELETE /api/models/{model_id}/overrides`

Delete all override rows for a model. Return 204.

### 3. Update `GET /api/models/{model_id}`

After loading `parts_json`, load all `PartOverride` rows for this model. Merge overrides into the parts array. Add `opacity` field to every part (default 1.0 if no override).

### 4. Database Migration

Adding a new table requires recreating the SQLite database or running a migration. Since this is a local dev tool with SQLite:

- Option A: Delete `renderer.db` and let `init_db()` recreate all tables (simplest, acceptable for dev)
- Option B: Use Alembic for proper migrations (overkill for current stage)

Recommendation: **Option A** for now. Document that saved models will be lost. If the user has important models, export them as JSON first via the Download JSON button.

---

## New Files

| File | Purpose |
|------|---------|
| `frontend/src/components/PartProperties.tsx` | Properties panel: position/rotation inputs, opacity slider, reset button |
| `frontend/src/hooks/usePartEditor.ts` | Selection state, override API calls, debounced save |

## Modified Files

| File | Changes |
|------|---------|
| `src/renderer/models.py` | Add `PartOverride` table |
| `src/renderer/server.py` | Add 3 override endpoints, update `get_model()` to merge overrides |
| `frontend/src/types.ts` | Add `opacity` to `ScenePart`, add `PartOverrideRequest` type |
| `frontend/src/api.ts` | Add `upsertPartOverride()`, `deletePartOverride()`, `deleteAllOverrides()` |
| `frontend/src/three/ScenePart.tsx` | Add click handler, selection highlight, opacity support, `forwardRef` |
| `frontend/src/three/SceneCanvas.tsx` | Add `TransformControls`, selection state passthrough, `onPointerMissed` |
| `frontend/src/App.tsx` | Wire selection state, show `PartProperties` panel when part selected |
| `frontend/src/components/ToolBar.tsx` | Add translate/rotate mode toggle (or move to new panel) |

## Implementation Order

1. **Backend first:** `PartOverride` model + 3 new endpoints + merge logic in `get_model()`
2. **Types + API client:** Update `types.ts` and `api.ts`
3. **Selection:** Click-to-select in `ScenePart`, deselect on miss, visual highlight
4. **Opacity:** `PartProperties` panel with opacity slider, material transparency in `ScenePart`
5. **Transform gizmo:** `TransformControls` integration, mode toggle, save on drag end
6. **Persistence:** Wire save calls on interaction end, load overrides on model load

## Acceptance Criteria

- [ ] Clicking a part highlights it visually (emissive glow)
- [ ] Clicking empty space deselects
- [ ] Selected part shows translate gizmo; dragging moves the part on the chosen axis
- [ ] Pressing R switches to rotate gizmo; pressing G switches back to translate
- [ ] Orbit controls work normally when not dragging the gizmo
- [ ] Properties panel shows position/rotation/opacity for the selected part
- [ ] Changing the opacity slider immediately updates the part's transparency in the canvas
- [ ] Setting opacity to 0 makes the part invisible; setting to 1 makes it fully opaque
- [ ] After moving a part and saving the model, reloading shows the part at the edited position
- [ ] "Reset to Original" reverts a single part to LLM-generated position/rotation/opacity
- [ ] "Reset All" reverts all parts in a model to their original values
- [ ] Overrides are deleted when the parent `StoredModel` is deleted (cascade)
- [ ] The original `parts_json` on `StoredModel` is never modified by editing

---

## Edge Cases to Handle

- **Duplicate labels:** The LLM may generate two parts with the same label. The override system keys on label, so duplicates would share an override. The developer should add an index suffix to duplicate labels at save time (e.g., `fry-1`, `fry-1-2`) or use a composite key of `(model_id, part_label, part_index)`. Recommend: validate uniqueness at save time and auto-suffix duplicates.
- **Many parts:** The example scene has 23 parts. Larger scenes could have 100+. Override queries should be batched (one `SELECT` for all overrides per model, not one per part).
- **Gizmo on small parts:** Very small parts (e.g., `burger-pickle-1` at 0.015 radius) may have gizmo handles that are hard to grab. Consider scaling the gizmo size relative to the camera distance.
- **Transparent sort order:** Three.js requires transparent objects to render back-to-front. When multiple parts have opacity < 1, set `depthWrite={false}` on their materials to avoid z-fighting artifacts. R3F handles render order automatically for transparent objects if `<Canvas>` uses the default `sortObjects: true`.
