import type { DatasetMode } from "../lib/domain/dataset";
import { datasetLabels } from "../lib/i18n/dataset";
import { explorationLabels } from "../lib/i18n/exploration";
import type { GraphState, Selection } from "../lib/client/graph-state";
import { displayRelations, entityLabel, relationId } from "../lib/client/graph-presentation";
import { formatPeriod, polarityLabel, relationLabel, qualificationLabel } from "../lib/client/format";
import styles from "./Explorer.module.css";

export default function RelationsList({ graph, selection, onEntity, onClaim, onExpand, onClose, dataset = "demo" }: {
  dataset?: DatasetMode;
  graph: GraphState; selection: Selection; onEntity: (id: string) => void; onClaim: (id: string) => void; onExpand: (id: string) => void; onClose: (id: string) => void;
}) {
  const relation = selection?.kind === "relation" ? displayRelations(graph.claims)[selection.id] : null;
  const entityId = selection?.kind === "entity" ? selection.id : selection?.kind === "claim" ? graph.claims[selection.id]?.subjectId : relation?.subjectId ?? null;
  const entity = entityId ? graph.nodes[entityId] : null;
  if (!entity) return <p className={styles.muted}>Nodeを選ぶと、そのEntityの隣接関係をテキストで確認できます。</p>;
  const claims = Object.values(graph.claims).filter((claim) => claim.subjectId === entity.id || claim.objectId === entity.id);
  const expansion = graph.expansions[entity.id];
  return <section className={styles.relations} aria-label="選択Entityの隣接関係">
    <h3>{entity.name}の隣接関係</h3>
    <div className={styles.actions}>{expansion?.open ? <button onClick={() => onClose(entity.id)}>展開を閉じる</button> : <button onClick={() => onExpand(entity.id)}>{expansion?.pages.length ? "展開を再開" : "近傍を展開"}</button>}</div>
    {!claims.length && <p role="status">{expansion?.error ? "隣接関係を取得できませんでした。詳細ペインを確認してください。" : expansion?.expanded && expansion.pages.every((page) => !page.claimIds.length) && !expansion.hasMore ? graph.predicates === null && graph.contributionRoles === null && graph.organizationPositions === null ? datasetLabels(dataset).empty : explorationLabels().empty : !expansion?.open ? "展開は閉じています。再開すると取得済みの枝を復元します。" : expansion.loading ? "隣接関係を取得しています。" : "表示中の隣接関係はありません。"}</p>}
    <ul className={styles.relationList}>
      {claims.map((claim) => {
        const neighbor = graph.nodes[claim.subjectId === entity.id ? claim.objectId : claim.subjectId];
        const selected = (selection?.kind === "claim" && selection.id === claim.id) || (selection?.kind === "relation" && selection.id === relationId(claim));
        return <li key={claim.id} className={selected ? styles.selectedRelation : undefined} data-testid={`relation-${claim.id}`}>
          <p>{entityLabel(graph.nodes[claim.subjectId], graph.nodes).replace("\n", " / ")} → {relationLabel(claim)} → {entityLabel(graph.nodes[claim.objectId], graph.nodes).replace("\n", " / ")}</p>
          <p className={styles.muted}>{polarityLabel(claim)} · {qualificationLabel(claim) && `${qualificationLabel(claim)} · `}{formatPeriod(claim.period)} · {claim.sourceCount ? `出典 ${claim.sourceCount}件` : "出典未確認"}</p>
          <div className={styles.actions}>
            <button aria-pressed={selection?.kind === "entity" && selection.id === neighbor.id} onClick={() => onEntity(neighbor.id)}>{neighbor.name}を選択・展開</button>
            <button aria-pressed={selected} onClick={() => onClaim(claim.id)}>主張と出典を見る</button>
          </div>
        </li>;
      })}
    </ul>
  </section>;
}
