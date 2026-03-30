// ── Geometry schema (mirrors decode_prompt.txt contract) ────────────────────

export type GeometryType =
  | "box" | "cylinder" | "sphere" | "cone"
  | "torus" | "lathe" | "tube" | "extrude";

export interface Vec3 { x: number; y: number; z: number }
export interface Vec2 { x: number; y: number }

export interface PathCommand {
  op: "M" | "L" | "Q" | "C";
  x: number;
  y: number;
  cp1x?: number;
  cp1y?: number;
  cp2x?: number;
  cp2y?: number;
}

export interface ScenePart {
  label: string;
  geometryType: GeometryType;
  color: string;
  position: Vec3;
  rotation: Vec3;
  opacity?: number;   // 0.0–1.0, default 1.0; merged from PartOverride on backend
  scale?: Vec3;
  // box
  width?: number;
  height?: number;
  depth?: number;
  // cylinder / cone
  radiusTop?: number;
  radiusBottom?: number;
  radius?: number;
  radialSegments?: number;
  // sphere
  widthSegments?: number;
  heightSegments?: number;
  // torus
  tubeRadius?: number;
  tubularSegments?: number;
  // lathe
  profilePoints?: Vec2[];
  segments?: number;
  // tube
  tubePoints?: Vec3[];
  // extrude
  pathCommands?: PathCommand[];
  bevelEnabled?: boolean;
}

// ── API response shapes ──────────────────────────────────────────────────────

export interface RenderResponse {
  parts: ScenePart[];
  raw_response: string;
}

export interface RenderError {
  error: string;
  raw_response: string;
}

// ── Database record shapes ───────────────────────────────────────────────────

export interface StoredModel {
  id: number;
  name: string;
  part_count: number;
  created_at: string;
  parts?: ScenePart[];
}

export interface Transform {
  pos_x?: number;
  pos_y?: number;
  pos_z?: number;
  rot_x?: number;
  rot_y?: number;
  rot_z?: number;
  scale_x?: number;
  scale_y?: number;
  scale_z?: number;
}

export interface SceneInstance {
  id: number;
  model_id: number;
  model_name: string;
  parts: ScenePart[];
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
}

export interface ComposedScene {
  id: number;
  name: string;
  instances: SceneInstance[];
}

export interface SceneSummary {
  id: number;
  name: string;
  created_at: string;
}

export interface PartOverrideRequest {
  pos_x?: number | null;
  pos_y?: number | null;
  pos_z?: number | null;
  rot_x?: number | null;
  rot_y?: number | null;
  rot_z?: number | null;
  opacity?: number | null;
}

export type EditMode = "translate" | "rotate";
