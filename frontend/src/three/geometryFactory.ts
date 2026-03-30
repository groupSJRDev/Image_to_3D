import * as THREE from "three";
import type { ScenePart } from "../types";

export function buildGeometry(part: ScenePart): THREE.BufferGeometry | null {
  switch (part.geometryType) {
    case "box":
      return new THREE.BoxGeometry(
        part.width ?? 0.1,
        part.height ?? 0.1,
        part.depth ?? 0.1
      );

    case "cylinder":
      return new THREE.CylinderGeometry(
        part.radiusTop ?? 0.05,
        part.radiusBottom ?? 0.05,
        part.height ?? 0.1,
        part.radialSegments ?? 32
      );

    case "sphere":
      return new THREE.SphereGeometry(
        part.radius ?? 0.05,
        part.widthSegments ?? 24,
        part.heightSegments ?? 18
      );

    case "cone":
      return new THREE.ConeGeometry(
        part.radius ?? 0.05,
        part.height ?? 0.1,
        part.radialSegments ?? 16
      );

    case "torus":
      return new THREE.TorusGeometry(
        part.radius ?? 0.1,
        part.tubeRadius ?? 0.02,
        part.radialSegments ?? 16,
        part.tubularSegments ?? 48
      );

    case "lathe": {
      if (!part.profilePoints?.length) return null;
      const points = part.profilePoints.map((p) => new THREE.Vector2(p.x, p.y));
      return new THREE.LatheGeometry(points, part.segments ?? 32);
    }

    case "tube": {
      if (!part.tubePoints?.length) return null;
      const pts = part.tubePoints.map((p) => new THREE.Vector3(p.x, p.y, p.z));
      const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5);
      return new THREE.TubeGeometry(
        curve,
        Math.max(16, pts.length * 16),
        part.tubeRadius ?? 0.02,
        12,
        false
      );
    }

    case "extrude": {
      if (!part.pathCommands?.length) return null;
      const shape = new THREE.Shape();
      for (const cmd of part.pathCommands) {
        if (cmd.op === "M") shape.moveTo(cmd.x, cmd.y);
        else if (cmd.op === "L") shape.lineTo(cmd.x, cmd.y);
        else if (cmd.op === "Q")
          shape.quadraticCurveTo(cmd.cp1x!, cmd.cp1y!, cmd.x, cmd.y);
        else if (cmd.op === "C")
          shape.bezierCurveTo(cmd.cp1x!, cmd.cp1y!, cmd.cp2x!, cmd.cp2y!, cmd.x, cmd.y);
      }
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: part.depth ?? 0.05,
        bevelEnabled: part.bevelEnabled ?? false,
      });
      geo.translate(0, 0, -(part.depth ?? 0.05) / 2);
      return geo;
    }

    default:
      return null;
  }
}
