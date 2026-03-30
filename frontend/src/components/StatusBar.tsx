export type Status = "idle" | "loading" | "success" | "error";

interface Props {
  status: Status;
  message?: string;
  partCount?: number;
}

export function StatusBar({ status, message, partCount }: Props) {
  if (status === "idle") return null;

  const base = "px-3 py-1.5 text-xs rounded mx-3 mb-2";

  if (status === "loading") return (
    <div role="status" aria-live="polite" className={`${base} bg-blue-900/40 text-blue-300 flex items-center gap-2`}>
      <span className="animate-spin">⟳</span>
      Analysing with Gemini… (20–40 seconds)
    </div>
  );

  if (status === "success") return (
    <div role="status" aria-live="polite" className={`${base} bg-green-900/40 text-green-300`}>
      ✓ Scene rendered — {partCount} parts
    </div>
  );

  if (status === "error") return (
    <div role="status" aria-live="assertive" className={`${base} bg-red-900/40 text-red-300`}>
      ✗ {message ?? "Something went wrong"}
    </div>
  );

  return null;
}
