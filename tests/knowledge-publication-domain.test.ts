import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildKnowledgePublishedRecord, flattenKnowledgePublishedRecord, knowledgePublicationGraph,
  knowledgePublicationQuerySchema,
} from "../lib/domain/knowledge-publication";
import { adaptLegacyKnowledge } from "../lib/domain/knowledge-legacy";
import type { KnowledgeMappingVersion, KnowledgeRecordVersion } from "../lib/domain/knowledge-foundation";

const sample = JSON.parse(readFileSync(new URL("../docs/research/issue75-foundation/legacy-sample.json", import.meta.url), "utf8"));
const adapted = adaptLegacyKnowledge(sample.fixture, sample.provenance);
const version = <T extends { id: string; content: unknown }>(item: T) => ({
  ...item, revision: 1, createdAt: "2026-11-02T00:00:00.000Z", reason: "公開済み原本の検証",
});
const entities = adapted.entities.map(version), sources = adapted.sources.map(version);
const records = adapted.records.map(version);
const generation = "k75-" + "a".repeat(32);
const scoped = records.find(record => adapted.legacyLinks.find(link => link.recordId === record.id)?.payload.claim.contribution?.scope)!;
const event = records.find(record => adapted.legacyLinks.find(link => link.recordId === record.id)?.payload.claim.predicate === "PARTICIPATED_IN")!;
const org = records.find(record => adapted.legacyLinks.find(link => link.recordId === record.id)?.payload.claim.organizationParticipation)!;
function publish(record = scoped, mappings: KnowledgeMappingVersion[] = []) {
  return buildKnowledgePublishedRecord(record, {
    entities, sources, mappings, legacyLink: adapted.legacyLinks.find(link => link.recordId === record.id),
  });
}
function mapping(record = scoped): KnowledgeMappingVersion {
  return {
    id: record.id, revision: 1, createdAt: "2026-11-02T00:00:00Z", reason: "意味を明示対応",
    content: { recordRevision: record.revision, concept: { id: "concept-independent", revision: 1, label: "対応先だけの独自概念", definition: "後から整理した意味" } },
  };
}

describe("knowledge publication domain", () => {
  it("keeps all six real records and their typed qualifications without flattening the concrete meaning", () => {
    for (const record of records) {
      const dto = publish(record);
      expect(dto.record).toEqual(record);
      expect(dto.label).toBe(record.content.relation);
      expect(dto.legacyTyped?.legacyClaimId).toBe(record.id);
      expect(dto.record.content.evidence.every(evidence => dto.sources.some(source => source.id === evidence.source.id && source.revision === evidence.source.revision))).toBe(true);
      expect(dto.legacyTyped?.citationQualifications.map(citation => citation.id).sort()).toEqual(record.content.evidence.map(evidence => evidence.id).sort());
    }
    expect(publish(scoped).legacyTyped?.contribution?.scope?.isbn13).toBe("9784063729221");
    expect(flattenKnowledgePublishedRecord(publish(scoped))).toMatchObject({ predicate: "CONTRIBUTED_TO", roleId: "STORY_CO_CREATION", isbn13: "9784063729221" });
    expect(flattenKnowledgePublishedRecord(publish(org)).organizationPositionId).toBe("VISITOR");
    expect(publish(event).legacyTyped?.eventParticipation?.roleId).toBe("CHAIR");
    expect(publish(event).legacyTyped?.citationQualifications).toHaveLength(2);
  });

  it("keeps occurrence dates separate from the participation claim and preserves partial-date precision", () => {
    const dto = publish(event);
    expect(dto.record.content.times).toEqual([]);
    expect(dto.legacyTyped?.claimPeriod).toEqual({ from: null, to: null });
    const index = flattenKnowledgePublishedRecord(dto);
    expect(index.eventFrom).toEqual(dto.legacyTyped?.event?.metadata.period.from);
    expect(index.eventTo).toEqual(dto.legacyTyped?.event?.metadata.period.to);
    expect(index.eventFromLower).toBe("1927-10-24");
    expect(index.eventToUpper).toBe("1927-10-29");
    const coarse = structuredClone(dto);
    coarse.legacyTyped!.event!.metadata.period = { from: { value: "1927", precision: "year" }, to: { value: "1927-02", precision: "month" } };
    expect(flattenKnowledgePublishedRecord(coarse)).toMatchObject({ eventFromLower: "1927-01-01", eventToUpper: "1927-02-28", eventFrom: { value: "1927", precision: "year" } });
    coarse.legacyTyped!.event!.metadata.period.to = null;
    expect(flattenKnowledgePublishedRecord(coarse)).toMatchObject({ eventFromLower: null, eventToUpper: null });
  });

  it("does not inherit imported roles or scope after correcting the Record, even when its label is unchanged", () => {
    const revised = { ...scoped, revision: 2, content: { ...scoped.content, assertion: "改訂した具体文" } };
    const dto = publish(revised);
    expect(dto.legacyTyped).toBeNull();
    expect(flattenKnowledgePublishedRecord(dto)).toMatchObject({ predicate: null, roleId: null, isbn13: null });
    expect(dto.record.content.scope).toBe(scoped.content.scope);
    expect(dto.label).toBe(scoped.content.relation);
  });

  it("keeps an unknown relationship, its stable ID, time, polarity and evidence without adding a predicate", () => {
    const novel: KnowledgeRecordVersion = {
      ...scoped, id: "new-independent-record",
      content: { ...scoped.content, relation: "創作ノートを交換した", assertion: "二人が創作ノートを交換したという不確かな記録",
        polarity: "uncertain", scope: "この資料に書かれた一度の交換",
        times: [{ id: "uncertain-date", time: { kind: "calendar", from: "1991", label: "1991年のどこか" } }],
        evidence: scoped.content.evidence.map(evidence => ({ ...evidence, stance: "background" as const })),
      },
    };
    const dto = publish(novel);
    expect(dto.record).toEqual(novel);
    expect(dto.label).toBe("創作ノートを交換した");
    expect(dto.legacyTyped).toBeNull();
    expect(flattenKnowledgePublishedRecord(dto)).toMatchObject({ predicate: null, polarity: "uncertain", relationLabel: "創作ノートを交換した" });
    const denied = publish({ ...novel, content: { ...novel.content, polarity: "denied" } });
    expect(denied.record.content.evidence[0].stance).toBe("background");
    expect(flattenKnowledgePublishedRecord(denied).polarity).toBe("denied");
  });

  it("indexes only a current mapping while retaining a stale mapping for explanation", () => {
    const current = publish(scoped, [mapping()]);
    expect(current.semantics.status).toBe("current");
    expect(flattenKnowledgePublishedRecord(current).conceptId).toBe("concept-independent");
    expect(flattenKnowledgePublishedRecord(current).searchText).toContain("対応先だけの独自概念");
    const revised = { ...scoped, revision: 2 };
    const stale = publish(revised, [mapping()]);
    expect(stale.semantics).toMatchObject({ status: "stale", recordRevision: 1, concept: { id: "concept-independent" } });
    expect(flattenKnowledgePublishedRecord(stale)).toMatchObject({ conceptId: null, conceptLabel: null });
    expect(flattenKnowledgePublishedRecord(stale).searchText).not.toContain("対応先だけの独自概念");
    const cleared = { ...mapping(), content: { recordRevision: 1, concept: null } };
    expect(publish(scoped, [cleared]).semantics.status).toBe("unmapped");
  });

  it("requires the exact cited Source revision and excludes unrelated dependencies", () => {
    const original = sources.find(source => source.id === scoped.content.evidence[0].source.id)!;
    const latest = { ...original, revision: 2, content: { ...original.content, title: "まだ引用していない資料新版" } };
    const dto = buildKnowledgePublishedRecord(scoped, { entities, sources: [...sources, latest], mappings: [] });
    expect(dto.sources).toContainEqual(original);
    expect(dto.sources).not.toContainEqual(latest);
    expect(() => buildKnowledgePublishedRecord(scoped, { entities, sources: sources.filter(source => source.id !== original.id).concat(latest), mappings: [] })).toThrow(/exact cited source/);
    expect(() => buildKnowledgePublishedRecord(scoped, { entities: entities.filter(entity => entity.id !== scoped.content.subjectId), sources, mappings: [] })).toThrow(/fixed entity/);
    expect(() => buildKnowledgePublishedRecord(scoped, { entities: [...entities, { ...entities.find(entity => entity.id === scoped.content.subjectId)!, revision: 2 }], sources, mappings: [] })).toThrow(/fixed entity/);
  });

  it("fails a mismatched legacy identity instead of silently applying its typed meaning", () => {
    const link = adapted.legacyLinks.find(link => link.recordId === scoped.id)!;
    expect(() => buildKnowledgePublishedRecord(scoped, { entities, sources, mappings: [], legacyLink: { ...link, recordId: "other" } })).toThrow(/identify/);
    expect(() => publish({ ...scoped, content: { ...scoped.content, polarity: "denied" } })).toThrow(/polarity/);
  });

  it("supports an explicit legacy-ID to new stable-ID mapping", () => {
    const link = adapted.legacyLinks.find(link => link.recordId === scoped.id)!;
    const renamed = { ...scoped, id: "new-record-identity" };
    const dto = buildKnowledgePublishedRecord(renamed, { entities, sources, mappings: [], legacyLink: { ...link, recordId: renamed.id } });
    expect(dto.record.id).toBe("new-record-identity");
    expect(dto.legacyTyped?.legacyClaimId).toBe(scoped.id);
    expect(dto.legacyTyped?.importedRevision).toBe(1);
  });

  it("makes an explicit generation graph with independent Record IDs and exact source versions", () => {
    const graph = knowledgePublicationGraph(generation, records.map(record => publish(record)));
    expect(graph.records.map(record => record.record.id)).toEqual(records.map(record => record.id));
    expect(graph.entities).toHaveLength(12);
    expect(graph.sources).toHaveLength(8);
    expect(graph.generationId).toBe(generation);
    const dto = publish(scoped), another = structuredClone(dto);
    another.record.id = "separate-record";
    another.entities[0].revision = 2;
    expect(() => knowledgePublicationGraph(generation, [dto, another])).toThrow(/different publication revisions/);
  });

  it("keeps two cited revisions of one Source in the same generation graph", () => {
    const first = publish(scoped);
    const cited = first.sources[0];
    const nextSource = { ...cited, revision: 2, content: { ...cited.content, title: "資料の明示訂正版" } };
    const secondRecord = { ...scoped, id: "separate-citation", content: { ...scoped.content,
      evidence: scoped.content.evidence.map(evidence => evidence.source.id === cited.id ? { ...evidence, source: { id: cited.id, revision: 2 } } : evidence),
    } };
    const second = buildKnowledgePublishedRecord(secondRecord, { entities, sources: [...sources, nextSource], mappings: [] });
    const graph = knowledgePublicationGraph(generation, [first, second]);
    expect(graph.sources.filter(source => source.id === cited.id).map(source => source.revision)).toEqual([1, 2]);
    expect(graph.records[0].record.content.evidence[0].source.revision).toBe(1);
    expect(graph.records[1].record.content.evidence[0].source.revision).toBe(2);
  });

  it("validates the bounded query and rejects mismatched typed filters, invalid dates and unsafe cursor shapes", () => {
    expect(knowledgePublicationQuerySchema.parse({ q: "  未知の関係  ", relationLabel: "創作ノートを交換した", polarity: "uncertain" })).toMatchObject({ q: "未知の関係", limit: 20 });
    expect(knowledgePublicationQuerySchema.parse({ roleId: "DIRECTING", limit: 50, generation, cursor: "eyJhIjoxfQ" }).roleId).toBe("DIRECTING");
    for (const input of [
      { predicate: "INFLUENCED_BY", roleId: "DIRECTING" }, { roleId: "AUTHOR", eventRoleId: "CHAIR" },
      { eventDay: "1927-02-30" }, { isbn13: "9784063729222" }, { limit: 0 }, { limit: 51 },
      { generation: "old-generation" }, { cursor: "../../secret" }, { cursor: "x".repeat(2049) },
      { q: "a\u0000b" }, { q: "x".repeat(201) }, { arbitrarySql: "SELECT 1" },
    ]) expect(knowledgePublicationQuerySchema.safeParse(input).success).toBe(false);
  });
});
