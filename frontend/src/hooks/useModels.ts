import { useCallback, useEffect, useState } from "react";
import { listModels } from "../api";
import type { StoredModel } from "../types";

export function useModels() {
  const [models, setModels] = useState<StoredModel[]>([]);

  const refresh = useCallback(async () => {
    try {
      setModels(await listModels());
    } catch {
      // silent — library is non-critical
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { models, refresh };
}
