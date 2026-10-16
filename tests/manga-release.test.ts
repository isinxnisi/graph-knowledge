import { execFileSync } from "node:child_process";
import { beforeAll, expect, it } from "vitest";
import { loadPublicRelease, type PublicRelease } from "../lib/server/public-dataset";
import { publicGraph, planPublicGraph } from "../lib/server/public-graph";
import { validateFixture } from "../lib/domain/fixture";
import acceptance from "../datasets/manga-collection/accepted-r0002-20261017/acceptance.json";
import proposal from "../datasets/manga-collection/review-r0002-20261017/proposed-records.json";
import pending from "../datasets/manga-collection/original-story-r0002-20261017/candidates.json";
let base: PublicRelease, next: PublicRelease;
beforeAll(async () => {
  execFileSync("python3", ["-O", "scripts/prepare-manga-release.py", "--check"]);
  base = await loadPublicRelease("datasets/public-kg/releases/20261014-credits-001");
  next = await loadPublicRelease("datasets/public-kg/releases/20261017-manga-r0002-001");
});
it("既存全レコード・撤回履歴・由来を保全し正式受入分だけ追加する", () => {
  for (const field of ["entities", "claims", "sources", "citations"] as const) {
    const after = new Map(next.fixture[field].map(row => [row.id, row]));
    for (const row of base.fixture[field]) expect(after.get(row.id)).toEqual(row);
    expect(next.fixture[field].length - base.fixture[field].length).toBe(acceptance.acceptedRecordIds[field].length);
  }
  expect(next.manifest.baseRelease).toBe(base.manifest.release);
  expect(next.manifest.claimOrigins.slice(0, base.manifest.claimOrigins.length)).toEqual(base.manifest.claimOrigins);
  expect(next.manifest.withdrawals).toEqual(base.manifest.withdrawals);
  const plan = planPublicGraph(publicGraph(base.fixture), publicGraph(next.fixture));
  expect(plan.updated).toEqual([]); expect(plan.added).toHaveLength(26); expect(plan.relationshipsAdded).toBe(23);
  for (const record of proposal.records.claims) expect(next.fixture.claims.find(c => c.id === record.id)).toEqual({ ...record, visibility: "published" });
  for (const record of proposal.records.citations) expect(next.fixture.citations.find(c => c.id === record.id)).toEqual(record);
});
it("原作5件と未受入8 Entityを公開に混入させず、依存とscopeを検証する", () => {
  expect(pending.records.claims).toHaveLength(5);
  for (const c of pending.records.claims) {
    expect(c.visibility).toBe("hidden"); expect(c.contribution.roleId).toBe("ORIGINAL_STORY");
    expect(next.fixture.claims.some(p => p.id === c.id)).toBe(false);
  }
  expect(pending.candidates.every(c => c.formalAcceptance.decision === "pending" && c.formalAcceptance.reviewer === null)).toBe(true);
  for (const id of acceptance.excludedEntityIds) expect(next.fixture.entities.some(e => e.id === id)).toBe(false);
  const full = validateFixture({ ...next.fixture, entities: [...next.fixture.entities, ...pending.records.entities], claims: [...next.fixture.claims, ...pending.records.claims], sources: [...next.fixture.sources, ...pending.records.sources], citations: [...next.fixture.citations, ...pending.records.citations] });
  expect(full.claims.filter(c => c.contribution?.roleId === "ORIGINAL_STORY")).toHaveLength(5);
});
it("変更済み承認資料や未受入を最適化Pythonでも拒否する", () => {
  execFileSync("python3", ["-O", "-c", `
import importlib.util, pathlib, tempfile, shutil, json
spec=importlib.util.spec_from_file_location('prepare','scripts/prepare-manga-release.py'); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as folder:
 root=pathlib.Path(folder)
 for path in [m.ACCEPTANCE,m.PROPOSAL,*[r['file'] for r in json.loads(pathlib.Path(m.ACCEPTANCE).read_text())['referenceArtifacts']]]:
  target=root/path; target.parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(path,target)
 a=root/m.ACCEPTANCE; original=a.read_text(); data=json.loads(original); data['status']='pending'; a.write_text(json.dumps(data))
 try: m.build(root)
 except ValueError: pass
 else: raise RuntimeError('Pending acceptance allowed')
 a.write_text(original); proposal=root/m.PROPOSAL; proposal.write_text(proposal.read_text()+' ')
 try: m.build(root)
 except ValueError: pass
 else: raise RuntimeError('Changed input allowed')
`]);
});
