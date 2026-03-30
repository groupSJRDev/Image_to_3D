import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { EditMode, SceneInstance, ScenePart as ScenePartType, Vec3 } from "../types";
import { groupPartsByPrefix } from "../utils/groupParts";
import { CanvasErrorBoundary } from "./CanvasErrorBoundary";
import { PartGroup } from "./PartGroup";
import { ModelGroup } from "./ModelGroup";
import { Lighting } from "./Lighting";
import { GroundGrid } from "./GroundGrid";

interface Props {
  parts?: ScenePartType[];
  instances?: SceneInstance[];
  selectedGroup?: string | null;
  selectedLabel?: string | null;
  editMode?: EditMode;
  /** Unified select: label=null means deselect, altKey=true means individual part mode */
  onSelect?: (label: string | null, altKey: boolean) => void;
  onTransformEnd?: (label: string, pos: Vec3, rot: Vec3) => void;
  onGroupTransformEnd?: (groupName: string, parts: ScenePartType[], delta: Vec3) => void;
}

export function SceneCanvas({
  parts = [],
  instances = [],
  selectedGroup = null,
  selectedLabel = null,
  editMode = "translate",
  onSelect,
  onTransformEnd,
  onGroupTransformEnd,
}: Props) {
  const isEmpty = parts.length === 0 && instances.length === 0;
  const grouped = groupPartsByPrefix(parts);

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
        onPointerMissed={() => onSelect?.(null, false)}
      >
        <CanvasErrorBoundary>
          <Lighting />
          <GroundGrid />
          <OrbitControls enableDamping makeDefault target={[0, 0.8, 0]} />
          {Object.entries(grouped).map(([groupName, groupParts]) => (
            <PartGroup
              key={groupName}
              groupName={groupName}
              parts={groupParts}
              isGroupSelected={groupName === selectedGroup}
              selectedLabel={selectedLabel}
              editMode={editMode}
              onSelect={onSelect ?? (() => {})}
              onTransformEnd={onTransformEnd ?? (() => {})}
              onGroupTransformEnd={onGroupTransformEnd ?? (() => {})}
            />
          ))}
          {instances.map((inst) => (
            <ModelGroup key={inst.id} instance={inst} />
          ))}
        </CanvasErrorBoundary>
      </Canvas>
    </div>
  );
}
