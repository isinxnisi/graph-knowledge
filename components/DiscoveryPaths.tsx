"use client";
import { useMemo } from "react";
import { useUiLocale } from "../lib/client/ui-locale";
import { useDiscoveryPaths } from "../lib/client/use-discovery-paths";
import { discoveryExplorationHref } from "../lib/client/discovery-navigation";
import { discoveryPathHref } from "../lib/client/discovery-path-navigation";
import { pathKey, type PathUi } from "../lib/domain/discovery-paths";
import type { Predicate } from "../lib/domain/predicates";
import type { ContributionRoleId } from "../lib/domain/contribution";
import { contributionLabels } from "../lib/i18n/contribution";
import { explorationLabels } from "../lib/i18n/exploration";
import DiscoveryClaimRow from "./DiscoveryClaimRow";
import Icon from "./Icon";
import styles from "./DiscoveryExplorer.module.css";

export default function DiscoveryPaths({ anchorId,predicate,role,revision,ui,onChange,onRefresh,pageFilter }: {
  anchorId:string;predicate:Predicate|null;role:ContributionRoleId|null;revision:string;ui:PathUi;onChange:(value:PathUi)=>void;onRefresh:()=>void;pageFilter:boolean;
}) {
  const {locale}=useUiLocale(),en=locale==="en",t=(ja:string,eng:string)=>en?eng:ja;
  const conditions=useMemo(()=>({predicates:predicate?[predicate]:null,contributionRoles:role?[role]:null}),[predicate,role]);
  const query=useDiscoveryPaths(ui.open,anchorId,ui.depth,conditions,revision), result=query.result;
  const selected=result?.paths.find(p=>pathKey(p)===ui.selected), node=(id:string)=>result?.nodes.find(n=>n.id===id)?.name??id;
  return <section className={styles.paths} data-testid="discovery-paths" aria-label={t("複数段の探索","Multi-step discovery")}>
    <div className={styles.pathToolbar}><button className={styles.pathToggle} aria-expanded={ui.open} onClick={()=>onChange({...ui,open:!ui.open})}><Icon name="graph"/>{t("2〜3段先の接点", "Connections 2–3 steps away")} <span>{ui.open?"−":"＋"}</span></button>
    {ui.open&&<div role="group" aria-label={t("経路の段数","Path length")}>{([2,3] as const).map(depth=><button key={depth} aria-pressed={ui.depth===depth} onClick={()=>onChange({...ui,depth,selected:null})}>{t(depth+"段",depth+" steps")}</button>)}</div>}</div>
    {ui.open&&<div className={styles.pathContent}>
      <p className={styles.pathNote}>{t("同じ関係条件をすべての段に適用。複数の記録を辿る経路で、直接関係や因果関係の主張ではありません。","The same relation filters apply at every step. A route through records is not a direct or causal claim.")}</p>
      <p className={styles.pathNote}>{predicate?explorationLabels(locale).predicates[predicate]:t("すべての関係","All relations")}{role?" · "+contributionLabels(locale).roles[role]:""} · {t("両方向・肯否とも含む","Both directions and polarities")}{pageFilter&&t("。名前の絞込は一段目の表示だけに作用します。",". The name filter applies only to the one-step list.")}</p>
      {query.loading&&<p role="status">{t("経路を確認中…","Checking routes…")}</p>}
      {query.error&&<div role="alert"><p>{query.conflict?t("公開KGの版が変わりました。記録と経路を再取得してください。","The public KG changed. Refresh records and routes."):t("経路を取得できませんでした。再試行できます。","Could not load routes. You can retry.")}</p><button onClick={()=>{onRefresh();query.retry();}}>{t("記録と経路を再取得","Refresh records and routes")}</button></div>}
      {result&&<>
        <ol className={styles.pathOptions} aria-label={t("見つかった経路","Found routes")}>{result.paths.map(path=><li key={pathKey(path)}><button aria-pressed={ui.selected===pathKey(path)} onClick={()=>onChange({...ui,selected:ui.selected===pathKey(path)?null:pathKey(path)})}><span>{path.nodeIds.map(node).join(" — ")}</span><small>{t(path.claimIds.length+"段",path.claimIds.length+" steps")}</small></button></li>)}</ol>
        {!result.paths.length&&<p role="status">{result.scan.reasons.length?t("取得上限内では経路を確認できませんでした。未取得の記録があり、経路がないとは断定できません。","No route found within these limits. Unread records remain; this is not proof that no route exists."):t("この公開版・関係条件では指定段数の循環しない経路はありません。","No non-cyclic route of this length exists for these filters in this public revision.")}</p>}
        <p className={styles.pathNote} data-testid="path-coverage">{result.scan.reasons.length?t("一部の範囲です。","Partial coverage. "):t("この段数・条件の取得を完了。","Complete for this length and these filters. ")}{t("各対象20記録・最大24対象・候補12件まで。", "Up to 20 records per entity, 24 expanded entities and 12 routes.")}{t("今回 "+result.scan.expanded+"対象を確認。", " Checked "+result.scan.expanded+" entities.")}</p>
        {ui.selected&&!selected&&<p role="status">{t("選択した経路は現在の取得範囲にありません。別の候補を選べます。","The selected route is not in this result. Choose another candidate.")}</p>}
        {selected&&<div className={styles.pathDetail} data-testid="discovery-path-detail">
          <div className={styles.pathToolbar}><strong>{selected.nodeIds.map(node).join(" — ")}</strong><button onClick={()=>onChange({...ui,selected:null})}>{t("経路の選択を解除","Clear route selection")}</button></div>
          {selected.claimIds.map((ids,i)=><section key={i} className={styles.pathStep} aria-label={t((i+1)+"段目", "Step "+(i+1))}><h4>{node(selected.nodeIds[i])} → {node(selected.nodeIds[i+1])}</h4><p className={styles.pathNote}>{t("辿る順番です。下の矢印は各Claimの正規方向です。","Traversal order above; arrows below show each Claim's canonical direction.")}{ids.length>1&&t(" 同じ2対象の独立した記録を併記します。"," Parallel Claims remain separate records.")}</p>{ids.map(id=><DiscoveryClaimRow key={id} claim={result.claims.find(c=>c.id===id)!} nodes={result.nodes} revision={revision} graphHref={id=>(en?"/en":"")+discoveryExplorationHref("public-kg",id,conditions.predicates,conditions.contributionRoles)}/>)}</section>)}
          <a className={styles.graphLaunch} data-testid="path-graph" href={(en?"/en":"")+discoveryPathHref(selected,conditions,revision)}><Icon name="graph"/>{t("この経路をGraphで開く","Open this route in Graph")}<Icon name="external"/></a>
          <p className={styles.pathNote}>{t("経路を含む枝を開きます。各対象の最初20記録も表示します。公開版と各段の記録を再確認してから開きます。","Opens branches containing this route, including the first 20 records per entity. The public revision and each step are checked again.")}</p>
        </div>}
      </>}
    </div>}
  </section>;
}
