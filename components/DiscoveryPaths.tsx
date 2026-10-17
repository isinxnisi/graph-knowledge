"use client";
import { useMemo } from "react";
import { useUiLocale } from "../lib/client/ui-locale";
import { useDiscoveryPaths } from "../lib/client/use-discovery-paths";
import { discoveryExplorationHref } from "../lib/client/discovery-navigation";
import { discoveryPathHref } from "../lib/client/discovery-path-navigation";
import { pathPresets, resolvePathPreset, type PathPresetRef } from "../lib/domain/discovery-path-presets";
import { pathKey, PATH_LIMITS, type PathUi } from "../lib/domain/discovery-paths";
import type { EntitySummary } from "../lib/domain/api";
import type { Predicate } from "../lib/domain/predicates";
import type { ContributionRoleId } from "../lib/domain/contribution";
import { contributionLabels } from "../lib/i18n/contribution";
import { explorationLabels } from "../lib/i18n/exploration";
import DiscoveryClaimRow from "./DiscoveryClaimRow";
import Icon from "./Icon";
import styles from "./DiscoveryExplorer.module.css";

export default function DiscoveryPaths({ anchor, anchorId, predicate, role, revision, ui, onChange, onPreset, onRefresh, pageFilter }: {
  anchor: EntitySummary; anchorId: string; predicate: Predicate | null; role: ContributionRoleId | null; revision: string;
  ui: PathUi; onChange: (value: PathUi) => void; onPreset: (value: PathPresetRef) => void; onRefresh: () => void; pageFilter: boolean;
}) {
  const { locale }=useUiLocale(), en=locale==="en", t=(ja:string,eng:string)=>en?eng:ja;
  const conditions=useMemo(()=>({predicates:predicate?[predicate]:null,contributionRoles:role?[role]:null}),[predicate,role]);
  const preset=ui.preset ?? null, template=preset ? resolvePathPreset(preset) : null;
  const query=useDiscoveryPaths(ui.open,anchorId,ui.depth,conditions,revision,preset), result=query.result;
  const selected=result?.paths.find(p=>pathKey(p)===ui.selected), node=(id:string)=>result?.nodes.find(n=>n.id===id)?.name??id;
  const choices=pathPresets.filter(p=>p.kinds[0]===anchor.kind);
  const partialReasons=result?.scan.reasons.map(reason=>({
    neighbors:t("一部の対象に未取得の記録があります。","Some entities have unread records."),
    expansions:t("確認する対象数の上限に達しました。","The entity scan limit was reached."),
    prefixes:t("途中の経路数を制限しています。","Intermediate routes were capped."),
    results:t("候補の表示は12経路までです。","The candidate list is capped at 12 routes."),
  })[reason]).join(" ");
  return <section className={styles.paths} data-testid="discovery-paths" aria-label={t("複数段の探索","Multi-step discovery")}>
    {!!choices.length&&<div className={styles.pathPresets} role="group" aria-label={t("接点の見つけ方","Ways to discover")}>
      <span>{t("見つけ方", "Try a discovery")}</span>
      {choices.map(choice=><button key={choice.id} data-path-preset={choice.id} aria-pressed={preset?.id===choice.id}
        title={choice.purpose[en?1:0]} onClick={()=>onPreset({id:choice.id,revision:choice.revision})}>
        {choice.title[en?1:0]}<Icon name="arrow"/>
        {role&&choice.predicate!=="CONTRIBUTED_TO"&&<small>{t("所属へ変更・制作役割を解除", "Switch to affiliation; remove production role")}</small>}
      </button>)}
    </div>}
    <div className={styles.pathToolbar}>
      <button className={styles.pathToggle} aria-expanded={ui.open} onClick={()=>onChange({...ui,open:!ui.open})}>
        <Icon name="graph"/>{t("2〜3段先の接点", "Connections 2–3 steps away")} <span>{ui.open?"−":"＋"}</span>
      </button>
      {ui.open&&<div role="group" aria-label={t("経路の段数","Path length")}>
        {([2,3] as const).map(depth=><button key={depth} aria-pressed={ui.depth===depth}
          onClick={()=>{if(depth!==ui.depth)onChange({...ui,depth,selected:null,preset:null,changed:!!preset||ui.changed});}}>{t(depth+"段",depth+" steps")}</button>)}
      </div>}
    </div>
    {ui.open&&<div className={styles.pathContent}>
      {template?<div className={styles.pathPurpose} data-testid="path-purpose">
        <div><strong>{template.title[en?1:0]}</strong><button onClick={()=>onChange({...ui,preset:null,selected:null,changed:true})}>{t("探し方だけ解除", "Remove only preset")}</button></div>
        <p>{anchor.name}{t("から。", ": ")}{template.purpose[en?1:0]}</p><small>{template.shape[en?1:0]}</small>
      </div>:<p className={styles.pathNote}>{ui.changed?t("探し方の制約を外して自由に探索中。下の関係・役割・段数で経路を探します。","Exploring freely after changing the preset. Routes use the relation, role and length shown below."):t("関係と段数を自由に選んで探索できます。", "Explore freely using relation filters and path length.")}</p>}
      <p className={styles.pathNote}>{predicate?explorationLabels(locale).predicates[predicate]:t("すべての関係","All relations")}{role?" · "+contributionLabels(locale).roles[role]:""} · {t("全段に適用・両方向・肯否とも含む","At every step · both directions and polarities")}{pageFilter&&t("。名前の絞込は一段目の表示だけに作用します。",". The name filter applies only to the one-step list.")}</p>
      <p className={styles.pathNote}>{t("経路は記録のつながりです。両端の直接関係・因果を示しません。","A route links records, not a direct or causal relation between its endpoints.")}</p>
      {query.loading&&<p role="status">{t("経路を確認中…","Checking routes…")}</p>}
      {query.error&&<div role="alert"><p>{query.conflict?t("公開KGの版が変わりました。記録と経路を再取得してください。","The public KG changed. Refresh records and routes."):t("経路を取得できませんでした。再試行できます。","Could not load routes. You can retry.")}</p><button onClick={()=>{onRefresh();query.retry();}}>{t("記録と経路を再取得","Refresh records and routes")}</button></div>}
      {result&&<>
        <div className={styles.pathCoverage} data-testid="path-coverage" data-partial={!!result.scan.reasons.length} role="status">
          <strong>{result.paths.length}{t("経路", " routes")} · {result.scan.reasons.length?t("取得上限内の一部", "A limited selection"):t("この条件の全候補", "All candidates for these criteria")}</strong>
          <span>{result.scan.reasons.length?partialReasons:t("この対象・段数・条件の公開経路です（循環なし）。","All non-cyclic public routes for this subject and these criteria.")}</span>
          {!!result.scan.reasons.length&&<small>{t(`各対象${PATH_LIMITS.neighbors}記録・最大${PATH_LIMITS.expansions}対象・候補${PATH_LIMITS.results}経路まで。`,`Up to ${PATH_LIMITS.neighbors} records per entity, ${PATH_LIMITS.expansions} expanded entities and ${PATH_LIMITS.results} routes.`)}{t(`今回${result.scan.expanded}対象を確認。`,` Checked ${result.scan.expanded} entities.`)}</small>}
        </div>
        <ol className={styles.pathOptions} aria-label={t("見つかった経路","Found routes")}>{result.paths.map(path=><li key={pathKey(path)}><button aria-pressed={ui.selected===pathKey(path)} onClick={()=>onChange({...ui,selected:ui.selected===pathKey(path)?null:pathKey(path)})}><span>{path.nodeIds.map(node).join(" — ")}</span><small>{t(path.claimIds.length+"段",path.claimIds.length+" steps")}</small></button></li>)}</ol>
        {!result.paths.length&&<p>{result.scan.reasons.length?t("取得範囲では見つかりませんでした。未取得の記録があるため、経路がないとは断定できません。","None found in the scanned range. Unread records remain; this is not proof that no route exists."):t("この条件の経路はありません。対象・関係・役割・段数を変更して探せます。","No routes match these criteria. Try another subject, relation, role or length.")}</p>}
        {ui.selected&&!selected&&<p role="status">{t("選択した経路は現在の取得範囲にありません。別の候補を選べます。","The selected route is not in this result. Choose another candidate.")}</p>}
        {selected&&<div className={styles.pathDetail} data-testid="discovery-path-detail">
          <div className={styles.pathToolbar}><strong>{selected.nodeIds.map(node).join(" — ")}</strong><div>
            <button onClick={()=>onChange({...ui,selected:null})}>{t("経路の選択を解除","Clear route selection")}</button>
            <a className={styles.graphLaunch} data-testid="path-graph" href={(en?"/en":"")+discoveryPathHref(selected,conditions,revision)}><Icon name="graph"/>{t("この経路をGraphで開く","Open this route in Graph")}<Icon name="external"/></a>
          </div></div>
          <p className={styles.pathNote}>{t("経路を含む枝を開きます。各対象の最初20記録も表示します。公開版と各段の記録を再確認してから開きます。","Opens branches containing this route, including the first 20 records per entity. The public revision and each step are checked again.")}</p>
          {selected.claimIds.map((ids,i)=><section key={i} className={styles.pathStep} aria-label={t((i+1)+"段目", "Step "+(i+1))}><h4>{node(selected.nodeIds[i])} — {node(selected.nodeIds[i+1])}</h4><p className={styles.pathNote}>{t("辿る順番です。下の矢印は各Claimの正規方向です。","Traversal order above; arrows below show each Claim's canonical direction.")}{ids.length>1&&t(" 同じ2対象の独立した記録を併記します。"," Parallel Claims remain separate records.")}</p>{ids.map(id=><DiscoveryClaimRow key={id} claim={result.claims.find(c=>c.id===id)!} nodes={result.nodes} revision={revision} graphHref={id=>(en?"/en":"")+discoveryExplorationHref("public-kg",id,conditions.predicates,conditions.contributionRoles)}/>)}</section>)}
        </div>}
      </>}
    </div>}
  </section>;
}
