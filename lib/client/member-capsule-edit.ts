import type { MemberCapsule, MemberCapsuleContent } from "../domain/member-capsule";
import { memberCapsuleContentSchema } from "../domain/member-capsule";
import type { ResolvedCapsule } from "./local-capsules";

export type MemberCapsuleDraft = {
  ownerId: string;
  base: MemberCapsule;
  expected: MemberCapsule;
  content: MemberCapsuleContent;
  resolved: ResolvedCapsule;
  needsCheck: boolean;
};
const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every(id => b.includes(id));
export function sameMemberContent(a: MemberCapsuleContent, b: MemberCapsuleContent) {
  return a.dataset === b.dataset && a.language === b.language && a.title.trim() === b.title.trim() && a.note === b.note
    && sameIds(a.entityIds, b.entityIds) && sameIds(a.claimIds, b.claimIds);
}
export function memberDraftRequired(draft: MemberCapsuleDraft) {
  return new Set(draft.content.claimIds.flatMap(id => {
    const claim = draft.resolved.claims[id];
    return claim ? [claim.subjectId, claim.objectId] : draft.base.content.entityIds;
  }));
}
export function memberDraftContent(draft: MemberCapsuleDraft) {
  const entityIds = [...new Set([...draft.content.entityIds, ...memberDraftRequired(draft)])];
  // New references must have been explicitly resolved and confirmed. Existing
  // unresolved references remain editable without guessing their endpoints.
  if (entityIds.some(id => !draft.base.content.entityIds.includes(id) && !draft.resolved.entities[id])
    || draft.content.claimIds.some(id => !draft.base.content.claimIds.includes(id) && !draft.resolved.claims[id])) throw new Error("Unknown reference");
  return memberCapsuleContentSchema.parse({ ...draft.content, entityIds });
}
