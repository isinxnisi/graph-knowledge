import { z } from "zod";
import { periodSchema, dateProperties } from "./dates";
import { originalTermEvidenceSchema } from "./evidence";

// 特定開催回。seriesはこの型に入れない。開催期間をClaimへ転記しない。
export const eventMetadataSchema = z.strictObject({ granularity: z.literal("occurrence"), period: periodSchema });
export type EventMetadata = z.infer<typeof eventMetadataSchema>;
export const EVENT_ROLE_IDS = ["CHAIR"] as const;
export const eventRoleSchema = z.enum(EVENT_ROLE_IDS);
export const eventParticipationSchema = z.strictObject({ roleId: eventRoleSchema });
export const eventParticipationEvidenceSchema = originalTermEvidenceSchema;
export type EventRoleId = typeof EVENT_ROLE_IDS[number];
export type EventParticipation = z.infer<typeof eventParticipationSchema>;
export function eventParticipationOf(claim: { predicate: string; eventParticipation?: EventParticipation | null }): EventParticipation | null {
  return claim.predicate === "PARTICIPATED_IN" ? claim.eventParticipation ?? null : null;
}
export function eventParticipationProperties(value: EventParticipation | null) { return { eventRoleId: value?.roleId ?? null }; }
export function storedEventParticipation(properties: Record<string, unknown>, predicate: string): EventParticipation | null {
  if (properties.eventRoleId == null) return null;
  if (predicate !== "PARTICIPATED_IN") throw new Error("Event participation on another predicate");
  return eventParticipationSchema.parse({ roleId: properties.eventRoleId });
}
export function eventProperties(value: EventMetadata | null) {
  return { eventGranularity: value?.granularity ?? null, ...dateProperties("eventFrom", value?.period.from ?? null), ...dateProperties("eventTo", value?.period.to ?? null) };
}
export function storedEventMetadata(properties: Record<string, unknown>): EventMetadata | null {
  const fields = ["eventGranularity", "eventFromValue", "eventFromPrecision", "eventToValue", "eventToPrecision"];
  if (properties.kind !== "event") {
    if (fields.some(key => properties[key] != null)) throw new Error("Event metadata on another kind");
    return null;
  }
  const date = (prefix: string) => properties[`${prefix}Value`] == null && properties[`${prefix}Precision`] == null ? null : { value: properties[`${prefix}Value`], precision: properties[`${prefix}Precision`] };
  return eventMetadataSchema.parse({ granularity: properties.eventGranularity, period: { from: date("eventFrom"), to: date("eventTo") } });
}
