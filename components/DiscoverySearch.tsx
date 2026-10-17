"use client";
import type { EntitySummary } from "../lib/domain/api";
import type { DatasetMode } from "../lib/domain/dataset";
import type { PredicateFilter } from "../lib/domain/exploration";
import type { DiscoveryCriteria } from "../lib/client/use-discovery-search";
import DiscoveryExplorer from "./DiscoveryExplorer";
import DiscoverySearchLegacy from "./DiscoverySearchLegacy";

export default function DiscoverySearch({ dataset, ...props }: {
  dataset: DatasetMode; initial: DiscoveryCriteria; onClose: (source?: string | null) => void;
  onChoose: (entity: EntitySummary, predicates?: PredicateFilter, roles?: import("../lib/domain/exploration").ContributionRoleFilter) => void;
}) {
  return dataset === "public-kg" ? <DiscoveryExplorer {...props}/> : <DiscoverySearchLegacy {...props}/>;
}
