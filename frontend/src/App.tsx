import { useEffect, useRef, useState } from "react";
import { renderImage, saveModel, addModelToScene, createScene, getModel, ApiError } from "./api";
import type { ScenePart, SceneInstance, StoredModel, Vec3 } from "./types";
import { groupPartsByPrefix, getGroupPrefix } from "./utils/groupParts";
import { SceneCanvas } from "./three/SceneCanvas";
import { UploadPanel } from "./components/UploadPanel";
import { StatusBar, type Status } from "./components/StatusBar";
import { ToolBar } from "./components/ToolBar";
import { DebugPanel } from "./components/DebugPanel";
import { ModelLibrary } from "./components/ModelLibrary";
import { PartProperties, GroupProperties } from "./components/PartProperties";
import { useModels } from "./hooks/useModels";
import { usePartEditor } from "./hooks/usePartEditor";

export default function App() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [parts, setParts] = useState<ScenePart[]>([]);
  const [baseParts, setBaseParts] = useState<ScenePart[]>([]);
  const [rawResponse, setRawResponse] = useState("");
  const [instances, setInstances] = useState<SceneInstance[]>([]);
  const [sceneId, setSceneId] = useState<number | null>(null);
  const [currentModelId, setCurrentModelId] = useState<number | null>(null);
  const { models, error: modelsError, refresh: refreshModels } = useModels();
  const addingToScene = useRef(false);

  const {
    selectedLabel,
    setSelectedLabel,
    selectedGroup,
    setSelectedGroup,
    selectionMode,
    setSelectionMode,
    editMode,
    setEditMode,
    clearSelection,
    handleTransformEnd,
    handleGroupTransformEnd,
    handleOpacityChange,
    handlePositionInputChange,
    handleRotationInputChange,
    handleResetPart,
    handleResetGroup,
  } = usePartEditor({ currentModelId, onPartsChange: setParts });

  // Keyboard shortcuts
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "g" || e.key === "G") setEditMode("translate");
      if (e.key === "r" || e.key === "R") setEditMode("rotate");
      if (e.key === "p" || e.key === "P") setSelectionMode((m) => m === "group" ? "part" : "group");
      if (e.key === "Escape") clearSelection();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setEditMode, setSelectionMode, clearSelection]);

  // Unified select handler — all clicks in the canvas come through here
  function handleCanvasSelect(label: string | null, altKey: boolean) {
    if (!label) {
      clearSelection();
      return;
    }
    if (altKey || selectionMode === "part") {
      // Individual part mode
      setSelectedLabel(label);
      setSelectedGroup(null);
    } else {
      // Group mode
      setSelectedGroup(getGroupPrefix(label));
      setSelectedLabel(null);
    }
  }

  async function handleRender(file: File) {
    setStatus("loading");
    clearSelection();
    setCurrentModelId(null);
    try {
      const result = await renderImage(file);
      setParts(result.parts);
      setBaseParts(result.parts);
      setRawResponse(result.raw_response);
      setStatus("success");
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
        setRawResponse(err.raw_response);
      } else {
        setErrorMsg(err instanceof Error ? err.message : "Unknown error");
        setRawResponse("");
      }
      setStatus("error");
    }
  }

  async function handleSave() {
    if (!parts.length) return;
    const name = prompt("Model name:", "My Model") ?? "My Model";
    const saved = await saveModel(name.trim() || "My Model", parts);
    setCurrentModelId(saved.id ?? null);
    refreshModels();
  }

  async function handleAddToScene(model: StoredModel) {
    if (addingToScene.current) return;
    addingToScene.current = true;
    try {
      let sid = sceneId;
      if (!sid) {
        const scene = await createScene("My Scene");
        sid = scene.id;
        setSceneId(sid);
      }
      const inst = await addModelToScene(sid, model.id);
      const fullModel = await getModel(model.id);
      const newInstance: SceneInstance = {
        id: (inst as SceneInstance).id,
        model_id: (inst as SceneInstance).model_id,
        model_name: (inst as SceneInstance).model_name,
        position: (inst as SceneInstance).position,
        rotation: (inst as SceneInstance).rotation,
        scale: (inst as SceneInstance).scale,
        parts: fullModel.parts ?? [],
      };
      setInstances((prev) => [...prev, newInstance]);
    } finally {
      addingToScene.current = false;
    }
  }

  const canSave = parts.length > 0 && status === "success";
  const canvasMode = instances.length > 0 ? "composed" : "single";
  const hasSelection = selectedLabel !== null || selectedGroup !== null;

  // Derive what to show in the properties panel
  const selectedPart = selectedLabel
    ? parts.find((p) => p.label === selectedLabel) ?? null
    : null;
  const grouped = groupPartsByPrefix(parts);
  const selectedGroupParts = selectedGroup ? (grouped[selectedGroup] ?? []) : [];

  // For Reset Group, find base parts in that group
  function getBaseGroupParts(groupName: string): ScenePart[] {
    return baseParts.filter((p) => getGroupPrefix(p.label) === groupName);
  }

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-gray-100">
      <ToolBar
        parts={parts}
        onSave={handleSave}
        canSave={canSave}
        editMode={editMode}
        onEditModeChange={setEditMode}
        selectionMode={selectionMode}
        onSelectionModeChange={setSelectionMode}
        hasSelection={hasSelection}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <div className="w-52 shrink-0 border-r border-gray-700 flex flex-col bg-gray-900">
          <UploadPanel onRender={handleRender} loading={status === "loading"} />
          <StatusBar status={status} message={errorMsg} partCount={parts.length} />
        </div>

        {/* Canvas + properties panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1">
            <SceneCanvas
              parts={canvasMode === "single" ? parts : []}
              instances={canvasMode === "composed" ? instances : []}
              selectedGroup={selectedGroup}
              selectedLabel={selectedLabel}
              editMode={editMode}
              onSelect={handleCanvasSelect}
              onTransformEnd={handleTransformEnd}
              onGroupTransformEnd={(groupName, groupParts, delta: Vec3) =>
                handleGroupTransformEnd(groupName, groupParts, delta)
              }
            />
          </div>

          {/* Group properties panel */}
          {selectedGroup && !selectedLabel && (
            <GroupProperties
              groupName={selectedGroup}
              groupParts={selectedGroupParts}
              modelId={currentModelId}
              onResetGroup={(groupName, _parts) =>
                handleResetGroup(groupName, getBaseGroupParts(groupName))
              }
              onClose={clearSelection}
            />
          )}

          {/* Individual part properties panel */}
          {selectedPart && (
            <PartProperties
              part={selectedPart}
              modelId={currentModelId}
              onOpacityChange={handleOpacityChange}
              onPositionChange={handlePositionInputChange}
              onRotationChange={handleRotationInputChange}
              onResetPart={(label, _part) =>
                handleResetPart(label, baseParts.find((p) => p.label === label) ?? _part)
              }
              onClose={clearSelection}
            />
          )}
        </div>

        {/* Right panel — model library */}
        <div className="w-52 shrink-0 border-l border-gray-700 bg-gray-900">
          <ModelLibrary
            models={models}
            error={modelsError}
            onRefresh={refreshModels}
            onAddToScene={handleAddToScene}
          />
        </div>
      </div>

      <DebugPanel parts={parts} rawResponse={rawResponse} />
    </div>
  );
}
