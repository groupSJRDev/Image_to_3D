# Plan: Replace TransformControls with Vanilla Drag Approach

**Date:** 2026-03-31  
**Status:** Draft — not yet implemented  
**Scope:** Remove all `TransformControls` usage, replace with direct drag-plane interaction that mirrors `testthreejs.html`

---

## Why

Every bug we have fought in the past two sessions traces back to one decision: using `@react-three/drei`'s `TransformControls` for dragging. The problems it has caused:

| Problem | Cause |
|---|---|
| Second object couldn't be selected | TC's invisible camera-filling drag plane blocked all subsequent raycasts |
| Axis cones didn't drag | Part mesh was hit before TC check, orbit never disabled |
| Orbit not reliably disabled | `__r3f` internal path broke in R3F v9 |
| Parts snapped back | Unrelated bug, but masked by TC complexity |
| Gizmo positioning had to be engineered | Bounding-box center + local-space conversion added for TC placement |

The vanilla `testthreejs.html` has none of these bugs. It uses a 20-line custom drag plane approach that is deterministic, transparent, and has no invisible geometry injected into the scene.

The takeaway: **TransformControls is a sophisticated tool built for professional 3D editors. For a pick-and-move interaction model, it is the wrong tool.**

---

## What the Vanilla Approach Does (The Target)

```javascript
// On pointerdown — hit a mesh:
activeGroup = hit.group;
controls.enabled = false;
raycaster.ray.intersectPlane(dragPlane, hitPoint);      // y=0 horizontal plane
dragOffset.copy(activeGroup.position).sub(hitPoint);    // remember where we grabbed

// On pointermove — while dragging:
if (raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
  activeGroup.position.x = hitPoint.x + dragOffset.x;
  activeGroup.position.z = hitPoint.z + dragOffset.z;
}

// On pointerup:
controls.enabled = true;
activeGroup = null;
```

Key properties of this approach:
- **No invisible geometry** — nothing is added to the scene that could interfere with raycasting
- **No framework integration** — three DOM events, one plane, done
- **Orbit disable is immediate and unconditional** — disabled on click, enabled on release, no detection needed
- **Groups live at world origin (0,0,0)** — parts are at world-space positions within the group; moving the group shifts all children together

---

## What Stays the Same

- `registerMesh` / `unregisterMesh` pattern for raycasting against only part meshes
- Selection state (`selectedGroup`, `selectedLabel`) in `usePartEditor`
- Orange emissive highlight on selected parts/groups in `ScenePart`
- `onGroupTransformEnd(groupName, parts, delta)` API to persist moves via `PartOverride`
- `onTransformEnd(label, pos, rot)` API for individual part moves
- `editMode` ("translate" / "rotate") from the toolbar
- All keyboard shortcuts (G/R/Escape)
- `PartProperties` and `GroupProperties` panels

---

## What Changes

### 1. Delete `useSceneRaycast.ts` — replaced by `useSceneDrag.ts`

The new hook consolidates everything: selection, drag, rotation, and orbit management. Nothing is split across the hook and the components.

**New hook signature:**

```typescript
interface UseSceneDragOptions {
  grouped: Record<string, ScenePartType[]>;  // to know which group a label belongs to
  editMode: EditMode;
  onSelect: (label: string | null, altKey: boolean) => void;
  onGroupDragEnd: (groupName: string, parts: ScenePartType[], delta: Vec3) => void;
  onPartDragEnd: (label: string, pos: Vec3, rot: Vec3) => void;
}

function useSceneDrag(options): {
  registerMesh:    (label: string, mesh: THREE.Mesh)   => void;
  unregisterMesh:  (label: string)                     => void;
  registerGroup:   (groupName: string, group: THREE.Group) => void;
  unregisterGroup: (groupName: string)                 => void;
}
```

**Internal state of the hook (all refs, not React state):**

```
meshesRef:    Map<string, THREE.Mesh>
groupsRef:    Map<string, THREE.Group>
dragPlane:    THREE.Plane(new Vector3(0, 1, 0), 0)   ← horizontal floor plane
hitPoint:     THREE.Vector3  (scratch space)
dragOffset:   THREE.Vector3
activeGroupName:  string | null
activeLabel:      string | null   (for part-mode drag)
activeObject:     THREE.Group | THREE.Mesh | null
dragMode:     "translate" | "rotate" | null
rotStartX:    number
rotStartY:    number  (initial group.rotation.y)
isDragging:   boolean
startPosition: THREE.Vector3  (to compute delta on release)
```

**`pointerdown` logic (no more `isTransformControlsHit` — it doesn't exist):**

```
1. Set ray from mouse coords
2. Intersect meshesRef (registered part meshes only, non-recursive)
3. If no mesh hit:
     call onSelect(null, false) → deselect
     return
4. Get label from hit mesh
5. Determine mode: altKey or selectionMode==="part" → part mode, else group mode
6. Call onSelect(label, altKey) → update selection state
7. Disable OrbitControls (controls.enabled = false)
8. If group mode:
     groupName = getGroupPrefix(label)
     activeObject = groupsRef.get(groupName)
     activeGroupName = groupName
9. If part mode:
     activeObject = hit mesh
     activeLabel = label
10. Record startPosition = activeObject.position.clone()
11. If editMode === "translate":
      intersect dragPlane → hitPoint
      dragOffset = activeObject.position - hitPoint
      dragMode = "translate"
12. If editMode === "rotate":
      rotStartX = e.clientX
      rotStartY = activeObject.rotation.y
      dragMode = "rotate"
13. isDragging = true
```

**`pointermove` logic:**

```
If not isDragging: return  (hover highlighting is optional — see Phase 4)

Update ray from current mouse coords

If dragMode === "translate":
  intersect dragPlane → hitPoint
  activeObject.position.x = hitPoint.x + dragOffset.x
  activeObject.position.z = hitPoint.z + dragOffset.z
  (Y is locked — objects slide along the floor plane)

If dragMode === "rotate":
  activeObject.rotation.y = rotStartY + (e.clientX - rotStartX) * 0.01
```

**`pointerup` logic:**

```
If not isDragging: return

Re-enable OrbitControls (controls.enabled = true)

If dragMode === "translate":
  delta = activeObject.position - startPosition
  if |delta| > 0.0001:  (avoid saving zero-movement clicks)
    if activeGroupName:
      call onGroupDragEnd(activeGroupName, groupParts, delta)
      activeObject.position.copy(startPosition)  ← reset to 0,0,0 so baked delta takes effect on re-render
    if activeLabel:
      call onPartDragEnd(label, finalPos, finalRot)

If dragMode === "rotate":
  same pattern — compute delta rotation and notify

Clear all active refs (activeObject, activeGroupName, activeLabel, isDragging, dragMode)
```

**Why `pointerleave` matters:**
Vanilla also handles `pointerleave` — if the cursor leaves the canvas mid-drag, release the drag. Otherwise orbit stays disabled permanently. Add a `pointerleave` handler that calls the same cleanup as `pointerup`.

---

### 2. Simplify `PartGroup.tsx`

**Remove entirely:**
- `useMemo` for bounding-box center and `localParts` (local-space conversion)
- `TransformControls` import and render
- `tcRef` and the `dragging-changed` `useEffect`
- `center` and `localParts` variables
- `editMode`, `onTransformEnd`, `onGroupTransformEnd` props (drag is now in the hook)

**Add:**
- `registerGroup: (groupName: string, group: THREE.Group) => void`
- `unregisterGroup: (groupName: string) => void`
- A `useEffect` that calls `registerGroup(groupName, groupObj)` when `groupObj` is set (same pattern as `registerMesh` in ScenePart)

**New group positioning:**
Group sits at `[0, 0, 0]` always. Parts render at their world-space positions directly (no local-space offset). This is exactly the vanilla structure: `threeGroups[key]` at origin, parts at world coords inside.

**Before (complex):**
```tsx
const { center, localParts } = useMemo(() => { /* bounding box math */ }, [parts]);
<group ref={setGroupObj} position={[center.x, center.y, center.z]}>
  {localParts.map(p => <ScenePart part={p} />)}  {/* local-offset positions */}
</group>
<TransformControls ref={tcRef} object={groupObj} mode={editMode} />
```

**After (simple):**
```tsx
<group ref={setGroupObj}>   {/* always at 0,0,0 */}
  {parts.map(p => <ScenePart part={p} />)}   {/* world-space positions */}
</group>
```

**Props diff:**
```
Remove:  editMode, onTransformEnd, onGroupTransformEnd
Add:     registerGroup, unregisterGroup
Keep:    groupName, parts, isGroupSelected, selectedLabel, registerMesh, unregisterMesh
```

---

### 3. Simplify `ScenePart.tsx`

**Remove entirely:**
- `showGizmo` prop
- `shouldShowGizmo` derived variable
- `TransformControls` import and render
- `tcRef` and the `dragging-changed` `useEffect`
- `editMode` prop (no longer needed at this level)
- `onTransformEnd` prop (handled by hook)

**Keep:**
- `isSelected` prop and orange emissive highlight
- `registerMesh` / `unregisterMesh` via `useEffect`
- All geometry, material, wireframe rendering
- Geometry disposal `useEffect`

**Props diff:**
```
Remove:  showGizmo, editMode, onTransformEnd
Keep:    part, isSelected, registerMesh, unregisterMesh
```

---

### 4. Update `SceneCanvas.tsx` — use `useSceneDrag` instead of `useSceneRaycast`

The inner `SceneRaycaster` component (which must be inside `<Canvas>` to call `useThree`) becomes `SceneInteraction` and calls `useSceneDrag` instead.

**Pass down to `PartGroup`:**
- `registerGroup` and `unregisterGroup` (new)
- Remove: `editMode`, `onTransformEnd`, `onGroupTransformEnd`

**Props to `SceneCanvas` that can be removed:**
- `onTransformEnd` — handled internally by `useSceneDrag`
- `onGroupTransformEnd` — handled internally by `useSceneDrag`

**New `SceneCanvas` props:**
- `onGroupDragEnd: (groupName, parts, delta) => void`
- `onPartDragEnd: (label, pos, rot) => void`

These have the same signatures as before, just better names.

---

### 5. Minor update to `App.tsx`

Update prop names passed to `SceneCanvas`:
```tsx
// Before:
onTransformEnd={handleTransformEnd}
onGroupTransformEnd={(groupName, groupParts, delta) =>
  handleGroupTransformEnd(groupName, groupParts, delta)
}

// After:
onPartDragEnd={handleTransformEnd}
onGroupDragEnd={(groupName, groupParts, delta) =>
  handleGroupTransformEnd(groupName, groupParts, delta)
}
```

No logic changes needed in `usePartEditor.ts` — `handleTransformEnd` and `handleGroupTransformEnd` signatures are unchanged.

---

## File Summary

| File | Action | Reason |
|---|---|---|
| `useSceneRaycast.ts` | **Delete** | Replaced by `useSceneDrag.ts` |
| `useSceneDrag.ts` | **Create** | Unified drag+select hook, vanilla pattern |
| `PartGroup.tsx` | **Simplify** | Remove TC, remove center/localParts, add registerGroup |
| `ScenePart.tsx` | **Simplify** | Remove TC, remove showGizmo/editMode/onTransformEnd |
| `SceneCanvas.tsx` | **Update** | Use useSceneDrag, update prop threading |
| `App.tsx` | **Minor** | Rename onTransformEnd → onPartDragEnd etc. |
| `usePartEditor.ts` | **No change** | Signatures already match |

---

## What Vanilla Does That We Should Also Adopt

### Drag plane at the object's Y level (not always y=0)

Vanilla uses `dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)` — the plane is at y=0. This works for the burger scene because all objects sit on or near y=0. For objects elevated above the floor (e.g., items on a table), the drag plane should be offset to the object's base Y:

```typescript
// Set the plane to the dragged object's Y floor when drag starts:
dragPlane.constant = -activeObject.position.y;  // or -partBaseY
```

This prevents objects from jumping to y=0 when dragged.

### Hover highlighting

Vanilla highlights groups on `pointermove` (before clicking). This gives good feedback:
```javascript
pointermove → if not dragging → pickGroup → setGroupHighlight(newKey, true)
```

We can add this as Phase 2. It requires:
- A `hoveredGroup: string | null` state in `App.tsx` (or `SceneCanvas`)
- The drag hook calls `onHover(groupName | null)` on `pointermove` when not dragging
- `PartGroup` passes `isHovered` to `ScenePart` which adds a subtle emissive (different from the selection emissive)

This is optional for the core fix but dramatically improves UX.

### `pointerleave` cleanup

Vanilla handles `pointerleave` on the canvas:
```javascript
renderer.domElement.addEventListener("pointerleave", () => {
  if (activeGroup) { /* cleanup */ controls.enabled = true; }
});
```

If the user drags quickly and the cursor leaves the canvas, orbit stays disabled without this. The new `useSceneDrag` hook must include a `pointerleave` listener.

---

## What We Keep From Our System (Not in Vanilla)

### Individual part editing (Alt+click)
Vanilla only has group-level interaction. Our system supports Alt+clicking a specific part to drag it independently. The drag hook handles this via the `activeLabel` path — same drag plane, but the dragged object is the `THREE.Mesh` instead of the `THREE.Group`.

### Opacity editing via `PartProperties` panel
Entirely React-side, unaffected by this change.

### Keyboard shortcuts (G/R/Escape)
Unaffected.

### Persist moves via `PartOverride` API
Unaffected — `handleGroupTransformEnd` and `handleTransformEnd` in `usePartEditor` work identically.

### Translate vs. Rotate mode toggle in ToolBar
Vanilla uses right-click for rotate, left-click for translate. Our toggle in the toolbar gives the same control with left-click for both. The `useSceneDrag` hook reads `editMode` to decide which mode to activate on `pointerdown`. Both approaches work; keep the toolbar toggle since it's already built.

---

## Implementation Order

1. **`useSceneDrag.ts`** — write the new hook first, in isolation, no component changes yet
2. **`PartGroup.tsx`** — add `registerGroup`/`unregisterGroup`, remove TC and center math
3. **`ScenePart.tsx`** — remove TC, remove showGizmo/editMode/onTransformEnd
4. **`SceneCanvas.tsx`** — wire `useSceneDrag`, pass new props, remove old TC props
5. **`App.tsx`** — update prop names
6. **Delete `useSceneRaycast.ts`**
7. **Test**: select → move → re-select → move a different object → Alt+click part → move part → persist across reload

---

## Acceptance Criteria

- [ ] Click any group → highlights orange
- [ ] Drag the group → it moves along the floor plane (Y locked)
- [ ] Release → position persists (reload shows new position)
- [ ] Click a different group → first deselects, second highlights
- [ ] Repeat re-selection works indefinitely (the core bug)
- [ ] Orbit camera works when not clicking an object
- [ ] Alt+click a part → only that part highlights and moves
- [ ] Rotate mode: drag rotates group around Y axis
- [ ] Clicking empty space deselects everything
- [ ] Fast cursor move off canvas doesn't leave orbit permanently disabled
