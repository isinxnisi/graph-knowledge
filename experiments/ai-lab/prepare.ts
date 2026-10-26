/** Offline, fixed public snapshot projection. Never connects to a database. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { fixtureV4Schema } from "../../lib/domain/fixture";
import { validatePublicRelease } from "../../lib/server/public-dataset";

const here = path.dirname(fileURLToPath(import.meta.url));
const origin = path.resolve(here, "../../datasets/connectivity/issue-34");
const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const input = JSON.parse(fs.readFileSync(path.join(origin, "input.json"), "utf8"));
function read(ref: { file: string; sha256: string }) {
  const bytes = fs.readFileSync(path.join(origin, ref.file));
  if (sha(bytes) !== ref.sha256) throw Error("Source artifact changed");
  return JSON.parse((ref.file.endsWith(".gz") ? gunzipSync(bytes, { maxOutputLength: 64 * 1024 * 1024 }) : bytes).toString());
}
const full = fixtureV4Schema.parse(read(input.comparison.fixture));
const release = validatePublicRelease({ fixture: full, manifest: read(input.comparison.manifest) });
const observation = read(input.publicObservation);
if (observation.dataset !== "public-kg" || observation.revision !== "88437056-b74f-42ab-88c0-33ed435bdccc"
  || observation.release !== release.manifest.release) throw Error("Publication observation mismatch");
// Six published PLUTO claims and two other works. Original UUIDs and all fields survive.
const ids = new Set([
  "75f911ca-a247-42bd-8bf0-c166649ce145", "839b0bb8-1781-4a3e-8446-9a22d08d1658",
  "aacddf82-87ae-4981-8542-0470e981a94f", "cc2bc0c3-d8e7-47fe-8aaf-1b219bff0137",
  "dbc08a85-9165-4cc8-a3af-d133c83d8f67", "e3b37447-87f5-40ed-b738-6ba37578c8c3",
  "4e212aa6-9e75-47a4-aacf-96432e7eb517", "6d5ff5e4-5f59-4948-8248-cbdac3888a7c",
]);
const claims = full.claims.filter(c => ids.has(c.id));
if (claims.length !== ids.size || claims.some(c => c.visibility !== "published")) throw Error("Expected public claims missing");
const entityIds = new Set(claims.flatMap(c => [c.subjectId, c.objectId]));
const citations = full.citations.filter(c => ids.has(c.claimId));
const sourceIds = new Set(citations.map(c => c.sourceId));
const snapshot = fixtureV4Schema.parse({ schemaVersion: 4,
  entities: full.entities.filter(e => entityIds.has(e.id)), claims,
  sources: full.sources.filter(s => sourceIds.has(s.id)), citations });
const data = JSON.stringify(snapshot, null, 2) + "\n";
const manifest = JSON.stringify({ schemaVersion: 1, id: "public-pluto-subset-v1", dataset: "public-kg",
  revision: observation.revision, release: observation.release, observedAt: observation.observedAt,
  origin: observation.origin, sourceArtifact: input.comparison.fixture, sourceManifest: input.comparison.manifest,
  observationArtifact: input.publicObservation, snapshotSha256: sha(data),
  scope: "selected-public-subset; not exhaustive; no inference of absence outside this snapshot",
  claimIds: [...ids].sort() }, null, 2) + "\n";
fs.mkdirSync(path.join(here, "data"), { recursive: true });
for (const [name, content] of Object.entries({ "snapshot.json": data, "manifest.json": manifest })) {
  const target = path.join(here, "data", name);
  if (fs.existsSync(target)) {
    if (fs.readFileSync(target, "utf8") !== content) throw Error("Frozen projection differs: " + name);
  } else if (process.argv.includes("--check")) throw Error("Missing projection: " + name);
  else fs.writeFileSync(target, content, { flag: "wx" });
}
console.log(JSON.stringify({ status: "verified", entities: snapshot.entities.length, claims: claims.length,
  citations: citations.length, sources: snapshot.sources.length, snapshotSha256: sha(data) }));
