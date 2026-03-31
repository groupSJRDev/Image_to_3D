# Fix: Selection Not Working — Replace R3F Events with Manual Raycasting

**Date:** 2026-03-30
**Author:** Claude Opus 4.6 (Senior Lead)
**Priority:** CRITICAL — core editing workflow completely broken

---

## Problem

Clicking on any part in the 3D canvas produces no selection highlight and no gizmo. The R3F event system (`onClick` on `<mesh>`) is not firing. Meanwhile, a vanilla Three.js implementation with identical scene data and manual raycasting works perfectly.

## Root Cause

R3F's built-in event system raycasts against the **entire scene graph**, not just meshes with event handlers. The `GroundGrid` component injects ~80+ unmanaged Three.js objects via `<primitive object={group} />` — a 4m x 4m floor plane, grid lines, and axis lines. These objects interfere with R3F's event traversal:

1. The floor plane at y=-0.002 intercepts downward-looking raycasts before they reach model parts
2. Even after setting `plane.raycast = () => {}`, the `<primitive>` container and its Line children remain in R3F's traversal path
3. Objects added via `<primitive>` lack R3F's internal `__r3f` metadata — they may cause the event system to misroute or drop events entirely

The vanilla Three.js example avoids this entirely:
```javascript
// Only checks explicit mesh list — no grid, no plane, no lines
const hits = raycaster.intersectObjects(allMeshes, false);
```

## Solution: Manual Raycasting Hook

Replace R3F's `onClick` event system with a manual raycaster that checks only part meshes, exactly as the working vanilla code does. This runs inside the R3F Canvas via `useThree()` but bypasses R3F's event dispatch.

### New file: `frontend/src/three/useSceneRaycast.ts`

```typescript
import { useEffect, useRef, useCallback } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

interface UseSceneRaycastOptions {
  /** Called when a mesh is clicked. Receives mesh name (part label) and whether Alt was held. */
  onHit: (label: string, altKey: boolean) => void;
  /** Called when clicking empty space (no mesh hit). */
  onMiss: () => void;
  /** If false, raycasting is disabled (e.g., while dragging a gizmo). */
  enabled?: boolean;
}

/**
 * Manual raycaster that checks only registered meshes.
 * Bypasses R3F's event system to avoid interference from
 * <primitive> objects (GroundGrid, etc.).
 *
 * Components register their meshes via the returned `registerMesh`
 * and `unregisterMesh` callbacks.
 */
export function useSceneRaycast({ onHit, onMiss, enabled = true }: UseSceneRaycastOptions) {
  const { camera, gl } = useThree();
  const meshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());

  const registerMesh = useCallback((label: string, mesh: THREE.Mesh) => {
    meshesRef.current.set(label, mesh);
  }, []);

  const unregisterMesh = useCallback((label: string) => {
    meshesRef.current.delete(label);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const canvas = gl.domElement;

    function handlePointerDown(e: PointerEvent) {
      // Ignore right-click (context menu) and middle-click
      if (e.button !== 0) return;

      const rect = canvas.getBoundingClientRect();
      mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.current.setFromCamera(mouse.current, camera);

      const meshArray = Array.from(meshesRef.current.values());
      const hits = raycaster.current.intersectObjects(meshArray, false);

      if (hits.length > 0) {
        const hitMesh = hits[0].object as THREE.Mesh;
        // Find the label for this mesh
        for (const [label, mesh] of meshesRef.current.entries()) {
          if (mesh === hitMesh) {
            onHit(label, e.altKey);
            return;
          }
        }
      }

      onMiss();
    }

    canvas.addEventListener("pointerdown", handlePointerDown);
    return () => canvas.removeEventListener("pointerdown", handlePointerDown);
  }, [camera, gl, enabled, onHit, onMiss]);

  return { registerMesh, unregisterMesh };
}
```

### Changes to `frontend/src/three/ScenePart.tsx`

Remove the `onClick` handler from `<mesh>`. Instead, register/unregister the mesh with the manual raycaster:

```typescript
// Remove: onClick on <mesh>
// Add: registration with manual raycaster

interface Props {
  part: ScenePartType;
  isSelected?: boolean;
  showGizmo?: boolean;
  editMode?: EditMode;
  onTransformEnd?: (label: string, pos: Vec3, rot: Vec3) => void;
  // NEW: registration callbacks from useSceneRaycast
  registerMesh?: (label: string, mesh: THREE.Mesh) => void;
  unregisterMesh?: (label: string) => void;
}

// Inside the component, after mesh ref is set:
useEffect(() => {
  if (meshObj && registerMesh) {
    registerMesh(part.label, meshObj);
  }
  return () => {
    if (unregisterMesh) unregisterMesh(part.label);
  };
}, [meshObj, part.label, registerMesh, unregisterMesh]);

// Remove onClick from <mesh>:
<mesh
  ref={setMeshObj}
  position={[pos.x, pos.y, pos.z]}
  rotation={[rot.x, rot.y, rot.z]}
  scale={[sc.x, sc.y, sc.z]}
  geometry={geometry}
  // NO onClick here — manual raycaster handles it
>
```

### Changes to `frontend/src/three/SceneCanvas.tsx`

Initialize the manual raycaster and pass registration callbacks down:

```typescript
export function SceneCanvas({ parts, instances, selectedGroup, selectedLabel,
                              editMode, onSelect, onTransformEnd, onGroupTransformEnd }: Props) {
  // ...existing code...

  return (
    <Canvas ...>
      <CanvasErrorBoundary>
        <Lighting />
        <GroundGrid />
        <OrbitControls enableDamping makeDefault target={[0, 0.8, 0]} />
        <SceneRaycaster
          grouped={grouped}
          selectedGroup={selectedGroup}
          selectedLabel={selectedLabel}
          editMode={editMode}
          onSelect={onSelect}
          onTransformEnd={onTransformEnd}
          onGroupTransformEnd={onGroupTransformEnd}
        />
      </CanvasErrorBoundary>
    </Canvas>
  );
}

// Inner component that can use useThree() (must be inside <Canvas>)
function SceneRaycaster({ grouped, selectedGroup, selectedLabel, editMode,
                          onSelect, onTransformEnd, onGroupTransformEnd }) {
  const { registerMesh, unregisterMesh } = useSceneRaycast({
    onHit: (label, altKey) => onSelect?.(label, altKey),
    onMiss: () => onSelect?.(null, false),
  });

  return (
    <>
      {Object.entries(grouped).map(([groupName, groupParts]) => (
        <PartGroup
          key={groupName}
          groupName={groupName}
          parts={groupParts}
          isGroupSelected={groupName === selectedGroup}
          selectedLabel={selectedLabel}
          editMode={editMode}
          onTransformEnd={onTransformEnd}
          onGroupTransformEnd={onGroupTransformEnd}
          registerMesh={registerMesh}
          unregisterMesh={unregisterMesh}
        />
      ))}
    </>
  );
}
```

### Changes to `frontend/src/three/PartGroup.tsx`

Pass `registerMesh` and `unregisterMesh` through to ScenePart children:

```typescript
interface Props {
  // ...existing props...
  registerMesh: (label: string, mesh: THREE.Mesh) => void;
  unregisterMesh: (label: string) => void;
}

// In the render:
<ScenePart
  key={`${p.label}-${i}`}
  part={p}
  isSelected={isGroupSelected || p.label === selectedLabel}
  showGizmo={p.label === selectedLabel}
  editMode={editMode}
  onTransformEnd={onTransformEnd}
  registerMesh={registerMesh}
  unregisterMesh={unregisterMesh}
/>
```

### Remove `onPointerMissed` from Canvas

The manual raycaster handles miss detection. Remove from `SceneCanvas.tsx`:

```typescript
// Remove this:
onPointerMissed={() => onSelect?.(null, false)}
```

### Optional: Add Hover Highlight

The vanilla example has hover highlighting (emissive glow on mouseover). This can be added to `useSceneRaycast` with a `pointermove` listener and an `onHover` callback, following the same pattern as the working code.

---

## Why Manual Raycasting Over R3F Events

| Aspect | R3F Events | Manual Raycasting |
|--------|-----------|-------------------|
| Checks | Entire scene graph | Only registered meshes |
| Ground plane | Intercepts clicks | Ignored — not registered |
| Grid lines | In traversal path | Ignored — not registered |
| `<primitive>` objects | Confuse event routing | Not involved |
| Control | Implicit, framework-managed | Explicit, we decide what's hit-testable |
| Vanilla Three.js parity | Different event model | Identical approach — proven working |

The vanilla example proves that manual raycasting against an explicit mesh list works. The R3F event system adds complexity for no benefit in this use case, and its interaction with `<primitive>` objects creates bugs we can't easily fix.

---

## Files to Change

| File | Change |
|------|--------|
| New: `frontend/src/three/useSceneRaycast.ts` | Manual raycaster hook |
| `frontend/src/three/ScenePart.tsx` | Remove `onClick`, add mesh registration via `useEffect` |
| `frontend/src/three/SceneCanvas.tsx` | Initialize `useSceneRaycast`, remove `onPointerMissed`, create inner `SceneRaycaster` component |
| `frontend/src/three/PartGroup.tsx` | Pass `registerMesh`/`unregisterMesh` to ScenePart children |

## Acceptance Criteria

- [ ] Clicking any part highlights its group with orange emissive glow
- [ ] Alt+clicking a specific part highlights only that part
- [ ] TransformControls gizmo appears on the selected group/part
- [ ] Dragging the gizmo moves/rotates the selection (orbit controls disabled during drag)
- [ ] Clicking empty space (grid, background) deselects
- [ ] Ground plane and grid lines never intercept clicks
- [ ] Works identically to the vanilla Three.js example's selection behavior
