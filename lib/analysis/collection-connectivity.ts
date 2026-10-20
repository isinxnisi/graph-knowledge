/** Offline structural analysis. Claim traversal never creates an inferred Claim. */
import { fixtureV4Schema, type Fixture } from "../domain/fixture";
import { sha256, stableJson } from "../server/public-dataset";

type Claim = Fixture["claims"][number];
type Entity = Fixture["entities"][number];
export type AnalysisOptions = {
  direction?: "both" | "outgoing" | "incoming";
  predicates?: string[]; roleIds?: string[];
  includeHiddenCandidates?: boolean;
  held?: { claimId: string; reason: string }[];
  groups?: { id: string; title: string; claimIds: string[] }[];
  roots?: string[];
  maxPathsPerRoot?: number; maxExpansionsPerRoot?: number; maxTotalPathExpansions?: number;
};
type Graph = { entities: Map<string, Entity>; claims: Claim[]; adjacency: Map<string, { to: string; claimId: string }[]> };
const fields = ["entities", "claims", "sources", "citations"] as const;
const sorted = (values: Iterable<string>) => [...values].sort();
const check = (value: unknown, message: string) => { if (!value) throw Error(message); };
const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map(row => [row.id, row]));

function graph(entities: Entity[], claims: Claim[], direction: AnalysisOptions["direction"]): Graph {
  const adjacency: Graph["adjacency"] = new Map(entities.map(e => [e.id, []]));
  for (const c of claims) {
    if (direction !== "incoming") adjacency.get(c.subjectId)!.push({ to: c.objectId, claimId: c.id });
    if (direction !== "outgoing" && c.subjectId !== c.objectId) adjacency.get(c.objectId)!.push({ to: c.subjectId, claimId: c.id });
  }
  for (const neighbors of adjacency.values()) neighbors.sort((a, b) => a.claimId.localeCompare(b.claimId) || a.to.localeCompare(b.to));
  return { entities: byId(entities), claims, adjacency };
}

function components(g: Graph) {
  // Weak components are independent of the selected traversal direction.
  const adjacency = new Map(sorted(g.entities.keys()).map(id => [id, new Set<string>()]));
  for (const c of g.claims) { adjacency.get(c.subjectId)!.add(c.objectId); adjacency.get(c.objectId)!.add(c.subjectId); }
  const owner = new Map<string, string>();
  const rows: { id: string; entityIds: string[]; claimIds: string[]; entityCount: number; claimCount: number }[] = [];
  for (const start of adjacency.keys()) {
    if (owner.has(start)) continue;
    const entityIds = [start]; owner.set(start, start);
    for (let i = 0; i < entityIds.length; i++) for (const next of adjacency.get(entityIds[i])!) {
      if (!owner.has(next)) { owner.set(next, start); entityIds.push(next); }
    }
    entityIds.sort();
    rows.push({ id: start, entityIds, claimIds: [], entityCount: entityIds.length, claimCount: 0 });
  }
  const lookup = new Map(rows.map(c => [c.id, c]));
  for (const c of g.claims) lookup.get(owner.get(c.subjectId)!)!.claimIds.push(c.id);
  for (const c of rows) { c.claimIds.sort(); c.claimCount = c.claimIds.length; }
  return { rows, owner };
}

function summary(g: Graph) {
  const component = components(g);
  const degrees = sorted(g.entities.keys()).map(entityId => ({ entityId,
    neighborCount: new Set(g.adjacency.get(entityId)!.map(e => e.to).filter(id => id !== entityId)).size,
    incidentClaimCount: g.claims.filter(c => c.subjectId === entityId || c.objectId === entityId).length,
  }));
  const sizes: Record<string, number> = {};
  for (const c of component.rows) sizes[c.entityCount] = (sizes[c.entityCount] ?? 0) + 1;
  const pairs = new Map<string, string[]>();
  for (const c of g.claims) {
    const key = stableJson([c.subjectId, c.objectId].sort());
    pairs.set(key, [...(pairs.get(key) ?? []), c.id]);
  }
  return { entityCount: g.entities.size, claimCount: g.claims.length, componentCount: component.rows.length,
    largestComponentSize: Math.max(0, ...component.rows.map(c => c.entityCount)), componentSizeHistogram: sizes,
    components: component.rows, degrees, branchingEntityCount: degrees.filter(d => d.neighborCount >= 2).length,
    selfLoopClaimIds: g.claims.filter(c => c.subjectId === c.objectId).map(c => c.id),
    parallelClaims: [...pairs].filter(([, ids]) => ids.length > 1).sort(([a], [b]) => a.localeCompare(b)).map(([endpoints, claimIds]) => ({ entityIds: JSON.parse(endpoints) as string[], claimIds: claimIds.sort() })),
  };
}

/** Unique endpoint reachability, cumulative <= 1/2/3 hops, exact on the supplied filtered graph. */
function reach(g: Graph, root: string) {
  const seen = new Set([root]), result: Set<string>[] = [];
  let frontier = g.entities.has(root) ? [root] : [];
  for (let hop = 1; hop <= 3; hop++) {
    const next: string[] = [];
    for (const id of frontier) for (const edge of g.adjacency.get(id) ?? []) if (!seen.has(edge.to)) { seen.add(edge.to); next.push(edge.to); }
    result.push(new Set([...seen].filter(id => id !== root))); frontier = next;
  }
  return result;
}

function reachComparison(before: Graph, after: Graph, roots: string[]) {
  const totals = { before: [0, 0, 0], after: [0, 0, 0], added: [0, 0, 0] };
  const rows = roots.map(entityId => {
    const old = reach(before, entityId), next = reach(after, entityId);
    const added = next.map((ids, hop) => sorted([...ids].filter(id => !old[hop].has(id))));
    for (let i = 0; i < 3; i++) { totals.before[i] += old[i].size; totals.after[i] += next[i].size; totals.added[i] += added[i].length; }
    return { entityId, before: old.map(s => s.size), after: next.map(s => s.size), added: added.map(s => s.length), addedEndpointIdsByHop: added };
  });
  return { semantics: "ordered root/endpoint pairs within <=1, <=2, <=3 hops; excludes root; parallel Claims count once", exact: true, totals, roots: rows };
}

export type AnalysisPath = { entityIds: string[]; claimIds: string[]; directions: ("forward" | "reverse")[]; hops: number; newClaimIds: string[]; endpointReachableBeforeWithinHops: boolean; kind: string };
function paths(g: Graph, before: Graph, roots: string[], added: Set<string>, options: Required<Pick<AnalysisOptions, "maxPathsPerRoot" | "maxExpansionsPerRoot" | "maxTotalPathExpansions">>) {
  const claims = byId(g.claims);
  let totalExpansions = 0;
  return roots.map(root => {
    const items: AnalysisPath[] = [], old = reach(before, root);
    let expansions = 0, stopped: "paths" | "expansions" | "total-expansions" | null = null;
    function visit(entityIds: string[], claimIds: string[], directions: ("forward" | "reverse")[]) {
      if (claimIds.length === 3 || stopped) return;
      for (const edge of g.adjacency.get(entityIds.at(-1)!) ?? []) {
        if (totalExpansions >= options.maxTotalPathExpansions) { stopped = "total-expansions"; return; }
        if (expansions >= options.maxExpansionsPerRoot) { stopped = "expansions"; return; }
        expansions++; totalExpansions++;
        if (entityIds.includes(edge.to)) continue; // no loops or repeated entities
        const c = claims.get(edge.claimId)!;
        const nodes = [...entityIds, edge.to], ids = [...claimIds, c.id];
        const dirs = [...directions, c.subjectId === entityIds.at(-1) ? "forward" as const : "reverse" as const];
        const newClaimIds = ids.filter(id => added.has(id));
        if (ids.length >= 2 && newClaimIds.length) {
          if (items.length >= options.maxPathsPerRoot) { stopped = "paths"; return; }
          const kinds = nodes.map(id => g.entities.get(id)!.kind);
          items.push({ entityIds: nodes, claimIds: ids, directions: dirs, hops: ids.length, newClaimIds,
            endpointReachableBeforeWithinHops: old[ids.length - 1].has(edge.to),
            kind: kinds[0] === "work" && kinds.at(-1) === "work" ? "different-works" : kinds[0] === "person" && kinds.at(-1) === "person" ? "different-people" : "other" });
        }
        visit(nodes, ids, dirs);
        if (stopped) return;
      }
    }
    visit([root], [], []);
    return { root, items, expansions, complete: stopped === null, limitedBy: stopped };
  });
}

export function analyzeConnectivity(beforeInput: unknown, afterInput: unknown, options: AnalysisOptions = {}) {
  const before = fixtureV4Schema.parse(beforeInput), after = fixtureV4Schema.parse(afterInput);
  check(stableJson(before) === stableJson(beforeInput) && stableJson(after) === stableJson(afterInput), "Non-canonical fixture would change original fields during validation");
  check(after.entities.length <= 10000 && after.claims.length <= 50000, "Input exceeds v1 analysis size limit (10000 entities / 50000 Claims)");
  // No identity matching by name/QID and no modification/deletion of an existing record.
  for (const field of fields) {
    const next = new Map<string, unknown>(after[field].map(row => [row.id, row]));
    for (const row of before[field]) check(stableJson(row) === stableJson(next.get(row.id)), `Existing ${field} changed or missing: ${row.id}`);
  }
  const entityMap = byId(after.entities), beforeIds = new Set(before.entities.map(e => e.id)), beforeClaims = new Set(before.claims.map(c => c.id));
  const beforeCitationIds = new Set(before.citations.map(c => c.id));
  check(!after.citations.some(c => !beforeCitationIds.has(c.id) && beforeClaims.has(c.claimId)), "New Citation on an existing Claim is outside append-only new-Claim analysis");
  const added = after.claims.filter(c => !beforeClaims.has(c.id)).sort((a, b) => a.id.localeCompare(b.id));
  const addedIds = new Set(added.map(c => c.id));
  const held = new Map<string, string>();
  for (const row of options.held ?? []) {
    check(addedIds.has(row.claimId) && !held.has(row.claimId) && row.reason.trim(), "Invalid/duplicate held Claim"); held.set(row.claimId, row.reason);
  }
  const support = new Set(after.citations.filter(c => c.stance === "support" && !after.sources.find(s => s.id === c.sourceId)!.isDemo).map(c => c.claimId));
  const classifications = after.claims.map(claim => {
    const reasons: string[] = [];
    if (claim.polarity === "denied") reasons.push("denied");
    if (claim.visibility !== "published" && !(options.includeHiddenCandidates && addedIds.has(claim.id))) reasons.push("hidden");
    if (!support.has(claim.id)) reasons.push("no-supporting-non-demo-citation");
    if (held.has(claim.id)) reasons.push("held: " + held.get(claim.id));
    if (options.predicates?.length && !options.predicates.includes(claim.predicate)) reasons.push("predicate-filter");
    if (options.roleIds?.length && (!claim.contribution?.roleId || !options.roleIds.includes(claim.contribution.roleId))) reasons.push("role-filter");
    return { claimId: claim.id, new: addedIds.has(claim.id), eligible: !reasons.length, reasons };
  }).sort((a, b) => a.claimId.localeCompare(b.claimId));
  const eligible = new Set(classifications.filter(c => c.eligible).map(c => c.claimId));
  const oldGraph = graph(before.entities, before.claims.filter(c => eligible.has(c.id)).sort((a, b) => a.id.localeCompare(b.id)), options.direction ?? "both");
  const newClaims = added.filter(c => eligible.has(c.id));
  const newGraph = graph(after.entities, after.claims.filter(c => eligible.has(c.id)).sort((a, b) => a.id.localeCompare(b.id)), options.direction ?? "both");
  const endpoints = new Set(newClaims.flatMap(c => [c.subjectId, c.objectId]));
  const standalone = graph(after.entities.filter(e => endpoints.has(e.id)), newClaims, options.direction ?? "both");
  const baseComponents = components(oldGraph), combinedComponents = components(newGraph);
  const componentChanges = combinedComponents.rows.map(c => ({ ...c,
    baselineComponentIds: sorted(new Set(c.entityIds.filter(id => beforeIds.has(id)).map(id => baseComponents.owner.get(id)!))),
    newEntityIds: c.entityIds.filter(id => !beforeIds.has(id)), newClaimIds: c.claimIds.filter(id => addedIds.has(id)),
  }));
  const attached = componentChanges.filter(c => c.newClaimIds.length && c.baselineComponentIds.length);
  const islands = componentChanges.filter(c => !c.baselineComponentIds.length);
  const roots = sorted(new Set([...endpoints, ...(options.roots ?? [])]));
  check(roots.every(id => entityMap.has(id)), "Unknown exploration root");
  const limits = { maxPathsPerRoot: options.maxPathsPerRoot ?? 48, maxExpansionsPerRoot: options.maxExpansionsPerRoot ?? 2000,
    maxTotalPathExpansions: options.maxTotalPathExpansions ?? 100000 };
  check(Number.isInteger(limits.maxPathsPerRoot) && limits.maxPathsPerRoot > 0 && limits.maxPathsPerRoot <= 1000
    && Number.isInteger(limits.maxExpansionsPerRoot) && limits.maxExpansionsPerRoot > 0 && limits.maxExpansionsPerRoot <= 100000
    && Number.isInteger(limits.maxTotalPathExpansions) && limits.maxTotalPathExpansions > 0 && limits.maxTotalPathExpansions <= 2000000, "Invalid path limits");
  const pathResults = paths(newGraph, oldGraph, roots, addedIds, limits);
  const groups = options.groups?.length ? [...options.groups].sort((a, b) => a.id.localeCompare(b.id)) : addedIds.size ? [{ id: "all-additions", title: "追加集合全体", claimIds: sorted(addedIds) }] : [];
  const grouped = new Set<string>();
  check(new Set(groups.map(g => g.id)).size === groups.length, "Duplicate group ID");
  for (const g of groups) {
    check(g.claimIds.length && new Set(g.claimIds).size === g.claimIds.length && g.claimIds.every(id => addedIds.has(id)), "Group contains unknown/duplicate Claim");
    g.claimIds.forEach(id => grouped.add(id));
  }
  check(grouped.size === addedIds.size || !addedIds.size, "Groups must cover all added Claims");
  function unitImpact(ids: Set<string>) {
    const claims = newClaims.filter(c => ids.has(c.id)), nodes = new Set(claims.flatMap(c => [c.subjectId, c.objectId]));
    const single = graph([...before.entities, ...after.entities.filter(e => !beforeIds.has(e.id) && nodes.has(e.id))], [...oldGraph.claims, ...claims], options.direction ?? "both");
    const comp = components(single);
    return { eligibleClaimCount: claims.length, componentCount: comp.rows.length, componentDelta: comp.rows.length - baseComponents.rows.length,
      newEntityIds: sorted([...nodes].filter(id => !beforeIds.has(id))),
      connectedBaselineGroups: comp.rows.map(c => sorted(new Set(c.entityIds.filter(id => beforeIds.has(id)).map(id => baseComponents.owner.get(id)!)))).filter(ids => ids.length > 1),
      isolatedNewGroups: comp.rows.filter(c => c.entityIds.every(id => !beforeIds.has(id))),
      endpointReachability: reachComparison(oldGraph, single, sorted(nodes)),
    };
  }
  const claimEffects = added.map(c => {
    const without = graph(after.entities, newGraph.claims.filter(v => v.id !== c.id), "both");
    const withoutComponents = components(without);
    const splitting = eligible.has(c.id) && withoutComponents.owner.get(c.subjectId) !== withoutComponents.owner.get(c.objectId);
    const sides = splitting ? [c.subjectId, c.objectId].map(id => {
      const row = withoutComponents.rows.find(v => v.id === withoutComponents.owner.get(id))!;
      return { entityIds: row.entityIds, workIds: row.entityIds.filter(id => entityMap.get(id)!.kind === "work"), personIds: row.entityIds.filter(id => entityMap.get(id)!.kind === "person") };
    }) : [];
    const witnesses = pathResults.flatMap(r => r.items).filter(p => p.claimIds.includes(c.id));
    const representatives = (["different-works", "different-people", "other"] as const).flatMap(kind => [2, 3].flatMap(hops => witnesses.filter(p => p.kind === kind && p.hops === hops).slice(0, 1)));
    const baseIds = sorted(new Set([c.subjectId, c.objectId].filter(id => beforeIds.has(id)).map(id => baseComponents.owner.get(id)!)));
    return { claimId: c.id, eligible: eligible.has(c.id), baselineEndpointIds: [c.subjectId, c.objectId].filter(id => beforeIds.has(id)), baselineComponentIds: baseIds,
      directlyBridgesBaselineComponents: eligible.has(c.id) && baseIds.length > 1,
      graphBridgeInCombined: splitting, bridgeSides: sides,
      connectsWorkOrPersonGroups: sides.length === 2 && (sides.every(s => s.workIds.length) || sides.every(s => s.personIds.length)),
      connectsCreatorWorkGroups: sides.length === 2 && sides.every(s => s.workIds.length && s.personIds.length),
      singleClaimImpact: unitImpact(new Set([c.id])), representativePaths: representatives,
      pathSearchComplete: pathResults.every(r => r.complete),
    };
  });
  const totalReachability = reachComparison(oldGraph, newGraph, sorted(newGraph.entities.keys()));
  const oldSummary = summary(oldGraph), nextSummary = summary(newGraph);
  const evidenceIds = new Set([...addedIds, ...pathResults.flatMap(r => r.items.flatMap(p => p.claimIds))]);
  const citations = after.citations.filter(c => evidenceIds.has(c.claimId)).sort((a, b) => a.id.localeCompare(b.id));
  const sourceIds = new Set(citations.map(c => c.sourceId));
  function dispositionCounts(rows: typeof classifications) {
    return { all: rows.length, eligible: rows.filter(c => c.eligible).length, denied: rows.filter(c => c.reasons.includes("denied")).length,
      hidden: rows.filter(c => c.reasons.includes("hidden")).length, held: rows.filter(c => c.reasons.some(r => r.startsWith("held:"))).length,
      noSupportingCitation: rows.filter(c => c.reasons.includes("no-supporting-non-demo-citation")).length, excluded: rows.filter(c => !c.eligible).length };
  }
  return { schemaVersion: 1, readOnly: true, authority: "structural-analysis-only-no-acceptance-no-collection",
    semantics: { components: "weak components of eligible affirmative Claims; all entities including singletons", traversal: options.direction ?? "both",
      reachability: "exact unique endpoints on supplied snapshot, cumulative <=1/2/3 hops; not UI/API availability",
      paths: "bounded simple Claim witnesses with at least one new Claim; no entity repetition; reverse traversal preserves original Claim direction",
      evidence: "support Citation presence only; no source-quality/confidence score, no simultaneous-period or scope compatibility inference",
      hiddenCandidates: options.includeHiddenCandidates ?? false, predicates: sorted(options.predicates ?? []), roleIds: sorted(options.roleIds ?? []),
      partialPathsDoNotMeanAbsence: true, uiAvailability: "not-evaluated", limits },
    inputDigests: { before: sha256(stableJson(before)), after: sha256(stableJson(after)) },
    before: oldSummary, after: nextSummary, additionOnly: summary(standalone),
    delta: { entities: after.entities.length - before.entities.length, claims: added.length,
      eligibleClaims: newClaims.length, componentCount: nextSummary.componentCount - oldSummary.componentCount,
      attachedComponents: attached, isolatedNewGroups: islands,
      mergedBaselineComponents: componentChanges.filter(c => c.baselineComponentIds.length > 1),
      directlyBridgingClaimIds: claimEffects.filter(c => c.directlyBridgesBaselineComponents).map(c => c.claimId),
      groupConnectingClaimIds: claimEffects.filter(c => c.connectsWorkOrPersonGroups).map(c => c.claimId),
      creatorWorkGroupBridgeClaimIds: claimEffects.filter(c => c.connectsCreatorWorkGroups).map(c => c.claimId),
      newEntityAttachments: attached.flatMap(c => c.newEntityIds),
      reachability: totalReachability, branchingEntities: nextSummary.branchingEntityCount - oldSummary.branchingEntityCount },
    claimDispositionCounts: { before: dispositionCounts(classifications.filter(c => !c.new)), after: dispositionCounts(classifications), additions: dispositionCounts(classifications.filter(c => c.new)) },
    classifications, claimEffects, groups: groups.map(g => ({ ...g, claimIds: sorted(g.claimIds), impact: unitImpact(new Set(g.claimIds)) })),
    paths: pathResults,
    evidence: { entities: after.entities.filter(e => !beforeIds.has(e.id) || roots.includes(e.id) || added.some(c => c.subjectId === e.id || c.objectId === e.id) || pathResults.some(r => r.items.some(p => p.entityIds.includes(e.id)))).sort((a, b) => a.id.localeCompare(b.id)),
      claims: after.claims.filter(c => evidenceIds.has(c.id)).sort((a, b) => a.id.localeCompare(b.id)), citations,
      sources: after.sources.filter(s => sourceIds.has(s.id)).sort((a, b) => a.id.localeCompare(b.id)) },
  };
}

export type ConnectivityReport = ReturnType<typeof analyzeConnectivity>;

export function connectivityMarkdown(report: ConnectivityReport) {
  const entities = byId(report.evidence.entities), claims = byId(report.evidence.claims);
  const name = (id: string) => entities.get(id)?.name ?? id;
  const esc = (v: string) => v.replaceAll("|", "\\|").replaceAll("\n", " ");
  const lines = ["# 収集データの接続性評価", "", "読み取り専用の構造評価。収集・受入・公開の承認ではない。UI/APIでの経路表示可否は未評価。", "",
    "連結成分は肯定・支持CitationありのClaimによる弱連結。到達数は各起点から1／2／3段以内の異なる終点（起点と終点の順序を区別）。Role・scope・期間を経路全体の成立条件へ推論合成しない。", "",
    "| 集計 | 既存KG | 追加後 | 差分 |", "| --- | ---: | ---: | ---: |",
    `| Entity | ${report.before.entityCount} | ${report.after.entityCount} | ${report.delta.entities} |`,
    `| 対象Claim | ${report.before.claimCount} | ${report.after.claimCount} | ${report.delta.eligibleClaims} |`,
    `| 連結成分 | ${report.before.componentCount} | ${report.after.componentCount} | ${report.delta.componentCount} |`,
    `| 最大成分のEntity | ${report.before.largestComponentSize} | ${report.after.largestComponentSize} | ${report.after.largestComponentSize - report.before.largestComponentSize} |`,
    `| 分岐するEntity（隣接先2以上） | ${report.before.branchingEntityCount} | ${report.after.branchingEntityCount} | ${report.delta.branchingEntities} |`, "",
    `追加Claim単独: **${report.additionOnly.claimCount} Claim／${report.additionOnly.componentCount}成分**（端点Entityだけ）。既存KGを含む成分数と区別する。`, "",
    `追加Claimの別集計: 否定${report.claimDispositionCounts.additions.denied}、非公開で除外${report.claimDispositionCounts.additions.hidden}、保留${report.claimDispositionCounts.additions.held}、支持Citationなし${report.claimDispositionCounts.additions.noSupportingCitation}。理由は重複し得る。`, "",
    "| 段数以内 | 既存の到達組 | 追加後 | 新規到達組 |", "| --- | ---: | ---: | ---: |",
    ...[0, 1, 2].map(i => `| ${i + 1} | ${report.delta.reachability.totals.before[i]} | ${report.delta.reachability.totals.after[i]} | ${report.delta.reachability.totals.added[i]} |`), "",
    `既存成分の統合: ${report.delta.mergedBaselineComponents.length}、直接橋渡しClaim: ${report.delta.directlyBridgingClaimIds.length}、既存成分に付着した新規Entity: ${report.delta.newEntityAttachments.length}、独立した新規島: ${report.delta.isolatedNewGroups.length}。`, "",
    `経路列挙: ${report.paths.filter(p => !p.complete).length}/${report.paths.length}起点で上限到達。各起点${report.semantics.limits.maxPathsPerRoot}経路・${report.semantics.limits.maxExpansionsPerRoot}辺確認、全体${report.semantics.limits.maxTotalPathExpansions}辺確認まで。下記は代表例で、全経路数ではない。`, "",
    "## 異なる制作担当者と作品の組をつなぐClaim", "", "このClaimを除くと両側に人物と作品がそれぞれ残る構造上の橋。既存KG成分の直接統合とは別の指標。", "",
    "| Claim UUID | 主体 → 対象 | Role |", "| --- | --- | --- |",
    ...report.delta.creatorWorkGroupBridgeClaimIds.map(id => { const c = claims.get(id)!; return `| ${id} | ${esc(name(c.subjectId))} → ${esc(name(c.objectId))} | ${c.contribution?.roleId ?? "未指定"} |`; }), "",
    "## 候補ごとの比較と代表経路", "", "単独効果は既存KG＋当該1 Claimとその端点だけ。全体効果には追加Claim同士の接続を含む。次数や経路数を重要性・根拠確度の得点にしない。", "",
  ];
  for (const effect of report.claimEffects) {
    const c = claims.get(effect.claimId)!;
    const status = report.classifications.find(row => row.claimId === c.id)!;
    lines.push(`### ${esc(name(c.subjectId))} → ${esc(name(c.objectId))}`, "", `- Claim: \`${c.id}\` / ${c.predicate} / ${c.polarity} / ${c.visibility}`,
      `- Role: ${c.contribution?.roleId ?? "未指定"} / scope: ${c.contribution?.scope ? JSON.stringify(c.contribution.scope) : "未指定"}`,
      `- 集計: ${effect.eligible ? "対象" : status.reasons.join(", ")}。既存端点${effect.baselineEndpointIds.length}、既存成分の直接橋渡し${effect.directlyBridgesBaselineComponents ? "あり" : "なし"}。全体で作品／人物グループを分ける橋${effect.connectsWorkOrPersonGroups ? "あり" : "なし"}。単独の成分差分${effect.singleClaimImpact.componentDelta}。`, "");
    for (const path of effect.representativePaths) {
      lines.push(`- ${path.hops}段・${path.kind}: ${path.entityIds.map(name).map(esc).join(" — ")}（終点は追加前${path.endpointReachableBeforeWithinHops ? "も到達可能・新しいClaim経路" : "には同段数で到達不可"}）`,
        `  Claim順: ${path.claimIds.map(id => `\`${id}\``).join(" → ")} / 辿る方向: ${path.directions.join(", ")}`);
    }
    if (!effect.representativePaths.length) lines.push("代表2〜3段経路は今回の列挙範囲では未検出。部分列挙なら不存在を意味しない。");
    const cites = report.evidence.citations.filter(row => row.claimId === c.id);
    for (const citation of cites) {
      const source = report.evidence.sources.find(s => s.id === citation.sourceId)!;
      lines.push(`- Citation \`${citation.id}\` (${citation.stance}) / ${esc(citation.locator)} / Source \`${source.id}\` ${esc(source.title)}${source.url ? ` / ${source.url}` : ""}`);
    }
    lines.push("");
  }
  lines.push("## 独立する新規グループ", "");
  for (const island of report.delta.isolatedNewGroups) lines.push(`- ${island.entityIds.map(name).map(esc).join(" / ")} — ${island.claimCount} Claim、Entity ${island.entityCount}。Claim: ${island.newClaimIds.map(id => `\`${id}\``).join(", ") || "なし"}`);
  lines.push("", "## テーマ単位の比較", "");
  for (const group of report.groups) lines.push(`- ${esc(group.title)} (\`${group.id}\`): 対象${group.impact.eligibleClaimCount} Claim、新規Entity${group.impact.newEntityIds.length}、成分差分${group.impact.componentDelta}、既存成分統合${group.impact.connectedBaselineGroups.length}、独立島${group.impact.isolatedNewGroups.length}。到達数はテーマ端点を起点にした比較。`);
  lines.push("", "## 全経路の根拠索引", "", "既存Claimを含め、今回の代表経路探索で使った元の根拠。詳しい原語・期間・scopeはJSONの同一UUIDを参照。", "",
    "| Claim UUID | Citation UUID / stance / locator | Source UUID / 資料 |", "| --- | --- | --- |");
  for (const c of report.evidence.citations) {
    const source = report.evidence.sources.find(s => s.id === c.sourceId)!;
    lines.push(`| ${c.claimId} | ${c.id} / ${c.stance} / ${esc(c.locator)} | ${source.id} / ${esc(source.title)}${source.url ? ` / ${source.url}` : ""} |`);
  }
  lines.push("", "## 次の収集企画へ", "", "- 既存KGへ付着するClaimと、複数作品・別担当者へ進めるClaimを、その根拠・Role・刊行物scopeとともに比較する。", "- 独立島の端点を次の資料調査の起点として検討する。島同士の関係は未確認であり、接続性のためにClaimを補完しない。", "- 既に到達可能な端点へのRole付き経路にも資料上の具体性がある。一方、次数・島の大きさだけで収集を自動実行しない。", "", "各経路の全Claim・Source・Citation、成分サイズ・次数・除外理由・単独／テーマ効果はJSONを参照。根拠確度は再評価せず、支持Citationの有無だけを検証。", "");
  return lines.join("\n");
}
