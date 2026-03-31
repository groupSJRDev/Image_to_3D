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
  const { camera, gl, scene, controls } = useThree();
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
    // Track whether we disabled orbit controls so we can re-enable on pointer up
    let disabledOrbit = false;

    function isTransformControlsHit(): boolean {
      // Check if the ray hits any visible TransformControls gizmo handle.
      // IMPORTANT: skip invisible objects — TC adds large invisible picker planes and
      // a camera-facing drag plane to the scene. These are `visible:false` but are
      // still tested by Three.js's raycaster (it does not respect visibility).
      // Without this filter, any click anywhere hits the drag plane and returns true,
      // permanently blocking re-selection after the first object is picked.
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

    function handlePointerDown(e: PointerEvent) {
      // Ignore right-click (context menu) and middle-click
      if (e.button !== 0) return;

      const rect = canvas.getBoundingClientRect();
      mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.current.setFromCamera(mouse.current, camera);

      // Check TC gizmo FIRST — axis cones/arrows overlap part meshes visually,
      // so a part mesh check first would intercept gizmo clicks and prevent dragging.
      if (isTransformControlsHit()) {
        if (controls) {
          (controls as any).enabled = false;
          disabledOrbit = true;
        }
        return;
      }

      // Check registered part meshes
      const meshArray = Array.from(meshesRef.current.values());
      const hits = raycaster.current.intersectObjects(meshArray, false);

      if (hits.length > 0) {
        const hitMesh = hits[0].object as THREE.Mesh;
        for (const [label, mesh] of meshesRef.current.entries()) {
          if (mesh === hitMesh) {
            onHit(label, e.altKey);
            return;
          }
        }
      }

      // Truly empty space — deselect
      onMiss();
    }

    function handlePointerUp() {
      // Re-enable OrbitControls after gizmo drag ends
      if (disabledOrbit) {
        if (controls) (controls as any).enabled = true;
        disabledOrbit = false;
      }
    }

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointerup", handlePointerUp);
    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointerup", handlePointerUp);
    };
  }, [camera, gl, scene, controls, enabled, onHit, onMiss]);

  return { registerMesh, unregisterMesh };
}
