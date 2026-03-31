import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import type { ScenePart as ScenePartType } from "../types";
import { buildGeometry } from "./geometryFactory";
import { resolveColor } from "./resolveColor";

interface Props {
  part: ScenePartType;
  isSelected?: boolean;
  registerMesh?: (label: string, mesh: THREE.Mesh) => void;
  unregisterMesh?: (label: string) => void;
}

export function ScenePart({
  part,
  isSelected = false,
  registerMesh,
  unregisterMesh,
}: Props) {
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

  const [meshObj, setMeshObj] = useState<THREE.Mesh | null>(null);

  useEffect(() => {
    if (meshObj && registerMesh) {
      registerMesh(part.label, meshObj);
    }
    return () => {
      if (unregisterMesh) unregisterMesh(part.label);
    };
  }, [meshObj, part.label, registerMesh, unregisterMesh]);

  if (!geometry) return null;

  const color = resolveColor(part.label, part.color);
  const pos = part.position;
  const rot = part.rotation;
  const sc = part.scale ?? { x: 1, y: 1, z: 1 };
  const opacity = part.opacity ?? 1.0;
  const transparent = opacity < 1;

  return (
    <mesh
      ref={setMeshObj}
      position={[pos.x, pos.y, pos.z]}
      rotation={[rot.x, rot.y, rot.z]}
      scale={[sc.x, sc.y, sc.z]}
      geometry={geometry}
    >
      <meshStandardMaterial
        color={color}
        roughness={0.65}
        metalness={0.05}
        transparent={transparent}
        opacity={opacity}
        depthWrite={!transparent}
        emissive={isSelected ? "#ff8800" : "#000000"}
        emissiveIntensity={isSelected ? 0.3 : 0}
      />
      {wireframeGeo && (
        <lineSegments geometry={wireframeGeo}>
          <lineBasicMaterial
            color="#444444"
            transparent
            opacity={Math.min(0.13, opacity * 0.13)}
          />
        </lineSegments>
      )}
    </mesh>
  );
}
