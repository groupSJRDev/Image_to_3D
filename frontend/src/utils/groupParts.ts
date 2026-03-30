import type { ScenePart } from "../types";

/**
 * Derives the group prefix from a part label by splitting on the first hyphen.
 * "burger-bun-bottom" → "burger"
 * "fry-1"             → "fry"
 * "board"             → "board"  (no hyphen → standalone, own group)
 */
export function getGroupPrefix(label: string): string {
  const idx = label.indexOf("-");
  return idx === -1 ? label : label.slice(0, idx);
}

/**
 * Groups parts by their label prefix. Returns a stable-ordered map where
 * keys appear in the order the first part of each group was encountered.
 */
export function groupPartsByPrefix(parts: ScenePart[]): Record<string, ScenePart[]> {
  const groups: Record<string, ScenePart[]> = {};
  for (const part of parts) {
    const prefix = getGroupPrefix(part.label);
    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix].push({ ...part, group: prefix });
  }
  return groups;
}
