import type { MemberCapsule, MemberCapsuleContent } from "../domain/member-capsule";
import { memberReaderCapsule } from "./member-api";
import { resolveCapsule, type ResolvedCapsule } from "./local-capsules";

function references(before: string[], after: string[]) {
  const previous = new Set(before), current = new Set(after);
  return {
    added: after.filter(id => !previous.has(id)),
    removed: before.filter(id => !current.has(id)),
    retained: before.filter(id => current.has(id)).length,
  };
}

// Membership is explicit and keyed by independent Entity / Claim IDs. Ordering,
// timestamps and current KG content are not Capsule content changes.
export function compareCapsuleContent(before: MemberCapsuleContent, after: MemberCapsuleContent) {
  if (before.dataset !== after.dataset) throw new Error("Dataset mismatch");
  const entities = references(before.entityIds, after.entityIds);
  const claims = references(before.claimIds, after.claimIds);
  const titleChanged = before.title !== after.title, noteChanged = before.note !== after.note;
  return { entities, claims, titleChanged, noteChanged,
    changed: titleChanged || noteChanged || !!(entities.added.length + entities.removed.length + claims.added.length + claims.removed.length) };
}

export type ComparisonReferences = { before: ResolvedCapsule; after: ResolvedCapsule };
// Reuse the bounded, ID-checked reader, but only resolve changed claims. Each
// side retains its own endpoint membership check. Never construct a union graph.
export async function resolveComparisonReferences(before: MemberCapsule, after: MemberCapsule, signal: AbortSignal): Promise<ComparisonReferences> {
  const diff = compareCapsuleContent(before.content, after.content);
  async function resolve(capsule: MemberCapsule, entityIds: string[], claimIds: string[]) {
    if (!entityIds.length && !claimIds.length) return { entities: {}, claims: {}, issues: [] };
    return resolveCapsule({ ...memberReaderCapsule(capsule, before.content.dataset),
      entityIds: claimIds.length ? capsule.content.entityIds : entityIds, claimIds }, signal);
  }
  // Sequential batches keep the existing four-request concurrency bound.
  const previous = await resolve(before, diff.entities.removed, diff.claims.removed);
  const current = await resolve(after, diff.entities.added, diff.claims.added);
  return { before: previous, after: current };
}
