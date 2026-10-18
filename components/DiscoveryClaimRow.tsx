"use client";
import { useState } from "react";
import type { ClaimSummary, EntitySummary } from "../lib/domain/api";
import { useUiLocale } from "../lib/client/ui-locale";
import { formatPeriod, polarityLabel, qualificationLabel } from "../lib/client/format";
import { explorationLabels } from "../lib/i18n/exploration";
import DiscoveryPrototypeEvidence from "./DiscoveryPrototypeEvidence";
import Icon from "./Icon";
import styles from "./DiscoveryExplorer.module.css";
type GraphHref = (id: string, all?: boolean) => string;
export default function DiscoveryClaimRow({ claim, nodes, anchor, revision, onChoose, graphHref }: { claim: ClaimSummary; nodes: EntitySummary[]; anchor?: EntitySummary | null; revision: string; onChoose?: (entity: EntitySummary) => void; graphHref?: GraphHref }) {
  const { locale } = useUiLocale(), en = locale === "en";
  const [evidence, setEvidence] = useState(false);
  const subject = nodes.find(n => n.id === claim.subjectId) ?? (anchor?.id === claim.subjectId ? anchor : null);
  const object = nodes.find(n => n.id === claim.objectId) ?? (anchor?.id === claim.objectId ? anchor : null);
  const target = claim.subjectId === anchor?.id ? object : subject, qualification = qualificationLabel(claim, locale), scope = claim.contribution?.scope;
  return <article className={styles.claim} data-testid="prototype-claim" data-claim={claim.id}>
    <div className={styles.claimIdentity}><span className={styles.entityIdentity}><span className={styles.entityMark} data-kind={target?.kind}><Icon name={target?.kind === "person" ? "person" : target?.kind === "organization" ? "organization" : target?.kind === "event" ? "event" : "book"}/></span><strong>{anchor ? target?.name ?? (en ? "Unknown entity" : "対象未確認") : <>{subject?.name} → {object?.name}</>}</strong></span><span className={styles.polarity} data-denied={claim.polarity === "denied"}>{polarityLabel(claim, locale)}</span></div>
    <p className={styles.statement}>{subject?.name} → {explorationLabels(locale).predicates[claim.predicate]} → {object?.name}</p>
    <div className={styles.facts}>{qualification && <strong>{qualification}</strong>}<span>{formatPeriod(claim.period, locale)}</span><span>{en ? claim.sourceCount + " source(s)" : "出典 " + claim.sourceCount + "件"}</span></div>
    {claim.contribution && <p className={styles.scope}>{scope ? (scope.volumeLabel ?? (en ? "Volume unspecified" : "巻未確認")) + " · ISBN " + scope.isbn13 : en ? "Publication scope unstructured" : "刊行物の適用範囲は未構造化"}</p>}
    <div className={styles.rowActions}>{target && onChoose && <button onClick={() => onChoose(target)} aria-label={en ? "Change subject to " + target.name : "対象を" + target.name + "に変更"}><Icon name="arrow"/>{en ? "Explore" : "ここから探す"}</button>}<button className={styles.quiet} aria-expanded={evidence} onClick={() => setEvidence(v => !v)}>{evidence ? (en ? "Close evidence" : "根拠を閉じる") : (en ? "Read evidence" : "根拠を開く")} {evidence ? "−" : "＋"}</button>{graphHref && anchor && target && <a className={styles.graphLink} href={graphHref(target.id)} aria-label={en ? "Open " + target.name + " in Graph" : target.name + "をGraphで開く"}><Icon name="graph"/>Graph<Icon name="external"/></a>}{graphHref && !anchor && [subject, object].map(entity => entity && <a key={entity.id} className={styles.graphLink} href={graphHref(entity.id)} aria-label={en ? "Open " + entity.name + " in Graph" : entity.name + "をGraphで開く"}><Icon name="graph"/>Graph · {entity.name}<Icon name="external"/></a>)}</div>
    {evidence && <div className={styles.evidence}><DiscoveryPrototypeEvidence id={claim.id} revision={revision} nodes={anchor ? [anchor, ...nodes] : nodes}/></div>}
  </article>;
}
