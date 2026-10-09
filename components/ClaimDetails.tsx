"use client";
import type { DatasetMode } from "../lib/domain/dataset";
import ReadingLink from "./ReadingLink";
import { eventParticipationOf } from "../lib/domain/event-participation";
import { eventParticipationLabels } from "../lib/i18n/event-participation";
import { organizationParticipationOf } from "../lib/domain/organization-participation";
import { organizationParticipationLabels } from "../lib/i18n/organization-participation";
import { claimComparisonKey } from "../lib/domain/qualifications";
import { contributionOf, comparisonCategory } from "../lib/domain/contribution";
import { contributionLabels } from "../lib/i18n/contribution";

import { matchesClaim, type EventRoleFilter, type OrganizationPositionFilter, type ContributionRoleFilter, type PredicateFilter } from "../lib/domain/exploration";
import { explorationLabels } from "../lib/i18n/exploration";
import { useClaimDetails } from "../lib/client/use-claim-details";
import type { ClaimDetail, ClaimSummary, EntitySummary, SourceDetail } from "../lib/domain/api";
import { formatDate, formatPeriod, polarityLabel } from "../lib/client/format";
import { entityLabel } from "../lib/client/graph-presentation";
import { PREDICATES } from "../lib/domain/predicates";
import RelationOverview from "./RelationOverview";
import { relationPresentationLabels } from "../lib/i18n/relation-presentation";
import styles from "./Explorer.module.css";

const SOURCE_KINDS = { book: "書籍", interview: "インタビュー", magazine: "雑誌", web: "ウェブ", paper: "論文" };
function usableUrl(source: SourceDetail): boolean {
  if (!source.url || source.isDemo) return false;
  try { const url = new URL(source.url); return ["http:", "https:"].includes(url.protocol) && !url.hostname.endsWith(".invalid"); }
  catch { return false; }
}

export function ClaimCard({ claim, nodes, title, dataset, idPrefix = "" }: { dataset?: DatasetMode; idPrefix?: string; claim: ClaimDetail; nodes: Record<string, EntitySummary>; title: string }) {
  const text = relationPresentationLabels();
  const eventParticipation = eventParticipationOf(claim), eventText = eventParticipationLabels();
  const position = organizationParticipationOf(claim);
  const positionText = organizationParticipationLabels();
  const contribution = contributionOf(claim);
  const roleText = contributionLabels();
  return <article id={`${idPrefix}claim-${claim.id}`} tabIndex={-1} className={styles.claimCard} data-testid={`claim-card-${claim.id}`}>
    <h4>{title}</h4>
    {dataset && <p><ReadingLink reference={{ kind: "claim", dataset, id: claim.id }} /></p>}
    <span className={styles.muted}>関係についての主張</span>
    <p><strong>{nodes[claim.subjectId] ? entityLabel(nodes[claim.subjectId], nodes).replace("\n", " / ") : "主体"} → {PREDICATES[claim.predicate].label} → {nodes[claim.objectId] ? entityLabel(nodes[claim.objectId], nodes).replace("\n", " / ") : "対象"}</strong></p>
    <p className={claim.polarity === "denied" ? styles.denied : styles.badge}>{polarityLabel(claim)}する主張</p>
    <dl className={styles.claimFacts}><dt>関係の期間</dt><dd>{formatPeriod(claim.period)}</dd></dl>
    {contribution && <dl className={styles.claimFacts}><dt>{roleText.roleTitle}</dt><dd>{contribution.roleId ? roleText.roles[contribution.roleId] : roleText.none}</dd>
      <dt>{roleText.scope}</dt><dd>{contribution.scope ? <>{contribution.scope.volumeLabel ?? roleText.volumeUnknown} / {contribution.scope.editionLabel ?? roleText.editionUnknown}<br />ISBN {contribution.scope.isbn13} · {contribution.scope.language}<br />{roleText.publicationOnly}</> : roleText.scopeUnknown}</dd></dl>}
    {claim.predicate === "AFFILIATED_WITH" && <dl className={styles.claimFacts}><dt>{positionText.title}</dt><dd>{position ? positionText.positions[position.positionId] : positionText.none}{position && <><br />{positionText.limitation}</>}</dd></dl>}
    {claim.predicate === "PARTICIPATED_IN" && <dl className={styles.claimFacts}><dt>{eventText.title}</dt><dd>{eventParticipation ? eventText.roles[eventParticipation.roleId] : eventText.none}{eventParticipation && <><br />{eventText.limitation}</>}</dd></dl>}
    {contribution && !contribution.roleId && <p className={styles.muted}>{text.noRole}</p>}
    {claim.predicate === "AFFILIATED_WITH" && !position && <p className={styles.muted}>{text.noPosition}</p>}
    {claim.predicate === "PARTICIPATED_IN" && !eventParticipation && <p className={styles.muted}>{text.noEventRole}</p>}
    {!!claim.citations.length && <button onClick={() => document.getElementById(`${idPrefix}citation-${claim.citations[0].id}`)?.scrollIntoView({ block: "nearest" })}>{text.evidence}</button>}
    <p>{claim.sourceCount ? `出典 ${claim.sourceCount}件` : "出典未確認"}</p>
    {!claim.citations.length && <p className={styles.muted}>この主張の出典はまだ登録されていません。</p>}
    {!!claim.citations.length && <h5 className={styles.evidenceTitle}>根拠となる出典と参照箇所</h5>}
    {claim.citations.map((citation, index) => <section id={`${idPrefix}citation-${citation.id}`} key={citation.id} className={styles.citation} aria-label="出典と参照箇所">
      <p className={styles.muted}>出典 {index + 1} · {SOURCE_KINDS[citation.source.kind]}</p>
      <h5>{citation.source.title}</h5>
      <p>{SOURCE_KINDS[citation.source.kind]} · {citation.stance === "support" ? "この主張を支持" : citation.stance === "refute" ? "この主張への反証" : "背景資料"}</p>
      <p><strong>参照箇所：{citation.locator}</strong></p>
      {citation.source.url && <p>{usableUrl(citation.source)
        ? <a href={citation.source.url} target="_blank" rel="noopener noreferrer">出典のURLを開く</a>
        : <span>デモURL（リンク無効）：{citation.source.url}</span>}</p>}
      {citation.eventParticipationEvidence && <p><strong>{eventText.evidence}：</strong>{citation.eventParticipationEvidence.originalText}<br />{eventText.language}：{citation.eventParticipationEvidence.language}</p>}
      {citation.positionEvidence && <p><strong>{positionText.evidence}：</strong>{citation.positionEvidence.originalText}<br />{positionText.language}：{citation.positionEvidence.language}</p>}
      {citation.roleEvidence && <p><strong>{roleText.evidence}：</strong>{citation.roleEvidence.originalText}<br />{roleText.language}：{citation.roleEvidence.language}</p>}
      {citation.note && <><p className={styles.muted}>{text.original}</p><p>{citation.note}</p></>}
      <details><summary>{text.metadata}</summary>
      <p>公開日：{formatDate(citation.source.publishedAt)}</p>
      <p>著者：{citation.source.authors.length ? citation.source.authors.join("、") : "不明"}</p>
      {citation.source.publisher && <p>発行者：{citation.source.publisher}</p>}
      {citation.source.edition && <p>版・号：{citation.source.edition}</p>}
      {citation.accessedAt && <p>アクセス日：{formatDate({ value: citation.accessedAt, precision: "day" })}</p>}
      {citation.source.note && <p className={styles.muted}>{citation.source.note}</p>}
      </details>
    </section>)}
  </article>;
}

function moveToClaim(id: string) {
  const card = document.getElementById(`claim-${id}`);
  card?.focus({ preventScroll: true }); card?.scrollIntoView({ block: "nearest" });
}

function comparisonText(reference: ClaimDetail, claim: ClaimDetail): string | null {
  const same = claimComparisonKey(reference) === claimComparisonKey(claim);
  if (reference.predicate === "PARTICIPATED_IN") return same ? eventParticipationLabels().sameComparison : eventParticipationLabels().differentComparison;
  if (reference.predicate === "AFFILIATED_WITH") return same ? organizationParticipationLabels().sameComparison : organizationParticipationLabels().differentComparison;
  if (reference.predicate === "CONTRIBUTED_TO") {
    const category = comparisonCategory(reference, claim), text = contributionLabels();
    return category === "same" && !same ? text.differentPeriod : text.comparison[category];
  }
  return null;
}

type ClaimDetailsProps = { dataset?: DatasetMode; id: string; nodes: Record<string, EntitySummary>; claimSummary?: ClaimSummary; onInspectEntity?: (id: string) => void; mode?: "claim" | "relation"; visibleClaimIds?: string[]; visibleClaims?: ClaimSummary[]; predicates?: PredicateFilter; roles?: ContributionRoleFilter; positions?: OrganizationPositionFilter; eventRoles?: EventRoleFilter };

export default function ClaimDetails(props: ClaimDetailsProps) {
  return <ClaimDetailsSession key={props.id} {...props} />;
}

function ClaimDetailsSession({ dataset, id, nodes, claimSummary, onInspectEntity, mode = "claim", visibleClaimIds, visibleClaims, predicates = null, roles = null, positions = null, eventRoles = null }: ClaimDetailsProps) {
  const roleText = contributionLabels(), text = relationPresentationLabels();
  const { primary, related, error, failedCount, pending, retry } = useClaimDetails(id);
  // Reserve numbers from the complete ID list, including details still loading or failed.
  const claimIds = primary ? [primary.claim.id, ...primary.relatedClaimIds].sort((a, b) => a.localeCompare(b)) : [];
  const claimNumber = (claimId: string) => claimIds.indexOf(claimId) + 1;
  const claims = primary ? [primary.claim, ...related].sort((a, b) => a.id.localeCompare(b.id)) : [];
  const shown = claims.filter(claim => visibleClaimIds === undefined || visibleClaimIds.includes(claim.id));
  const unseen = claims.filter(claim => visibleClaimIds !== undefined && !visibleClaimIds.includes(claim.id) && matchesClaim(claim, predicates, roles, positions, eventRoles));
  const outside = claims.filter(claim => visibleClaimIds !== undefined && !visibleClaimIds.includes(claim.id) && !matchesClaim(claim, predicates, roles, positions, eventRoles));
  const groups = [{ key: "shown", title: explorationLabels().shown, claims: shown, help: "" },
    { key: "unseen", title: explorationLabels().unseen, claims: unseen, help: text.unseenHelp },
    { key: "outside", title: explorationLabels().outside, claims: outside, help: text.outsideHelp }];
  const reference = primary ? contributionOf(primary.claim) : null;
  // The graph already knows both endpoints, even while evidence is unavailable.
  const relation = claimSummary ?? visibleClaims?.[0] ?? primary?.claim;
  const endpoints = relation ? [...new Set([relation.subjectId, relation.objectId])].filter(id => nodes[id]) : [];
  return <section aria-label="Claim詳細">
    {mode === "relation" && <RelationOverview claims={visibleClaims ?? shown} nodes={nodes} />}
    {onInspectEntity && endpoints.length > 0 && <nav aria-label={text.endpoints}>
      <p className={styles.muted}>{text.endpointHelp}</p>
      <div className={styles.actions}>{endpoints.map(entityId => <button key={entityId} onClick={() => onInspectEntity(entityId)}>
        {text.inspectEntity(entityLabel(nodes[entityId], nodes).replace("\n", " / "))}
      </button>)}</div>
    </nav>}
    <h3>{mode === "relation" ? text.claimsTitle : "主張と出典"}</h3>
    {!primary && !error && <p role="status">主張の詳細を取得中…</p>}
    {error && <div className={styles.error} role="alert"><p>{error}</p><button onClick={retry}>主張の取得を再試行</button></div>}
    {primary && <>
      {pending > 0 && <p role="status">{text.loadingProgress(claims.length, claimIds.length)}</p>}
      {failedCount > 0 && <div className={styles.error} role="alert"><p>{text.failed(failedCount)}</p><p>{text.partial}</p><button disabled={pending > 0} onClick={retry}>他の主張を再試行</button></div>}
      {mode === "relation" ? <>
        <p className={styles.muted}>{text.reading}</p>
        <nav className={styles.claimNavigation} aria-label="主張への移動">{claims.map(claim => <button key={claim.id} onClick={() => moveToClaim(claim.id)}>{text.jump(claimNumber(claim.id))}</button>)}</nav>
        {groups.filter(group => group.claims.length).map(group => <section key={group.key} className={styles.claimGroup} data-testid={`claim-group-${group.key}`} aria-label={group.title}>
          <h4>{group.title} · {text.claimCount(group.claims.length)}</h4>
          {group.help && <p className={styles.muted}>{group.help}</p>}
          {group.claims.map(claim => <ClaimCard dataset={dataset} key={claim.id} claim={claim} nodes={nodes} title={`主張 ${claimNumber(claim.id)}`} />)}
        </section>)}
      </> : <>
        {reference && <p className={styles.muted}>{roleText.comparisonReference}：{reference.roleId ? roleText.roles[reference.roleId] : roleText.none} ／ {reference.scope ? `ISBN ${reference.scope.isbn13}` : roleText.scopeUnknown}</p>}
        <ClaimCard dataset={dataset} claim={primary.claim} nodes={nodes} title="選択した主張" />
        <h3>同じ関係についての他の主張</h3>
        <p className={styles.muted}>{text.reading}</p>
        {!primary.relatedClaimIds.length && <p className={styles.muted}>他の主張は登録されていません。</p>}
        {related.map(claim => <div key={claim.id}>
          {!matchesClaim(claim, predicates, roles, positions, eventRoles) && <p className={styles.muted}>{explorationLabels().outside}</p>}
          {comparisonText(primary.claim, claim) && <p className={styles.muted}>{comparisonText(primary.claim, claim)}</p>}
          <ClaimCard dataset={dataset} claim={claim} nodes={nodes} title="他の主張" />
        </div>)}
      </>}
    </>}
  </section>;
}
