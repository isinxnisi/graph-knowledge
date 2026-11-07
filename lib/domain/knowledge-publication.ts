import { z } from "zod";
import {
  knowledgeIdSchema, knowledgeRecordSearchText, type KnowledgeEntityVersion,
  type KnowledgeMappingVersion, type KnowledgeRecordVersion, type KnowledgeSourceVersion,
} from "./knowledge-foundation";
import { validateFixture, type Fixture } from "./fixture";
import { roleIdSchema, isbn13Schema, type Contribution } from "./contribution";
import { organizationPositionSchema, type OrganizationParticipation } from "./organization-participation";
import { eventRoleSchema, type EventMetadata, type EventParticipation } from "./event-participation";
import { isValidPartialDate, type PartialDate } from "./dates";
import { PREDICATE_KEYS } from "./predicates";

export type KnowledgeLegacyLink = {
  dataset: string; legacyClaimId: string; recordId: string; importedRevision: number;
  payload: unknown; sha256: string;
};
export type KnowledgeLegacyTyped = {
  dataset: string; legacyClaimId: string; importedRevision: number;
  predicate: Fixture["claims"][number]["predicate"];
  contribution: Contribution | null;
  organizationParticipation: OrganizationParticipation | null;
  eventParticipation: EventParticipation | null;
  claimPeriod: Fixture["claims"][number]["period"];
  event: { id: string; name: string; metadata: EventMetadata } | null;
  citationQualifications: {
    id: string;
    roleEvidence: NonNullable<Fixture["citations"][number]["roleEvidence"]> | null;
    positionEvidence: NonNullable<Fixture["citations"][number]["positionEvidence"]> | null;
    eventParticipationEvidence: NonNullable<Fixture["citations"][number]["eventParticipationEvidence"]> | null;
  }[];
};
export type KnowledgePublishedRecord = {
  record: KnowledgeRecordVersion;
  /** Original concrete language, never a generated generic relationship type. */
  label: string;
  entities: KnowledgeEntityVersion[];
  sources: KnowledgeSourceVersion[];
  semantics: {
    status: "unmapped" | "current" | "stale";
    mappingRevision: number | null; recordRevision: number | null;
    concept: KnowledgeMappingVersion["content"]["concept"];
  };
  legacyTyped: KnowledgeLegacyTyped | null;
};
export type KnowledgePublicationContext = {
  entities: KnowledgeEntityVersion[]; sources: KnowledgeSourceVersion[];
  mappings: KnowledgeMappingVersion[]; legacyLink?: KnowledgeLegacyLink | null;
};
export type KnowledgePublicationGraph = {
  generationId: string;
  entities: KnowledgeEntityVersion[];
  records: KnowledgePublishedRecord[];
  sources: KnowledgeSourceVersion[];
};

const generationId = z.string().regex(/^k75-[a-f0-9]{32}$/);
const cleanQueryText = z.string().trim().max(200).refine(value => !/[\u0000-\u001f\u007f]/.test(value), "制御文字を含む検索条件です");
export const knowledgePublicationQuerySchema = z.strictObject({
  q: cleanQueryText.default(""),
  entityId: knowledgeIdSchema.optional(),
  relationLabel: cleanQueryText.min(1).optional(),
  polarity: z.enum(["affirmed", "denied", "uncertain"]).optional(),
  conceptId: knowledgeIdSchema.optional(),
  predicate: z.enum(PREDICATE_KEYS).optional(),
  predicates: z.array(z.enum(PREDICATE_KEYS)).min(1).max(PREDICATE_KEYS.length).transform(ids=>[...new Set(ids)].sort()).optional(),
  entityKind: z.string().trim().min(1).max(80).optional(),
  aroundId: knowledgeIdSchema.optional(),
  scopeIds: z.array(knowledgeIdSchema).max(20000).transform(ids=>[...new Set(ids)].sort()).optional(),
  roleId: roleIdSchema.optional(),
  isbn13: isbn13Schema.optional(),
  organizationPositionId: organizationPositionSchema.optional(),
  eventRoleId: eventRoleSchema.optional(),
  eventId: knowledgeIdSchema.optional(),
  eventDay: z.string().refine(value => isValidPartialDate({ value, precision: "day" }), "開催日が不正です").optional(),
  generation: generationId.optional(),
  limit: z.number().int().min(1).max(50).default(20),
  // Decoding, generation/filter binding and keyset validation belong to the read service.
  cursor: z.string().min(1).max(2048).regex(/^[A-Za-z0-9_-]+$/).optional(),
}).superRefine((query, context) => {
  const required = [
    ...(query.roleId || query.isbn13 ? ["CONTRIBUTED_TO"] : []),
    ...(query.organizationPositionId ? ["AFFILIATED_WITH"] : []),
    ...(query.eventRoleId || query.eventId || query.eventDay ? ["PARTICIPATED_IN"] : []),
  ];
  if (new Set(required).size > 1 || (query.predicate && required.some(p => p !== query.predicate)))
    context.addIssue({ code: "custom", message: "異なる種類の関係条件が混在しています" });
});
export type KnowledgePublicationQuery = z.infer<typeof knowledgePublicationQuerySchema>;

function selectLegacyTyped(record: KnowledgeRecordVersion, link?: KnowledgeLegacyLink | null): KnowledgeLegacyTyped | null {
  if (!link) return null;
  if (link.recordId !== record.id)
    throw new Error("Legacy link does not identify this imported record");
  // Even a correction with an unchanged display label needs a fresh meaning decision.
  if (link.importedRevision !== record.revision && !(record.content.legacySemantics?.recordRevision===link.importedRevision&&record.content.legacySemantics.sha256===link.sha256)) return null;
  if (!/^[a-f0-9]{64}$/.test(link.sha256) || link.importedRevision !== 1)
    throw new Error("Legacy link is not an immutable import reference");
  // An observed Theme source also uses the immutable provenance registry, but
  // is not a typed legacy KG Claim. Its free relation remains the common label.
  const themeOrigin = z.object({ importKind: z.literal("theme75"),
    origin: z.object({ kind: z.literal("theme75-observation"), observedSha256: z.string().regex(/^[a-f0-9]{64}$/) }),
    record: z.object({ id: z.string() }),
  }).safeParse(link.payload);
  if (themeOrigin.success) {
    if (link.dataset !== `theme75:${themeOrigin.data.origin.observedSha256}` || themeOrigin.data.record.id !== link.legacyClaimId)
      throw new Error("Theme origin does not identify this imported record");
    return null;
  }
  // The persistence layer verifies the payload hash. Do not expose the raw payload.
  const payload = z.object({
    fixtureSchemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    claim: z.unknown(), entities: z.array(z.unknown()), sources: z.array(z.unknown()), citations: z.array(z.unknown()),
  }).parse(link.payload);
  const fixture = validateFixture({
    schemaVersion: payload.fixtureSchemaVersion, entities: payload.entities, claims: [payload.claim],
    sources: payload.sources, citations: payload.citations,
  });
  const claim = fixture.claims[0];
  if (claim.id !== link.legacyClaimId || claim.subjectId !== record.content.subjectId ||
      claim.objectId !== record.content.objectId || claim.polarity !== record.content.polarity)
    throw new Error("Legacy identity, direction or polarity differs from the imported revision");
  const occurrence = claim.predicate === "PARTICIPATED_IN"
    ? fixture.entities.find(entity => entity.id === claim.objectId && entity.event) : undefined;
  return {
    dataset: link.dataset, legacyClaimId: link.legacyClaimId, importedRevision: link.importedRevision,
    predicate: claim.predicate, contribution: claim.contribution ?? null,
    organizationParticipation: claim.organizationParticipation ?? null,
    eventParticipation: claim.eventParticipation ?? null, claimPeriod: claim.period,
    event: occurrence?.event ? { id: occurrence.id, name: occurrence.name, metadata: occurrence.event } : null,
    citationQualifications: fixture.citations.map(citation => ({
      id: citation.id, roleEvidence: citation.roleEvidence ?? null,
      positionEvidence: citation.positionEvidence ?? null,
      eventParticipationEvidence: citation.eventParticipationEvidence ?? null,
    })),
  };
}

/** Only already-public, generation-fixed dependencies may be supplied by the publisher. */
export function buildKnowledgePublishedRecord(record: KnowledgeRecordVersion, context: KnowledgePublicationContext): KnowledgePublishedRecord {
  const entityIds = [...new Set([record.content.subjectId, record.content.objectId].filter((id): id is string => Boolean(id)))];
  const entities = entityIds.map(id => {
    const matches = context.entities.filter(entity => entity.id === id);
    if (matches.length !== 1) throw new Error("A publication record needs one fixed entity revision per endpoint");
    return matches[0];
  });
  const sourcePins = new Map(record.content.evidence.map(evidence => [evidence.source.id + "@" + evidence.source.revision, evidence.source]));
  const sources = [...sourcePins.values()].map(pin => {
    const matches = context.sources.filter(source => source.id === pin.id && source.revision === pin.revision);
    if (matches.length !== 1) throw new Error("A publication record needs the exact cited source revision");
    return matches[0];
  });
  const mappings = context.mappings.filter(mapping => mapping.id === record.id);
  if (mappings.length > 1) throw new Error("Ambiguous publication mapping revision");
  const mapping = mappings[0];
  const semantics: KnowledgePublishedRecord["semantics"] = {
    status: !mapping ? "unmapped" : mapping.content.recordRevision !== record.revision ? "stale" : mapping.content.concept ? "current" : "unmapped",
    mappingRevision: mapping?.revision ?? null, recordRevision: mapping?.content.recordRevision ?? null,
    concept: mapping?.content.concept ?? null,
  };
  return {
    record, label: record.content.relation || record.content.assertion, entities, sources, semantics,
    legacyTyped: selectLegacyTyped(record, context.legacyLink),
  };
}

/** Bounds are search aids only. They never replace the original partial dates. */
function dateBound(date: PartialDate, end: boolean): string {
  const [year, rawMonth, rawDay] = date.value.split("-").map(Number);
  const month = date.precision === "year" ? (end ? 12 : 1) : rawMonth;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const last = month === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
  const day = date.precision === "day" ? rawDay : end ? last : 1;
  return [String(year).padStart(4, "0"), String(month).padStart(2, "0"), String(day).padStart(2, "0")].join("-");
}

export function flattenKnowledgePublishedRecord(dto: KnowledgePublishedRecord) {
  const typed = dto.legacyTyped;
  const concept = dto.semantics.status === "current" ? dto.semantics.concept : null;
  const period = typed?.event?.metadata.period;
  const eventFrom = period?.from ?? null, eventTo = period?.to ?? null;
  return {
    searchText: [
      knowledgeRecordSearchText(dto.record, dto.entities),
      ...dto.sources.flatMap(source => [source.content.title, source.content.bibliography]),
      ...dto.record.content.evidence.map(evidence => evidence.locator),
      concept?.label ?? "",
    ].join(" ").normalize("NFKC").toLocaleLowerCase(),
    relationLabel: dto.label, polarity: dto.record.content.polarity,
    predicate: typed?.predicate ?? null, roleId: typed?.contribution?.roleId ?? null,
    isbn13: typed?.contribution?.scope?.isbn13 ?? null,
    organizationPositionId: typed?.organizationParticipation?.positionId ?? null,
    eventRoleId: typed?.eventParticipation?.roleId ?? null, eventId: typed?.event?.id ?? null,
    eventFrom, eventTo,
    // An unknown boundary is not an infinitely long event.
    eventFromLower: eventFrom && eventTo ? dateBound(eventFrom, false) : null,
    eventToUpper: eventFrom && eventTo ? dateBound(eventTo, true) : null,
    conceptId: concept?.id ?? null, conceptLabel: concept?.label ?? null,
  };
}
export type KnowledgePublicationIndex = ReturnType<typeof flattenKnowledgePublishedRecord>;

export function knowledgePublicationGraph(generationId: string, records: KnowledgePublishedRecord[]): KnowledgePublicationGraph {
  generationId = knowledgePublicationQuerySchema.shape.generation.unwrap().parse(generationId);
  const entities = new Map<string, KnowledgeEntityVersion>();
  const sources = new Map<string, KnowledgeSourceVersion>();
  for (const dto of records) {
    for (const entity of dto.entities) {
      const previous = entities.get(entity.id);
      if (previous && previous.revision !== entity.revision) throw new Error("Graph endpoints span different publication revisions");
      entities.set(entity.id, entity);
    }
    for (const source of dto.sources) sources.set(source.id + "@" + source.revision, source);
  }
  return { generationId, records, entities: [...entities.values()], sources: [...sources.values()] };
}
