import { z } from "zod";
import { checkPendingFilmRoles, pendingFilmRolesSchema } from "./pending-film-roles";
import { checkRoleVocabulary, roleCatalogSchema, roleReviewSchema } from "./role-vocabulary";
import { vocabularyHash } from "./vocabulary";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const filmRoleDecisionSchema = z.strictObject({
  schemaVersion: z.literal(1), status: z.enum(["draft-not-approved", "approved"]),
  baseCatalogHash: digest, baseReviewsHash: digest, pendingHash: digest, reviewDraftsHash: digest,
  roles: z.array(z.strictObject({ targetId: z.enum(["DIRECTING", "ACTING"]), beforeHash: z.null(), afterHash: digest })).length(2),
  humanDecision: z.strictObject({ actorType: z.literal("human"), reviewer: z.string().trim().min(1),
    decidedAt: z.iso.datetime({ offset: true }), statement: z.string().trim().min(1) }).nullable(),
});
export function prepareFilmRoleDecision(catalog: unknown, reviews: unknown, pending: unknown, reviewDrafts: unknown) {
  const roles = checkPendingFilmRoles(pending).map(({ targetId, beforeHash, afterHash }) => ({ targetId, beforeHash, afterHash }));
  return { schemaVersion: 1, status: "draft-not-approved", baseCatalogHash: vocabularyHash(catalog),
    baseReviewsHash: vocabularyHash(reviews), pendingHash: vocabularyHash(pending), reviewDraftsHash: vocabularyHash(reviewDrafts),
    roles, humanDecision: null };
}
export function registerFilmRoles(input: unknown, catalogInput: unknown, baseline: unknown, reviewsInput: unknown,
  pendingInput: unknown, reviewDraftsInput: unknown, now = Date.now()) {
  const decision = filmRoleDecisionSchema.parse(input);
  if (decision.status !== "approved" || !decision.humanDecision) throw Error("Fixed human Role decision required");
  if (Date.parse(decision.humanDecision.decidedAt) > now) throw Error("Future human decision rejected");
  const expected = prepareFilmRoleDecision(catalogInput, reviewsInput, pendingInput, reviewDraftsInput);
  if (vocabularyHash({ ...decision, status: "draft-not-approved", humanDecision: null }) !== vocabularyHash(expected)) throw Error("Role decision binding changed");
  const catalog = roleCatalogSchema.parse(catalogInput), pending = pendingFilmRolesSchema.parse(pendingInput);
  if (pending.entries.some(entry => catalog.entries.some(old => old.id === entry.id))) throw Error("Film Role already registered; never rewrite its approval");
  const oldReviews = z.array(roleReviewSchema).parse(reviewsInput);
  const drafts = z.array(roleReviewSchema).parse(reviewDraftsInput);
  if (drafts.length !== 2 || new Set(drafts.map(r => r.targetId)).size !== 2) throw Error("Exactly two film review drafts required");
  const newReviews = drafts.map(draft => {
    const role = decision.roles.find(role => role.targetId === draft.targetId);
    const entry = pending.entries.find(entry => entry.id === draft.targetId);
    if (!role || !entry || draft.status !== "draft" || draft.beforeHash !== null || draft.afterHash !== role.afterHash ||
        draft.change !== "addition" || draft.outcome !== "qualifier" ||
        vocabularyHash(draft.comparisons) !== vocabularyHash(entry.comparisons) || draft.predicateRationale !== entry.predicateRationale) throw Error("Film review draft differs from definition");
    return { ...draft, status: "approved", reviewer: decision.humanDecision!.reviewer, reviewedAt: decision.humanDecision!.decidedAt.slice(0, 10) };
  });
  const nextCatalog = { ...catalog, entries: [...catalog.entries, ...pending.entries] };
  const nextReviews = [...oldReviews, ...newReviews];
  for (const base of [baseline, catalog]) {
    const check = checkRoleVocabulary(nextCatalog, base, nextReviews);
    if (check.errors.length) throw Error(check.errors.join("; "));
  }
  return { catalog: nextCatalog, reviews: nextReviews };
}
