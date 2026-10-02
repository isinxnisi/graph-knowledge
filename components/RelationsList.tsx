import type { GraphState, Selection } from "../lib/client/graph-state";
import { formatPeriod, polarityLabel, relationLabel } from "../lib/client/format";
import styles from "./Explorer.module.css";

export default function RelationsList({ graph, selection, onEntity, onClaim }: {
  graph: GraphState; selection: Selection; onEntity: (id: string) => void; onClaim: (id: string) => void;
}) {
  const entity = selection?.kind === "entity" ? graph.nodes[selection.id] : null;
  if (!entity) return <p className={styles.muted}>Nodeを選ぶと、そのEntityの隣接関係をテキストで確認できます。</p>;
  const claims = Object.values(graph.claims).filter((claim) => claim.subjectId === entity.id || claim.objectId === entity.id);
  const expansion = graph.expansions[entity.id];
  return <section className={styles.relations} aria-label="選択Entityの隣接関係">
    <h3>{entity.name}の隣接関係</h3>
    {!claims.length && <p role="status">{expansion?.error ? "隣接関係を取得できませんでした。詳細ペインを確認してください。" : expansion?.expanded ? "関係は登録されていません（孤立Entity）。" : "隣接関係を取得しています。"}</p>}
    <ul className={styles.relationList}>
      {claims.map((claim) => {
        const neighbor = graph.nodes[claim.subjectId === entity.id ? claim.objectId : claim.subjectId];
        return <li key={claim.id} data-testid={`relation-${claim.id}`}>
          <p>{graph.nodes[claim.subjectId]?.name} → {relationLabel(claim)} → {graph.nodes[claim.objectId]?.name}</p>
          <p className={styles.muted}>{polarityLabel(claim)} · {formatPeriod(claim.period)} · {claim.sourceCount ? `出典 ${claim.sourceCount}件` : "出典未確認"}</p>
          <div className={styles.actions}>
            <button onClick={() => onEntity(neighbor.id)}>{neighbor.name}を選択・展開</button>
            <button onClick={() => onClaim(claim.id)}>主張と出典を見る</button>
          </div>
        </li>;
      })}
    </ul>
  </section>;
}
