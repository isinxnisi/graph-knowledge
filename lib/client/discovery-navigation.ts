import type { DatasetMode } from "../domain/dataset";
import type { PredicateFilter } from "../domain/exploration";
import { explorationHref } from "./exploration-url";
import { workspaceSchema } from "./saved-workspace";

export function discoveryExplorationHref(dataset: DatasetMode, id: string, predicates: PredicateFilter, contributionRoles: import("../domain/exploration").ContributionRoleFilter = null) {
  const workspace = workspaceSchema.parse({ version: 1, dataset, id, rootId: id, title: "Discovery", savedAt: "2000-01-01T00:00:00.000Z",
    conditions: { predicates, contributionRoles, organizationPositions: null, eventRoles: null },
    branches: [{ id, open: true, pages: 1 }], view: null });
  if (dataset === "public-kg" && workspace.execution.type === "adjacent") workspace.execution.order = "bounded";
  return explorationHref(workspace);
}
