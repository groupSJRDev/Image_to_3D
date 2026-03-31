import { useEffect, useMemo } from "react";
import * as THREE from "three";

export function GroundGrid() {
  const group = useMemo(() => {
    const g = new THREE.Group();
    const SIZE = 4, DIVS = 40, CELL = SIZE / DIVS;
    const minor = new THREE.LineBasicMaterial({ color: 0xcccccc });
    const major = new THREE.LineBasicMaterial({ color: 0x999999 });
    const H = SIZE / 2;

    for (let i = 0; i <= DIVS; i++) {
      const o = -H + i * CELL;
      const m = i % 5 === 0 ? major : minor;
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-H, 0, o), new THREE.Vector3(H, 0, o),
      ]), m));
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(o, 0, -H), new THREE.Vector3(o, 0, H),
      ]), m));
    }

    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-H, 0.001, 0), new THREE.Vector3(H, 0.001, 0),
    ]), new THREE.LineBasicMaterial({ color: 0xcc4444 })));

    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.001, -H), new THREE.Vector3(0, 0.001, H),
    ]), new THREE.LineBasicMaterial({ color: 0x4444cc })));

    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(SIZE, SIZE),
      new THREE.MeshBasicMaterial({ color: 0xdddddd, side: THREE.DoubleSide })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.002;
    plane.raycast = () => {};  // exclude from raycaster — prevents blocking clicks on scene parts
    g.add(plane);
    return g;
  }, []);

  useEffect(() => {
    return () => {
      group.traverse((obj) => {
        if (obj instanceof THREE.Line || obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            (obj.material as THREE.Material).dispose();
          }
        }
      });
    };
  }, [group]);

  return <primitive object={group} />;
}
