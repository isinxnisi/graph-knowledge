import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { loadPublicRelease } from "../lib/server/public-dataset";
import { planPublicGraph, publicGraph } from "../lib/server/public-graph";

const directory = "datasets/public-kg/releases/20261014-nobel-001";
it("公式snapshotから決定的に生成し既存の全知識Nodeを変更しない", async () => {
  execFileSync("python3", ["scripts/prepare-nobel-affiliations.py", "--check"]);
  const base = await loadPublicRelease(), next = await loadPublicRelease(directory);
  for (const field of ["entities", "claims", "sources", "citations"] as const)
    for (const row of base.fixture[field]) expect(next.fixture[field].find(x => x.id === row.id)).toEqual(row);
  const plan = planPublicGraph(publicGraph(base.fixture), publicGraph(next.fixture));
  expect(plan.updated).toEqual([]);
  expect(next.fixture.claims.length - base.fixture.claims.length).toBe(827);
}, 30000);

it("全追加Citationのlocator・原表記・人物IDを公式rawへ辿れ、職位と期間を生成しない", async () => {
  const release = await loadPublicRelease(directory);
  const ledger = JSON.parse(await readFile("datasets/nobel-affiliations/v1/ledger.json", "utf8"));
  const pages = new Map<string, unknown>();
  for (const row of ledger.rows) {
    if (!pages.has(row.snapshot)) pages.set(row.snapshot, JSON.parse(await readFile(`datasets/nobel-affiliations/v1/${row.snapshot}`, "utf8")));
    let raw: unknown = pages.get(row.snapshot);
    for (const key of row.jsonPointer.split("/").slice(1)) raw = (raw as Record<string, unknown>)[key];
    expect((raw as { name: { en: string } }).name.en.trim()).toBe(row.organizationOriginal);
    const claim = release.fixture.claims.find(c => c.id === row.claimId)!;
    expect(claim).toMatchObject({ subjectId: row.subjectId, objectId: row.objectId, predicate: "AFFILIATED_WITH", period: { from: null, to: null }, organizationParticipation: null });
    const citation = release.fixture.citations.find(c => c.id === row.citationId)!;
    expect(citation.locator).toContain(row.awardYear);
    expect(citation.note).toContain(row.organizationOriginal);
    expect(row.acceptance).toBe("pending-public-approval");
  }
  expect(ledger.rows).toHaveLength(829);
}, 30000);

it("同じ人物機関ペアの複数受賞記録はCitationに残しClaimを重複生成しない", async () => {
  const next = await loadPublicRelease(directory), base = await loadPublicRelease();
  const oldIds = new Set(base.fixture.claims.map(c => c.id));
  const added = next.fixture.claims.filter(c => !oldIds.has(c.id));
  expect(new Set(added.map(c => `${c.subjectId}:${c.objectId}`)).size).toBe(added.length);
  expect(added.every(c => c.polarity === "affirmed" && c.predicate === "AFFILIATED_WITH")).toBe(true);
}, 30000);

it("Wikidata P108の明示statementだけを追加し、同一QIDを再利用して既存データを維持する", async () => {
  execFileSync("python3", ["scripts/prepare-wikidata-employers.py", "--check"]);
  const next = await loadPublicRelease("datasets/public-kg/releases/20261014-expanded-001"), base = await loadPublicRelease();
  const ledger = JSON.parse(await readFile("datasets/wikidata-employers/v1/ledger.json", "utf8"));
  const raw = JSON.parse(await readFile("datasets/wikidata-employers/v1/raw/employers.json", "utf8"));
  expect(ledger.rows).toHaveLength(1000);
  for (const row of ledger.rows) {
    const original = raw.results.bindings[Number(row.snapshotPointer.split("/").at(-1))];
    expect(original.statement.value).toBe(`http://www.wikidata.org/entity/statement/${row.statement}`);
    expect(original.rank.value).not.toContain("Deprecated");
    const person = next.fixture.entities.find(e => e.id === row.subjectId)!;
    expect(person.externalIds).toContainEqual({ namespace: "wikidata", value: row.subjectQid });
    const claim = next.fixture.claims.find(c => c.id === row.claimId)!;
    expect(claim).toMatchObject({ subjectId: row.subjectId, objectId: row.objectId, period: { from: null, to: null }, predicate: "AFFILIATED_WITH", organizationParticipation: null });
    expect(next.fixture.citations.find(c => c.id === row.citationId)!.locator).toContain(row.statement);
    expect(row.acceptance).toBe("pending-public-approval");
  }
  for (const field of ["entities", "claims", "sources", "citations"] as const)
    for (const row of base.fixture[field]) expect(next.fixture[field].find(x => x.id === row.id)).toEqual(row);
  expect(next.fixture.claims).toHaveLength(1822);
  expect(next.fixture.entities).toHaveLength(2099);
  expect(planPublicGraph(publicGraph(base.fixture), publicGraph(next.fixture)).updated).toEqual([]);
}, 30000);
