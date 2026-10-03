"use client";

import { useState } from "react";
import { displayRelations, entityLabel } from "../lib/client/graph-presentation";
import { relationLabel } from "../lib/client/format";
import { useGraphExplorer } from "../lib/client/use-graph-explorer";
import SearchPanel from "./SearchPanel";
import GraphCanvas from "./GraphCanvas";
import RelationsList from "./RelationsList";
import EntityDetails from "./EntityDetails";
import ClaimDetails from "./ClaimDetails";
import styles from "./Explorer.module.css";

export default function Explorer() {
  const [dark, setDark] = useState(false);
  const [darkPalette, setDarkPalette] = useState<"brown" | "blue">("brown");
  const { graph, selection, chooseRoot, selectEntity, selectClaim, selectRelation, expand } = useGraphExplorer();
  const relations = displayRelations(graph.claims);
  const selectedRelation = selection?.kind === "relation" ? relations[selection.id] : null;
  const selectedEntity = selection?.kind === "entity" ? graph.nodes[selection.id] : null;
  const selectedClaim = selection?.kind === "claim" ? graph.claims[selection.id] : null;
  const selectionText = selectedEntity ? entityLabel(selectedEntity, graph.nodes).replace("\n", " / ") : selectedClaim ? `${graph.nodes[selectedClaim.subjectId]?.name} → ${relationLabel(selectedClaim)} → ${graph.nodes[selectedClaim.objectId]?.name}` : selectedRelation ? `${graph.nodes[selectedRelation.subjectId]?.name} → ${selectedRelation.label.replace("\n", " / ")} → ${graph.nodes[selectedRelation.objectId]?.name}` : "未選択";
  const key = `${graph.generation}:${selection?.kind}:${selection?.id}`;
  const loading = Object.values(graph.expansions).filter((meta) => meta.loading).length;
  const blocked = Object.values(graph.expansions).find((meta) => meta.blocked);
  return <div className={styles.explorer}>
    <header className={styles.header}>
      <h1>関係性を探索する</h1><p className={styles.demo}>架空のデモデータ</p>
      <p>人物・作品・組織のつながりを、主張と出典から辿る。</p>
      <button className={styles.themeToggle} aria-label="ダークモード" aria-pressed={dark} onClick={() => {
        const next = !dark; setDark(next);
        document.documentElement.dataset.theme = next ? `dark-${darkPalette}` : "light";
      }}>{dark ? "ライトモードへ" : "ダークモードへ"}</button>
      {dark && <label className={styles.themePalette}>ダーク配色
        <select value={darkPalette} onChange={(event) => {
          const palette = event.target.value === "blue" ? "blue" : "brown";
          setDarkPalette(palette); document.documentElement.dataset.theme = `dark-${palette}`;
        }}><option value="brown">ブラウン</option><option value="blue">ブルー</option></select>
      </label>}
    </header>
    <main className={styles.columns}>
      <SearchPanel onChoose={chooseRoot} />
      <section className={`${styles.panel} ${styles.graphPanel}`} aria-labelledby="graph-title">
        <div className={styles.graphHeading}><h2 id="graph-title">Graph</h2>
          <p data-testid="graph-counts">Entity {Object.keys(graph.nodes).length} / Claim {Object.keys(graph.claims).length}</p><p data-testid="relation-counts">Relation {Object.keys(relations).length}</p>
        </div>
        <p className={styles.muted}>Nodeをクリックして一段階展開、線をクリックして主張と出典を確認。</p>
        {!graph.centerId && <p className={styles.empty}>左の検索結果から中心となる人物を選んでください。</p>}
        <div className={styles.feedback} aria-live="polite"><p data-testid="selection-status">選択中：{selectionText}</p><p>{loading ? `Graphを取得中…（${loading}件）` : selectedEntity ? graph.expansions[selectedEntity.id]?.expanded ? "近傍は展開済みです。" : "クリックで一段階展開します。" : "線ごとに同じ関係の主張をまとめて表示しています。"}</p></div>
        {Object.values(graph.expansions).some((meta) => meta.hasMore) && <p className={styles.muted}>Graphの関係表示は取得済みの主張に基づきます。続きは各Entityの詳細から取得できます。</p>}
        {blocked && <p role="alert" className={styles.error}>{blocked.error}</p>}
        <GraphCanvas graph={graph} selection={selection} onEntity={selectEntity} onRelation={selectRelation} />
        <RelationsList graph={graph} selection={selection} onEntity={selectEntity} onClaim={selectClaim} />
      </section>
      <aside className={styles.panel} aria-labelledby="detail-title">
        <h2 id="detail-title">詳細</h2>
        {!selection && <p className={styles.muted}>人物、作品、組織、または関係の線を選んでください。</p>}
        {selectedEntity && <EntityDetails key={key} entity={selectedEntity} expansion={graph.expansions[selectedEntity.id]} onExpand={(more) => void expand(selectedEntity.id, more)} />}
        {selectedRelation && <ClaimDetails key={`${key}:${selectedRelation.claimIds[0]}`} id={selectedRelation.claimIds[0]} nodes={graph.nodes} mode="relation" />}
        {selection?.kind === "claim" && <ClaimDetails key={key} id={selection.id} nodes={graph.nodes} />}
      </aside>
    </main>
  </div>;
}
