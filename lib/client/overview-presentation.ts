import type { EntityOverviewResponse } from "../domain/api";
import { PREDICATES } from "../domain/predicates";
import { overviewLabels } from "../i18n/entity-overview";
import { contributionLabels } from "../i18n/contribution";
import { organizationParticipationLabels } from "../i18n/organization-participation";
import { eventParticipationLabels } from "../i18n/event-participation";

export type OverviewRelation = EntityOverviewResponse["relations"][number];
// 表示の圧縮だけ。語義・Claim同一性・肯否対立や人数を認定しない。
export function overviewPresentation(relation: OverviewRelation, locale = "ja") {
  const labels = overviewLabels(locale);
  const predicate = PREDICATES[relation.predicate];
  const fromCenter = relation.perspective === "subject";
  const start = fromCenter ? labels.center[predicate.subjectKind] : labels.kinds[predicate.subjectKind];
  const end = fromCenter ? labels.kinds[predicate.objectKind] : labels.center[predicate.objectKind];
  const status = relation.counts.affirmed === 0 ? "denied" : relation.counts.denied > 0 ? "mixed" : "affirmed";
  const contribution = contributionLabels(locale), organization = organizationParticipationLabels(locale), event = eventParticipationLabels(locale);
  const qualification = relation.predicate === "CONTRIBUTED_TO" ? {
    title: labels.contributionTerms, details: labels.roleDetails, help: labels.scopeHelp,
    entries: relation.contributionRoles.map(value => ({ id: value.roleId, label: value.roleId ? contribution.roles[value.roleId] : labels.unqualified, counts: value.counts })),
  } : relation.predicate === "AFFILIATED_WITH" ? {
    title: labels.organizationTerms, details: labels.organizationDetails, help: organization.limitation,
    entries: relation.organizationPositions.map(value => ({ id: value.positionId, label: value.positionId ? organization.positions[value.positionId] : labels.unqualifiedPosition, counts: value.counts })),
  } : relation.predicate === "PARTICIPATED_IN" ? {
    title: labels.eventTerms, details: labels.eventDetails, help: event.limitation,
    entries: relation.eventRoles.map(value => ({ id: value.roleId, label: value.roleId ? event.roles[value.roleId] : labels.unqualifiedEvent, counts: value.counts })),
  } : null;
  const specified = qualification?.entries.filter(value => value.id !== null).sort((a, b) => a.id!.localeCompare(b.id!)) ?? [];
  const summary = specified.slice(0, 2).map(value => `${value.label}${value.counts.affirmed === 0 ? `（${labels.termDenied}）` : value.counts.denied > 0 ? `（${labels.termMixed}）` : ""}`);
  if (specified.length > 2) summary.push(labels.moreTerms(specified.length - 2));
  return { title: labels.relation(relation.predicate, relation.perspective), start, end, verb: predicate.label, fromCenter, status,
    qualification, qualificationSummary: summary.join("・") };
}
