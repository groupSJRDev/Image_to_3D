import type { EditMode, ScenePart, SelectionMode } from "../types";

interface Props {
  parts: ScenePart[];
  onSave: () => void;
  canSave: boolean;
  editMode: EditMode;
  onEditModeChange: (mode: EditMode) => void;
  selectionMode: SelectionMode;
  onSelectionModeChange: (mode: SelectionMode) => void;
  hasSelection: boolean;
}

function downloadJSON(parts: ScenePart[]) {
  const blob = new Blob([JSON.stringify({ parts }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "scene.json";
  a.click();
}

function downloadHTML(parts: ScenePart[]) {
  const partsJson = JSON.stringify(parts);
  const html = `<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>3D Scene</title>
  <style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#e8e8e8}canvas{display:block}</style>
  <script type="importmap">{"imports":{"three":"https://unpkg.com/three@0.160.0/build/three.module.js","three/addons/":"https://unpkg.com/three@0.160.0/examples/jsm/"}}</script>
</head><body>
<script type="module">
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
const parts = ${partsJson};
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xe8e8e8);
const camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 0.01, 100);
camera.position.set(0.8, 1.3, 3.2);
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth, innerHeight); document.body.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0,0.8,0); controls.enableDamping = true;
scene.add(new THREE.AmbientLight(0xffffff,1.5));
const kl=new THREE.DirectionalLight(0xffffff,2.5); kl.position.set(2,4,4); scene.add(kl);
for(const p of parts){
  let geo;
  if(p.geometryType==="box") geo=new THREE.BoxGeometry(p.width,p.height,p.depth);
  else if(p.geometryType==="cylinder") geo=new THREE.CylinderGeometry(p.radiusTop,p.radiusBottom,p.height,p.radialSegments??32);
  else if(p.geometryType==="sphere") geo=new THREE.SphereGeometry(p.radius,p.widthSegments??24,p.heightSegments??18);
  else if(p.geometryType==="cone") geo=new THREE.ConeGeometry(p.radius,p.height,p.radialSegments??16);
  if(!geo) continue;
  geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:p.color,roughness:0.65,metalness:0.05}));
  mesh.position.set(p.position.x,p.position.y,p.position.z);
  mesh.rotation.set(p.rotation.x,p.rotation.y,p.rotation.z);
  if(p.scale) mesh.scale.set(p.scale.x,p.scale.y,p.scale.z);
  scene.add(mesh);
}
(function a(){requestAnimationFrame(a);controls.update();renderer.render(scene,camera)})();
addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
</script></body></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "scene.html";
  a.click();
}

export function ToolBar({
  parts,
  onSave,
  canSave,
  editMode,
  onEditModeChange,
  selectionMode,
  onSelectionModeChange,
  hasSelection,
}: Props) {
  const hasScene = parts.length > 0;
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700 bg-gray-900 text-sm">
      <span className="font-semibold text-gray-200 mr-auto">Image → 3D Renderer</span>

      {/* Selection mode toggle — always visible when parts are loaded */}
      {hasScene && (
        <div className="flex items-center gap-1 border border-gray-700 rounded overflow-hidden">
          <button
            onClick={() => onSelectionModeChange("group")}
            title="Click selects whole group (default)"
            className={`px-2 py-1 text-xs transition-colors ${
              selectionMode === "group"
                ? "bg-indigo-700 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            Group
          </button>
          <button
            onClick={() => onSelectionModeChange("part")}
            title="Click selects individual part (P)"
            className={`px-2 py-1 text-xs transition-colors ${
              selectionMode === "part"
                ? "bg-indigo-700 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            Part
          </button>
        </div>
      )}

      {/* Edit mode toggle — only visible when something is selected */}
      {hasSelection && (
        <div className="flex items-center gap-1 border border-gray-700 rounded overflow-hidden">
          <button
            onClick={() => onEditModeChange("translate")}
            title="Move (G)"
            className={`px-2 py-1 text-xs transition-colors ${
              editMode === "translate"
                ? "bg-blue-700 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            Move
          </button>
          <button
            onClick={() => onEditModeChange("rotate")}
            title="Rotate (R)"
            className={`px-2 py-1 text-xs transition-colors ${
              editMode === "rotate"
                ? "bg-blue-700 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            Rotate
          </button>
        </div>
      )}

      <button
        disabled={!canSave}
        onClick={onSave}
        className="px-3 py-1 rounded bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-xs transition-colors"
      >
        Save to Library
      </button>
      <button
        disabled={!hasScene}
        onClick={() => downloadJSON(parts)}
        className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-xs transition-colors"
      >
        Download JSON
      </button>
      <button
        disabled={!hasScene}
        onClick={() => downloadHTML(parts)}
        className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-xs transition-colors"
      >
        Download HTML
      </button>
    </div>
  );
}
