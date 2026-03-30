import { useEffect, useRef, useState } from "react";
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
  onSelect: (label: string, altKey: boolean) => void;
  onTransformEnd: (label: string, pos: Vec3, rot: Vec3) => void;
  onGroupTransformEnd: (groupName: string, parts: ScenePartType[], delta: Vec3) => void;
}

export function PartGroup({
  groupName,
  parts,
  isGroupSelected,
  selectedLabel,
  editMode,
  onSelect,
  onTransformEnd,
  onGroupTransformEnd,
}: Props) {
  const [groupObj, setGroupObj] = useState<THREE.Group | null>(null);
  const tcRef = useRef<any>(null);

  // Detect drag end on the group gizmo, compute delta, notify parent
  useEffect(() => {
    const tc = tcRef.current;
    if (!tc || !isGroupSelected || !groupObj) return;

    const handleDraggingChanged = (e: { value: boolean }) => {
      if (!e.value && groupObj) {
        const delta: Vec3 = {
          x: groupObj.position.x,
          y: groupObj.position.y,
          z: groupObj.position.z,
        };
        // Reset group back to origin — delta is baked into individual part positions
        groupObj.position.set(0, 0, 0);
        onGroupTransformEnd(groupName, parts, delta);
      }
    };

    tc.addEventListener("dragging-changed", handleDraggingChanged);
    return () => tc.removeEventListener("dragging-changed", handleDraggingChanged);
  }, [tcRef.current, isGroupSelected, groupObj, groupName, parts, onGroupTransformEnd]);

  return (
    <>
      <group ref={setGroupObj}>
        {parts.map((p, i) => (
          <ScenePart
            key={`${p.label}-${i}`}
            part={p}
            // Highlight all parts when group is selected; highlight only the alt-clicked part
            isSelected={isGroupSelected || p.label === selectedLabel}
            // Only show individual gizmo when this specific part is alt-clicked
            showGizmo={p.label === selectedLabel}
            editMode={editMode}
            onSelect={onSelect}
            onTransformEnd={onTransformEnd}
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
