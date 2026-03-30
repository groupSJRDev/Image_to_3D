import type { SceneInstance } from "../types";
import { ScenePart } from "./ScenePart";

interface Props {
  instance: SceneInstance;
}

export function ModelGroup({ instance }: Props) {
  const { position: pos, rotation: rot, scale: sc, parts } = instance;
  return (
    <group
      position={[pos.x, pos.y, pos.z]}
      rotation={[rot.x, rot.y, rot.z]}
      scale={[sc.x, sc.y, sc.z]}
    >
      {parts.map((p, i) => (
        <ScenePart key={`${p.label}-${i}`} part={p} />
      ))}
    </group>
  );
}
