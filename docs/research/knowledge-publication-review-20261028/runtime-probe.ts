/**
 * Isolated imports only: no Next server, database, approval, queue or deployment.
 * Temporary variants are created by reproduce.py. Synthetic role is never adopted.
 */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const read = (p: string) => JSON.parse(fs.readFileSync(p, "utf8"));
const canonical = (x: unknown): string => {
  if (Array.isArray(x)) return "[" + x.map(canonical).join(",") + "]";
  if (x && typeof x === "object") return "{" + Object.keys(x).sort().map(k => JSON.stringify(k) + ":" + canonical((x as Record<string, unknown>)[k])).join(",") + "}";
  return JSON.stringify(x);
};
const load = async (root: string, relative: string) => {
  const m = await import(pathToFileURL(path.join(root, relative)).href);
  return m.default && !m.validateFixture && !m.roleIdSchema ? { ...m.default, ...m } : m;
};
async function main() {
  const [source, old, extended, generated, artifact, pythonHashes] = process.argv.slice(2);
  const input = read(path.join(artifact, "data.json"));
  const baseline = await load(old, "lib/domain/fixture.ts");
  const main = await load(source, "lib/domain/fixture.ts");
  const compatible = await load(extended, "lib/domain/fixture.ts");
  const synthetic = await load(generated, "lib/domain/fixture.ts");
  const attempt = (fn: () => unknown) => { try { fn(); return { accepted: true }; } catch (e: any) {
    return { accepted: false, issues: e.issues?.map((i: any) => ({ path: i.path, code: i.code })) ?? [String(e.message)] };
  }};
  const oldResult = attempt(() => baseline.validateFixture(input));
  assert.equal(oldResult.accepted, false);
  assert.deepEqual(oldResult.issues?.map((i: any) => i.path), [["claims",370,"contribution","roleId"],["claims",536,"contribution","roleId"]]);
  const mainResult = attempt(() => main.validateFixture(input)); assert.equal(mainResult.accepted, true);
  const compatibleResult = attempt(() => compatible.validateFixture(input)); assert.equal(compatibleResult.accepted, true);
  const oldEight = read(path.join(source, "vocabulary/contribution-roles/catalog.json")).entries.map((e: any) => e.id).filter((id: string) => !["ACTING","DIRECTING"].includes(id));
  const generatedContribution = await load(generated, "lib/domain/contribution.ts");
  const oldContribution = await load(old, "lib/domain/contribution.ts");
  const currentContribution = await load(source, "lib/domain/contribution.ts");
  for (const id of oldEight) {
    for (const scope of [null, {kind:"publication",isbn13:"9784091860019",volumeLabel:null,editionLabel:null,language:"ja"}]) {
      const v = {roleId:id, scope};
      assert.deepEqual(generatedContribution.contributionSchema.parse(v),oldContribution.contributionSchema.parse(v));
    }
  }
  const invented = structuredClone(input);
  const credit = invented.claims.find((c: any) => c.contribution?.roleId === "ACTING");
  credit.contribution.roleId = "PILOT_SYNTHETIC_ROLE";
  assert.equal(attempt(() => main.validateFixture(invented)).accepted,false);
  assert.equal(attempt(() => synthetic.validateFixture(invented)).accepted,true);
  assert.equal(currentContribution.roleIdSchema.safeParse("PILOT_SYNTHETIC_ROLE").success,false);
  const labels = await load(generated, "lib/i18n/contribution.ts");
  assert.equal(labels.contributionLabels("ja").roles.PILOT_SYNTHETIC_ROLE,"合成試験Role");
  const conditions = await load(generated,"lib/domain/relation-conditions.ts");
  const condition = conditions.normalizeRelationCondition({version:1,type:"pattern",pattern:{id:"other-works",revision:3},
    polarity:"affirmed",contributionRoles:null,stepRoles:[["PILOT_SYNTHETIC_ROLE"],["DIRECTING"]]});
  assert.deepEqual(conditions.normalizeRelationCondition(JSON.parse(JSON.stringify(condition))),condition);
  const badRole = structuredClone(invented); badRole.claims.find((c: any) => c.contribution?.roleId==="PILOT_SYNTHETIC_ROLE").contribution.roleId="UNKNOWN_ROLE";
  assert.equal(attempt(() => synthetic.validateFixture(badRole)).accepted,false);
  assert.equal(generatedContribution.contributionSchema.safeParse({roleId:"ACTING",scope:{kind:"film-cut",cut:"theatrical"}}).success,false);
  assert.equal(generatedContribution.publicationScopeSchema.safeParse({kind:"publication",isbn13:"9784091860010",volumeLabel:null,editionLabel:null,language:"ja"}).success,false);
  assert.throws(()=>generatedContribution.storedContribution({contributionRoleId:"ACTING"},"INFLUENCED_BY"));
  const pub = await load(source, "lib/server/public-dataset.ts");
  await pub.loadPublicRelease(artifact); // only file reading
  const reverseKeys = (x: any): any => Array.isArray(x) ? x.map(reverseKeys) : x && typeof x==="object" ?
    Object.fromEntries(Object.keys(x).reverse().map(k=>[k,reverseKeys(x[k])])) : x;
  const reordered = reverseKeys(input);
  const wire = JSON.stringify(reordered,null,2)+"\n";
  const normalized = JSON.stringify(main.validateFixture(reordered),null,2)+"\n";
  assert.deepEqual(JSON.parse(wire),JSON.parse(normalized));
  assert.notEqual(hash(wire),hash(normalized));
  assert.equal(hash(normalized),read(path.join(artifact,"manifest.json")).dataSha256);
  assert.equal(hash(canonical(input)),hash(canonical(reordered)));
  assert.equal(hash(canonical(input)),read(pythonHashes).canonicalDataSha256);
  const manifest = {...read(path.join(artifact,"manifest.json")),dataSha256:hash(wire)};
  const rejectsNoncanonical = attempt(()=>pub.validatePublicRelease({manifest,fixture:reordered}));
  assert.equal(rejectsNoncanonical.accepted,false);
  const mutations: Record<string,boolean> = {};
  for (const key of ["role","scope","period","locator","source","identity"]) {
    const value=structuredClone(input);
    const c=value.claims.find((c:any)=>c.contribution?.roleId==="ACTING");
    if(key==="role") c.contribution.roleId="DIRECTING";
    if(key==="scope") c.contribution.scope={kind:"film-cut",cut:"test-only"};
    if(key==="period") c.period.from={value:"1992",precision:"year"};
    if(key==="locator") value.citations.find((x:any)=>x.claimId===c.id).locator += " synthetic mutation";
    if(key==="source") value.sources[0].url="https://example.invalid/synthetic";
    if(key==="identity") c.subjectId=value.entities[0].id===c.subjectId ? value.entities[1].id : value.entities[0].id;
    mutations[key]=hash(canonical(value))!==hash(canonical(input));
    assert.equal(mutations[key],true);
  }
  process.stdout.write(JSON.stringify({
    authority:"isolated-schema-and-format-probe-not-approval-or-deployment",
    oldFixedWorkerSchema:oldResult,currentSchema:mainResult,oldSchemaWithGeneratedRoleIdsOnly:compatibleResult,
    currentPublicReleaseValidator:"passed-read-only",syntheticExtraRole:{unchangedCurrentRejected:true,generatedIdsAndLabelsAccepted:true,
      conditionRoundtrip:true,oldEightNullAndIsbnScopesPreserved:true,unknownRoleRejected:true,newScopeStructureRejected:true,invalidIsbnRejected:true,wrongPredicateRejected:true},
    serialization:{sameValuesDifferentWire:true,legacyValidatorRejectsReorderedWire:true,schemaNormalizedBytesMatchPublishedArtifact:true,
      pythonAndNodeCanonicalMatch:true,dataWireSha256:hash(fs.readFileSync(path.join(artifact,"data.json"),"utf8")),canonicalDataSha256:hash(canonical(input)),
      mutationsDetected:mutations},
    limits:["Old schema import is from pinned Git source; not an installed Worker execution.",
      "Generated variant tests schema, label and condition roundtrip only; it is not public acceptance, a Web build, actual image execution or the full Worker collect-review/accept-release flow.",
      "Canonical comparison covers this saved JSON domain, not a general cross-language number/Unicode canonicalization standard."]
  },null,2)+"\n");
}
main().catch(e=>{ console.error(e); process.exitCode=1; });
