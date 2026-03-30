import { useEffect, useRef, useState } from "react";

interface Props {
  onRender: (file: File) => void;
  loading: boolean;
}

export function UploadPanel({ onRender, loading }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function handleFile(f: File) {
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("image/")) handleFile(f);
  }

  return (
    <div className="flex flex-col gap-3 p-3 h-full">
      <div
        role="button"
        aria-label="Upload image for 3D rendering"
        className={`border-2 border-dashed rounded-lg flex flex-col items-center justify-center p-4 cursor-pointer transition-colors
          ${dragging ? "border-blue-400 bg-blue-950/20" : "border-gray-600 hover:border-gray-400"}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {preview ? (
          <img src={preview} alt="preview" className="max-h-40 rounded object-contain" />
        ) : (
          <p className="text-gray-400 text-xs text-center">
            Drop image here<br />or click to browse
          </p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </div>

      <button
        disabled={!file || loading}
        onClick={() => file && onRender(file)}
        className="w-full py-2 px-3 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
      >
        {loading ? "Rendering…" : "Render"}
      </button>
    </div>
  );
}
