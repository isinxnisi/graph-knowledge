"use client";

import { entityLabel } from "../lib/client/graph-presentation";
import { relationLabel } from "../lib/client/format";
import { useGraphExplorer } from "../lib/client/use-graph-explorer";
import SearchPanel from "./SearchPanel";
import GraphCanvas from "./GraphCanvas";
import RelationsList from "./RelationsList";
import EntityDetails from "./EntityDetails";
import ClaimDetails from "./ClaimDetails";
import styles from "./Explorer.module.css";

export default function Explorer() {
  const { graph, selection, chooseRoot, selectEntity, selectClaim, expand } = useGraphExplorer();
  const selectedEntity = selection?.kind === "entity" ? graph.nodes[selection.id] : null;
  const selectedClaim = selection?.kind === "claim" ? graph.claims[selection.id] : null;
  const selectionText = selectedEntity ? entityLabel(selectedEntity, graph.nodes).replace("\n", " / ") : selectedClaim ? `${graph.nodes[selectedClaim.subjectId]?.name} → ${relationLabel(selectedClaim)} → ${graph.nodes[selectedClaim.objectId]?.name}` : "未選択";
  const key = `${graph.generation}:${selection?.kind}:${selection?.id}`;
  const loading = Object.values(graph.expansions).filter((meta) => meta.loading).length;
  const blocked = Object.values(graph.expansions).find((meta) => meta.blocked);
  return <div className={styles.explorer}>
    <header className={styles.header}>
      <h1>関係性を探索する</h1><p className={styles.demo}>架空のデモデータ</p>
      <p>人物・作品・組織のつながりを、主張と出典から辿る。</p>
    </header>
    <main className={styles.columns}>
      <SearchPanel onChoose={chooseRoot} />
      <section className={`${styles.panel} ${styles.graphPanel}`} aria-labelledby="graph-title">
        <div className={styles.graphHeading}><h2 id="graph-title">Graph</h2>
          <p data-testid="graph-counts">Entity {Object.keys(graph.nodes).length} / Claim {Object.keys(graph.claims).length}</p>
        </div>
        <p className={styles.muted}>Nodeをクリックして一段階展開、線をクリックして主張と出典を確認。</p>
        {!graph.centerId && <p className={styles.empty}>左の検索結果から中心となる人物を選んでください。</p>}
        <div className={styles.feedback} aria-live="polite"><p data-testid="selection-status">選択中：{selectionText}</p><p>{loading ? `Graphを取得中…（${loading}件）` : selectedEntity ? graph.expansions[selectedEntity.id]?.expanded ? "近傍は展開済みです。" : "クリックで一段階展開します。" : "線ごとに一つの主張を表示しています。"}</p></div>
        {blocked && <p role="alert" className={styles.error}>{blocked.error}</p>}
        <GraphCanvas graph={graph} selection={selection} onEntity={selectEntity} onClaim={selectClaim} />
        <RelationsList graph={graph} selection={selection} onEntity={selectEntity} onClaim={selectClaim} />
      </section>
      <aside className={styles.panel} aria-labelledby="detail-title">
        <h2 id="detail-title">詳細</h2>
        {!selection && <p className={styles.muted}>人物、作品、組織、または関係の線を選んでください。</p>}
        {selectedEntity && <EntityDetails key={key} entity={selectedEntity} expansion={graph.expansions[selectedEntity.id]} onExpand={(more) => void expand(selectedEntity.id, more)} />}
        {selection?.kind === "claim" && <ClaimDetails key={key} id={selection.id} nodes={graph.nodes} />}
      </aside>
    </main>
  </div>;
}
