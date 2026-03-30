import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { SceneInstance, ScenePart as ScenePartType } from "../types";
import { CanvasErrorBoundary } from "./CanvasErrorBoundary";
import { ScenePart } from "./ScenePart";
import { ModelGroup } from "./ModelGroup";
import { Lighting } from "./Lighting";
import { GroundGrid } from "./GroundGrid";

interface Props {
  parts?: ScenePartType[];
  instances?: SceneInstance[];
}

export function SceneCanvas({ parts = [], instances = [] }: Props) {
  const isEmpty = parts.length === 0 && instances.length === 0;

  return (
    <div className="w-full h-full relative">
      {isEmpty && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm pointer-events-none">
          Upload an image to render a 3D model
        </div>
      )}
      <Canvas
        camera={{ position: [0.8, 1.3, 3.2], fov: 45, near: 0.01, far: 100 }}
        gl={{ antialias: true }}
        style={{ background: "#e8e8e8" }}
      >
        <CanvasErrorBoundary>
          <Lighting />
          <GroundGrid />
          <OrbitControls enableDamping makeDefault target={[0, 0.8, 0]} />
          {parts.map((p, i) => (
            <ScenePart key={`${p.label}-${i}`} part={p} />
          ))}
          {instances.map((inst) => (
            <ModelGroup key={inst.id} instance={inst} />
          ))}
        </CanvasErrorBoundary>
      </Canvas>
    </div>
  );
}
