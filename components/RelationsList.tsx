import { entityDisplayName } from "../lib/domain/entity-display";
import { useState } from "react";
import AnimatedDetails from "./AnimatedDetails";
import NeighborLoading from "./NeighborLoading";
import { useUiLocale } from "../lib/client/ui-locale";
import { explorerLabels, explorerMessage } from "../lib/i18n/explorer";
import type { DatasetMode } from "../lib/domain/dataset";
import { datasetLabels } from "../lib/i18n/dataset";
import { explorationLabels } from "../lib/i18n/exploration";
import type { GraphState, Selection } from "../lib/client/graph-state";
import { displayRelations, entityLabel, relationId } from "../lib/client/graph-presentation";
import { formatPeriod, polarityLabel, relationLabel, qualificationLabel } from "../lib/client/format";
import Icon from "./Icon";
import styles from "./Explorer.module.css";

export default function RelationsList({ graph, selection, onEntity, onClaim, onExpand, dataset = "demo" }: {
  dataset?: DatasetMode;
  graph: GraphState; selection: Selection; onEntity: (id: string) => void; onClaim: (id: string) => void; onExpand: (id: string, more?: boolean) => void;
}) {
  const { locale } = useUiLocale();
  const ui = explorerLabels(locale);
  const relation = selection?.kind === "relation" ? displayRelations(graph.claims, locale)[selection.id] : null;
  const initialId = selection?.kind === "entity" ? selection.id : selection?.kind === "claim" ? graph.claims[selection.id]?.subjectId : relation?.subjectId ?? graph.centerId;
  const [context, setContext] = useState({ generation: graph.generation, id: initialId });
  // 主張／線の詳細選択で一覧の主題を変えない。対象の選択と新探索だけが切替契機。
  const candidateId = context.generation !== graph.generation ? graph.centerId : selection?.kind === "entity" ? selection.id : context.id;
  const nextId = candidateId && graph.nodes[candidateId] ? candidateId : graph.centerId;
  if (context.generation !== graph.generation || context.id !== nextId) setContext({ generation: graph.generation, id: nextId });
  const entityId = nextId;
  const entity = entityId ? graph.nodes[entityId] : null;
  if (!entity) return <p className={styles.muted}>{ui.listHelp}</p>;
  const claims = Object.values(graph.claims).filter((claim) => claim.subjectId === entity.id || claim.objectId === entity.id);
  const expansion = graph.expansions[entity.id];
  const text = explorationLabels(locale);
  return <section id="explorer-relations" tabIndex={-1} className={styles.relations} aria-label={ui.adjacentAria}>
    <AnimatedDetails key={entity.id} open className={styles.adjacencyDisclosure} bodyClassName={styles.adjacencyBody} summary={<><h3>{ui.adjacent(entityDisplayName(entity,locale))}<small className={styles.muted}>{ui.adjacentHelp}</small></h3><span className={styles.disclosureChevron} aria-hidden="true"><Icon name="chevron" /></span></>}>
    {!expansion?.open&&<div className={styles.actions}><button onClick={() => onExpand(entity.id)}>{expansion?.pages.length ? ui.reopenBranch : ui.expand}</button></div>}
    {expansion?.loading && <NeighborLoading key={`${entity.id}:${expansion.request}`} name={entityDisplayName(entity,locale)} more={expansion.expanded} />}
    {expansion?.error && <div role="alert" className={styles.error}>
      <p>{explorerMessage(expansion.error, locale)}</p>
      <button disabled={expansion.loading} onClick={() => onExpand(entity.id, expansion.open && expansion.expanded)}>{text.neighborsRetry}</button>
    </div>}
    {expansion?.open && expansion.hasMore && <div>
      <p className={styles.muted}>{text.neighborsPartial}</p>
      <button onClick={() => onExpand(entity.id, true)} disabled={expansion.loading || expansion.blocked}>
        {text.neighborsMore}
      </button>
    </div>}
    {expansion?.expanded && !expansion.loading && !expansion.error && <p className={styles.muted}>{text.neighborsShown(claims.length)} {expansion.hasMore ? "" : text.neighborsComplete}</p>}
    {expansion?.ranking && <p className={styles.muted}>{text.neighborsRanked}</p>}
    {!claims.length && !expansion?.loading && !expansion?.error && <p role="status">{expansion?.expanded && expansion.pages.every((page) => !page.claimIds.length) && !expansion.hasMore ? graph.predicates === null && graph.contributionRoles === null && graph.organizationPositions === null && graph.eventRoles === null ? datasetLabels(dataset, locale).empty : text.empty : !expansion?.open ? ui.closedHelp : ui.noAdjacent}</p>}
    <ul className={styles.relationList}>
      {claims.map((claim) => {
        const neighbor = graph.nodes[claim.subjectId === entity.id ? claim.objectId : claim.subjectId];
        const selected = (selection?.kind === "claim" && selection.id === claim.id) || (selection?.kind === "relation" && selection.id === relationId(claim));
        return <li key={claim.id} className={selected ? styles.selectedRelation : undefined} data-testid={`relation-${claim.id}`}>
          <p className={styles.adjacencyPredicate}>{relationLabel(claim, locale)}</p>
          <p className={styles.adjacencyPair}><span>{entityLabel(graph.nodes[claim.subjectId], graph.nodes, locale).replace("\n", " / ")}</span><Icon name="arrow" /><span>{entityLabel(graph.nodes[claim.objectId], graph.nodes, locale).replace("\n", " / ")}</span></p>
          <p className={styles.muted}>{polarityLabel(claim, locale)} · {qualificationLabel(claim, locale) && `${qualificationLabel(claim, locale)} · `}{formatPeriod(claim.period, locale)} · {claim.sourceCount ? ui.sourceCount(claim.sourceCount) : ui.unverified}</p>
          <div className={styles.actions}>
            <button aria-pressed={selection?.kind === "entity" && selection.id === neighbor.id} onClick={() => onEntity(neighbor.id)}>{ui.selectExpand(neighbor.name)}</button>
            <button aria-pressed={selected} onClick={() => onClaim(claim.id)}><Icon name="book" />{ui.claimOpen}</button>
          </div>
        </li>;
      })}
    </ul>
    </AnimatedDetails>
  </section>;
}
