# Bug Analysis: Cannot Select a Second Object After the First

**Date:** 2026-03-31  
**File affected:** `frontend/src/three/useSceneRaycast.ts`  
**Symptom:** First object click selects correctly and can be moved. Every subsequent click on a different object does nothing — selection is stuck on the first object.

---

## What the User Experiences

1. Click the burger group → highlights orange, gizmo appears ✓
2. Move the burger with the gizmo ✓
3. Click the beer group → nothing happens. Burger stays selected.
4. Click anywhere on anything → selection never changes.

---

## Why the First Click Works

On the very first click, there is no `TransformControls` gizmo anywhere in the scene (nothing is selected yet). `handlePointerDown` runs:

```
isTransformControlsHit() → false  (no TC exists)
intersectObjects(meshArray) → hits burger mesh
onHit("burger-bottom-bun", false) → selectedGroup = "burger"
```

React re-renders. `PartGroup` for `"burger"` now has `isGroupSelected=true` and renders a `<TransformControls>` attached to the group's `THREE.Group` object.

**The TC gizmo is now in the scene.** This is where everything breaks.

---

## Why the Second Click (and Every Click After) Fails

When the user tries to click the beer group, `handlePointerDown` runs again:

```
isTransformControlsHit() → ???
```

This function does:

```typescript
const allHits = raycaster.current.intersectObjects(scene.children, true);
for (const hit of allHits) {
  let obj = hit.object;
  while (obj) {
    if ((obj as any).isTransformControls) return true;
    obj = obj.parent;
  }
}
```

It raycasts against **all scene children recursively**. The key fact is:

> **Three.js `intersectObjects` does NOT skip invisible meshes.**

Three.js's raycasting traversal calls `object.raycast()` on every object it visits regardless of `object.visible`. Visibility is a render-only flag — the geometry is still tested against the ray.

---

## The TransformControls Internal Structure

`TransformControls` (Three.js) is not just the arrows and sphere you see on screen. It has two layers of internal geometry:

### 1. Visible Gizmo Handles
The arrows (cones + shafts), the center sphere, the rotation rings. These are `visible: true` and are what the user sees. They are sized roughly proportional to the object.

### 2. Invisible Picker Meshes
Every handle has a corresponding larger invisible mesh that exists solely to make it easier to click — so you don't have to pixel-perfectly click the arrow tip. These are `visible: false`.

### 3. The Drag Plane Mesh
When in translate mode, TC adds an invisible `THREE.PlaneGeometry` mesh to the scene. This plane defines the drag surface when you grab a handle. In translate mode the plane is **oriented toward the camera and sized to fill the field of view** — it must be large enough that the cursor never leaves it during a drag, even at extreme angles.

**This drag plane is the culprit.** It is:
- Added to the scene as a `THREE.Mesh`
- Has `visible: false`
- Is large (fills the camera frustum)
- Is **not** skipped by Three.js's raycaster

So when the user clicks on the beer group after the burger TC is active, the ray aimed at the beer collides with the burger TC's large invisible drag plane somewhere along its path. `isTransformControlsHit()` walks up the parent chain from that plane to the `TransformControls` object, finds `isTransformControls = true`, and returns `true`.

The code then does:

```typescript
if (isTransformControlsHit()) {
  controls.enabled = false;
  disabledOrbit = true;
  return;  // ← never reaches the mesh check or onHit
}
```

`onHit` is never called. Selection never changes. This happens for **every** click after the first, because the TC's drag plane covers the whole viewport.

---

## Comparison with the Working Vanilla Example

`testthreejs.html` does not use `TransformControls` at all. Instead it uses a custom drag plane:

```javascript
renderer.domElement.addEventListener("pointerdown", e => {
  const hit = pickGroup(e);  // only checks actual part meshes
  if (!hit) return;

  activeGroup = hit.group;
  controls.enabled = false;  // immediately disables orbit on any mesh hit
  // starts drag...
});
```

There are no invisible TC picker planes in the scene. `pickGroup` only checks the `allMeshes` array (the actual geometry). There is nothing that can interfere.

The vanilla approach can always re-select because every `pointerdown` independently checks part meshes with no competing invisible geometry.

---

## The Fix

In `isTransformControlsHit()`, skip any ray intersection where the hit object is invisible. The invisible picker planes and drag planes have `visible: false`. The real visible gizmo handles (arrows, sphere) have `visible: true`. Filtering by `visible` isolates only the actual interactive parts.

**Before (broken):**
```typescript
function isTransformControlsHit(): boolean {
  const allHits = raycaster.current.intersectObjects(scene.children, true);
  for (const hit of allHits) {
    let obj: THREE.Object3D | null = hit.object;
    while (obj) {
      if ((obj as any).isTransformControls) return true;
      obj = obj.parent;
    }
  }
  return false;
}
```

**After (fixed):**
```typescript
function isTransformControlsHit(): boolean {
  const allHits = raycaster.current.intersectObjects(scene.children, true);
  for (const hit of allHits) {
    if (!hit.object.visible) continue;  // skip invisible picker/plane meshes
    let obj: THREE.Object3D | null = hit.object;
    while (obj) {
      if ((obj as any).isTransformControls) return true;
      obj = obj.parent;
    }
  }
  return false;
}
```

This one-line change means:

| Hit object | `visible` | Result |
|---|---|---|
| TC axis cone (arrow tip) | `true` | TC detected ✓ — gizmo drag starts |
| TC center sphere | `true` | TC detected ✓ — gizmo drag starts |
| TC invisible picker plane | `false` | **Skipped** — falls through to mesh check |
| TC invisible drag plane | `false` | **Skipped** — falls through to mesh check |
| Part mesh (burger, beer, etc.) | `true` | Not TC — mesh check handles it → `onHit` |

After the fix:
1. Click burger → selects burger ✓
2. Click beer (ray hits TC invisible plane + beer mesh) → TC plane is skipped → beer mesh is hit → `onHit("beer-glass-body", false)` → selects beer ✓
3. Click fries → same result ✓

---

## Why This Was Hard to Spot

The symptom ("can't re-select") looks like a state bug or an `onHit` callback issue. The actual cause is at the Three.js geometry level — invisible meshes that Three.js creates internally and that the raycaster hits even though they're invisible. This is undocumented behavior. The vanilla example avoids it entirely by not using `TransformControls`.

---

## Files Changed

| File | Change |
|---|---|
| `frontend/src/three/useSceneRaycast.ts` | Add `if (!hit.object.visible) continue;` in `isTransformControlsHit()` |
