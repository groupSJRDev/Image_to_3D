import { useCallback, useEffect, useState } from "react";
import { listModels } from "../api";
import type { StoredModel } from "../types";

export function useModels() {
  const [models, setModels] = useState<StoredModel[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setModels(await listModels());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load models");
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { models, error, refresh };
}
