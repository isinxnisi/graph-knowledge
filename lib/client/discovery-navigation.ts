import type { DatasetMode } from "../domain/dataset";
import type { PredicateFilter } from "../domain/exploration";
import { explorationHref } from "./exploration-url";

export function discoveryExplorationHref(dataset: DatasetMode, id: string, predicates: PredicateFilter) {
  return explorationHref({ version: 1, dataset, id, rootId: id, title: "Discovery", savedAt: "2000-01-01T00:00:00.000Z",
    conditions: { predicates, contributionRoles: null, organizationPositions: null, eventRoles: null },
    branches: [{ id, open: true, pages: 1 }], view: null });
}
