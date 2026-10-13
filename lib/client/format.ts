import { explorerLabels } from "../i18n/explorer";
import { explorationLabels } from "../i18n/exploration";
import { eventParticipationOf } from "../domain/event-participation";
import { eventParticipationLabels } from "../i18n/event-participation";
import { contributionOf } from "../domain/contribution";
import { organizationParticipationOf } from "../domain/organization-participation";
import { contributionLabels } from "../i18n/contribution";
import { organizationParticipationLabels } from "../i18n/organization-participation";
import type { PartialDate } from "../domain/dates";
import type { ClaimSummary } from "../domain/api";
import { type EntityKind } from "../domain/predicates";

export const KIND_LABELS: Record<EntityKind, string> = { person: "人物", work: "作品", organization: "組織", event: "出来事" };
export function formatDate(date: PartialDate | null, locale = "ja"): string {
  if (!date) return explorerLabels(locale).unknown;
  if (locale.startsWith("en")) return date.value;
  const [year, month, day] = date.value.split("-").map(Number);
  return `${year}年${date.precision !== "year" ? `${month}月` : ""}${date.precision === "day" ? `${day}日` : ""}`;
}
export function formatPeriod(period: ClaimSummary["period"], locale = "ja"): string {
  if (!period.from && !period.to) return explorerLabels(locale).periodUnknown;
  return `${period.from ? formatDate(period.from, locale) : explorerLabels(locale).fromUnknown}${locale.startsWith("en") ? " – " : "〜"}${period.to ? formatDate(period.to, locale) : explorerLabels(locale).toUnknown}`;
}
export const polarityLabel = (claim: Pick<ClaimSummary, "polarity">, locale = "ja") => claim.polarity === "denied" ? explorerLabels(locale).denied : explorerLabels(locale).affirmed;
export const relationLabel = (claim: Pick<ClaimSummary, "predicate" | "polarity">, locale = "ja") => `${explorationLabels(locale).predicates[claim.predicate]}${claim.polarity === "denied" ? `（${explorerLabels(locale).denied}）` : ""}`;

export function qualificationLabel(claim: ClaimSummary, locale = "ja"): string | null {
  if (claim.predicate === "CONTRIBUTED_TO") {
    const role = contributionOf(claim)?.roleId, text = contributionLabels(locale);
    return role ? text.roles[role] : text.none;
  }
  if (claim.predicate === "AFFILIATED_WITH") {
    const position = organizationParticipationOf(claim)?.positionId, text = organizationParticipationLabels(locale);
    return position ? text.positions[position] : text.none;
  }
  if (claim.predicate === "PARTICIPATED_IN") {
    const role = eventParticipationOf(claim)?.roleId, text = eventParticipationLabels(locale);
    return role ? text.roles[role] : text.none;
  }
  return null;
}
