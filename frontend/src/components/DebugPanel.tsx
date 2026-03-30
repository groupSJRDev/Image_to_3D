import { useState } from "react";

interface Props {
  parts: object[];
  rawResponse: string;
}

export function DebugPanel({ parts, rawResponse }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"json" | "raw">("json");

  return (
    <div className="border-t border-gray-700 bg-gray-950">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-3 py-1.5 text-left text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
      >
        <span>{open ? "▼" : "▶"}</span> Debug
      </button>
      {open && (
        <div className="flex flex-col" style={{ height: 200 }}>
          <div className="flex gap-1 px-3 pb-1">
            {(["json", "raw"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-2 py-0.5 rounded text-xs ${tab === t ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300"}`}
              >
                {t === "json" ? "Scene JSON" : "Raw LLM Response"}
              </button>
            ))}
          </div>
          <pre className="flex-1 overflow-auto px-3 pb-2 text-xs text-gray-400 font-mono whitespace-pre-wrap">
            {tab === "json"
              ? JSON.stringify(parts, null, 2)
              : rawResponse || "(no response yet)"}
          </pre>
        </div>
      )}
    </div>
  );
}
