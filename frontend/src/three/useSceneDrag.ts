import { useEffect, useRef, useCallback } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { EditMode, ScenePart as ScenePartType, Vec3 } from "../types";
import { getGroupPrefix } from "../utils/groupParts";

interface UseSceneDragOptions {
  grouped: Record<string, ScenePartType[]>;
  editMode: EditMode;
  onSelect: (label: string | null, altKey: boolean) => void;
  onGroupDragEnd: (groupName: string, parts: ScenePartType[], delta: Vec3) => void;
  onPartDragEnd: (label: string, pos: Vec3, rot: Vec3) => void;
}

export function useSceneDrag({
  grouped,
  editMode,
  onSelect,
  onGroupDragEnd,
  onPartDragEnd,
}: UseSceneDragOptions) {
  const { camera, gl, controls } = useThree();

  const meshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const groupsRef = useRef<Map<string, THREE.Group>>(new Map());

  // Keep mutable values in refs so event handlers always read the latest without re-binding
  const groupedRef = useRef(grouped);
  const editModeRef = useRef(editMode);
  const onSelectRef = useRef(onSelect);
  const onGroupDragEndRef = useRef(onGroupDragEnd);
  const onPartDragEndRef = useRef(onPartDragEnd);

  groupedRef.current = grouped;
  editModeRef.current = editMode;
  onSelectRef.current = onSelect;
  onGroupDragEndRef.current = onGroupDragEnd;
  onPartDragEndRef.current = onPartDragEnd;

  // All drag state in refs — no React re-renders during drag
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());
  const dragPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const hitPoint = useRef(new THREE.Vector3());
  const dragOffset = useRef(new THREE.Vector3());
  const activeGroupName = useRef<string | null>(null);
  const activeLabel = useRef<string | null>(null);
  const activeObject = useRef<THREE.Group | THREE.Mesh | null>(null);
  const dragMode = useRef<"translate" | "rotate" | null>(null);
  const rotStartX = useRef(0);
  const rotStartY = useRef(0);
  const isDragging = useRef(false);
  const startPosition = useRef(new THREE.Vector3());

  const registerMesh = useCallback((label: string, mesh: THREE.Mesh) => {
    meshesRef.current.set(label, mesh);
  }, []);

  const unregisterMesh = useCallback((label: string) => {
    meshesRef.current.delete(label);
  }, []);

  const registerGroup = useCallback((groupName: string, group: THREE.Group) => {
    groupsRef.current.set(groupName, group);
  }, []);

  const unregisterGroup = useCallback((groupName: string) => {
    groupsRef.current.delete(groupName);
  }, []);

  useEffect(() => {
    const canvas = gl.domElement;

    function setRay(e: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.current.setFromCamera(mouse.current, camera);
    }

    function cleanup() {
      if (controls) (controls as any).enabled = true;
      activeObject.current = null;
      activeGroupName.current = null;
      activeLabel.current = null;
      isDragging.current = false;
      dragMode.current = null;
    }

    function handlePointerDown(e: PointerEvent) {
      if (e.button !== 0) return;

      setRay(e);

      // Step 2: intersect only registered part meshes (non-recursive)
      const meshArray = Array.from(meshesRef.current.values());
      const hits = raycaster.current.intersectObjects(meshArray, false);

      // Step 3: no hit → deselect
      if (hits.length === 0) {
        onSelectRef.current(null, false);
        return;
      }

      // Step 4: find label for hit mesh
      const hitMesh = hits[0].object as THREE.Mesh;
      let label: string | null = null;
      for (const [l, m] of meshesRef.current.entries()) {
        if (m === hitMesh) { label = l; break; }
      }
      if (!label) return;

      // Step 5: determine group vs part mode
      const isPartMode = e.altKey;

      // Step 6: notify selection
      onSelectRef.current(label, e.altKey);

      // Step 7: disable orbit immediately
      if (controls) (controls as any).enabled = false;

      // Steps 8–9: set active object
      if (!isPartMode) {
        // Group mode
        const groupName = getGroupPrefix(label);
        const group = groupsRef.current.get(groupName);
        if (!group) { cleanup(); return; }
        activeObject.current = group;
        activeGroupName.current = groupName;
      } else {
        // Part mode
        activeObject.current = hitMesh;
        activeLabel.current = label;
      }

      // Step 10: record start position
      startPosition.current.copy(activeObject.current.position);

      // Steps 11–12: set up drag mode
      if (editModeRef.current === "translate") {
        // Offset drag plane to the object's Y level so elevated objects don't jump to y=0
        dragPlane.current.constant = -activeObject.current.position.y;
        raycaster.current.ray.intersectPlane(dragPlane.current, hitPoint.current);
        dragOffset.current.copy(activeObject.current.position).sub(hitPoint.current);
        dragMode.current = "translate";
      } else {
        // Rotate mode
        rotStartX.current = e.clientX;
        rotStartY.current = activeObject.current.rotation.y;
        dragMode.current = "rotate";
      }

      // Step 13
      isDragging.current = true;
    }

    function handlePointerMove(e: PointerEvent) {
      if (!isDragging.current || !activeObject.current) return;

      setRay(e);

      if (dragMode.current === "translate") {
        if (raycaster.current.ray.intersectPlane(dragPlane.current, hitPoint.current)) {
          activeObject.current.position.x = hitPoint.current.x + dragOffset.current.x;
          activeObject.current.position.z = hitPoint.current.z + dragOffset.current.z;
          // Y is locked — objects slide along the floor plane
        }
      } else if (dragMode.current === "rotate") {
        activeObject.current.rotation.y =
          rotStartY.current + (e.clientX - rotStartX.current) * 0.01;
      }
    }

    function handlePointerUp() {
      if (!isDragging.current || !activeObject.current) {
        cleanup();
        return;
      }

      if (controls) (controls as any).enabled = true;

      if (dragMode.current === "translate") {
        const delta: Vec3 = {
          x: activeObject.current.position.x - startPosition.current.x,
          y: 0, // Y is locked
          z: activeObject.current.position.z - startPosition.current.z,
        };
        const magnitude = Math.abs(delta.x) + Math.abs(delta.z);

        if (magnitude > 0.0001) {
          if (activeGroupName.current) {
            const groupParts = groupedRef.current[activeGroupName.current] ?? [];
            onGroupDragEndRef.current(activeGroupName.current, groupParts, delta);
            // Reset group to start position (0,0,0) so baked part positions take effect on re-render
            activeObject.current.position.copy(startPosition.current);
          } else if (activeLabel.current) {
            const obj = activeObject.current as THREE.Mesh;
            onPartDragEndRef.current(
              activeLabel.current,
              { x: obj.position.x, y: obj.position.y, z: obj.position.z },
              { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
            );
          }
        } else {
          // Zero movement — reset group back in case it drifted slightly
          if (activeGroupName.current) {
            activeObject.current.position.copy(startPosition.current);
          }
        }
      } else if (dragMode.current === "rotate") {
        if (activeLabel.current) {
          // Persist individual part rotation
          const obj = activeObject.current as THREE.Mesh;
          onPartDragEndRef.current(
            activeLabel.current,
            { x: obj.position.x, y: obj.position.y, z: obj.position.z },
            { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
          );
        }
        // Group rotation: visual only — no persist API for group rotation
      }

      // Clear all active refs
      activeObject.current = null;
      activeGroupName.current = null;
      activeLabel.current = null;
      isDragging.current = false;
      dragMode.current = null;
    }

    function handlePointerLeave() {
      if (isDragging.current && activeObject.current) {
        // Reset object to where it started — drag is abandoned
        activeObject.current.position.copy(startPosition.current);
        if (dragMode.current === "rotate") {
          activeObject.current.rotation.y = rotStartY.current;
        }
      }
      cleanup();
    }

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [camera, gl, controls]);

  return { registerMesh, unregisterMesh, registerGroup, unregisterGroup };
}
