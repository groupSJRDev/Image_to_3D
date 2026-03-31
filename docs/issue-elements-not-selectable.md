# Issue: Elements Not Selectable for Move/Rotate

**Date:** 2026-03-30
**Author:** Claude Opus 4.6 (Senior Lead)
**Reported by:** Brian Douglas — "still not able to select elements in the model to move or rotate"

---

## Diagnosis

The selection, grouping, and transform code is correctly wired. The problem is that **there is no way to load a JSON file into the app for editing**. The only entry point that populates `parts` state and enables selection is the image upload → Gemini render flow. The user has `scene (1).json` on disk but no way to get it into the canvas in an editable state.

There are actually **three issues** preventing the user from editing:

### Issue 1: No "Load JSON" Feature

The app can **export** JSON (`Download JSON` button) but cannot **import** it. The user created `scene (1).json` (likely exported or hand-edited), but there's no way to load it back into the app. The only path to get parts on screen is:

```
Upload image → Click Render → Gemini API → parts[] → canvas
```

There is no:
```
Load JSON file → parts[] → canvas
```

**Fix:** Add a "Load JSON" button to the UploadPanel or ToolBar that reads a `.json` file, parses it, and sets `parts` state directly — bypassing the Gemini render flow entirely.

### Issue 2: Selection Only Works When `status === "success"`

In `App.tsx` line 107:

```typescript
const canSave = parts.length > 0 && status === "success";
```

More importantly, `status` starts as `"idle"` and only becomes `"success"` after a successful render via the Gemini API. If parts are loaded any other way (JSON import, loading from library), `status` never changes from `"idle"`.

The selection/editing code itself doesn't gate on `status`, so this isn't blocking selection directly. But `canSave` being `false` means the user can't save edits to the library after loading from JSON.

**Fix:** Set `status` to `"success"` when parts are loaded from JSON import or from the library.

### Issue 3: No "Load from Library" into Edit Mode

The model library sidebar has an "add to scene" button, but this puts the model into **composed scene mode** (`instances[]`), not **single model edit mode** (`parts[]`). In composed mode, the `ModelGroup` component renders parts without selection/editing props:

```typescript
// ModelGroup.tsx — no selection, no gizmo, no onSelect
{parts.map((p, i) => (
  <ScenePart key={`${p.label}-${i}`} part={p} />
))}
```

So a model loaded from the library into a composed scene is **view-only** — you can orbit around it but not select or edit individual parts.

**Fix:** Add a "Load for Editing" action on library models that loads the model's parts into single-model edit mode (sets `parts[]`, `currentModelId`, `status = "success"`), distinct from the existing "Add to Scene" action.

---

## Implementation Plan

### Fix 1: Add JSON Import (highest impact)

**Files to change:**

**`frontend/src/components/UploadPanel.tsx`** — Add a "Load JSON" button below the Render button:

```typescript
function handleLoadJSON(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result as string);
      const parts = Array.isArray(data) ? data : data.parts;
      if (Array.isArray(parts)) onLoadJSON(parts);
    } catch {
      // invalid JSON — ignore or surface error
    }
  };
  reader.readAsText(file);
}
```

Add `onLoadJSON: (parts: ScenePart[]) => void` to Props.

**`frontend/src/App.tsx`** — Add the handler:

```typescript
function handleLoadJSON(loadedParts: ScenePart[]) {
  setParts(loadedParts);
  setBaseParts(loadedParts);
  setRawResponse("");
  setCurrentModelId(null);
  setStatus("success");  // enables saving and selection
  clearSelection();
}
```

Pass `onLoadJSON={handleLoadJSON}` to UploadPanel.

### Fix 2: Add "Edit" Action to Model Library

**Files to change:**

**`frontend/src/components/ModelLibrary.tsx`** — Add an "Edit" button per model (alongside "Add to Scene"):

```typescript
<button onClick={() => onEditModel(m)} title="Edit model">Edit</button>
```

Add `onEditModel: (model: StoredModel) => void` to Props.

**`frontend/src/App.tsx`** — Add the handler:

```typescript
async function handleEditModel(model: StoredModel) {
  const full = await getModel(model.id);
  setParts(full.parts ?? []);
  setBaseParts(full.parts ?? []);
  setCurrentModelId(model.id);
  setInstances([]);        // exit composed mode
  setSceneId(null);
  setStatus("success");
  clearSelection();
}
```

This loads the model's parts into single-model edit mode with the `currentModelId` set, so overrides are persisted to the correct model.

### Fix 3: Wire ModelGroup Parts Through Selection (lower priority)

For composed scene mode, `ModelGroup.tsx` should pass selection/editing props through to its `ScenePart` children, similar to `PartGroup.tsx`. This is a larger change and can be deferred — Fixes 1 and 2 cover the immediate workflow gap.

---

## Acceptance Criteria

- [ ] User can click "Load JSON", select `scene (1).json`, and see all 34 parts rendered in the canvas
- [ ] After loading JSON, clicking a part (or group) highlights it with the orange emissive glow
- [ ] The translate gizmo appears and the part/group can be moved
- [ ] Pressing R switches to rotate mode
- [ ] "Save to Library" is enabled after loading JSON
- [ ] User can click "Edit" on a saved library model to load it into edit mode with full selection/editing
- [ ] The properties panel shows position/rotation/opacity for selected parts

---

## Root Cause Summary

The editing infrastructure (selection, grouping, TransformControls, overrides) is complete and correct. The gap is in **entry points** — the only way to get parts into the editable canvas is the Gemini render flow. A user with a JSON file on disk or a model in the library has no path to the edit mode. This is a **workflow gap**, not a code bug.
