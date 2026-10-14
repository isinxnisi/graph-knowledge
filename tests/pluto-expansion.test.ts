import { execFileSync } from "node:child_process";
import { beforeAll, expect, it } from "vitest";
import { loadPublicRelease, type PublicRelease } from "../lib/server/public-dataset";
import { planPublicGraph, publicGraph } from "../lib/server/public-graph";

let base: PublicRelease, next: PublicRelease;
beforeAll(async () => {
  execFileSync("python3", ["scripts/prepare-pluto-expansion.py", "--check"]);
  base = await loadPublicRelease("datasets/public-kg/releases/20261014-expanded-001");
  next = await loadPublicRelease("datasets/public-kg/releases/20261014-pluto-001");
}, 30000);

it("大量拡充候補と既存知識を変えず10 Entity・12 Claimだけ追加する", () => {
  expect(next.manifest.baseRelease).toBe(base.manifest.release);
  expect(next.fixture.entities.length - base.fixture.entities.length).toBe(10);
  expect(next.fixture.claims.length - base.fixture.claims.length).toBe(12);
  for (const field of ["entities", "claims", "sources", "citations"] as const)
    for (const row of base.fixture[field]) expect(next.fixture[field].find(x => x.id === row.id)).toEqual(row);
  const plan = planPublicGraph(publicGraph(base.fixture), publicGraph(next.fixture));
  expect(plan.updated).toEqual([]);
  expect(plan.added).toHaveLength(43);
  expect(plan.relationshipsAdded).toBe(48);
}, 30000);

it("PLUTOから別作者と組織へ、実在する独立関係を複数段階で辿れる", () => {
  const id = (name: string) => next.fixture.entities.find(e => e.name === name)!.id;
  for (const path of [
    ["PLUTO", "浦沢直樹", "パイナップルARMY", "工藤かずや", "信長", "池上遼一"],
    ["PLUTO", "手塚眞", "手塚プロダクション", "手塚治虫", "鉄腕アトム"],
    ["PLUTO", "長崎尚志", "MASTERキートン Reマスター", "浦沢直樹", "20世紀少年"],
  ]) {
    for (let i = 1; i < path.length; i++) {
      const [a, b] = [id(path[i - 1]), id(path[i])];
      expect(next.fixture.claims.some(c => c.polarity === "affirmed" && ((c.subjectId === a && c.objectId === b) || (c.subjectId === b && c.objectId === a)))).toBe(true);
    }
  }
  expect(next.fixture.claims.some(c => c.subjectId === id("PLUTO") && c.objectId === id("鉄腕アトム"))).toBe(false);
  expect(next.fixture.claims.some(c => c.subjectId === id("手塚治虫") && c.objectId === id("PLUTO"))).toBe(false);
});

it("巻のクレジットを全巻・全期間や作画Roleへ一般化せず原表記をCitationに残す", () => {
  const old = new Set(base.fixture.claims.map(c => c.id));
  const added = next.fixture.claims.filter(c => !old.has(c.id));
  expect(added.filter(c => c.contribution?.scope)).toHaveLength(7);
  for (const claim of added) {
    expect(claim.period).toEqual({ from: null, to: null });
    expect(claim.contribution?.roleId ?? null).toBeNull();
    expect(claim.organizationParticipation).toBeNull();
    const citations = next.fixture.citations.filter(c => c.claimId === claim.id);
    expect(citations).toHaveLength(1);
    expect(citations[0].note).toContain("原表記（ja）");
    expect(citations[0].locator.length).toBeGreaterThan(0);
  }
});
