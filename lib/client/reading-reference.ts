import { z } from "zod";
import { DATASET_MODES, type DatasetMode } from "../domain/dataset";
import { claimDetailSchema, entityDetailSchema } from "../domain/api";
import { ClientApiError, fetchClaim, fetchEntity } from "./api";

export type ReadingReference = { kind: "entity" | "claim"; dataset: DatasetMode; id: string };
export type ReadingLocation = { status: "ready"; reference: ReadingReference } | { status: "invalid" } | { status: "dataset"; dataset: DatasetMode } | null;
const keys = ["read", "dataset", "id"] as const;
const idSchema = z.uuidv4();

export function readingHref(reference: ReadingReference): string {
  return `/?${new URLSearchParams({ read: reference.kind, dataset: reference.dataset, id: reference.id })}`;
}

export function parseReadingLocation(params: Pick<URLSearchParams, "has" | "getAll" | "get">, activeDataset: DatasetMode): ReadingLocation {
  if (!keys.some(key => params.has(key))) return null;
  if (keys.some(key => params.getAll(key).length !== 1)) return { status: "invalid" };
  const kind = params.get("read"), dataset = params.get("dataset"), id = params.get("id");
  if ((kind !== "entity" && kind !== "claim") || !DATASET_MODES.includes(dataset as DatasetMode) || !idSchema.safeParse(id).success) return { status: "invalid" };
  if (dataset !== activeDataset) return { status: "dataset", dataset: dataset as DatasetMode };
  return { status: "ready", reference: { kind, dataset: activeDataset, id: id!.toLowerCase() } };
}

export function withoutReadingReference(url: URL): string {
  for (const key of keys) url.searchParams.delete(key);
  return `${url.pathname}${url.search}${url.hash}`;
}

// Read current published knowledge only; a URL is neither a snapshot nor a permission.
export async function readEntityReference(id: string, signal: AbortSignal) {
  const result = await fetchEntity(id, signal);
  signal.throwIfAborted();
  const entity = entityDetailSchema.safeParse(result.entity);
  if (!entity.success || entity.data.id !== id) throw new ClientApiError("対象の応答を確認できませんでした。再試行してください。", 0);
  return entity.data;
}
export async function readClaimReference(id: string, signal: AbortSignal) {
  const result = await fetchClaim(id, signal);
  signal.throwIfAborted();
  const claim = claimDetailSchema.safeParse(result.claim);
  if (!claim.success || claim.data.id !== id) throw new ClientApiError("主張の応答を確認できませんでした。再試行してください。", 0);
  return claim.data;
}
