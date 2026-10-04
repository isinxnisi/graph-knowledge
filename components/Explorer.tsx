"use client";
import { entryLabels } from "../lib/i18n/exploration-entry";
import { contributionLabels } from "../lib/i18n/contribution";

import type { DatasetMode } from "../lib/domain/dataset";
import { datasetLabels } from "../lib/i18n/dataset";
import { useState } from "react";
import { displayRelations, entityLabel } from "../lib/client/graph-presentation";
import { relationLabel } from "../lib/client/format";
import { useGraphExplorer } from "../lib/client/use-graph-explorer";
import RelationFilter from "./RelationFilter";
import SearchPanel from "./SearchPanel";
import GraphCanvas from "./GraphCanvas";
import RelationsList from "./RelationsList";
import EntityDetails from "./EntityDetails";
import ClaimDetails from "./ClaimDetails";
import styles from "./Explorer.module.css";

export default function Explorer({ dataset = "demo" }: { dataset?: DatasetMode }) {
  const labels = datasetLabels(dataset);
  const entry = entryLabels();
  const [detailWide, setDetailWide] = useState(false);
  const [dark, setDark] = useState(false);
  const [darkPalette, setDarkPalette] = useState<"brown" | "blue">("brown");
  const { graph, selection, changePredicates, chooseRoot, selectEntity, selectClaim, selectRelation, expand, close, toggleEntity } = useGraphExplorer();
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
      <h1>関係性を探索する</h1><p className={styles.demo}>{labels.badge}</p>
      <p>{labels.description}</p>
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
    <main className={`${styles.columns} ${detailWide ? styles.wideDetails : ""}`}>
      <div className={styles.panel}><SearchPanel placeholder={labels.searchExample} onChoose={chooseRoot} /></div>
      <section className={`${styles.panel} ${styles.graphPanel}`} aria-labelledby="graph-title">
        <div className={styles.graphHeading}><h2 id="graph-title">Graph</h2>
          <p data-testid="graph-counts">Entity {Object.keys(graph.nodes).length} / Claim {Object.keys(graph.claims).length}</p><p data-testid="relation-counts">Relation {Object.keys(relations).length}</p>
        </div>
        <p className={styles.rootLabel} data-testid="exploration-root">{entry.root}：{graph.centerId ? graph.nodes[graph.centerId]?.name : entry.rootEmpty}</p>
        <RelationFilter roles={graph.contributionRoles ?? null} value={graph.predicates} onApply={changePredicates} />
        {graph.centerId ? <p className={styles.muted}>{entry.selectedHelp}</p> : <div className={styles.empty}><h3>{entry.initialTitle}</h3><p>{entry.initialHelp}</p></div>}
        <div className={`${styles.feedback} ${!graph.centerId ? styles.initialFeedback : ""}`} aria-live="polite"><p data-testid="selection-status">選択中：{selectionText}</p><p>{loading ? `Graphを取得中…（${loading}件）` : selectedEntity ? graph.expansions[selectedEntity.id]?.expanded ? "近傍は展開済みです。" : graph.expansions[selectedEntity.id]?.pages.length ? "展開は閉じています。クリックで取得済みの枝を復元します。" : "クリックで一段階展開します。" : "線ごとに同じ関係の主張をまとめて表示しています。"}</p></div>
        {Object.values(graph.expansions).some((meta) => meta.active && meta.hasMore) && <p className={styles.muted}>Graphの関係表示は取得済みの主張に基づきます。続きは各Entityの詳細から取得できます。</p>}
        {graph.notice && <p role="status">{graph.notice}</p>}
        {blocked && <p role="alert" className={styles.error}>{blocked.error}</p>}
        {Object.values(graph.claims).some((claim) => claim.contribution?.roleId) && <p className={styles.muted}>{contributionLabels().partial}</p>}
        <GraphCanvas graph={graph} selection={selection} onEntity={selectEntity} onRelation={selectRelation} onToggleEntity={toggleEntity} />
        <RelationsList dataset={dataset} graph={graph} selection={selection} onEntity={selectEntity} onClaim={selectClaim} onExpand={(id) => void expand(id)} onClose={close} />
      </section>
      <aside className={styles.panel} aria-labelledby="detail-title">
        <div className={styles.detailHeading}><h2 id="detail-title">詳細</h2>{selection && <button aria-pressed={detailWide} onClick={() => setDetailWide(!detailWide)}>{detailWide ? entry.detailNormal : entry.detailWide}</button>}</div>
        {!selection && <p className={styles.muted}>{entry.detailHelp}</p>}
        {selectedEntity && <EntityDetails key={key} entity={selectedEntity} expansion={graph.expansions[selectedEntity.id]} onExpand={(more) => void expand(selectedEntity.id, more)} onClose={() => close(selectedEntity.id)} />}
        {selectedRelation && <ClaimDetails key={`${key}:${selectedRelation.claimIds[0]}`} id={selectedRelation.claimIds[0]} nodes={graph.nodes} mode="relation" visibleClaimIds={selectedRelation.claimIds} roles={graph.contributionRoles ?? null} predicates={graph.predicates} />}
        {selection?.kind === "claim" && <ClaimDetails key={key} id={selection.id} nodes={graph.nodes} roles={graph.contributionRoles ?? null} predicates={graph.predicates} />}
      </aside>
    </main>
  </div>;
}
