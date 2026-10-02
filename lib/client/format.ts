import type { PartialDate } from "../domain/dates";
import type { ClaimSummary } from "../domain/api";
import { PREDICATES, type EntityKind } from "../domain/predicates";

export const KIND_LABELS: Record<EntityKind, string> = { person: "人物", work: "作品", organization: "組織", event: "出来事" };
export function formatDate(date: PartialDate | null): string {
  if (!date) return "不明";
  const [year, month, day] = date.value.split("-").map(Number);
  return `${year}年${date.precision !== "year" ? `${month}月` : ""}${date.precision === "day" ? `${day}日` : ""}`;
}
export function formatPeriod(period: ClaimSummary["period"]): string {
  if (!period.from && !period.to) return "期間不明";
  return `${period.from ? formatDate(period.from) : "開始不明"}〜${period.to ? formatDate(period.to) : "終了不明"}`;
}
export const polarityLabel = (claim: Pick<ClaimSummary, "polarity">) => claim.polarity === "denied" ? "否定" : "肯定";
export const relationLabel = (claim: Pick<ClaimSummary, "predicate" | "polarity">) => `${PREDICATES[claim.predicate].label}${claim.polarity === "denied" ? "（否定）" : ""}`;
