import type { SearchKind } from "./search";
import type { DiscoveryTheme } from "./discovery";
import type { PredicateFilter } from "./exploration";
import type { ContributionRoleId } from "./contribution";
export type RecordSearchCriteria = { q: string; kind: SearchKind | null; predicates: PredicateFilter; contributionRole: ContributionRoleId | null; theme?: DiscoveryTheme; around?: string };
export function recordSearchProblem(criteria: RecordSearchCriteria): readonly [string, string] | null {
  return criteria.contributionRole && (criteria.predicates?.length !== 1 || criteria.predicates[0] !== "CONTRIBUTED_TO")
    ? ["制作役割は「作品づくり」だけを選んだ記録検索で使えます。役割を外すか、関係を作品づくりに戻してください。", "A production role requires Production as the only relation. Remove the role or return to Production."] : null;
}
// Optional query examples. They replace only relation/role, preserving name, kind and scope.
export const recordPresets = [
  { id: "drawing", title: ["作画の記録", "Drawing credits"], predicates: ["CONTRIBUTED_TO"], contributionRole: "DRAWING" },
  { id: "script", title: ["脚本の記録", "Script credits"], predicates: ["CONTRIBUTED_TO"], contributionRole: "SCRIPT_WRITING" },
  { id: "influence", title: ["影響の記録", "Influence records"], predicates: ["INFLUENCED_BY"], contributionRole: null },
] as const;
