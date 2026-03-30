import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { ScenePart as ScenePartType } from "../types";
import { buildGeometry } from "./geometryFactory";
import { resolveColor } from "./resolveColor";

interface Props {
  part: ScenePartType;
}

export function ScenePart({ part }: Props) {
  const geometry = useMemo(() => {
    const geo = buildGeometry(part);
    if (geo) geo.computeVertexNormals();
    return geo;
  }, [part]);

  const wireframeGeo = useMemo(
    () => (geometry ? new THREE.WireframeGeometry(geometry) : null),
    [geometry]
  );

  useEffect(() => {
    return () => {
      geometry?.dispose();
      wireframeGeo?.dispose();
    };
  }, [geometry, wireframeGeo]);

  if (!geometry) return null;

  const color = resolveColor(part.label, part.color);
  const pos = part.position;
  const rot = part.rotation;
  const sc = part.scale ?? { x: 1, y: 1, z: 1 };

  return (
    <mesh
      position={[pos.x, pos.y, pos.z]}
      rotation={[rot.x, rot.y, rot.z]}
      scale={[sc.x, sc.y, sc.z]}
      geometry={geometry}
    >
      <meshStandardMaterial color={color} roughness={0.65} metalness={0.05} />
      {wireframeGeo && (
        <lineSegments geometry={wireframeGeo}>
          <lineBasicMaterial color="#444444" transparent opacity={0.13} />
        </lineSegments>
      )}
    </mesh>
  );
}
