# Issue: Only Large/Top-Level Parts Are Selectable — Group Selection Needed

**Date:** 2026-03-30
**Author:** Claude Opus 4.6 (Senior Lead)
**Reported by:** Brian Douglas
**Severity:** UX — core editing workflow broken for compound models

---

## Problem

When loading a model like `scene (1).json` (burger, beer, fries, dipping sauces, tomatoes on a cutting board), the user can click and move the `board` but **cannot select or move logical groups** like "the burger", "the fries", "the beer glass", etc. Individual tiny parts (pickles, stems, individual fries) are technically clickable, but:

1. Small parts (0.01m fries, 0.002m stems) are nearly impossible to click
2. Moving one fry without the other 7 fries and the bowl is useless
3. Moving `beer-glass` without `beer-liquid` and `beer-foam` breaks the model
4. There's no way to select "the burger" as a unit — it's 10 separate parts

The user's mental model is **groups** (burger, beer, fries, ketchup, mayo, tomatoes). The current implementation only understands **individual parts**.

---

## Root Cause Analysis

### The JSON Schema Has No Group Concept

The `parts[]` array is flat. Looking at the scene JSON, the grouping is implicit in the label naming convention:

```
burger-bun-bottom    ┐
burger-lettuce       │
burger-patty-bottom  │
burger-cheese-bottom │  "burger" group (10 parts)
burger-patty-top     │
burger-cheese-top    │
burger-pickle-1/2/3  │
burger-bun-top       ┘

beer-glass           ┐
beer-liquid          │  "beer" group (3 parts)
beer-foam            ┘

fries-bowl           ┐
fry-1 through fry-8  │  "fries" group (9 parts)
                     ┘

ketchup-bowl         ┐  "ketchup" group (2 parts)
ketchup-sauce        ┘

mayo-bowl            ┐
mayo-sauce-base      │  "mayo" group (3 parts)
mayo-sauce-peak      ┘

tomato-1/2/3         ┐  "tomatoes" group (6 parts)
tomato-1/2/3-stem    ┘

board                   standalone (1 part)
```

The LLM already generates these prefix conventions consistently. The system just doesn't use them.

### ScenePart Selection Is Per-Part Only

In `ScenePart.tsx`, the click handler fires on individual meshes:

```typescript
onClick={(e) => {
  e.stopPropagation();
  onSelect?.(part.label);  // selects ONE part
}}
```

`TransformControls` then attaches to that single mesh. Moving it moves only that one mesh — the rest of the group stays put.

### No Group-Level Transform Exists

`SceneCanvas.tsx` renders all parts flat:

```typescript
{parts.map((p, i) => (
  <ScenePart key={`${p.label}-${i}`} part={p} ... />
))}
```

There's no `<group>` wrapping related parts. Compare with `ModelGroup.tsx`, which wraps `SceneInstance` children in a `<group>` — that pattern already exists for composed scenes but isn't applied within a single model.

---

## Solution: Label-Prefix Group Detection + Group Selection Mode

### 1. Derive Groups from Label Prefixes

Parse `parts[]` labels to detect groups automatically. The algorithm:

```
For each part label:
  1. Split on the LAST hyphen-followed-by-number pattern: "burger-patty-1" → prefix "burger-patty"
  2. If that yields a prefix shared by 0 other parts, split on the first hyphen: "burger-patty-1" → prefix "burger"
  3. Parts with a shared prefix form a group
  4. Parts with a unique prefix are standalone
```

A simpler approach that works for LLM-generated labels: **split on the first hyphen** to get the group prefix. `burger-bun-bottom` → `burger`, `beer-glass` → `beer`, `fry-1` → `fry`, `tomato-1-stem` → `tomato`.

Edge case: `board` has no hyphen — it's its own group.

This gives us:

| Prefix | Parts | Count |
|--------|-------|-------|
| `burger` | burger-bun-bottom, burger-lettuce, ..., burger-bun-top | 10 |
| `beer` | beer-glass, beer-liquid, beer-foam | 3 |
| `fry` | fry-1 through fry-8 | 8 |
| `fries` | fries-bowl | 1 |
| `ketchup` | ketchup-bowl, ketchup-sauce | 2 |
| `mayo` | mayo-bowl, mayo-sauce-base, mayo-sauce-peak | 3 |
| `tomato` | tomato-1, tomato-1-stem, ..., tomato-3-stem | 6 |
| `board` | board | 1 |

Problem: `fry-*` and `fries-bowl` should be the same group. First-hyphen splitting puts them in different groups.

**Better algorithm:** Use the longest common prefix among labels that share at least the first hyphen segment. Or: provide a configurable merge map. Or simplest: **the user defines groups manually from the properties panel**.

**Recommended approach:** Combine auto-detection with manual override:

1. Auto-detect groups using first-hyphen-segment as default
2. Show groups in a collapsible tree in the UI
3. Allow the user to drag parts between groups or merge groups
4. Persist group assignments in a new `PartGroup` table (or as a JSON field on `StoredModel`)

### 2. Add a `group` Field to the Schema

Extend `ScenePart` with an optional `group` field:

```typescript
export interface ScenePart {
  // ... existing fields ...
  group?: string;   // e.g., "burger", "beer", "fries" — null = standalone
}
```

This field is:
- **Auto-populated** on first render by the prefix algorithm
- **User-editable** via the properties panel (move part to different group)
- **Persisted** as part of the override system (or inline in parts_json since it's metadata, not geometry)

### 3. Render Groups as `<group>` Elements

In `SceneCanvas.tsx`, instead of rendering a flat list:

```typescript
// Current (flat):
{parts.map((p, i) => <ScenePart key={...} part={p} />)}

// Proposed (grouped):
{Object.entries(groupedParts).map(([groupName, groupParts]) => (
  <PartGroup
    key={groupName}
    name={groupName}
    parts={groupParts}
    isSelected={selectedGroup === groupName}
    onSelect={onSelectGroup}
    onTransformEnd={onGroupTransformEnd}
  />
))}
```

The new `PartGroup` component wraps children in a Three.js `<group>`:

```typescript
function PartGroup({ name, parts, isSelected, editMode, onSelect, onTransformEnd }) {
  const groupRef = useRef<THREE.Group>(null);

  return (
    <>
      <group ref={groupRef}>
        {parts.map((p, i) => (
          <ScenePart key={`${p.label}-${i}`} part={p} ... />
        ))}
      </group>
      {isSelected && groupRef.current && (
        <TransformControls object={groupRef.current} mode={editMode} />
      )}
    </>
  );
}
```

When the gizmo moves the `<group>`, **all children move together**. This is exactly how `ModelGroup.tsx` already works for composed scenes — the same pattern, applied within a single model.

### 4. Two Selection Levels

The UI needs two selection modes:

| Mode | Click Behavior | Gizmo Attaches To | Use Case |
|------|---------------|-------------------|----------|
| **Group mode** (default) | Click any part → selects its group | The `<group>` | Move the burger, move the beer glass |
| **Part mode** (hold Alt) | Click a part → selects that part only | The individual `<mesh>` | Nudge one pickle, adjust one fry angle |

Toggle via:
- **Alt+click** = part mode (temporary, for precision edits)
- **Toolbar button** = switch default mode
- **Keyboard:** `P` for part mode, `G` for group/grab mode (overload current G)

### 5. Persist Group Transforms

When a group is moved, we need to update the position of every part in the group. Two approaches:

**Option A — Update individual part overrides:** When the group gizmo ends, compute each part's new world position and save individual `PartOverride` rows. Simple, uses existing infrastructure.

**Option B — Store group-level transform separately:** Add a `GroupOverride` table with `(model_id, group_name, pos_x/y/z, rot_x/y/z)`. The frontend applies the group transform on top of individual part positions. More efficient (1 row instead of N), but adds complexity to the merge logic.

**Recommendation: Option A** for now. It's simpler and the part count per model is small (20–40 parts). Option B is an optimization for later if needed.

With Option A, when the user drags a group:
1. Read the group's delta (new position - old position from the `<group>` transform)
2. For each part in the group: `new_part_pos = original_pos + delta`
3. Batch-save all overrides via a new `PUT /api/models/:id/overrides/batch` endpoint
4. Reset the `<group>` position to (0,0,0) — the delta is now baked into individual parts

### 6. Properties Panel Updates

When a group is selected, the `PartProperties` panel should show:
- Group name (editable — rename the group)
- Part count
- Group position/rotation (aggregate — applied to the `<group>` node)
- "Expand" button to list individual parts within the group
- "Reset Group" button — resets all parts in the group to LLM originals

When an individual part is selected (Alt+click):
- Current behavior — part label, position, rotation, opacity

---

## Implementation Phases

### Phase A: Group Detection + Visual Grouping (no editing yet)

**Files:**
- New: `frontend/src/utils/groupParts.ts` — `groupPartsByPrefix(parts: ScenePart[]): Record<string, ScenePart[]>`
- New: `frontend/src/three/PartGroup.tsx` — `<group>` wrapper with selection support
- Modified: `frontend/src/three/SceneCanvas.tsx` — use grouped rendering
- Modified: `frontend/src/types.ts` — add `group?: string` to `ScenePart`

**Acceptance criteria:**
- [ ] Parts render identically to before (no visual change)
- [ ] Console logs show detected groups matching the expected table above

### Phase B: Group Selection + Transform

**Files:**
- Modified: `frontend/src/three/PartGroup.tsx` — add TransformControls on group select
- Modified: `frontend/src/three/SceneCanvas.tsx` — group selection state, Alt+click for part mode
- Modified: `frontend/src/App.tsx` — `selectedGroup` state alongside `selectedLabel`
- Modified: `frontend/src/hooks/usePartEditor.ts` — handle group transform end (delta calculation + batch override)

**Acceptance criteria:**
- [ ] Clicking the beer glass selects the entire beer group (glass + liquid + foam glow)
- [ ] Dragging the group gizmo moves all 3 beer parts together
- [ ] Alt+clicking the beer foam selects only the foam part
- [ ] Releasing the gizmo persists positions via the override API

### Phase C: Batch Override API

**Files:**
- Modified: `src/renderer/server.py` — `PUT /api/models/:id/overrides/batch`
- Modified: `frontend/src/api.ts` — `batchUpsertOverrides()`

**Acceptance criteria:**
- [ ] Moving a group of 10 parts makes 1 API call, not 10
- [ ] Reloading the model shows parts at their new group positions

### Phase D: Properties Panel for Groups

**Files:**
- Modified: `frontend/src/components/PartProperties.tsx` — group mode view
- Modified: `frontend/src/App.tsx` — pass group data to properties panel

**Acceptance criteria:**
- [ ] Selecting a group shows group name and part count
- [ ] "Reset Group" reverts all parts in the group to original positions

---

## Edge Cases

- **Single-part groups** (like `board`): Behave identically to individual part selection. No visual difference.
- **Label with no hyphen**: Part is its own group.
- **Ambiguous prefixes** (`fry-*` vs `fries-*`): The auto-detection should handle this — both share `fr` but diverge at the second character. Using first-hyphen-split: `fry` and `fries` are separate groups. This is actually correct behavior — the bowl is a container, the fries are contents. If the user wants them as one group, they can merge manually in Phase D.
- **Group transform + individual override**: If a part has an individual position override AND the group is moved, the override is the final position. The group delta is applied on top of whatever the part's current position is (base or overridden).

---

## Why This Wasn't Caught Earlier

The feature-part-editing spec focused on per-part editing because the JSON schema is per-part. The assumption was that users would want to fine-tune individual elements. In practice, users think in **semantic objects** (the burger, the glass), not geometric primitives (cylinder #4, lathe #7). The label prefix convention was always there — the system just never exploited it.

This is a common pattern in LLM-generated structured output: **the LLM encodes hierarchy in naming conventions that the downstream system treats as flat strings.** Any system consuming LLM-generated labeled data should check whether the labels encode implicit structure worth surfacing.
