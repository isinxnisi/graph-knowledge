import { contributionSchema, roleEvidenceSchema, type Contribution, type RoleEvidence } from "./contribution";
import { organizationParticipationSchema, positionEvidenceSchema, type OrganizationParticipation, type PositionEvidence } from "./organization-participation";
import { invalidQualificationFields } from "./qualifications";
import { z } from "zod";
import { accessedAtSchema, partialDateSchema, periodSchema } from "./dates";
import { ENTITY_KINDS, PREDICATE_KEYS, PREDICATES } from "./predicates";

const id = z.uuidv4();
const text = z.string().trim().min(1);
const nullableText = text.nullable();
const timestamp = z.iso.datetime();

export const entitySchema = z.strictObject({
  id, kind: z.enum(ENTITY_KINDS), name: text, description: nullableText,
  aliases: z.array(text), externalIds: z.array(z.strictObject({ namespace: text, value: text })),
  createdAt: timestamp, updatedAt: timestamp,
});
export const claimSchema = z.strictObject({
  id, subjectId: id, objectId: id, predicate: z.enum(PREDICATE_KEYS),
  polarity: z.enum(["affirmed", "denied"]), period: periodSchema,
  visibility: z.enum(["published", "hidden"]), createdAt: timestamp, updatedAt: timestamp,
});
export const sourceSchema = z.strictObject({
  id, kind: z.enum(["book", "interview", "magazine", "web", "paper"]), title: text,
  authors: z.array(text), publisher: nullableText,
  url: z.url({ protocol: /^https?$/ }).nullable(), publishedAt: partialDateSchema.nullable(),
  edition: nullableText, note: nullableText, isDemo: z.boolean(),
});
export const citationSchema = z.strictObject({
  id, claimId: id, sourceId: id, locator: text, note: nullableText,
  accessedAt: accessedAtSchema, stance: z.enum(["support", "refute", "background"]),
});

const fixtureBaseSchema = z.strictObject({
  schemaVersion: z.literal(1),
  entities: z.array(entitySchema), claims: z.array(claimSchema),
  sources: z.array(sourceSchema), citations: z.array(citationSchema),
});
function validateReferences(fixture: z.infer<typeof fixtureBaseSchema>, ctx: z.RefinementCtx) {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
  const seen = new Set<string>();
  for (const key of ["entities", "claims", "sources", "citations"] as const) {
    fixture[key].forEach((node, i) => {
      if (seen.has(node.id)) issue([key, i, "id"], "Duplicate internal ID");
      seen.add(node.id);
    });
  }
  const entities = new Map(fixture.entities.map((entity) => [entity.id, entity]));
  const claims = new Set(fixture.claims.map((claim) => claim.id));
  const sources = new Set(fixture.sources.map((source) => source.id));
  fixture.claims.forEach((claim, i) => {
    const definition = PREDICATES[claim.predicate];
    const subject = entities.get(claim.subjectId);
    const object = entities.get(claim.objectId);
    if (!subject) issue(["claims", i, "subjectId"], "Missing subject");
    else if (subject.kind !== definition.subjectKind) issue(["claims", i, "subjectId"], "Invalid subject kind");
    if (!object) issue(["claims", i, "objectId"], "Missing object");
    else if (object.kind !== definition.objectKind) issue(["claims", i, "objectId"], "Invalid object kind");
  });
  fixture.citations.forEach((citation, i) => {
    if (!claims.has(citation.claimId)) issue(["citations", i, "claimId"], "Missing claim");
    if (!sources.has(citation.sourceId)) issue(["citations", i, "sourceId"], "Missing source");
  });
  const externalIds = new Set<string>();
  fixture.entities.forEach((entity, i) => entity.externalIds.forEach((external, j) => {
    const key = JSON.stringify([external.namespace, external.value]);
    if (externalIds.has(key)) issue(["entities", i, "externalIds", j], "Duplicate external identifier");
    externalIds.add(key);
  }));
}
export const fixtureSchema = fixtureBaseSchema.superRefine(validateReferences);

const claimV2Schema = claimSchema.extend({ contribution: contributionSchema.nullable() }).superRefine((claim, ctx) => {
  if ((claim.predicate === "CONTRIBUTED_TO") !== (claim.contribution !== null)) ctx.addIssue({ code: "custom", message: "Contribution must match predicate" });
});
export const fixtureV2Schema = z.strictObject({ ...fixtureBaseSchema.shape, schemaVersion: z.literal(2), claims: z.array(claimV2Schema), citations: z.array(citationSchema.extend({ roleEvidence: roleEvidenceSchema.nullable() })) }).superRefine((fixture, ctx) => {
  validateReferences({ ...fixture, schemaVersion: 1 }, ctx);
  const claims = new Map(fixture.claims.map((claim) => [claim.id, claim]));
  fixture.citations.forEach((citation, i) => {
    if (citation.roleEvidence && claims.get(citation.claimId)?.predicate !== "CONTRIBUTED_TO") ctx.addIssue({ code: "custom", path: ["citations", i, "roleEvidence"], message: "Role evidence is contribution-specific" });
  });
});
export const fixtureV3Schema = z.strictObject({ ...fixtureBaseSchema.shape, schemaVersion: z.literal(3),
  claims: z.array(claimSchema.extend({ contribution: contributionSchema.nullable(), organizationParticipation: organizationParticipationSchema.nullable() }).superRefine((claim, ctx) => {
    if ((claim.predicate === "CONTRIBUTED_TO") !== (claim.contribution !== null)) ctx.addIssue({ code: "custom", message: "Contribution must match predicate" });
    for (const field of invalidQualificationFields(claim)) ctx.addIssue({ code: "custom", path: [field], message: "Qualification must match registered predicate" });
  })),
  citations: z.array(citationSchema.extend({ roleEvidence: roleEvidenceSchema.nullable(), positionEvidence: positionEvidenceSchema.nullable() })),
}).superRefine((fixture, ctx) => {
  validateReferences({ ...fixture, schemaVersion: 1 }, ctx);
  const claims = new Map(fixture.claims.map(claim => [claim.id, claim]));
  fixture.citations.forEach((citation, i) => {
    const claim = claims.get(citation.claimId);
    if (citation.roleEvidence && claim?.predicate !== "CONTRIBUTED_TO") ctx.addIssue({ code: "custom", path: ["citations", i, "roleEvidence"], message: "Role evidence is contribution-specific" });
    if (citation.positionEvidence && !claim?.organizationParticipation) ctx.addIssue({ code: "custom", path: ["citations", i, "positionEvidence"], message: "Position evidence requires an explicitly qualified organization claim" });
  });
});
export type Fixture = Omit<z.infer<typeof fixtureSchema>, "schemaVersion" | "claims" | "citations"> & {
  schemaVersion: 1 | 2 | 3; claims: (z.infer<typeof claimSchema> & { contribution?: Contribution | null; organizationParticipation?: OrganizationParticipation | null })[];
  citations: (z.infer<typeof citationSchema> & { roleEvidence?: RoleEvidence | null; positionEvidence?: PositionEvidence | null })[];
};
export type Entity = z.infer<typeof entitySchema>;
export type Claim = z.infer<typeof claimSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Citation = z.infer<typeof citationSchema>;

export function validateFixture(input: unknown): Fixture {
  if (typeof input === "object" && input !== null && "schemaVersion" in input && input.schemaVersion === 3) return fixtureV3Schema.parse(input);
  return (typeof input === "object" && input !== null && "schemaVersion" in input && input.schemaVersion === 2) ? fixtureV2Schema.parse(input) : fixtureSchema.parse(input);
}

export function fixtureCounts(fixture: Fixture) {
  return {
    nodes: {
      Entity: fixture.entities.length, Claim: fixture.claims.length,
      Source: fixture.sources.length, Citation: fixture.citations.length,
      ExternalIdentifier: fixture.entities.reduce((sum, entity) => sum + entity.externalIds.length, 0),
    },
    relationships: {
      SUBJECT: fixture.claims.length, OBJECT: fixture.claims.length,
      HAS_CITATION: fixture.citations.length, CITES: fixture.citations.length,
      HAS_EXTERNAL_ID: fixture.entities.reduce((sum, entity) => sum + entity.externalIds.length, 0),
    },
  };
}
