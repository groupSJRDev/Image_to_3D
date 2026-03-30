import type { ScenePart } from "../types";

interface Props {
  part: ScenePart;
  modelId: number | null;
  onOpacityChange: (label: string, opacity: number) => void;
  onPositionChange: (label: string, axis: "x" | "y" | "z", value: number) => void;
  onRotationChange: (label: string, axis: "x" | "y" | "z", valueDeg: number) => void;
  onResetPart: (label: string, basePart: ScenePart) => void;
  onClose: () => void;
}

function NumInput({
  value,
  onChange,
  step = 0.01,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <input
      type="number"
      step={step}
      value={parseFloat(value.toFixed(4))}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (!isNaN(v)) onChange(v);
      }}
      className="w-20 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-xs text-gray-100 focus:outline-none focus:border-blue-500"
    />
  );
}

const RAD_TO_DEG = 180 / Math.PI;

export function PartProperties({
  part,
  modelId,
  onOpacityChange,
  onPositionChange,
  onRotationChange,
  onResetPart,
  onClose,
}: Props) {
  const pos = part.position;
  const rot = part.rotation;
  const opacity = part.opacity ?? 1.0;

  return (
    <div className="border-t border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-300 shrink-0">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-gray-100 truncate max-w-[160px]" title={part.label}>
          {part.label}
        </span>
        <div className="flex items-center gap-2">
          {modelId && (
            <button
              onClick={() => onResetPart(part.label, part)}
              className="text-xs px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
            >
              Reset
            </button>
          )}
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-200 transition-colors leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-2 gap-y-1 items-center">
        {/* Position */}
        <span className="text-gray-500">Pos</span>
        {(["x", "y", "z"] as const).map((ax) => (
          <div key={ax} className="flex items-center gap-0.5">
            <span className="text-gray-500 uppercase text-[10px] w-3">{ax}</span>
            <NumInput
              value={pos[ax]}
              onChange={(v) => onPositionChange(part.label, ax, v)}
            />
          </div>
        ))}

        {/* Rotation */}
        <span className="text-gray-500">Rot°</span>
        {(["x", "y", "z"] as const).map((ax) => (
          <div key={ax} className="flex items-center gap-0.5">
            <span className="text-gray-500 uppercase text-[10px] w-3">{ax}</span>
            <NumInput
              value={rot[ax] * RAD_TO_DEG}
              onChange={(v) => onRotationChange(part.label, ax, v)}
              step={1}
            />
          </div>
        ))}
      </div>

      {/* Opacity */}
      <div className="flex items-center gap-2 mt-2">
        <span className="text-gray-500 w-8">Opac</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={opacity}
          onChange={(e) => onOpacityChange(part.label, parseFloat(e.target.value))}
          className="flex-1 accent-blue-500"
        />
        <span className="w-8 text-right text-gray-400">{Math.round(opacity * 100)}%</span>
      </div>
    </div>
  );
}
