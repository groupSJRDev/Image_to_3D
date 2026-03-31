import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { TransformControls } from "@react-three/drei";
import type { EditMode, ScenePart as ScenePartType, Vec3 } from "../types";
import { ScenePart } from "./ScenePart";

interface Props {
  groupName: string;
  parts: ScenePartType[];
  isGroupSelected: boolean;
  selectedLabel: string | null;   // individual part selected within this group
  editMode: EditMode;
  onTransformEnd: (label: string, pos: Vec3, rot: Vec3) => void;
  onGroupTransformEnd: (groupName: string, parts: ScenePartType[], delta: Vec3) => void;
  registerMesh: (label: string, mesh: THREE.Mesh) => void;
  unregisterMesh: (label: string) => void;
}

export function PartGroup({
  groupName,
  parts,
  isGroupSelected,
  selectedLabel,
  editMode,
  onTransformEnd,
  onGroupTransformEnd,
  registerMesh,
  unregisterMesh,
}: Props) {
  const [groupObj, setGroupObj] = useState<THREE.Group | null>(null);
  const tcRef = useRef<any>(null);

  // Compute the center of the group (average of all part positions)
  // and create local-space parts offset from that center.
  const { center, localParts } = useMemo(() => {
    if (parts.length === 0) return { center: { x: 0, y: 0, z: 0 }, localParts: [] };

    // Find bounding box center of all part positions
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const p of parts) {
      minX = Math.min(minX, p.position.x);
      minY = Math.min(minY, p.position.y);
      minZ = Math.min(minZ, p.position.z);
      maxX = Math.max(maxX, p.position.x);
      maxY = Math.max(maxY, p.position.y);
      maxZ = Math.max(maxZ, p.position.z);
    }
    const cx = (minX + maxX) / 2;
    const cy = minY;  // base of the group, not center — gizmo sits at the bottom
    const cz = (minZ + maxZ) / 2;

    // Offset each part's position relative to the group center
    const local = parts.map((p) => ({
      ...p,
      position: {
        x: p.position.x - cx,
        y: p.position.y - cy,
        z: p.position.z - cz,
      },
    }));

    return { center: { x: cx, y: cy, z: cz }, localParts: local };
  }, [parts]);

  // Detect drag end on the group gizmo, compute delta, notify parent
  useEffect(() => {
    const tc = tcRef.current;
    if (!tc || !isGroupSelected || !groupObj) return;

    const handleDraggingChanged = (e: { value: boolean }) => {
      if (!e.value && groupObj) {
        // Delta is how far the group moved from its computed center
        const delta: Vec3 = {
          x: groupObj.position.x - center.x,
          y: groupObj.position.y - center.y,
          z: groupObj.position.z - center.z,
        };
        // Snap group back to center — delta will be baked into individual part positions
        groupObj.position.set(center.x, center.y, center.z);
        onGroupTransformEnd(groupName, parts, delta);
      }
    };

    tc.addEventListener("dragging-changed", handleDraggingChanged);
    return () => tc.removeEventListener("dragging-changed", handleDraggingChanged);
  }, [tcRef.current, isGroupSelected, groupObj, groupName, parts, center, onGroupTransformEnd]);

  return (
    <>
      <group ref={setGroupObj} position={[center.x, center.y, center.z]}>
        {localParts.map((p, i) => (
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
        ))}
      </group>

      {isGroupSelected && groupObj && (
        <TransformControls
          ref={tcRef}
          object={groupObj}
          mode={editMode}
        />
      )}
    </>
  );
}
