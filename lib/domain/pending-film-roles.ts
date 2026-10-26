import { z } from "zod";
import { roleCatalogSchema } from "./role-vocabulary";
import { CONTRIBUTION_ROLE_IDS, PENDING_CONTRIBUTION_ROLE_IDS } from "./contribution";
import { contributionLabels } from "../i18n/contribution";
import { vocabularyHash } from "./vocabulary";
export const pendingFilmRolesSchema = z.strictObject({
  schemaVersion: z.literal(1), status: z.literal("pending-human-review"),
  reviewer: z.null(), reviewedAt: z.null(), adoptionPolicy: z.string().min(1),
  entries: roleCatalogSchema.shape.entries,
});
export function checkPendingFilmRoles(input: unknown) {
  const draft = pendingFilmRolesSchema.parse(input);
  if (draft.entries.length !== 2 || new Set(draft.entries.map(e => e.id)).size !== 2) throw Error("Exactly two pending film roles required");
  for (const id of PENDING_CONTRIBUTION_ROLE_IDS) {
    const entry = draft.entries.find(e => e.id === id);
    if (!entry) throw Error("Missing pending film role");
    if (entry.comparisons.length !== CONTRIBUTION_ROLE_IDS.length - 1 ||
        CONTRIBUTION_ROLE_IDS.some(other => other !== id && !entry.comparisons.some(c => c.roleId === other && c.relation === "distinct"))) throw Error("Film role comparisons incomplete");
    for (const category of ["include", "exclude", "boundary"]) if (!entry.meaning.examples.some(e => e.category === category)) throw Error("Missing film role example");
    for (const locale of ["ja", "en"]) if (entry.translations[locale]?.label !== contributionLabels(locale).roles[id]) throw Error("Film runtime label mismatch");
  }
  return draft.entries.map(e => ({ targetId: e.id, beforeHash: null, afterHash: vocabularyHash(e), status: "draft-not-approved", reviewer: null, reviewedAt: null }));
}
