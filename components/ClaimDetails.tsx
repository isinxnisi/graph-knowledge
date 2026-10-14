"use client";
import { trackPublicEvent } from "../lib/client/public-events";
import { useEffect, useId, useRef, useState } from "react";
import { useUiLocale } from "../lib/client/ui-locale";
import { explorerLabels, explorerMessage } from "../lib/i18n/explorer";
import type { DatasetMode } from "../lib/domain/dataset";
import { dataReleaseLabels } from "../lib/i18n/data-release";
import { readingHref } from "../lib/client/reading-reference";
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
import { formatDate, formatPeriod } from "../lib/client/format";
import { entityLabel } from "../lib/client/graph-presentation";
import RelationOverview from "./RelationOverview";
import { relationPresentationLabels } from "../lib/i18n/relation-presentation";
import styles from "./Explorer.module.css";
import Icon from "./Icon";

function usableUrl(source: SourceDetail): boolean {
  if (!source.url || source.isDemo) return false;
  try { const url = new URL(source.url); return ["http:", "https:"].includes(url.protocol) && !url.hostname.endsWith(".invalid"); }
  catch { return false; }
}

function SourceNote({ note }: { note: string }) {
  const { locale } = useUiLocale();
  const text = relationPresentationLabels(locale);
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const paragraph = useRef<HTMLParagraphElement>(null);
  const [collapsible, setCollapsible] = useState(false);
  useEffect(() => {
    const element = paragraph.current;
    if (!element) return;
    const measure = () => {
      const lineHeight = parseFloat(getComputedStyle(element).lineHeight);
      setCollapsible(element.scrollHeight > lineHeight * 3 + 1);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [note]);
  return <div className={styles.sourceNote}>
    <p className={styles.muted}>{text.original}</p>
    <p id={id} ref={paragraph} className={!expanded ? styles.notePreview : undefined}>{note}</p>
    {collapsible && <button className={styles.noteToggle} data-expanded={expanded} aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>{expanded ? text.collapseNote : text.expandNote}</button>}
  </div>;
}

export function ClaimCard({ claim, nodes, title, dataset, referenceDataset = dataset, idPrefix = "", withinRelation = false }: { withinRelation?: boolean; referenceDataset?: DatasetMode; dataset?: DatasetMode; idPrefix?: string; claim: ClaimDetail; nodes: Record<string, EntitySummary>; title: string }) {
  const { locale } = useUiLocale();
  const ui = explorerLabels(locale);
  const text = relationPresentationLabels(locale);
  const eventParticipation = eventParticipationOf(claim), eventText = eventParticipationLabels(locale);
  const position = organizationParticipationOf(claim);
  const positionText = organizationParticipationLabels(locale);
  const contribution = contributionOf(claim);
  const roleText = contributionLabels(locale);
  const term = contribution ? (contribution.roleId ? roleText.roles[contribution.roleId] : null)
    : claim.predicate === "AFFILIATED_WITH" ? (position ? positionText.positions[position.positionId] : null)
    : claim.predicate === "PARTICIPATED_IN" ? (eventParticipation ? eventText.roles[eventParticipation.roleId] : null) : null;
  return <article id={`${idPrefix}claim-${claim.id}`} tabIndex={-1} className={styles.claimCard} data-testid={`claim-card-${claim.id}`}>
    <header className={styles.recordHeader}><h4>{title}</h4><span className={claim.polarity === "denied" ? styles.recordDenied : styles.recordStatus}>{claim.polarity === "denied" ? text.recordDenied : text.recordAffirmed}</span></header>
    {term && <p className={styles.recordTerm}>{term}</p>}
    {contribution?.scope && <p className={styles.recordScopeHint}>{text.verifiedPublication}：{contribution.scope.volumeLabel ?? roleText.volumeUnknown}{contribution.scope.editionLabel ? ` / ${contribution.scope.editionLabel}` : ""}</p>}
    {claim.withdrawal && <section role="note" className={styles.error}><strong>{dataReleaseLabels(locale).withdrawn}</strong><p>{dataReleaseLabels(locale).withdrawnHelp}</p><p>{claim.withdrawal.reason}</p>
      {referenceDataset && claim.withdrawal.replacementClaimId && <a href={readingHref({ dataset: referenceDataset, kind: "claim", id: claim.withdrawal.replacementClaimId })}>{dataReleaseLabels(locale).replacement}</a>}
    </section>}
    {!withinRelation && <p className={styles.recordStatement}><strong>{nodes[claim.subjectId] ? entityLabel(nodes[claim.subjectId], nodes, locale).replace("\n", " / ") : ui.subject} → {explorationLabels(locale).predicates[claim.predicate]} → {nodes[claim.objectId] ? entityLabel(nodes[claim.objectId], nodes, locale).replace("\n", " / ") : ui.object}</strong></p>}
    {!claim.sourceCount && <p className={styles.recordSourceCount}>{ui.unverified}</p>}
    {!claim.citations.length && <p className={styles.muted}>{ui.noCitations}</p>}
    {!withinRelation && !!claim.citations.length && <h5 className={styles.evidenceTitle}>{text.evidenceTitle}</h5>}
    {claim.citations.map((citation, index) => <section id={`${idPrefix}citation-${citation.id}`} key={citation.id} className={styles.citation} aria-label={ui.citation}>
      <p className={styles.sourceEyebrow}>{ui.source(index + 1)} · {ui.sourceKinds[citation.source.kind]} <span>{text.sourceStances[citation.stance]}</span></p>
      <h5>{citation.source.title}</h5>
      <p className={styles.sourceLocator}>{ui.locator}：{citation.locator}</p>
      {citation.source.url && <p>{usableUrl(citation.source)
        ? <a href={citation.source.url} target="_blank" rel="noopener noreferrer" aria-label={ui.openSource} onClick={() => trackPublicEvent("source_open")}>{text.openSource}<span aria-hidden="true"> ↗</span></a>
        : <span>{ui.demoUrl}：{citation.source.url}</span>}</p>}
      {citation.eventParticipationEvidence && <p><strong>{eventText.evidence}：</strong>{citation.eventParticipationEvidence.originalText}<br />{eventText.language}：{citation.eventParticipationEvidence.language}</p>}
      {citation.positionEvidence && <p><strong>{positionText.evidence}：</strong>{citation.positionEvidence.originalText}<br />{positionText.language}：{citation.positionEvidence.language}</p>}
      {citation.roleEvidence && <p><strong>{roleText.evidence}：</strong>{citation.roleEvidence.originalText}<br />{roleText.language}：{citation.roleEvidence.language}</p>}
      {citation.note && <SourceNote note={citation.note} />}
      <details className={styles.disclosure}><summary>{text.metadata}</summary><div className={styles.disclosureBody}>
      <p>{ui.published}：{formatDate(citation.source.publishedAt, locale)}</p>
      <p>{ui.authors}：{citation.source.authors.length ? citation.source.authors.join("、") : ui.unknown}</p>
      {citation.source.publisher && <p>{ui.publisher}：{citation.source.publisher}</p>}
      {citation.source.edition && <p>{ui.edition}：{citation.source.edition}</p>}
      {citation.accessedAt && <p>{ui.accessed}：{formatDate({ value: citation.accessedAt, precision: "day" }, locale)}</p>}
      {citation.source.note && <p className={styles.muted}>{citation.source.note}</p>}
      </div></details>
    </section>)}
    <details className={`${styles.recordScope} ${styles.disclosure}`}><summary>{text.recordScope}</summary><div className={styles.disclosureBody}>
    {!!claim.sourceCount && <p className={styles.recordSourceCount}>{ui.sourceCount(claim.sourceCount)}</p>}
    <dl className={styles.claimFacts}><dt>{ui.relationPeriod}</dt><dd>{formatPeriod(claim.period, locale)}</dd></dl>
    {contribution && <dl className={styles.claimFacts}><dt>{roleText.roleTitle}</dt><dd>{contribution.roleId ? roleText.roles[contribution.roleId] : roleText.none}</dd>
      <dt>{roleText.scope}</dt><dd>{contribution.scope ? <>{contribution.scope.volumeLabel ?? roleText.volumeUnknown} / {contribution.scope.editionLabel ?? roleText.editionUnknown}<br />ISBN {contribution.scope.isbn13} · {contribution.scope.language}<br />{roleText.publicationOnly}</> : roleText.scopeUnknown}</dd></dl>}
    {claim.predicate === "AFFILIATED_WITH" && <dl className={styles.claimFacts}><dt>{positionText.title}</dt><dd>{position ? positionText.positions[position.positionId] : positionText.none}{position && <><br />{positionText.limitation}</>}</dd></dl>}
    {claim.predicate === "PARTICIPATED_IN" && <dl className={styles.claimFacts}><dt>{eventText.title}</dt><dd>{eventParticipation ? eventText.roles[eventParticipation.roleId] : eventText.none}{eventParticipation && <><br />{eventText.limitation}</>}</dd></dl>}
    {contribution && !contribution.roleId && <p className={styles.muted}>{text.noRole}</p>}
    {claim.predicate === "AFFILIATED_WITH" && !position && <p className={styles.muted}>{text.noPosition}</p>}
    {claim.predicate === "PARTICIPATED_IN" && !eventParticipation && <p className={styles.muted}>{text.noEventRole}</p>}
    </div></details>
    {dataset && <div className={styles.recordPermalink}><ReadingLink reference={{ kind: "claim", dataset, id: claim.id }}><Icon name="link" />{text.recordLink}</ReadingLink><span>{text.recordLinkHelp}</span></div>}
  </article>;
}

function moveToClaim(id: string) {
  const card = document.getElementById(`claim-${id}`);
  card?.focus({ preventScroll: true }); card?.scrollIntoView({ block: "nearest" });
}

function comparisonText(reference: ClaimDetail, claim: ClaimDetail, locale: string): string | null {
  const same = claimComparisonKey(reference) === claimComparisonKey(claim);
  if (reference.predicate === "PARTICIPATED_IN") return same ? eventParticipationLabels(locale).sameComparison : eventParticipationLabels(locale).differentComparison;
  if (reference.predicate === "AFFILIATED_WITH") return same ? organizationParticipationLabels(locale).sameComparison : organizationParticipationLabels(locale).differentComparison;
  if (reference.predicate === "CONTRIBUTED_TO") {
    const category = comparisonCategory(reference, claim), text = contributionLabels(locale);
    return category === "same" && !same ? text.differentPeriod : text.comparison[category];
  }
  return null;
}

type ClaimDetailsProps = { onDataChanged?: () => void; revision?: string; dataset?: DatasetMode; id: string; nodes: Record<string, EntitySummary>; claimSummary?: ClaimSummary; onInspectEntity?: (id: string) => void; mode?: "claim" | "relation"; visibleClaimIds?: string[]; visibleClaims?: ClaimSummary[]; predicates?: PredicateFilter; roles?: ContributionRoleFilter; positions?: OrganizationPositionFilter; eventRoles?: EventRoleFilter };

export default function ClaimDetails(props: ClaimDetailsProps) {
  return <ClaimDetailsSession key={props.id} {...props} />;
}

function ClaimDetailsSession({ onDataChanged, revision, dataset, id, nodes, claimSummary, onInspectEntity, mode = "claim", visibleClaimIds, visibleClaims, predicates = null, roles = null, positions = null, eventRoles = null }: ClaimDetailsProps) {
  const { locale } = useUiLocale();
  const ui = explorerLabels(locale);
  const roleText = contributionLabels(locale), text = relationPresentationLabels(locale);
  const { primary, related, error, failedCount, pending, retry } = useClaimDetails(id, revision, onDataChanged);
  // Reserve numbers from the complete ID list, including details still loading or failed.
  const claimIds = primary ? [primary.claim.id, ...primary.relatedClaimIds].sort((a, b) => a.localeCompare(b)) : [];
  const claimNumber = (claimId: string) => claimIds.indexOf(claimId) + 1;
  const claims = primary ? [primary.claim, ...related].sort((a, b) => a.id.localeCompare(b.id)) : [];
  const sourceClaims = new Map<string, { id: string; title: string; claimIds: Set<string> }>();
  for (const claim of claims) for (const citation of claim.citations) {
    const record = sourceClaims.get(citation.source.id) ?? { id: citation.source.id, title: citation.source.title, claimIds: new Set<string>() };
    record.claimIds.add(claim.id); sourceClaims.set(citation.source.id, record);
  }
  const sharedSources = [...sourceClaims.values()].filter(source => source.claimIds.size > 1);
  const shown = claims.filter(claim => visibleClaimIds === undefined || visibleClaimIds.includes(claim.id));
  const unseen = claims.filter(claim => visibleClaimIds !== undefined && !visibleClaimIds.includes(claim.id) && matchesClaim(claim, predicates, roles, positions, eventRoles));
  const outside = claims.filter(claim => visibleClaimIds !== undefined && !visibleClaimIds.includes(claim.id) && !matchesClaim(claim, predicates, roles, positions, eventRoles));
  const groups = [{ key: "shown", title: text.shownRecords, claims: shown, help: "" },
    { key: "unseen", title: text.unseenRecords, claims: unseen, help: text.unseenHelp },
    { key: "outside", title: text.outsideRecords, claims: outside, help: text.outsideHelp }];
  const reference = primary ? contributionOf(primary.claim) : null;
  // The graph already knows both endpoints, even while evidence is unavailable.
  const relation = claimSummary ?? visibleClaims?.[0] ?? primary?.claim;
  const endpoints = relation ? [...new Set([relation.subjectId, relation.objectId])].filter(id => nodes[id]) : [];
  return <section aria-label={ui.claimDetails} className={styles.relationDetails}>
    {mode === "relation" && <RelationOverview claims={visibleClaims ?? shown} nodes={nodes} />}
    {onInspectEntity && endpoints.length > 0 && <nav aria-label={text.endpoints} className={styles.relationEndpoints}>
      <h4>{text.endpoints}</h4>
      <div className={styles.endpointPair}>{endpoints.map((entityId, index) => <div key={entityId} className={styles.endpointItem}>
        {index > 0 && <span className={styles.endpointDirection} aria-hidden="true"><Icon name="arrow" /></span>}
        <button aria-label={text.inspectEntity(entityLabel(nodes[entityId], nodes, locale).replace("\n", " / "))} title={text.inspectEntity(entityLabel(nodes[entityId], nodes, locale).replace("\n", " / "))} onClick={() => onInspectEntity(entityId)} className={styles.endpointButton}>
          <span className={styles.endpointIcon}><Icon name={nodes[entityId].kind === "work" ? "book" : nodes[entityId].kind} /></span>
          <span className={styles.endpointIdentity}><strong>{entityLabel(nodes[entityId], nodes, locale).replace("\n", " / ")}</strong><small>{ui.kinds[nodes[entityId].kind]}</small></span>
          <span className={styles.endpointAction} aria-hidden="true"><Icon name="chevron" /></span>
        </button>
      </div>)}</div>
      <p className={styles.endpointHelp}>{text.endpointHelp}</p>
    </nav>}
    <h3 className={styles.recordsHeading}>{mode === "relation" ? text.claimsTitle : ui.claimTitle}</h3>
    {!primary && !error && <p role="status">{ui.claimLoading}</p>}
    {error && <div className={styles.error} role="alert"><p>{explorerMessage(error, locale)}</p><button onClick={retry}>{ui.claimRetry}</button></div>}
    {primary && <>
      {sharedSources.length > 0 && <aside aria-label={text.sharedSources} className={styles.sharedEvidence}><p>{text.sharedSourcesHelp}</p><ul>{sharedSources.map(source => <li key={source.id}>{source.title}</li>)}</ul></aside>}
      {pending > 0 && <p role="status">{text.loadingProgress(claims.length, claimIds.length)}</p>}
      {failedCount > 0 && <div className={styles.error} role="alert"><p>{text.failed(failedCount)}</p><p>{text.partial}</p><button disabled={pending > 0} onClick={retry}>{ui.otherRetry}</button></div>}
      {mode === "relation" ? <>
        <p className={styles.muted}>{text.sourcesIntro}</p>
        {claims.length > 1 && <nav className={styles.claimNavigation} aria-label={ui.claimNavigation}>{claims.map(claim => <button key={claim.id} onClick={() => moveToClaim(claim.id)}>{text.jump(claimNumber(claim.id))}</button>)}</nav>}
        {groups.filter(group => group.claims.length).map(group => <section key={group.key} className={styles.claimGroup} data-testid={`claim-group-${group.key}`} aria-label={group.title}>
          {(group.key !== "shown" || unseen.length > 0 || outside.length > 0) && <h4>{group.title} · {text.claimCount(group.claims.length)}</h4>}
          {group.help && <p className={styles.muted}>{group.help}</p>}
          {group.claims.map(claim => <ClaimCard withinRelation dataset={dataset} key={claim.id} claim={claim} nodes={nodes} title={text.record(claimNumber(claim.id))} />)}
        </section>)}
      </> : <>
        {reference && <p className={styles.muted}>{roleText.comparisonReference}：{reference.roleId ? roleText.roles[reference.roleId] : roleText.none} ／ {reference.scope ? `ISBN ${reference.scope.isbn13}` : roleText.scopeUnknown}</p>}
        <ClaimCard dataset={dataset} claim={primary.claim} nodes={nodes} title={ui.selectedClaim} />
        <h3>{ui.related}</h3>
        <p className={styles.muted}>{text.reading}</p>
        {!primary.relatedClaimIds.length && <p className={styles.muted}>{ui.noRelated}</p>}
        {related.map(claim => <div key={claim.id}>
          {!matchesClaim(claim, predicates, roles, positions, eventRoles) && <p className={styles.muted}>{explorationLabels(locale).outside}</p>}
          {comparisonText(primary.claim, claim, locale) && <p className={styles.muted}>{comparisonText(primary.claim, claim, locale)}</p>}
          <ClaimCard dataset={dataset} claim={claim} nodes={nodes} title={ui.otherClaim} />
        </div>)}
      </>}
    </>}
  </section>;
}
