import type { ClaimSummary } from "../domain/api";
import { contributionOf } from "../domain/contribution";
import { organizationParticipationOf } from "../domain/organization-participation";
import { eventParticipationOf } from "../domain/event-participation";
import { contributionLabels } from "../i18n/contribution";
import { organizationParticipationLabels } from "../i18n/organization-participation";
import { eventParticipationLabels } from "../i18n/event-participation";
import { relationPresentationLabels } from "../i18n/relation-presentation";

// 表示中の独立Claimを要約するだけ。比較キー・同一性・Source支持は推論しない。
export function relationPresentation(claims: readonly ClaimSummary[], locale = "ja") {
  const text = relationPresentationLabels(locale), first = claims[0];
  const qualification = first?.predicate === "CONTRIBUTED_TO" ? {
    title: contributionLabels(locale).title, short: text.role, help: contributionLabels(locale).publicationOnly,
    value: (claim: ClaimSummary) => contributionOf(claim)?.roleId ?? null,
    label: (id: string) => contributionLabels(locale).roles[id as keyof ReturnType<typeof contributionLabels>["roles"]],
  } : first?.predicate === "AFFILIATED_WITH" ? {
    title: organizationParticipationLabels(locale).title, short: text.position, help: organizationParticipationLabels(locale).limitation,
    value: (claim: ClaimSummary) => organizationParticipationOf(claim)?.positionId ?? null,
    label: (id: string) => organizationParticipationLabels(locale).positions[id as keyof ReturnType<typeof organizationParticipationLabels>["positions"]],
  } : first?.predicate === "PARTICIPATED_IN" ? {
    title: eventParticipationLabels(locale).title, short: text.position, help: eventParticipationLabels(locale).limitation,
    value: (claim: ClaimSummary) => eventParticipationOf(claim)?.roleId ?? null,
    label: (id: string) => eventParticipationLabels(locale).roles[id as keyof ReturnType<typeof eventParticipationLabels>["roles"]],
  } : null;
  const counts = (items: readonly ClaimSummary[]) => ({ affirmed: items.filter(c => c.polarity === "affirmed").length, denied: items.filter(c => c.polarity === "denied").length });
  const status = counts(claims);
  const ids = qualification ? [...new Set(claims.map(qualification.value))].sort((a, b) => a === null ? 1 : b === null ? -1 : a.localeCompare(b)) : [];
  const entries = ids.map(id => ({ id, label: id === null ? `${qualification!.short}${text.unspecified}` : qualification!.label(id), ...counts(claims.filter(c => qualification!.value(c) === id)) }));
  const specified = entries.filter(e => e.id !== null);
  const names = specified.map(e => `${e.label}${e.affirmed === 0 ? `（${text.termDenied}）` : e.denied ? `（${text.termMixed}）` : ""}`).join("・");
  const compact = specified.length > 2 || [...names].length > 24 ? `${qualification?.short} ${text.terms(specified.length)}` : names;
  const graphQualification = specified.length ? compact + (entries.some(e => e.id === null) ? `＋${text.unspecified}` : "") : "";
  return { ...status, qualification: qualification ? { title: qualification.title, help: qualification.help, entries } : null, graphQualification };
}
