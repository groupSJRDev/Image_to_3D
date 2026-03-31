import { useEffect, useRef, useState } from "react";
import type { ScenePart } from "../types";
import { groupPartsByPrefix, getGroupPrefix } from "../utils/groupParts";

interface SceneHierarchyProps {
  parts: ScenePart[];
  selectedGroup: string | null;
  selectedLabel: string | null;
  onSelectGroup: (groupName: string) => void;
  onSelectPart: (label: string) => void;
}

export function SceneHierarchy({
  parts,
  selectedGroup,
  selectedLabel,
  onSelectGroup,
  onSelectPart,
}: SceneHierarchyProps) {
  const grouped = groupPartsByPrefix(parts);

  // All groups expanded by default
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(Object.keys(grouped))
  );

  // Reset to all-open when parts change (new render)
  useEffect(() => {
    const g = groupPartsByPrefix(parts);
    setExpanded(new Set(Object.keys(g)));
  }, [parts]);

  // Auto-expand the group containing the newly selected part
  useEffect(() => {
    if (selectedLabel) {
      const groupName = getGroupPrefix(selectedLabel);
      setExpanded((prev) => new Set([...prev, groupName]));
    }
  }, [selectedLabel]);

  // Scroll selected row into view
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  useEffect(() => {
    const key = selectedLabel ?? selectedGroup;
    if (!key) return;
    rowRefs.current.get(key)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedLabel, selectedGroup]);

  function toggle(groupName: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) {
        next.delete(groupName);
      } else {
        next.add(groupName);
      }
      return next;
    });
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="text-[10px] uppercase tracking-wider text-gray-600 px-3 py-1 border-b border-gray-800">
        Scene
      </div>
      <div className="flex-1 overflow-y-auto text-xs">
        {Object.entries(grouped).map(([groupName, groupParts]) => (
          <GroupNode
            key={groupName}
            groupName={groupName}
            parts={groupParts}
            isExpanded={expanded.has(groupName)}
            isGroupSelected={groupName === selectedGroup}
            selectedLabel={selectedLabel}
            onToggle={() => toggle(groupName)}
            onSelectGroup={() => onSelectGroup(groupName)}
            onSelectPart={onSelectPart}
            rowRefs={rowRefs.current}
          />
        ))}
      </div>
    </div>
  );
}

interface GroupNodeProps {
  groupName: string;
  parts: ScenePart[];
  isExpanded: boolean;
  isGroupSelected: boolean;
  selectedLabel: string | null;
  onToggle: () => void;
  onSelectGroup: () => void;
  onSelectPart: (label: string) => void;
  rowRefs: Map<string, HTMLDivElement>;
}

function GroupNode({
  groupName,
  parts,
  isExpanded,
  isGroupSelected,
  selectedLabel,
  onToggle,
  onSelectGroup,
  onSelectPart,
  rowRefs,
}: GroupNodeProps) {
  return (
    <>
      {/* Group header row */}
      <div
        ref={(el) => { if (el) rowRefs.set(groupName, el); }}
        onClick={onSelectGroup}
        className={`flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-gray-800
          ${isGroupSelected ? "bg-gray-700 text-orange-400" : "text-gray-300"}`}
      >
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="text-gray-500 hover:text-gray-300 w-4 shrink-0"
        >
          {isExpanded ? "▾" : "▸"}
        </button>
        <span className="font-medium capitalize truncate flex-1">{groupName}</span>
        <span className="text-gray-600 shrink-0">{parts.length}</span>
      </div>

      {/* Part rows */}
      {isExpanded && parts.map((part) => {
        const isSelected = part.label === selectedLabel;
        return (
          <div
            key={part.label}
            ref={(el) => { if (el) rowRefs.set(part.label, el); }}
            onClick={() => onSelectPart(part.label)}
            className={`flex items-center gap-1 pl-7 pr-2 py-0.5 cursor-pointer hover:bg-gray-800
              ${isSelected ? "bg-gray-700 text-orange-400" : "text-gray-400"}`}
          >
            <span className="truncate flex-1">{part.label}</span>
            <span className="text-gray-700 text-[10px] shrink-0">{part.geometryType}</span>
          </div>
        );
      })}
    </>
  );
}
