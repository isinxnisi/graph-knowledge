import { z } from "zod";
import { memberCapsuleSchema, memberCapsuleContentSchema, memberCreateSchema, type MemberCapsule } from "../domain/member-capsule";
import type { DatasetMode } from "../domain/dataset";
import type { LocalCapsule } from "./local-capsules";

export const memberProfileSchema = z.object({ user: z.object({ id: z.uuidv4(), name: z.string(), locale: z.string() }) });
export type MemberUser = z.infer<typeof memberProfileSchema>["user"];
export class MemberClientError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
export async function memberRequest<T>(path: string, schema: z.ZodType<T>, options: { method?: string; body?: unknown; user?: string; signal?: AbortSignal } = {}): Promise<T> {
  const response = await fetch(path, { method: options.method ?? "GET", credentials: "same-origin", cache: "no-store",
    headers: { ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}), ...(options.user ? { "X-Member-User": options.user } : {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body), signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new MemberClientError(response.status, error?.error?.code ?? "REQUEST_FAILED");
  }
  return schema.parse(await response.json());
}
export const memberListSchema = z.object({ capsules: z.array(memberCapsuleSchema).max(10) });
export const memberItemSchema = z.object({ capsule: memberCapsuleSchema });
export const memberCreateResultSchema = memberItemSchema.extend({ replayed: z.boolean() });
export function memberReaderCapsule(capsule: MemberCapsule, dataset: DatasetMode): LocalCapsule {
  const value = memberCapsuleSchema.parse(capsule);
  if (value.content.dataset !== dataset) throw new Error("Dataset mismatch");
  return { ...value.content, id: value.id, revision: value.revision, createdAt: value.createdAt, ...(value.revision > 1 ? { updatedAt: value.updatedAt } : {}) };
}
// Persist the retry key before sending. Reload, ambiguous network failure and
// re-login in this tab must not create another copy of the same local revision.
// This is retry metadata, not authentication state or a cache of account-private content.
export function memberImportRequest(storage: Pick<Storage, "getItem" | "setItem">, user: string, capsule: LocalCapsule) {
  const { dataset, title, note, language, entityIds, claimIds } = capsule;
  const content = memberCapsuleContentSchema.parse({ dataset, title, note, language, entityIds, claimIds });
  const key = `graph-knowledge:member-import:${user}:${dataset}:${capsule.id}:${capsule.revision}`;
  const previous = storage.getItem(key);
  if (previous) {
    const parsed = memberCreateSchema.parse(JSON.parse(previous));
    if (JSON.stringify(parsed.content) !== JSON.stringify(content)) throw new Error("Local revision changed");
    return parsed;
  }
  const request = { requestId: crypto.randomUUID(), content };
  storage.setItem(key, JSON.stringify(request));
  return request;
}
