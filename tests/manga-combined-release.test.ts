import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { beforeAll, expect, it } from "vitest";
import { loadPublicRelease, sha256, type PublicRelease } from "../lib/server/public-dataset";
import { publicGraph, planPublicGraph } from "../lib/server/public-graph";
import { matchesClaim } from "../lib/domain/exploration";
import { claimSummarySchema } from "../lib/domain/api";
import acceptance from "../datasets/manga-collection/accepted-original-story-r0002-20261017/acceptance.json";
import pending from "../datasets/manga-collection/original-story-r0002-20261017/candidates.json";
let base: PublicRelease, previous: PublicRelease, combined: PublicRelease;
beforeAll(async () => {
  execFileSync("python3", ["-O", "scripts/prepare-manga-release.py", "--combined", "--check"]);
  base = await loadPublicRelease(acceptance.baseDirectory);
  previous = await loadPublicRelease("datasets/public-kg/releases/20261017-manga-r0002-001");
  combined = await loadPublicRelease("datasets/public-kg/releases/20261017-manga-r0002-002");
});

it("最新公開baseと旧候補を保持し13 Entity・9 Claim・7 Source・9 Citationだけ統合する", () => {
  const expected = { entities: 13, claims: 9, sources: 7, citations: 9 };
  for (const field of ["entities", "claims", "sources", "citations"] as const) {
    const after = new Map(combined.fixture[field].map(row => [row.id, row]));
    for (const row of previous.fixture[field]) expect(after.get(row.id)).toEqual(row);
    expect(combined.fixture[field].length - base.fixture[field].length).toBe(expected[field]);
  }
  expect(combined.manifest.baseRelease).toBe(base.manifest.release);
  expect(combined.manifest.baseRelease).not.toBe(previous.manifest.release); // -001 has never been applied.
  expect(combined.manifest.withdrawals).toEqual(base.manifest.withdrawals);
  expect(combined.manifest.claimOrigins.slice(0, previous.manifest.claimOrigins.length)).toEqual(previous.manifest.claimOrigins);
  const plan = planPublicGraph(publicGraph(base.fixture), publicGraph(combined.fixture));
  expect(plan.updated).toEqual([]); expect(plan.added).toHaveLength(51); expect(plan.relationshipsAdded).toBe(49);
  const delta = planPublicGraph(publicGraph(previous.fixture), publicGraph(combined.fixture));
  expect(delta.updated).toEqual([]); expect(delta.added).toHaveLength(25); expect(delta.relationshipsAdded).toBe(26);
});

it("人間受入と凍結hash・UUID・原責任表示・日本語第1巻scopeを維持し2 Sourceを再利用する", () => {
  expect(acceptance.reviewer).toBe("プロジェクト運営者");
  expect(acceptance.applyAuthorized).toEqual({ local: false, beta: false, vps: false });
  for (const ref of acceptance.referenceArtifacts) expect(sha256(readFileSync(ref.file, "utf8"))).toBe(ref.sha256);
  expect(acceptance.acceptedRecordIds.entities).toHaveLength(6);
  expect(acceptance.acceptedRecordIds.claims).toHaveLength(5);
  for (const record of pending.records.claims) expect(combined.fixture.claims.find(c => c.id === record.id)).toEqual({ ...record, visibility: "published" });
  for (const record of pending.records.entities) expect(combined.fixture.entities.find(e => e.id === record.id)).toEqual(record);
  for (const record of pending.records.citations) {
    const final = combined.fixture.citations.find(c => c.id === record.id)!;
    expect(final).toEqual({ ...record, note: record.note.replace(/^未受入候補。/, "") });
    expect(final.roleEvidence?.originalText).toBeTruthy();
    expect(combined.fixture.citations.filter(c => c.claimId === record.claimId)).toHaveLength(1);
  }
  for (const id of acceptance.reusedPreviouslyAcceptedSourceIds) {
    const source = previous.fixture.sources.find(s => s.id === id)!;
    expect(combined.fixture.sources.filter(s => s.url === source.url)).toEqual([source]);
    expect(combined.fixture.citations.filter(c => c.sourceId === id)).toHaveLength(2);
  }
  for (const record of pending.records.sources) expect(combined.fixture.sources.filter(s => s.url === record.url)).toEqual([record]);
});

it("未受入2人物と制作関係は除外し、原作と作画を作品経由で探索できる", () => {
  for (const id of acceptance.excludedEntityIds) {
    expect(combined.fixture.entities.some(e => e.id === id)).toBe(false);
    expect(combined.fixture.claims.some(c => c.subjectId === id || c.objectId === id)).toBe(false);
  }
  const entityId = (name: string) => combined.fixture.entities.find(e => e.name === name)!.id;
  const summary = (c: PublicRelease["fixture"]["claims"][number]) => claimSummarySchema.parse({ ...Object.fromEntries(Object.entries(c).filter(([key]) => !["visibility", "createdAt", "updatedAt"].includes(key))), sourceCount: 1 });
  const inagaki = entityId("稲垣理一郎");
  const stories = combined.fixture.claims.filter(c => c.subjectId === inagaki && matchesClaim(summary(c), ["CONTRIBUTED_TO"], ["ORIGINAL_STORY"]));
  expect(stories.map(c => c.objectId).sort()).toEqual(["トリリオンゲーム", "Dr.STONE", "アイシールド21"].map(entityId).sort());
  for (const [person, work] of [["池上遼一", "トリリオンゲーム"], ["Boichi", "Dr.STONE"]]) {
    const drawing = combined.fixture.claims.find(c => c.subjectId === entityId(person) && c.objectId === entityId(work) && c.contribution?.roleId === "DRAWING")!;
    expect(drawing).toBeDefined();
    expect(stories.some(c => c.objectId === drawing.objectId)).toBe(true);
    expect(matchesClaim(summary(drawing), null, ["ORIGINAL_STORY"])).toBe(false);
  }
  for (const [person, work] of [["大場つぐみ", "DEATH NOTE"], ["ほったゆみ", "ヒカルの碁"]]) {
    const claims = combined.fixture.claims.filter(c => c.objectId === entityId(work));
    expect(claims).toHaveLength(1); expect(claims[0].subjectId).toBe(entityId(person));
    expect(claims[0].contribution?.roleId).toBe("ORIGINAL_STORY");
  }
  // A traversal through a work does not introduce a direct collaboration Claim.
  expect(combined.fixture.claims.some(c => c.subjectId === inagaki && c.objectId === entityId("Boichi"))).toBe(false);
});

it("新しい承認なし・資料改変・古いbase・未受入混入を最適化Pythonでも拒否する", () => {
  execFileSync("python3", ["-O", "-c", `
import importlib.util, pathlib, tempfile, shutil, json, hashlib
spec=importlib.util.spec_from_file_location('prepare','scripts/prepare-manga-release.py'); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as folder:
 root=pathlib.Path(folder)
 originals=[m.ACCEPTANCE,m.PROPOSAL,m.ORIGINAL_ACCEPTANCE,m.ORIGINAL_PROPOSAL]
 refs=[r['file'] for path in [m.ACCEPTANCE,m.ORIGINAL_ACCEPTANCE] for r in json.loads(pathlib.Path(path).read_text())['referenceArtifacts']]
 for path in set(originals+refs):
  target=root/path; target.parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(path,target)
 a=root/m.ORIGINAL_ACCEPTANCE; original=a.read_text(); data=json.loads(original)
 def rejected():
  try: m.build_combined(root)
  except ValueError: return
  raise RuntimeError('Unsafe acceptance or input allowed')
 data['status']='pending'; a.write_text(json.dumps(data)); rejected()
 data=json.loads(original); data['baseRelease']='20261017-manga-r0002-001'; a.write_text(json.dumps(data)); rejected()
 a.write_text(original); proposal=root/m.ORIGINAL_PROPOSAL; original_proposal=proposal.read_text(); proposal.write_text(original_proposal+' '); rejected()
 # Even a matching changed input hash cannot enlarge the explicit six-Entity set.
 changed=json.loads(original_proposal); changed['records']['entities'].append({**changed['records']['entities'][0],'id':'3d279a30-0131-4b37-9429-9a39e8027e05','name':'村田雄介'})
 proposal.write_text(json.dumps(changed)); data=json.loads(original)
 for ref in data['referenceArtifacts']:
  if ref['file']==m.ORIGINAL_PROPOSAL:ref['sha256']=hashlib.sha256(proposal.read_bytes()).hexdigest()
 a.write_text(json.dumps(data)); rejected()
`]);
});
