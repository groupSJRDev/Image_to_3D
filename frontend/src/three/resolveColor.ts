const FLESH = "#e8c4a2";

/**
 * Mirrors the resolveColor(label, orig) function from the example HTML files.
 * Maps label patterns to material colors, overriding the raw JSON color field.
 * Called inside ScenePart before setting meshStandardMaterial color.
 */
export function resolveColor(label: string, orig: string): string {
  if (/head-cranium|neck|hand-|ear-|nose/.test(label)) return FLESH;
  if (/mouth/.test(label)) return "#cc8877";
  if (/eye/.test(label)) return orig;
  if (/hair/.test(label)) return "#222222";
  if (/tie/.test(label)) return orig;
  if (/torso|upper-arm|forearm/.test(label)) return orig;
  if (/thigh|shin/.test(label)) return orig;
  if (/foot/.test(label)) return "#2a2a2a";
  return orig;
}
