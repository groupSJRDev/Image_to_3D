import { useCallback, useRef, useState } from "react";
import { deleteAllOverrides, deletePartOverride, upsertPartOverride } from "../api";
import type { EditMode, PartOverrideRequest, ScenePart, Vec3 } from "../types";

interface UsePartEditorOptions {
  currentModelId: number | null;
  onPartsChange: (updater: (prev: ScenePart[]) => ScenePart[]) => void;
}

export function usePartEditor({ currentModelId, onPartsChange }: UsePartEditorOptions) {
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<EditMode>("translate");
  const opacityDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveOverride = useCallback(
    async (label: string, body: PartOverrideRequest) => {
      if (!currentModelId) return;
      try {
        const merged = await upsertPartOverride(currentModelId, label, body);
        onPartsChange((prev) =>
          prev.map((p) => (p.label === label ? { ...p, ...merged } : p))
        );
      } catch {
        // errors surfaced by API layer; no crash here
      }
    },
    [currentModelId, onPartsChange],
  );

  const handleTransformEnd = useCallback(
    (label: string, pos: Vec3, rot: Vec3) => {
      // Optimistically update local state so React re-render doesn't snap back
      onPartsChange((prev) =>
        prev.map((p) => (p.label === label ? { ...p, position: pos, rotation: rot } : p))
      );
      saveOverride(label, {
        pos_x: pos.x, pos_y: pos.y, pos_z: pos.z,
        rot_x: rot.x, rot_y: rot.y, rot_z: rot.z,
      });
    },
    [saveOverride, onPartsChange],
  );

  const handleOpacityChange = useCallback(
    (label: string, opacity: number) => {
      // Optimistic update
      onPartsChange((prev) =>
        prev.map((p) => (p.label === label ? { ...p, opacity } : p))
      );
      // Debounce API call by 300 ms
      if (opacityDebounceRef.current) clearTimeout(opacityDebounceRef.current);
      opacityDebounceRef.current = setTimeout(() => {
        saveOverride(label, { opacity });
      }, 300);
    },
    [saveOverride, onPartsChange],
  );

  const handlePositionInputChange = useCallback(
    (label: string, axis: "x" | "y" | "z", value: number) => {
      onPartsChange((prev) =>
        prev.map((p) =>
          p.label === label
            ? { ...p, position: { ...p.position, [axis]: value } }
            : p
        )
      );
      saveOverride(label, {
        pos_x: axis === "x" ? value : undefined,
        pos_y: axis === "y" ? value : undefined,
        pos_z: axis === "z" ? value : undefined,
      });
    },
    [saveOverride],
  );

  const handleRotationInputChange = useCallback(
    (label: string, axis: "x" | "y" | "z", valueDeg: number) => {
      const valueRad = (valueDeg * Math.PI) / 180;
      onPartsChange((prev) =>
        prev.map((p) =>
          p.label === label
            ? { ...p, rotation: { ...p.rotation, [axis]: valueRad } }
            : p
        )
      );
      saveOverride(label, {
        rot_x: axis === "x" ? valueRad : undefined,
        rot_y: axis === "y" ? valueRad : undefined,
        rot_z: axis === "z" ? valueRad : undefined,
      });
    },
    [saveOverride],
  );

  const handleResetPart = useCallback(
    async (label: string, basePart: ScenePart) => {
      if (!currentModelId) return;
      await deletePartOverride(currentModelId, label);
      onPartsChange((prev) =>
        prev.map((p) => (p.label === label ? { ...basePart } : p))
      );
    },
    [currentModelId, onPartsChange],
  );

  const handleResetAll = useCallback(
    async (baseParts: ScenePart[]) => {
      if (!currentModelId) return;
      await deleteAllOverrides(currentModelId);
      onPartsChange(() => baseParts);
    },
    [currentModelId, onPartsChange],
  );

  return {
    selectedLabel,
    setSelectedLabel,
    editMode,
    setEditMode,
    handleTransformEnd,
    handleOpacityChange,
    handlePositionInputChange,
    handleRotationInputChange,
    handleResetPart,
    handleResetAll,
  };
}
