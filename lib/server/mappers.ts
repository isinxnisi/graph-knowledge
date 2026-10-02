import { z } from "zod";
import { partialDateSchema, type PartialDate } from "../domain/dates";
import {
  claimSummarySchema, citationDetailSchema, entityDetailSchema, entitySummarySchema,
  type EntitySummary, type ClaimSummary,
} from "../domain/api";
import { sourceSchema } from "../domain/fixture";
import { PREDICATES } from "../domain/predicates";

type Properties = Record<string, unknown>;

function partialDate(properties: Properties, prefix: string): PartialDate | null {
  const value = properties[`${prefix}Value`] ?? null;
  const precision = properties[`${prefix}Precision`] ?? null;
  if (value === null && precision === null) return null;
  return partialDateSchema.parse({ value, precision });
}

export function entitySummary(properties: Properties): EntitySummary {
  return entitySummarySchema.parse({ id: properties.id, kind: properties.kind, name: properties.name, description: properties.description ?? null });
}
export function entityDetail(properties: Properties) {
  return entityDetailSchema.parse({ ...entitySummary(properties), aliases: properties.aliases ?? [] });
}
export function claimSummary(properties: Properties, subject: EntitySummary, object: EntitySummary, sourceCount: number): ClaimSummary {
  const result = claimSummarySchema.parse({
    id: properties.id, subjectId: subject.id, objectId: object.id,
    predicate: properties.predicate, polarity: properties.polarity,
    period: { from: partialDate(properties, "validFrom"), to: partialDate(properties, "validTo") }, sourceCount,
  });
  const definition = PREDICATES[result.predicate];
  if (subject.kind !== definition.subjectKind || object.kind !== definition.objectKind) throw new Error("Invalid stored predicate kinds");
  return result;
}
function sourceDetail(properties: Properties) {
  return sourceSchema.parse({
    id: properties.id, kind: properties.kind, title: properties.title, authors: properties.authors ?? [],
    publisher: properties.publisher ?? null, url: properties.url ?? null,
    publishedAt: partialDate(properties, "publishedAt"), edition: properties.edition ?? null,
    note: properties.note ?? null, isDemo: properties.isDemo,
  });
}
export function citationDetail(properties: Properties, source: Properties) {
  return citationDetailSchema.parse({
    id: properties.id, locator: properties.locator, note: properties.note ?? null,
    accessedAt: properties.accessedAt ?? null, stance: properties.stance, source: sourceDetail(source),
  });
}
export function relatedId(value: unknown): string { return z.uuidv4().parse(value); }
