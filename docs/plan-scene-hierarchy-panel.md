# Plan: Scene Hierarchy Panel

**Date:** 2026-03-31
**Status:** Draft — not yet implemented
**No backend changes required** — this is a pure frontend feature.

---

## What the User Gets

A collapsible **Scene Hierarchy** panel in the left sidebar (below the upload panel) that shows the entire scene as a tree:

```
▼ Scene
  ▼ burger  (4 parts)          ← group row, click to select group
      burger-bottom-bun        ← part row
      burger-lettuce
    ● burger-patty-top         ← highlighted = currently selected
      burger-top-bun
  ▶ beer  (3 parts)            ← collapsed group
  ▶ fries  (10 parts)
  ▶ board  (1 part)
```

Interactions:
- **Click a group row** → selects the group (same as clicking it in the 3D canvas)
- **Click a part row** → Alt-selects the individual part (same as Alt+clicking in canvas)
- **Canvas click syncs the panel** → when you click an object in 3D, the hierarchy scrolls to and highlights the selected node
- **Chevron toggle** → expand/collapse individual groups
- **Geometry type badge** on each part row (box, cylinder, sphere, etc.)

---

## Layout

The left sidebar currently holds `UploadPanel` and `StatusBar` stacked vertically in a `w-52` column. The hierarchy panel is added **below** `StatusBar`, taking up the remaining space with `flex-1 overflow-y-auto`.

```
Left sidebar (w-52)
├── UploadPanel          (shrink-0)
├── StatusBar            (shrink-0)
└── SceneHierarchy       (flex-1, overflow-y-auto)  ← new
```

If there are no parts (`parts.length === 0`), the hierarchy panel shows nothing (or a subtle "No scene loaded" placeholder). No layout shift.

---

## New Component: `SceneHierarchy`

**File:** `frontend/src/components/SceneHierarchy.tsx`

### Props

```typescript
interface SceneHierarchyProps {
  parts: ScenePart[];
  selectedGroup: string | null;
  selectedLabel: string | null;
  onSelectGroup: (groupName: string) => void;
  onSelectPart: (label: string) => void;
}
```

`onSelectGroup` and `onSelectPart` are wired directly to `setSelectedGroup`/`setSelectedLabel` in `App.tsx` — same state that the canvas writes to. This is what makes canvas↔panel selection sync work with no extra machinery: both write to the same state.

### Internal state

```typescript
// Which groups are expanded. Default: all expanded.
const [expanded, setExpanded] = useState<Set<string>>(() => {
  const grouped = groupPartsByPrefix(parts);
  return new Set(Object.keys(grouped));
});
```

When `parts` changes (new render), reset `expanded` to all-open via a `useEffect`.

### Render structure

```tsx
<div className="flex flex-col h-full">
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
      />
    ))}
  </div>
</div>
```

### `GroupNode` sub-component (internal)

```tsx
function GroupNode({ groupName, parts, isExpanded, isGroupSelected, selectedLabel,
                     onToggle, onSelectGroup, onSelectPart }) {
  return (
    <>
      {/* Group header row */}
      <div
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
```

### Highlight colours match the canvas

| State | Canvas colour | Hierarchy colour |
|---|---|---|
| Group selected | Orange emissive (`#ff8800`) | `text-orange-400` + `bg-gray-700` |
| Part selected | Orange emissive | `text-orange-400` + `bg-gray-700` |
| Unselected | Default material | `text-gray-300` / `text-gray-400` |
| Hovered (panel) | — | `hover:bg-gray-800` |

---

## Auto-scroll to Selected Node

When `selectedLabel` or `selectedGroup` changes due to a canvas click, the hierarchy panel should scroll the selected row into view.

Use a `ref` map keyed on group name and part label:

```typescript
const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

// After each render, scroll selected row into view:
useEffect(() => {
  const key = selectedLabel ?? selectedGroup;
  if (!key) return;
  rowRefs.current.get(key)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}, [selectedLabel, selectedGroup]);
```

Each row receives `ref={(el) => { if (el) rowRefs.current.set(rowKey, el); }}`.

Also auto-expand the group containing the newly selected part when the canvas selects it:

```typescript
useEffect(() => {
  if (selectedLabel) {
    const groupName = getGroupPrefix(selectedLabel);
    setExpanded((prev) => new Set([...prev, groupName]));
  }
}, [selectedLabel]);
```

---

## Wiring in `App.tsx`

### `onSelectGroup` handler

```typescript
function handleHierarchySelectGroup(groupName: string) {
  setSelectedGroup(groupName);
  setSelectedLabel(null);
}
```

### `onSelectPart` handler

```typescript
function handleHierarchySelectPart(label: string) {
  setSelectedLabel(label);
  setSelectedGroup(null);
}
```

These are identical in effect to what `handleCanvasSelect` does — they write to the same state. No new state needed.

### In the JSX

```tsx
{/* Left panel */}
<div className="w-52 shrink-0 border-r border-gray-700 flex flex-col bg-gray-900">
  <UploadPanel onRender={handleRender} loading={status === "loading"} />
  <StatusBar status={status} message={errorMsg} partCount={parts.length} />
  {parts.length > 0 && (               {/* ← new */}
    <SceneHierarchy
      parts={parts}
      selectedGroup={selectedGroup}
      selectedLabel={selectedLabel}
      onSelectGroup={handleHierarchySelectGroup}
      onSelectPart={handleHierarchySelectPart}
    />
  )}
</div>
```

---

## Part Count and Geometry Type

The part row shows `part.geometryType` (e.g., `box`, `lathe`, `cylinder`) from the existing `ScenePart` type — no new data needed. Keep it small (`text-[10px]`, muted gray) so it doesn't compete with the label.

---

## What Changes

| File | Change |
|---|---|
| `frontend/src/components/SceneHierarchy.tsx` | **Create** — new component |
| `frontend/src/App.tsx` | Add `SceneHierarchy` to left panel, wire `onSelectGroup`/`onSelectPart` |

**No other files change.** No backend changes. No new state beyond what already exists.

---

## Acceptance Criteria

- [ ] Left panel shows group tree after a render completes
- [ ] Groups are expanded by default, chevron toggles them
- [ ] Clicking a group row in the panel → selects group, highlights orange in both panel and canvas
- [ ] Clicking a part row in the panel → selects individual part, highlights orange in both
- [ ] Clicking an object in the canvas → corresponding group/part highlights in the panel and panel scrolls to it
- [ ] Selecting a part via canvas auto-expands its group in the panel if it was collapsed
- [ ] Escape key clears selection in both canvas and panel simultaneously
- [ ] Panel shows part count per group
- [ ] Each part shows its geometry type (small, muted)
- [ ] Panel is empty / not shown when no scene is loaded
- [ ] Long labels truncate cleanly, don't overflow the 208px sidebar
