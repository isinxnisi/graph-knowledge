import { z } from "zod";
import { relationConditionSchema } from "../domain/relation-conditions";
import { legacyRelation } from "./relation-state";
import { DATASET_MODES, type DatasetMode } from "../domain/dataset";
import { PREDICATE_KEYS } from "../domain/predicates";
import { CONTRIBUTION_ROLE_IDS } from "../domain/contribution";
import { ORGANIZATION_POSITION_IDS } from "../domain/organization-participation";
import { EVENT_ROLE_IDS } from "../domain/event-participation";
import { normalizePredicates, normalizeContributionRoles, normalizeOrganizationPositions, normalizeEventRoles } from "../domain/exploration";

export const SAVED_VIEW_LIMIT = 20;
export const SAVED_VIEW_TITLE_LIMIT = 80;
export const SAVED_VIEWS_FILE_LIMIT = 100_000;
// Version 1 fixes the current predicate/qualification vocabulary. Reject unknown
// versions or IDs rather than silently broadening a stored view.
export const viewConditionsSchema = z.strictObject({
  predicates: z.array(z.enum(PREDICATE_KEYS)).max(PREDICATE_KEYS.length).nullable(),
  contributionRoles: z.array(z.enum(CONTRIBUTION_ROLE_IDS)).max(CONTRIBUTION_ROLE_IDS.length).nullable(),
  organizationPositions: z.array(z.enum(ORGANIZATION_POSITION_IDS)).max(ORGANIZATION_POSITION_IDS.length).nullable(),
  eventRoles: z.array(z.enum(EVENT_ROLE_IDS)).max(EVENT_ROLE_IDS.length).nullable(),
}).transform(values => {
  const predicates = normalizePredicates(values.predicates);
  return {
    predicates,
    contributionRoles: normalizeContributionRoles(values.contributionRoles, predicates),
    organizationPositions: normalizeOrganizationPositions(values.organizationPositions, predicates),
    eventRoles: normalizeEventRoles(values.eventRoles, predicates),
  };
});
export type ViewConditions = z.infer<typeof viewConditionsSchema>;
export const legacySavedViewSchema = z.strictObject({
  id: z.uuidv4(),
  title: z.string().trim().min(1).max(SAVED_VIEW_TITLE_LIMIT),
  rootId: z.uuidv4(),
  conditions: viewConditionsSchema,
  createdAt: z.iso.datetime(),
});
export const savedViewSchema = legacySavedViewSchema.omit({ conditions: true }).extend({ version: z.literal(2), relation: relationConditionSchema });
export type SavedView = z.infer<typeof savedViewSchema>;
export const migrateSavedView = (input: z.infer<typeof legacySavedViewSchema>): SavedView => {
  const { conditions, ...value } = legacySavedViewSchema.parse(input);
  return savedViewSchema.parse({ ...value, version: 2, relation: legacyRelation(conditions) });
};
const collectionSchema = z.strictObject({
  version: z.literal(1),
  dataset: z.enum(DATASET_MODES),
  views: z.array(legacySavedViewSchema).max(SAVED_VIEW_LIMIT),
}).refine(value => new Set(value.views.map(view => view.id)).size === value.views.length);
const collectionV2Schema = z.strictObject({ version: z.literal(2), dataset: z.enum(DATASET_MODES), views: z.array(savedViewSchema).max(SAVED_VIEW_LIMIT) })
  .refine(value => new Set(value.views.map(view => view.id)).size === value.views.length && value.views.every(v => v.relation.type !== "pattern" || value.dataset === "public-kg"));
export const legacySavedViewsKey = (dataset: DatasetMode) => `graph-knowledge:saved-views:${dataset}`;
export const savedViewsKey = (dataset: DatasetMode) => `${legacySavedViewsKey(dataset)}:v2`;
type StorageAccess = Pick<Storage, "getItem" | "setItem">;
export class SavedViewsError extends Error {
  constructor(public reason: "invalid" | "storage" | "limit" | "dataset" | "conflict") { super(reason); }
}

export function parseSavedViewsBackup(raw: string, dataset: DatasetMode): SavedView[] {
  let collection: z.infer<typeof collectionV2Schema>;
  try {
    if (new TextEncoder().encode(raw).length > SAVED_VIEWS_FILE_LIMIT) throw new Error("Oversized collection");
    const value = JSON.parse(raw);
    collection = value?.version === 1 ? collectionV2Schema.parse({ ...collectionSchema.parse(value), version: 2, views: collectionSchema.parse(value).views.map(migrateSavedView) }) : collectionV2Schema.parse(value);
  } catch { throw new SavedViewsError("invalid"); }
  if (collection.dataset !== dataset) throw new SavedViewsError("dataset");
  return collection.views;
}

export function readSavedViews(storage: StorageAccess, dataset: DatasetMode): SavedView[] {
  let raw: string | null;
  let modern = false;
  try { raw = storage.getItem(savedViewsKey(dataset)); modern = raw !== null; if (raw === null) raw = storage.getItem(legacySavedViewsKey(dataset)); }
  catch { throw new SavedViewsError("storage"); }
  if (raw === null) return [];
  try {
    if (modern && JSON.parse(raw)?.version !== 2) throw Error("Unknown collection version");
    return parseSavedViewsBackup(raw, dataset);
  } catch { throw new SavedViewsError("invalid"); }
}

export function exportSavedViews(storage: StorageAccess, dataset: DatasetMode): string {
  return JSON.stringify({ version: 2, dataset, views: readSavedViews(storage, dataset) }, null, 2);
}

// Normalize through the schema before comparing, so JSON property order and
// predicate ordering do not turn an unchanged backup into a conflict.
export function planSavedViewsImport(previous: SavedView[], incoming: SavedView[]) {
  const existing = new Map(previous.map(view => [view.id, savedViewSchema.parse(view)]));
  const additions: SavedView[] = [];
  let skipped = 0;
  for (const candidate of incoming) {
    const view = savedViewSchema.parse(candidate);
    const sameId = existing.get(view.id);
    if (sameId) {
      if (JSON.stringify(sameId) !== JSON.stringify(view)) throw new SavedViewsError("conflict");
      skipped++;
    } else {
      additions.push(view);
      existing.set(view.id, view);
    }
  }
  if (previous.length + additions.length > SAVED_VIEW_LIMIT) throw new SavedViewsError("limit");
  return { views: [...additions, ...previous], added: additions.length, skipped };
}

// Re-parse the original file and re-read storage at confirmation time. A failed
// merge never partially imports a collection or overwrites an existing view.
export function importSavedViews(storage: StorageAccess, dataset: DatasetMode, raw: string) {
  const incoming = parseSavedViewsBackup(raw, dataset);
  const result = planSavedViewsImport(readSavedViews(storage, dataset), incoming);
  if (result.added > 0) {
    try { storage.setItem(savedViewsKey(dataset), JSON.stringify({ version: 2, dataset, views: result.views })); }
    catch { throw new SavedViewsError("storage"); }
  }
  return result;
}

// Re-read before each user action so a stale mounted list does not overwrite
// another tab's already committed edits. Invalid data is never auto-cleared.
export function editSavedViews(storage: StorageAccess, dataset: DatasetMode, edit: { add: SavedView } | { remove: string }): SavedView[] {
  const previous = readSavedViews(storage, dataset);
  if ("add" in edit && previous.length >= SAVED_VIEW_LIMIT) throw new SavedViewsError("limit");
  const views = "add" in edit ? [savedViewSchema.parse(edit.add), ...previous] : previous.filter(view => view.id !== edit.remove);
  const collection = collectionV2Schema.parse({ version: 2, dataset, views });
  try { storage.setItem(savedViewsKey(dataset), JSON.stringify(collection)); }
  catch { throw new SavedViewsError("storage"); }
  return collection.views;
}
