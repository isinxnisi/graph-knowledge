import { describe, expect, it } from "vitest";
import { sha256, stableJson } from "../lib/server/public-dataset";
import { loadPublicRelease, combineAcceptedFixtures, validateInitialPublicDataset, validatePublicRelease } from "../lib/server/public-dataset";
import { planPublicGraph, publicGraph, publicGraphDigest } from "../lib/server/public-graph";
import { assertDatasetTarget } from "../lib/domain/dataset";
import { readQueryTimeout } from "../lib/server/neo4j";
import { START_EXAMPLES } from "../lib/client/start-examples";
import { loadPilotV2 } from "../lib/server/pilot-v2-dataset";
import { loadEventPilot } from "../lib/server/event-dataset";
import { displayRelations } from "../lib/client/graph-presentation";

describe("公開準備の共通KG", () => {
  it("接続索引化後も既存のcanonical順とfingerprintを変えない", async () => {
    const { fixture } = await loadPublicRelease();
    const graph = publicGraph(fixture);
    graph.edges.reverse();
    const legacy = { nodes: Object.fromEntries(Object.entries(graph.nodes).sort(([a], [b]) => a.localeCompare(b))),
      edges: [...graph.edges].sort((a, b) => stableJson(a).localeCompare(stableJson(b))) };
    expect(publicGraphDigest(graph)).toBe(sha256(stableJson(legacy)));
  });
  it("読取制限の既定5秒を維持し、本番の明示設定にも有限の上限を課す", () => {
    expect(readQueryTimeout({})).toBe(5000);
    expect(readQueryTimeout({ NEO4J_READ_TIMEOUT_MS: "10000" })).toBe(10000);
    for (const value of ["", "0", "4999", "15001", "10000.5", "10s", "Infinity"]) expect(() => readQueryTimeout({ NEO4J_READ_TIMEOUT_MS: value })).toThrow();
  });
  it("本番DBを明示的な単一構成に限定し、凍結版・開発接続・設定ミスを拒否する", () => {
    expect(() => assertDatasetTarget("public-kg", "bolt://graph-neo4j:7687", "production")).not.toThrow();
    for (const uri of ["bolt://localhost:7694", "bolt://remote:7687", "neo4j://graph-neo4j:7687", "bolt://graph-neo4j:7687?x=1", "bolt://user:password@graph-neo4j:7687"]) {
      expect(() => assertDatasetTarget("public-kg", uri, "production")).toThrow();
    }
    for (const mode of ["demo", "pilot-urasawa-v2", "pilot-science-v2", "pilot-event-v1"] as const) {
      expect(() => assertDatasetTarget(mode, "bolt://graph-neo4j:7687", "production")).toThrow();
      expect(() => assertDatasetTarget(mode, "bolt://graph-neo4j:7687", undefined)).toThrow();
    }
    expect(() => assertDatasetTarget("public-kg", "bolt://graph-neo4j:7687", undefined)).toThrow();
    expect(() => assertDatasetTarget("public-kg", "bolt://localhost:7694", "prod")).toThrow();
  });
  it("受入済み27 Claimだけを再現し、科学の対照コピーを重複させない", async () => {
    const counts = await validateInitialPublicDataset();
    expect(counts.nodes).toMatchObject({ Entity: 18, Claim: 27, Source: 15, Citation: 29, ExternalIdentifier: 16 });
    const { fixture, manifest } = await loadPublicRelease();
    expect(manifest.claimOrigins).toHaveLength(27);
    expect(fixture.claims.filter(claim => claim.predicate === "PARTICIPATED_IN")).toHaveLength(3);
    expect(fixture.claims.filter(claim => claim.predicate === "AFFILIATED_WITH")).toHaveLength(10);
    expect(fixture.claims.filter(claim => claim.predicate === "INFLUENCED_BY")).toHaveLength(1);
    expect(fixture.sources.every(source => !source.isDemo)).toBe(true);
    for (const example of START_EXAMPLES["public-kg"]) expect(fixture.entities.find(entity => entity.id === example.id)?.kind).toBe(example.kind);
  });
  it("元UUID・期間・限定・根拠を保持し、入力の順序に依存しない", async () => {
    const manga = await loadPilotV2(), event = await loadEventPilot();
    const combined = combineAcceptedFixtures([manga, event]);
    expect(combineAcceptedFixtures([event, manga, event])).toEqual(combined);
    for (const original of [manga, event]) {
      for (const claim of original.claims) expect(combined.claims.find(value => value.id === claim.id)).toMatchObject(claim);
      for (const citation of original.citations) expect(combined.citations.find(value => value.id === citation.id)).toMatchObject(citation);
    }
    const claims = combined.claims.map(claim => ({ ...claim, contribution: claim.contribution ?? null, organizationParticipation: claim.organizationParticipation ?? null, eventParticipation: claim.eventParticipation ?? null, sourceCount: 1 }));
    expect(Object.keys(displayRelations(Object.fromEntries(claims.map(claim => [claim.id, claim]))))).toHaveLength(19);
  });
  it("同ID異内容・外部ID衝突・架空Sourceを拒否する", async () => {
    const { fixture } = await loadPublicRelease();
    const changed = structuredClone(fixture); changed.entities[0].name += "異内容";
    expect(() => combineAcceptedFixtures([fixture, changed])).toThrow(/Conflicting/);
    const conflict = structuredClone(fixture); conflict.entities[1].externalIds = [...conflict.entities[0].externalIds];
    expect(() => combineAcceptedFixtures([conflict])).toThrow();
    const demo = structuredClone(fixture); demo.sources[0].isDemo = true;
    expect(() => combineAcceptedFixtures([demo])).toThrow(/Demo/);
  });
  it("同じ内容は無変更、表記訂正を検出し、暗黙削除を拒否する", async () => {
    const { fixture } = await loadPublicRelease();
    const before = publicGraph(fixture);
    expect(planPublicGraph(before, publicGraph(fixture))).toEqual({ added: [], updated: [], relationshipsAdded: 0 });
    expect(publicGraphDigest(before)).toBe(publicGraphDigest(publicGraph(fixture)));
    const corrected = structuredClone(fixture); corrected.entities[0].description = "表記の訂正";
    expect(planPublicGraph(before, publicGraph(corrected)).updated).toEqual([`Entity:${corrected.entities[0].id}`]);
    const removed = structuredClone(fixture); removed.citations.pop();
    expect(() => planPublicGraph(before, publicGraph(removed))).toThrow(/Implicit deletion/);
  });
  it("Claimの意味・期間・公開状態・Citation接続の黙った変更を拒否する", async () => {
    const { fixture } = await loadPublicRelease();
    const before = publicGraph(fixture);
    for (const change of ["polarity", "visibility", "period"] as const) {
      const next = structuredClone(fixture);
      if (change === "period") next.claims[0].period = { from: { value: "1900", precision: "year" }, to: null };
      else if (change === "visibility") next.claims[0].visibility = "hidden";
      else next.claims[0].polarity = "denied";
      expect(() => planPublicGraph(before, publicGraph(next))).toThrow(/Claim meaning/);
    }
    const moved = structuredClone(fixture); moved.citations[0].sourceId = fixture.sources.find(source => source.id !== moved.citations[0].sourceId)!.id;
    expect(() => planPublicGraph(before, publicGraph(moved))).toThrow(/connection/);
  });
  it("公開用・検証用のDB誤接続を相互に拒否する", () => {
    expect(() => assertDatasetTarget("public-kg", "bolt://127.0.0.1:7694")).not.toThrow();
    for (const port of [7687, 7688, 7689, 7690, 7691, 7692, 7693]) expect(() => assertDatasetTarget("public-kg", `bolt://127.0.0.1:${port}`)).toThrow();
    for (const mode of ["demo", "pilot-urasawa-v2", "pilot-event-v1"] as const) expect(() => assertDatasetTarget(mode, "bolt://127.0.0.1:7694")).toThrow();
    expect(() => assertDatasetTarget("public-kg", "bolt://remote:7687")).toThrow();
  });
  it("artifact改変・由来の欠落/重複をDB接続前に拒否する", async () => {
    const release = await loadPublicRelease();
    const tampered = structuredClone(release); tampered.fixture.entities[0].description = "hash不一致";
    expect(() => validatePublicRelease(tampered)).toThrow(/hash/);
    const missing = structuredClone(release); missing.manifest.claimOrigins.pop();
    expect(() => validatePublicRelease(missing)).toThrow(/origin/);
    const duplicate = structuredClone(release); duplicate.manifest.claimOrigins[0] = duplicate.manifest.claimOrigins[1];
    expect(() => validatePublicRelease(duplicate)).toThrow(/origin/);
  });
});

it("明示撤回だけを許可し、差替え循環・由来欠落・既存意味の変更を拒否", async () => {
  const { sha256 } = await import("../lib/server/public-dataset");
  const first = await loadPublicRelease(), changed = structuredClone(first);
  const old = changed.fixture.claims[0]; old.visibility = "hidden";
  changed.manifest.release = "unit-withdrawal"; changed.manifest.baseRelease = first.manifest.release;
  changed.manifest.dataSha256 = sha256(JSON.stringify(changed.fixture, null, 2) + "\n");
  expect(() => validatePublicRelease(changed)).toThrow(/explicit withdrawal/);
  changed.manifest.withdrawals = [{ claimId: old.id, reason: "検証用", release: changed.manifest.release, replacementClaimId: null }];
  expect(() => validatePublicRelease(changed)).not.toThrow();
  expect(planPublicGraph(publicGraph(first.fixture), publicGraph(changed.fixture, changed.manifest.withdrawals)).updated).toEqual([`Claim:${old.id}`]);
  const semantics = structuredClone(changed.fixture); semantics.claims[0].polarity = "denied";
  expect(() => planPublicGraph(publicGraph(first.fixture), publicGraph(semantics, changed.manifest.withdrawals))).toThrow(/Claim meaning/);
  changed.manifest.withdrawals[0].replacementClaimId = old.id;
  expect(() => validatePublicRelease(changed)).toThrow(/Replacement/);
});

it("public cursorは無条件でも版・起点・三限定へ結合し、旧UUID形式を受け入れない", async () => {
  const { encodeNeighborCursor, decodeNeighborCursor } = await import("../lib/server/neighbor-cursor");
  const first = await loadPublicRelease(), claim = first.fixture.claims[0];
  const cursor = encodeNeighborCursor(claim.subjectId, null, claim.id, null, "public-kg", null, null, "revision-a");
  expect(decodeNeighborCursor(cursor, claim.subjectId, null, null, "public-kg", null, null, "revision-a")).toBe(claim.id);
  expect(() => decodeNeighborCursor(cursor, claim.subjectId, null, null, "public-kg", null, null, "revision-b")).toThrow(/更新/);
  expect(() => decodeNeighborCursor(cursor, claim.objectId, null, null, "public-kg", null, null, "revision-a")).toThrow();
  expect(() => decodeNeighborCursor(claim.id, claim.subjectId, null, null, "public-kg", null, null, "revision-a")).toThrow();
  expect(() => decodeNeighborCursor(cursor, claim.subjectId, null, ["PRODUCING"], "public-kg", null, null, "revision-a")).toThrow();
});

it("復旧用の指紋は表記・撤回を意味変更と扱わず、Claimの命題差を検出する", async () => {
  const { graphIdentities, mergeIdentities } = await import("../lib/server/public-identities");
  const { fixture } = await loadPublicRelease();
  const identities = graphIdentities(publicGraph(fixture));
  const changed = structuredClone(fixture); changed.entities[0].description = "表記訂正"; changed.claims[0].visibility = "hidden";
  expect(() => mergeIdentities(identities, graphIdentities(publicGraph(changed)))).not.toThrow();
  changed.claims[0].polarity = changed.claims[0].polarity === "affirmed" ? "denied" : "affirmed";
  expect(() => mergeIdentities(identities, graphIdentities(publicGraph(changed)))).toThrow(/identity.*meaning/);
  const moved = structuredClone(fixture);
  const owner = moved.entities.find(entity => entity.externalIds.length)!;
  const target = moved.entities.find(entity => entity.id !== owner.id)!;
  target.externalIds.push(owner.externalIds.pop()!);
  expect(() => mergeIdentities(identities, graphIdentities(publicGraph(moved)))).toThrow(/identity.*meaning/);
});
