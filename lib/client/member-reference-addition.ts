import { MEMBER_CAPSULE_LIMITS } from "../domain/member-capsule";
import type { DatasetMode } from "../domain/dataset";
import type { ClaimDetail, EntityDetail } from "../domain/api";
import { parseReadingLocation, readClaimReference, readEntityReference, type ReadingReference } from "./reading-reference";
import { memberDraftRequired, type MemberCapsuleDraft } from "./member-capsule-edit";

export type MemberReferenceAddition = { reference: ReadingReference; entities: EntityDetail[]; claim: ClaimDetail | null };

// Only extract an internal reference. Never fetch the supplied URL or forward
// credentials to its origin. Shared/private links are not KG references.
export function parseMemberReferenceLink(value: string, origin: string, dataset: DatasetMode): ReadingReference | null {
  try {
    if (value.length > 2048) return null;
    const url = new URL(value.trim(), origin);
    if (url.origin !== origin || url.pathname !== "/" || url.username || url.password || url.hash) return null;
    if ([...url.searchParams.keys()].some(key => !["read", "dataset", "id"].includes(key))) return null;
    const parsed = parseReadingLocation(url.searchParams, dataset);
    return parsed?.status === "ready" ? parsed.reference : null;
  } catch { return null; }
}

export async function loadMemberReference(reference: ReadingReference, signal: AbortSignal): Promise<MemberReferenceAddition> {
  if (reference.kind === "entity") return { reference, entities: [await readEntityReference(reference.id, signal)], claim: null };
  const claim = await readClaimReference(reference.id, signal);
  const entities = await Promise.all([...new Set([claim.subjectId, claim.objectId])].map(id => readEntityReference(id, signal)));
  signal.throwIfAborted();
  return { reference, entities, claim };
}

export function addMemberReference(draft: MemberCapsuleDraft, addition: MemberReferenceAddition): MemberCapsuleDraft {
  if (addition.reference.dataset !== draft.content.dataset) throw new Error("Dataset mismatch");
  const entityIds = addition.entities.map(entity => entity.id);
  if (addition.reference.kind === "entity"
    ? addition.claim !== null || entityIds.length !== 1 || entityIds[0] !== addition.reference.id
    : !addition.claim || addition.claim.id !== addition.reference.id || !entityIds.includes(addition.claim.subjectId) || !entityIds.includes(addition.claim.objectId) || entityIds.some(id => id !== addition.claim!.subjectId && id !== addition.claim!.objectId)) throw new Error("Reference mismatch");
  const next: MemberCapsuleDraft = {
    ...draft,
    content: { ...draft.content, entityIds: [...new Set([...draft.content.entityIds, ...entityIds])],
      claimIds: [...new Set([...draft.content.claimIds, ...(addition.claim ? [addition.claim.id] : [])])] },
    resolved: { ...draft.resolved,
      entities: { ...draft.resolved.entities, ...Object.fromEntries(addition.entities.map(entity => [entity.id, entity])) },
      claims: { ...draft.resolved.claims, ...(addition.claim ? { [addition.claim.id]: addition.claim } : {}) } },
  };
  // Validate atomically: a limit failure must not leave half a claim or its endpoints.
  // Title/note may still be incomplete; validate them when saving the draft.
  const members = new Set([...next.content.entityIds, ...memberDraftRequired(next)]);
  if (members.size > MEMBER_CAPSULE_LIMITS.entities || next.content.claimIds.length > MEMBER_CAPSULE_LIMITS.claims) throw new Error("Reference limit");
  return next;
}
