"use client";
import type { PathWitness } from "../lib/domain/discovery-paths";
import type { GraphState } from "../lib/client/graph-state";
import { useUiLocale } from "../lib/client/ui-locale";
import { polarityLabel, qualificationLabel } from "../lib/client/format";
import { explorationLabels } from "../lib/i18n/exploration";
import styles from "./Explorer.module.css";

// Keep the chosen route distinct from Graph's independently computed shortest path.
export default function DiscoveryGraphRoute({ path, graph, onClaim, onClear }: {
  path: PathWitness; graph: GraphState; onClaim: (id: string) => void; onClear: () => void;
}) {
  const { locale } = useUiLocale(), en = locale === "en";
  if (path.revision !== graph.revision || path.nodeIds[0] !== graph.centerId || path.nodeIds.some(id => !graph.nodes[id])
    || path.claimIds.flat().some(id => !graph.claims[id])) return null;
  return <section className={styles.discoveryRoute} data-testid="graph-discovery-route">
    <div><strong>{en ? "Route chosen in Discovery" : "Discoveryで選んだ経路"}</strong><button onClick={onClear}>{en ? "Clear route" : "経路表示を解除"}</button></div>
    <p className={styles.muted}>{en ? "A route through separate records, not a direct or causal claim. Read each record below." : "独立した記録を辿る経路です。直接関係・因果関係を意味しません。各記録から根拠を確認できます。"}</p>
    <ol>{path.claimIds.map((ids,i)=><li key={i}><p>{graph.nodes[path.nodeIds[i]].name} — {graph.nodes[path.nodeIds[i+1]].name}</p>{ids.map(id=>{
      const c=graph.claims[id];return <button key={id} onClick={()=>onClaim(id)}>{graph.nodes[c.subjectId].name} → {explorationLabels(locale).predicates[c.predicate]} → {graph.nodes[c.objectId].name}<small>{polarityLabel(c,locale)} · {qualificationLabel(c,locale) || (en?"No role limitation":"役割の限定なし")} · {en?"Read evidence":"根拠を読む"}</small></button>;
    })}</li>)}</ol>
  </section>;
}
