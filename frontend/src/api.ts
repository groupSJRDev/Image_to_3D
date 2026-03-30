import type {
  ComposedScene, PartOverrideRequest, RenderResponse, ScenePart,
  SceneSummary, StoredModel, Transform,
} from "./types";

export class ApiError extends Error {
  readonly raw_response: string;
  readonly status: number;

  constructor(message: string, status: number, raw_response: string = "") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.raw_response = raw_response;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const detail = body.detail ?? body.error ?? res.statusText;
    const message = typeof detail === "object" ? detail.error ?? res.statusText : detail;
    const raw = typeof detail === "object" ? detail.raw_response ?? "" : body.raw_response ?? "";
    throw new ApiError(message, res.status, raw);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

async function requestVoid(path: string, init?: RequestInit): Promise<void> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const detail = body.detail ?? body.error ?? res.statusText;
    const message = typeof detail === "object" ? detail.error ?? res.statusText : detail;
    const raw = typeof detail === "object" ? detail.raw_response ?? "" : body.raw_response ?? "";
    throw new ApiError(message, res.status, raw);
  }
}

// ── Render ───────────────────────────────────────────────────────────────────

export function renderImage(file: File): Promise<RenderResponse> {
  const form = new FormData();
  form.append("image", file);
  return request("/api/render", { method: "POST", body: form });
}

export function getPrompt(): Promise<{ prompt: string }> {
  return request("/api/prompt");
}

// ── Model library ────────────────────────────────────────────────────────────

export function saveModel(name: string, parts: object[]): Promise<StoredModel> {
  return request("/api/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parts }),
  });
}

export function listModels(): Promise<StoredModel[]> {
  return request("/api/models");
}

export function getModel(id: number): Promise<StoredModel> {
  return request(`/api/models/${id}`);
}

export function renameModel(id: number, name: string): Promise<StoredModel> {
  return request(`/api/models/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export function deleteModel(id: number): Promise<void> {
  return requestVoid(`/api/models/${id}`, { method: "DELETE" });
}

// ── Scene composer ───────────────────────────────────────────────────────────

export function createScene(name: string): Promise<ComposedScene> {
  return request("/api/scenes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

export function listScenes(): Promise<SceneSummary[]> {
  return request("/api/scenes");
}

export function getScene(id: number): Promise<ComposedScene> {
  return request(`/api/scenes/${id}`);
}

export function deleteScene(id: number): Promise<void> {
  return requestVoid(`/api/scenes/${id}`, { method: "DELETE" });
}

export function addModelToScene(
  sceneId: number,
  modelId: number,
  transform: Transform = {}
) {
  return request(`/api/scenes/${sceneId}/instances`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model_id: modelId, ...transform }),
  });
}

export function updateInstance(
  sceneId: number,
  instanceId: number,
  transform: Transform
) {
  return request(`/api/scenes/${sceneId}/instances/${instanceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(transform),
  });
}

export function removeInstance(sceneId: number, instanceId: number): Promise<void> {
  return requestVoid(`/api/scenes/${sceneId}/instances/${instanceId}`, { method: "DELETE" });
}

// ── Part overrides ────────────────────────────────────────────────────────────

export function upsertPartOverride(
  modelId: number,
  partLabel: string,
  body: PartOverrideRequest,
): Promise<ScenePart> {
  return request(`/api/models/${modelId}/parts/${encodeURIComponent(partLabel)}/override`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function deletePartOverride(modelId: number, partLabel: string): Promise<void> {
  return requestVoid(
    `/api/models/${modelId}/parts/${encodeURIComponent(partLabel)}/override`,
    { method: "DELETE" },
  );
}

export function deleteAllOverrides(modelId: number): Promise<void> {
  return requestVoid(`/api/models/${modelId}/overrides`, { method: "DELETE" });
}
