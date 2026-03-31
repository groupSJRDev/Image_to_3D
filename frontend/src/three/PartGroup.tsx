import { useEffect, useState } from "react";
import * as THREE from "three";
import type { ScenePart as ScenePartType } from "../types";
import { ScenePart } from "./ScenePart";

interface Props {
  groupName: string;
  parts: ScenePartType[];
  isGroupSelected: boolean;
  selectedLabel: string | null;
  registerMesh: (label: string, mesh: THREE.Mesh) => void;
  unregisterMesh: (label: string) => void;
  registerGroup: (groupName: string, group: THREE.Group) => void;
  unregisterGroup: (groupName: string) => void;
}

export function PartGroup({
  groupName,
  parts,
  isGroupSelected,
  selectedLabel,
  registerMesh,
  unregisterMesh,
  registerGroup,
  unregisterGroup,
}: Props) {
  const [groupObj, setGroupObj] = useState<THREE.Group | null>(null);

  useEffect(() => {
    if (groupObj) {
      registerGroup(groupName, groupObj);
    }
    return () => {
      unregisterGroup(groupName);
    };
  }, [groupObj, groupName, registerGroup, unregisterGroup]);

  return (
    <group ref={setGroupObj}>
      {parts.map((p, i) => (
        <ScenePart
          key={`${p.label}-${i}`}
          part={p}
          isSelected={isGroupSelected || p.label === selectedLabel}
          registerMesh={registerMesh}
          unregisterMesh={unregisterMesh}
        />
      ))}
    </group>
  );
}
