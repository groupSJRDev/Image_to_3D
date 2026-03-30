import { useState } from "react";
import { renderImage, saveModel, addModelToScene, createScene } from "./api";
import type { ScenePart, SceneInstance, StoredModel } from "./types";
import { SceneCanvas } from "./three/SceneCanvas";
import { UploadPanel } from "./components/UploadPanel";
import { StatusBar, type Status } from "./components/StatusBar";
import { ToolBar } from "./components/ToolBar";
import { DebugPanel } from "./components/DebugPanel";
import { ModelLibrary } from "./components/ModelLibrary";
import { useModels } from "./hooks/useModels";

export default function App() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [parts, setParts] = useState<ScenePart[]>([]);
  const [rawResponse, setRawResponse] = useState("");
  const [instances, setInstances] = useState<SceneInstance[]>([]);
  const [sceneId, setSceneId] = useState<number | null>(null);
  const [canSave, setCanSave] = useState(false);
  const { models, refresh: refreshModels } = useModels();

  async function handleRender(file: File) {
    setStatus("loading");
    setCanSave(false);
    try {
      const result = await renderImage(file);
      setParts(result.parts);
      setRawResponse(result.raw_response);
      setStatus("success");
      setCanSave(true);
    } catch (err: unknown) {
      const e = err as { message?: string; raw_response?: string };
      setErrorMsg(e.message ?? "Unknown error");
      setRawResponse(e.raw_response ?? "");
      setStatus("error");
    }
  }

  async function handleSave() {
    if (!parts.length) return;
    const name = prompt("Model name:", "My Model") ?? "My Model";
    await saveModel(name.trim() || "My Model", parts);
    setCanSave(false);
    refreshModels();
  }

  async function handleAddToScene(model: StoredModel) {
    let sid = sceneId;
    if (!sid) {
      const scene = await createScene("My Scene");
      sid = scene.id;
      setSceneId(sid);
    }
    const inst = await addModelToScene(sid, model.id);
    // Fetch full parts from model (already in library list if loaded)
    const modelWithParts = models.find((m) => m.id === model.id);
    const newInstance: SceneInstance = {
      id: (inst as SceneInstance).id,
      model_id: (inst as SceneInstance).model_id,
      model_name: (inst as SceneInstance).model_name,
      position: (inst as SceneInstance).position,
      rotation: (inst as SceneInstance).rotation,
      scale: (inst as SceneInstance).scale,
      parts: modelWithParts?.parts ?? [],
    };
    setInstances((prev) => [...prev, newInstance]);
  }

  const canvasMode = instances.length > 0 ? "composed" : "single";

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100">
      <ToolBar parts={parts} onSave={handleSave} canSave={canSave} />

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <div className="w-52 shrink-0 border-r border-gray-700 flex flex-col bg-gray-900">
          <UploadPanel onRender={handleRender} loading={status === "loading"} />
          <StatusBar status={status} message={errorMsg} partCount={parts.length} />
        </div>

        {/* Canvas */}
        <div className="flex-1">
          <SceneCanvas
            parts={canvasMode === "single" ? parts : []}
            instances={canvasMode === "composed" ? instances : []}
          />
        </div>

        {/* Right panel — model library */}
        <div className="w-52 shrink-0 border-l border-gray-700 bg-gray-900">
          <ModelLibrary
            models={models}
            onRefresh={refreshModels}
            onAddToScene={handleAddToScene}
          />
        </div>
      </div>

      <DebugPanel parts={parts} rawResponse={rawResponse} />
    </div>
  );
}
