import type { SavedWorkspace } from "../lib/client/saved-workspace";
export function adjacentWorkspace(value: SavedWorkspace) {
  if (value.relation.type !== "adjacent" || value.execution.type !== "adjacent") throw Error("Expected adjacent fixture");
  return value as SavedWorkspace & { relation: Extract<SavedWorkspace["relation"], { type: "adjacent" }>; execution: Extract<SavedWorkspace["execution"], { type: "adjacent" }> };
}
