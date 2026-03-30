import { useState } from "react";
import { deleteModel, renameModel } from "../api";
import type { StoredModel } from "../types";

interface Props {
  models: StoredModel[];
  onRefresh: () => void;
  onAddToScene: (model: StoredModel) => void;
}

export function ModelLibrary({ models, onRefresh, onAddToScene }: Props) {
  const [renaming, setRenaming] = useState<number | null>(null);
  const [nameInput, setNameInput] = useState("");

  async function handleRename(id: number) {
    if (!nameInput.trim()) return;
    await renameModel(id, nameInput.trim());
    setRenaming(null);
    onRefresh();
  }

  async function handleDelete(id: number) {
    await deleteModel(id);
    onRefresh();
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-700">
        Model Library
      </div>
      <div className="flex-1 overflow-y-auto">
        {models.length === 0 && (
          <p className="text-xs text-gray-600 p-3">No saved models yet.</p>
        )}
        {models.map((m) => (
          <div key={m.id} className="border-b border-gray-800 p-2 hover:bg-gray-800/50">
            {renaming === m.id ? (
              <div className="flex gap-1">
                <input
                  autoFocus
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleRename(m.id); if (e.key === "Escape") setRenaming(null); }}
                  className="flex-1 bg-gray-700 text-white text-xs px-2 py-1 rounded"
                />
                <button onClick={() => handleRename(m.id)} className="text-green-400 text-xs px-1">✓</button>
                <button onClick={() => setRenaming(null)} className="text-gray-400 text-xs px-1">✗</button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs text-gray-200 truncate flex-1">{m.name}</span>
                  <span className="text-xs text-gray-500 shrink-0">{m.part_count}p</span>
                </div>
                <div className="flex gap-1 mt-1">
                  <button
                    onClick={() => onAddToScene(m)}
                    className="flex-1 py-0.5 rounded bg-blue-700 hover:bg-blue-600 text-xs text-white"
                  >
                    + Scene
                  </button>
                  <button
                    onClick={() => { setRenaming(m.id); setNameInput(m.name); }}
                    className="px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-xs text-gray-300"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => handleDelete(m.id)}
                    className="px-2 py-0.5 rounded bg-gray-700 hover:bg-red-800 text-xs text-gray-300"
                  >
                    ✕
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
