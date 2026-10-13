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
    category: text.graphCategories.CONTRIBUTED_TO,
    title: contributionLabels(locale).title, short: text.role, help: contributionLabels(locale).publicationOnly,
    value: (claim: ClaimSummary) => contributionOf(claim)?.roleId ?? null,
    label: (id: string) => contributionLabels(locale).roles[id as keyof ReturnType<typeof contributionLabels>["roles"]],
  } : first?.predicate === "AFFILIATED_WITH" ? {
    category: text.graphCategories.AFFILIATED_WITH,
    title: organizationParticipationLabels(locale).title, short: text.position, help: organizationParticipationLabels(locale).limitation,
    value: (claim: ClaimSummary) => organizationParticipationOf(claim)?.positionId ?? null,
    label: (id: string) => organizationParticipationLabels(locale).positions[id as keyof ReturnType<typeof organizationParticipationLabels>["positions"]],
  } : first?.predicate === "PARTICIPATED_IN" ? {
    category: text.graphCategories.PARTICIPATED_IN,
    title: eventParticipationLabels(locale).title, short: text.position, help: eventParticipationLabels(locale).limitation,
    value: (claim: ClaimSummary) => eventParticipationOf(claim)?.roleId ?? null,
    label: (id: string) => eventParticipationLabels(locale).roles[id as keyof ReturnType<typeof eventParticipationLabels>["roles"]],
  } : null;
  const counts = (items: readonly ClaimSummary[]) => ({ affirmed: items.filter(c => c.polarity === "affirmed").length, denied: items.filter(c => c.polarity === "denied").length });
  const status = counts(claims);
  const ids = qualification ? [...new Set(claims.map(qualification.value))].sort((a, b) => a === null ? 1 : b === null ? -1 : a.localeCompare(b)) : [];
  const entries = ids.map(id => ({ id, label: id === null ? text.unqualified(qualification!.short) : qualification!.label(id), ...counts(claims.filter(c => qualification!.value(c) === id)) }));
  const specified = entries.filter(e => e.id !== null);
  // Graphは具体語を先に読む。指定なし・件数は詳細へ残し、長い語を種類数へ置き換えない。
  // ID順の先頭二値を表示するだけで、頻度・正しさ・期間による順位付けではない。
  const names = specified.slice(0, 2).map(e => `${e.label}${e.affirmed === 0 ? `（${text.termDenied}）` : e.denied ? `（${text.termMixed}）` : ""}`);
  const separator = [...names.join("・")].length > 24 ? "\n" : "・";
  const graphQualification = names.join(separator) + (specified.length > 2 ? `\n${text.moreTerms(specified.length - 2)}` : "");
  const graphCategory = graphQualification ? qualification!.category : "";
  return { ...status, qualification: qualification ? { title: qualification.title, help: qualification.help, entries } : null, graphCategory, graphQualification };
}
