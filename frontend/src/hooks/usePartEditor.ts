import { useCallback, useRef, useState } from "react";
import {
  batchUpsertOverrides,
  deleteAllOverrides,
  deletePartOverride,
  upsertPartOverride,
} from "../api";
import type {
  EditMode,
  PartOverrideRequest,
  ScenePart,
  SelectionMode,
  Vec3,
} from "../types";
import { getGroupPrefix } from "../utils/groupParts";

interface UsePartEditorOptions {
  currentModelId: number | null;
  onPartsChange: (updater: (prev: ScenePart[]) => ScenePart[]) => void;
}

export function usePartEditor({ currentModelId, onPartsChange }: UsePartEditorOptions) {
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<EditMode>("translate");
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("group");
  const opacityDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSelection = useCallback(() => {
    setSelectedLabel(null);
    setSelectedGroup(null);
  }, []);

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

  // Individual part transform (Alt+click then drag gizmo)
  const handleTransformEnd = useCallback(
    (label: string, pos: Vec3, rot: Vec3) => {
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

  // Group transform — delta already extracted from the THREE.Group, group reset to origin
  const handleGroupTransformEnd = useCallback(
    (groupName: string, groupParts: ScenePart[], delta: Vec3) => {
      if (delta.x === 0 && delta.y === 0 && delta.z === 0) return;

      // Optimistically apply delta to each part's current position
      const updatedParts: ScenePart[] = [];
      onPartsChange((prev) => {
        const next = prev.map((p) => {
          if (getGroupPrefix(p.label) !== groupName) return p;
          const updated = {
            ...p,
            position: {
              x: p.position.x + delta.x,
              y: p.position.y + delta.y,
              z: p.position.z + delta.z,
            },
          };
          updatedParts.push(updated);
          return updated;
        });
        return next;
      });

      if (!currentModelId) return;
      // One batch call for the whole group
      batchUpsertOverrides(
        currentModelId,
        groupParts.map((p) => ({
          part_label: p.label,
          pos_x: p.position.x + delta.x,
          pos_y: p.position.y + delta.y,
          pos_z: p.position.z + delta.z,
        })),
      ).catch(() => {});
    },
    [currentModelId, onPartsChange],
  );

  const handleOpacityChange = useCallback(
    (label: string, opacity: number) => {
      onPartsChange((prev) =>
        prev.map((p) => (p.label === label ? { ...p, opacity } : p))
      );
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

  const handleResetGroup = useCallback(
    async (groupName: string, baseGroupParts: ScenePart[]) => {
      if (!currentModelId) return;
      // Delete all overrides for each part in the group via batch reset
      await Promise.all(
        baseGroupParts.map((p) => deletePartOverride(currentModelId, p.label).catch(() => {}))
      );
      onPartsChange((prev) =>
        prev.map((p) => {
          const base = baseGroupParts.find((b) => b.label === p.label);
          return base ? { ...base } : p;
        })
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
    handleResetAll,
  };
}
