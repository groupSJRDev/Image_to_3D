# Plan: Shift-Click to Create Custom Groups

**Date:** 2026-03-31
**Status:** Draft — not yet implemented
**Depends on:** `plan-vanilla-drag-alignment.md` should be implemented first (removes TransformControls complexity)

---

## What the User Gets

1. Hold **Shift** and click objects to build a selection set — each clicked object highlights
2. When two or more objects from different auto-groups are selected, a **"Group Selection"** button appears in the toolbar
3. Click "Group Selection" → prompted to name the group → the selection is saved as a named custom group
4. From that point on, the custom group behaves identically to an auto-derived group: click any member → whole group moves together
5. The group name appears in the `GroupProperties` panel with a **"Ungroup"** button to dissolve it back to individual auto-groups

---

## Key Design Decisions

### Where groups are defined today
Currently, group membership is derived 100% deterministically from the part label:
```
getGroupPrefix("burger-patty-top") → "burger"
getGroupPrefix("beer-glass-body")  → "beer"
```
No group data is stored anywhere — it is always recomputed on the fly. This is elegant but it means user-defined groups have nowhere to live.

### Custom groups need persistence
A custom group like `"burger-and-beer"` containing `["burger-*", "beer-*"]` cannot be encoded in the existing label prefix convention without renaming parts (which would break `PartOverride` foreign key references and the immutable `parts_json` contract).

The solution: store custom group membership separately as a new `PartGroupAssignment` table, keyed on `(model_id, part_label, group_name)`. The label is never renamed.

### Priority: custom group beats auto-group
When a part has a custom group assignment, that overrides the label-prefix group for selection and drag purposes. The lookup order is:
1. Custom group assignment (from DB/state) → use this
2. No custom assignment → fall back to `getGroupPrefix(label)`

### Shift-click selects individual parts, not groups
Shift-click builds a set of individual part labels. The user clicks specific meshes (which may come from different auto-groups). After naming, these labels become members of the new custom group. This means clicking one burger part and one beer part and shift-clicking more builds a cross-group custom group.

---

## Data Model Changes

### New backend table: `PartGroupAssignment`

```python
class PartGroupAssignment(SQLModel, table=True):
    __table_args__ = (
        sa.UniqueConstraint("model_id", "part_label", name="uq_partgroup_model_part"),
    )
    id: int | None = Field(default=None, primary_key=True)
    model_id: int = Field(
        sa_column=sa.Column(
            sa.Integer,
            sa.ForeignKey("storedmodel.id", ondelete="CASCADE"),
            index=True,
            nullable=False,
        )
    )
    part_label: str = Field(max_length=255)
    group_name: str = Field(max_length=255)  # user-defined name, e.g. "my-combo"
```

One row per part per custom group assignment. The unique constraint on `(model_id, part_label)` means each part can only belong to one custom group at a time — you can't have overlapping custom groups. (This is the simplest correct behaviour; overlapping groups are confusing in a drag context.)

### Why not store the group as a JSON array on a `CustomGroup` row?
A separate `groups` table with a `part_labels: json` column would work but creates a secondary lookup. The per-row approach lets the API fetch "what custom group does this part belong to?" in a single indexed query: `SELECT group_name FROM partgroupassignment WHERE model_id=? AND part_label=?`. It also lets `DELETE … WHERE group_name=?` dissolve a whole group cleanly.

---

## New API Endpoints

### `POST /api/models/{model_id}/groups`
Create a new custom group.

```json
Request:  { "group_name": "burger-and-beer", "part_labels": ["burger-patty-top", "beer-glass-body", ...] }
Response: { "group_name": "burger-and-beer", "part_labels": [...] }
```

Validation:
- `group_name` must be non-empty, max 255 chars, no `/` or reserved chars
- `part_labels` must all exist in the model's `parts_json`
- Parts already in a custom group are reassigned (old assignment removed, new one inserted) — not rejected. This lets the user reorganise without having to ungroup first.

### `GET /api/models/{model_id}/groups`
Returns all custom group assignments for the model.

```json
Response: { "groups": { "burger-and-beer": ["burger-patty-top", "beer-glass-body"], ... } }
```

Called once when a model is loaded, result held in frontend state.

### `DELETE /api/models/{model_id}/groups/{group_name}`
Dissolve a custom group — deletes all `PartGroupAssignment` rows with this `group_name` for this model. Parts revert to their label-prefix auto-groups.

Use this for: ungrouping a custom group, OR cleaning up singleton rows when re-grouping via shift-click (the POST endpoint handles reassignment automatically, but a direct delete is also available).

### `POST /api/models/{model_id}/groups/ungroup`
Explode an auto-derived group into singleton custom groups (one row per part). This is the bulk variant — avoids N separate POST calls.

```json
Request:  { "part_labels": ["burger-patty-top", "burger-bottom-bun", "burger-lettuce", "burger-top-bun"] }
Response: { "ungrouped": ["burger-patty-top", "burger-bottom-bun", "burger-lettuce", "burger-top-bun"] }
```

Internally inserts one `PartGroupAssignment` row per label with `group_name = part_label`. Uses the same upsert logic as POST `/groups` — if a part was in a custom group, it is reassigned.

Validation: all `part_labels` must exist in the model's `parts_json`. Returns 404 if any label is missing.

---

## Frontend State Changes

### New state: `customGroups`
```typescript
// In App.tsx (or a new useCustomGroups hook):
const [customGroups, setCustomGroups] = useState<Record<string, string[]>>({});
// e.g. { "burger-and-beer": ["burger-patty-top", "beer-glass-body", ...] }
```

Loaded via `GET /api/models/{id}/groups` when `currentModelId` is set.

### New state: `shiftSelection`
```typescript
const [shiftSelection, setShiftSelection] = useState<Set<string>>(new Set());
// Set of part labels the user has shift-clicked so far
```

This is separate from `selectedGroup`/`selectedLabel` — it is a multi-selection accumulator, not the active editing selection.

### New utility: `resolveGroup(label, customGroups)`
```typescript
function resolveGroup(label: string, customGroups: Record<string, string[]>): string {
  for (const [groupName, labels] of Object.entries(customGroups)) {
    if (labels.includes(label)) return groupName;
  }
  return getGroupPrefix(label);  // fall back to auto-group
}
```

When a part has been ungrouped (singleton assignment where `group_name === label`), `resolveGroup` returns the part label itself. This makes it its own group — independently selectable and draggable. No special-casing needed anywhere else.

### New utility: `isUngroupedSingleton(label, customGroups)`
```typescript
function isUngroupedSingleton(label: string, customGroups: Record<string, string[]>): boolean {
  return customGroups[label]?.length === 1 && customGroups[label][0] === label;
}
```

Used by `SceneHierarchy` and `GroupProperties` to decide whether to show the singleton flat styling and swap "Ungroup" for "Re-group (shift-click to select)".

This replaces all current call sites of `getGroupPrefix(label)` when group membership matters for selection or drag. `groupPartsByPrefix` (which builds the render groups) also needs to respect custom assignments.

### Updated `groupPartsByPrefix` (or a new `groupParts` util)
```typescript
function groupPartsWithCustom(
  parts: ScenePart[],
  customGroups: Record<string, string[]>
): Record<string, ScenePart[]> {
  const groups: Record<string, ScenePart[]> = {};
  for (const part of parts) {
    const groupName = resolveGroup(part.label, customGroups);
    if (!groups[groupName]) groups[groupName] = [];
    groups[groupName].push({ ...part, group: groupName });
  }
  return groups;
}
```

This is the single function that determines how parts are grouped for rendering in `SceneCanvas` and for moving in `useSceneDrag` / `usePartEditor`.

---

## Interaction Flow

### Shift-click to build selection

In `useSceneDrag.ts` (or `useSceneRaycast.ts`), the `pointerdown` handler checks `e.shiftKey`:

```
pointerdown:
  if e.shiftKey:
    hit = raycast meshes
    if hit:
      toggle label in shiftSelection set
      call onShiftSelect(label)  ← new callback
    return   ← do NOT change selectedGroup/selectedLabel, do NOT start drag

  else (normal click):
    existing logic unchanged
```

Parts in `shiftSelection` get a **different highlight colour** from the active selection — e.g., blue emissive (`#0066ff`) instead of orange (`#ff8800`). This makes it visually clear which mode the user is in.

### "Group Selection" button in ToolBar

```typescript
// ToolBar shows this button when:
shiftSelection.size >= 2

// On click:
const name = prompt("Name this group:", "my-group");
if (name) createCustomGroup(name, [...shiftSelection]);
setShiftSelection(new Set());  // clear accumulator
```

### After group creation

1. `POST /api/models/{id}/groups` is called
2. `customGroups` state is updated
3. `groupPartsWithCustom` now returns the new group as a unit
4. `SceneCanvas` re-renders — the new group appears as a single entity
5. Clicking any member selects the whole custom group (same as any other group)

### Escape key clears shift selection
Add to keyboard shortcut handler:
```
Escape → clearSelection() AND setShiftSelection(new Set())
```

### "Ungroup" in GroupProperties panel

The **"Ungroup"** button appears on **every** group — both custom groups and auto-derived groups. The behaviour differs by group type.

#### Ungrouping a custom group
Parts in a custom group have explicit `PartGroupAssignment` rows. Ungroup deletes those rows — parts fall back to their label-prefix auto-group.

1. `DELETE /api/models/{id}/groups/{groupName}`
2. Remove `groupName` from `customGroups` state
3. `groupPartsWithCustom` re-runs — parts slot back into their auto-group
4. `clearSelection()`

**Example:** Custom group `"burger-and-beer"` contains `burger-patty-top` and `beer-glass-body`. After ungroup, `burger-patty-top` rejoins the `"burger"` auto-group; `beer-glass-body` rejoins `"beer"`.

#### Ungrouping an auto-derived group
Auto-groups have no DB rows — they are derived from the label prefix at runtime. To break one apart, we create a `PartGroupAssignment` row for **each part in the group**, using `part.label` as the `group_name`. This makes every part its own singleton group, independently draggable.

1. `POST /api/models/{id}/groups` called once per part: `{ group_name: part.label, part_labels: [part.label] }`
   — or, better: a new `POST /api/models/{id}/groups/ungroup` bulk endpoint (see API section below) 
2. `customGroups` state is populated with N singleton entries: `{ "burger-patty-top": ["burger-patty-top"], ... }`
3. `groupPartsWithCustom` returns each part as its own group — each is independently selectable and draggable
4. `clearSelection()`

**Example:** Auto-group `"burger"` has 4 parts. After ungroup, clicking `burger-patty-top` selects only that part (not the whole burger), and its gizmo moves only that piece.

#### Visual distinction for singleton (ungrouped) parts
In `SceneHierarchy`, ungrouped parts (singleton custom groups where `group_name === part.label`) render without a group header row — they appear as flat top-level items with a small `⬡` icon indicating they are standalone:

```
▼ Scene
  ▶ beer  (3 parts)
  ⬡ burger-patty-top       ← ungrouped singleton
  ⬡ burger-bottom-bun      ← ungrouped singleton
  ⬡ burger-lettuce
  ⬡ burger-top-bun
  ▶ fries  (10 parts)
```

(This is relevant once the hierarchy panel is built per `plan-scene-hierarchy-panel.md`.)

#### Re-grouping after ungroup
To re-group previously ungrouped parts: shift-click them and use the existing "Group Selection" flow. The new group assignment overwrites the singleton assignments. No special "re-group" action is needed — the general shift-click mechanism handles it.

---

## Component Changes Summary

| File | Change |
|---|---|
| `src/renderer/models.py` | Add `PartGroupAssignment` table |
| `src/renderer/server.py` | Add 4 endpoints: POST/GET/DELETE groups + POST ungroup |
| `frontend/src/types.ts` | Add `CustomGroupsMap = Record<string, string[]>` type alias |
| `frontend/src/api.ts` | Add `createCustomGroup`, `getCustomGroups`, `deleteCustomGroup`, `ungroupParts` fetch wrappers |
| `frontend/src/utils/groupParts.ts` | Add `resolveGroup()`, `groupPartsWithCustom()`, `isUngroupedSingleton()` |
| `frontend/src/App.tsx` | Add `customGroups`, `shiftSelection` state; load groups on model load; wire ungroup handler; pass to canvas/toolbar |
| `frontend/src/three/SceneCanvas.tsx` | Accept `customGroups` prop, pass to `groupPartsWithCustom` instead of `groupPartsByPrefix` |
| `frontend/src/three/useSceneDrag.ts` | Add `shiftKey` branch in `pointerdown`; call `onShiftSelect` |
| `frontend/src/three/ScenePart.tsx` | Add `isShiftSelected?: boolean` prop; render blue emissive when true |
| `frontend/src/components/ToolBar.tsx` | Add "Group Selection" button (shown when `shiftSelection.size >= 2`) |
| `frontend/src/components/PartProperties.tsx` | "Ungroup" button on ALL groups; for singletons show hint instead; pass `customGroups` to determine group type |
| DB migration | `rm renderer.db && touch renderer.db` — new table requires recreation |

---

## What Does Not Change

- `PartOverride` table and all position/opacity persistence — unaffected, keyed on `part_label` not group
- Auto-group logic (`getGroupPrefix`) — still used as the fallback
- `parts_json` — never mutated, labels never renamed
- Individual part editing (Alt+click) — unaffected

---

## Edge Cases to Handle

| Edge case | Handling |
|---|---|
| User shift-clicks parts from the same auto-group | Allowed — creates a custom group that is a subset of the auto-group. Remaining parts in the auto-group stay as auto-group members. |
| User shift-clicks a part already in a different custom group | The part is reassigned to the new group. Old group may now have fewer members (still valid ≥1 part). |
| Custom group ends up with 1 part after reassignment | Still valid — single-part groups work fine. Not shown as a "singleton" in the hierarchy — only parts ungrouped via the Ungroup action get singleton styling. |
| User deletes a group that has `PartOverride` rows | PartOverride rows are keyed on `part_label`, not group name — unaffected. Position overrides persist through ungroup/re-group. |
| `currentModelId` is null (unsaved render) | Disable "Group Selection" and "Ungroup" buttons. Custom groups require a saved model. Show tooltip: "Save model first." |
| Model loaded from library already has custom groups | `GET /api/models/{id}/groups` is called on load, `customGroups` populated, canvas renders them immediately including any singletons. |
| Ungrouping an already-ungrouped part (singleton) | `isUngroupedSingleton` returns true — "Ungroup" button is replaced with a note: "Already standalone — shift-click to re-group." |
| Ungrouping an auto-group with many parts (e.g., fries × 10) | Creates 10 singleton assignments in one `POST /ungroup` call. Each fry becomes independently draggable. This is intentional — user asked for it. |
| User ungroups, moves some parts, then re-groups them | Re-grouping via shift-click creates a new custom group assignment. The `PartOverride` positions from the solo moves are preserved — the new group moves all parts together from their current (overridden) positions. |
| Ungrouping an auto-group when only `currentModelId` is known | Ungrouping always goes through the API (it persists). If `currentModelId` is null, button is disabled. Same gate as "Group Selection". |

---

## Implementation Order

1. **Backend**: `PartGroupAssignment` model + 4 endpoints (POST groups, GET groups, DELETE groups/{name}, POST groups/ungroup) + DB reset
2. **`groupParts.ts`**: `resolveGroup`, `groupPartsWithCustom`, `isUngroupedSingleton`
3. **`api.ts`**: four fetch wrappers
4. **`App.tsx`**: `customGroups` and `shiftSelection` state; `handleUngroup` and `handleUngroupAuto` handlers; load groups on model load
5. **`SceneCanvas.tsx`**: accept and pass `customGroups` to grouping function
6. **`useSceneDrag.ts`**: shift-click branch, `onShiftSelect` callback
7. **`ScenePart.tsx`**: `isShiftSelected` blue emissive highlight
8. **`ToolBar.tsx`**: "Group Selection" button (gated on `shiftSelection.size >= 2` and `currentModelId`)
9. **`PartProperties.tsx`**: "Ungroup" button on `GroupProperties` for all groups; singleton hint text; pass `customGroups` to determine group type

---

## Acceptance Criteria

### Group creation
- [ ] Shift-click 3 parts from different groups → all 3 highlight blue
- [ ] Shift-clicking a highlighted part again toggles it off
- [ ] "Group Selection" button appears in toolbar when ≥2 parts are shift-selected
- [ ] "Group Selection" is disabled/hidden when `currentModelId` is null
- [ ] Click "Group Selection" → name prompt → group created → canvas re-renders as single unit
- [ ] Clicking any member of the new group selects and moves the entire custom group
- [ ] Reload page → custom groups are restored (persisted in DB)
- [ ] Escape clears shift-selection without changing active selection

### Ungrouping a custom group
- [ ] Selecting a custom group shows "Ungroup" button in GroupProperties
- [ ] Click "Ungroup" → parts dissolve back to their label-prefix auto-groups
- [ ] Canvas immediately re-renders: former members now belong to separate auto-groups
- [ ] Persisted: reload confirms the custom group is gone

### Ungrouping an auto-derived group
- [ ] Selecting an auto-group (e.g., "burger") shows "Ungroup" button in GroupProperties
- [ ] Click "Ungroup" → each part in the group becomes independently draggable
- [ ] Each former member can be selected and moved without affecting the others
- [ ] Persisted: reload confirms each part is still standalone
- [ ] `SceneHierarchy` (when built) shows ungrouped parts as flat top-level items with singleton styling

### Singleton guard
- [ ] Selecting a singleton part (already ungrouped) shows "Already standalone" hint, not "Ungroup"
- [ ] Ungroup and Group Selection buttons are disabled when `currentModelId` is null

### Re-grouping after ungroup
- [ ] Shift-clicking ungrouped parts and using "Group Selection" creates a new group containing them
- [ ] PartOverride positions (from solo moves) are preserved after re-grouping
- [ ] New group moves all members together from their current overridden positions
