import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fixtureV4Schema, fixtureCounts, type Fixture } from "../domain/fixture";
import { loadPilotV2 } from "./pilot-v2-dataset";
import { loadEventPilot } from "./event-dataset";
import { publicManifestSchema } from "../domain/public-release";

export const PUBLIC_DATASET = "public-kg" as const;
export const PUBLIC_DIRECTORY = "datasets/public-kg/releases/20261011-001";
export const stableJson = (value: unknown): string => JSON.stringify(value, (_, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export type PublicManifest = {
  dataset: typeof PUBLIC_DATASET; release: string; baseRelease: string | null;
  reason: string; dataSha256: string;
  inputs: { dataset: string; file: string; sha256: string }[];
  claimOrigins: { claimId: string; dataset: string; sourceClaimId: string }[];
  withdrawals?: { claimId: string; reason: string; release: string; replacementClaimId: string | null }[];
};
export type PublicRelease = { manifest: PublicManifest; fixture: Fixture };

export function validatePublicRelease(input: PublicRelease): PublicRelease {
  const manifest = publicManifestSchema.parse(input.manifest);
  const fixture = fixtureV4Schema.parse(input.fixture);
  if (fixture.sources.some(source => source.isDemo)) throw new Error("Demo sources cannot enter public-kg");
  if (sha256(JSON.stringify(fixture, null, 2) + "\n") !== manifest.dataSha256) throw new Error("Public release data hash mismatch");
  if (manifest.claimOrigins.length !== fixture.claims.length || new Set(manifest.claimOrigins.map(row => row.claimId)).size !== fixture.claims.length || manifest.claimOrigins.some(row => !fixture.claims.some(claim => claim.id === row.claimId))) throw new Error("Every public claim needs exactly one recorded origin");
  const withdrawals = manifest.withdrawals ?? [];
  const claims = new Map(fixture.claims.map(claim => [claim.id, claim]));
  if (new Set(withdrawals.map(row => row.claimId)).size !== withdrawals.length) throw new Error("Duplicate withdrawal");
  for (const row of withdrawals) {
    if (claims.get(row.claimId)?.visibility !== "hidden") throw new Error("Withdrawal must retain a hidden Claim");
    if (row.replacementClaimId && (row.replacementClaimId === row.claimId || !claims.has(row.replacementClaimId))) throw new Error("Replacement must be a distinct retained Claim");
  }
  for (const row of withdrawals) {
    const seen = new Set([row.claimId]); let next = row.replacementClaimId;
    while (next) {
      if (seen.has(next)) throw new Error("Replacement cycle is not allowed");
      seen.add(next); next = withdrawals.find(item => item.claimId === next)?.replacementClaimId ?? null;
    }
  }
  if (fixture.claims.some(claim => claim.visibility !== "published" && !withdrawals.some(row => row.claimId === claim.id))) throw new Error("Hidden public Claim needs explicit withdrawal");
  return { manifest, fixture };
}

// 凍結版の意味・UUIDを維持し、既存schemaの任意fieldだけを明示する。
export function combineAcceptedFixtures(fixtures: Fixture[]): Fixture {
  const result: Record<string, unknown> = { schemaVersion: 4 };
  for (const field of ["entities", "claims", "sources", "citations"] as const) {
    const rows = new Map<string, unknown>();
    for (const fixture of fixtures) for (const input of fixture[field]) {
      const row = field === "entities" ? { ...input, event: "event" in input ? input.event ?? null : null }
        : field === "claims" ? { contribution: null, organizationParticipation: null, eventParticipation: null, ...input }
        : field === "citations" ? { roleEvidence: null, positionEvidence: null, eventParticipationEvidence: null, ...input } : input;
      if (rows.has(input.id) && stableJson(rows.get(input.id)) !== stableJson(row)) throw new Error(`Conflicting ${field} ID: ${input.id}`);
      rows.set(input.id, row);
    }
    result[field] = [...rows.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value);
  }
  const fixture = fixtureV4Schema.parse(result);
  if (fixture.sources.some(source => source.isDemo)) throw new Error("Demo sources cannot enter public-kg");
  return fixture;
}

export async function preparePublicDataset(): Promise<{ release: PublicRelease; data: string; manifest: string }> {
  // 各loaderが元の受入状態・凍結hash・生成一致を検証する。
  const originals = [
    { dataset: "pilot-urasawa-v2", directory: "datasets/pilot-urasawa/v2", fixture: await loadPilotV2() },
    { dataset: "pilot-event-v1", directory: "datasets/pilot-event/v1", fixture: await loadEventPilot() },
  ];
  const fixture = combineAcceptedFixtures(originals.map(input => input.fixture));
  const data = JSON.stringify(fixture, null, 2) + "\n";
  const inputs: PublicManifest["inputs"] = [];
  for (const input of originals) for (const file of ["ledger.json", "manifest.json", "data.json"]) {
    const path = `${input.directory}/${file}`;
    inputs.push({ dataset: input.dataset, file: path, sha256: sha256(await readFile(path, "utf8")) });
  }
  const manifest: PublicManifest = {
    dataset: PUBLIC_DATASET, release: "20261011-001", baseRelease: null,
    reason: "人間受入済み漫画v2とEvent（科学v2を含む）をUUID・根拠・限定を保持して共通KGへ構成。新規事実の受入ではない。",
    dataSha256: sha256(data), inputs,
    claimOrigins: originals.flatMap(input => input.fixture.claims.map(claim => ({ claimId: claim.id, dataset: input.dataset, sourceClaimId: claim.id }))),
  };
  return { release: { manifest, fixture }, data, manifest: JSON.stringify(manifest, null, 2) + "\n" };
}

export async function loadPublicRelease(directory = PUBLIC_DIRECTORY): Promise<PublicRelease> {
  const data = await readFile(`${directory}/data.json`, "utf8");
  const manifest = publicManifestSchema.parse(JSON.parse(await readFile(`${directory}/manifest.json`, "utf8")));
  if (sha256(data) !== manifest.dataSha256) throw new Error("Public release data hash mismatch");
  const fixture = fixtureV4Schema.parse(JSON.parse(data));
  return validatePublicRelease({ manifest, fixture });
}

export async function validateInitialPublicDataset() {
  const expected = await preparePublicDataset();
  for (const [file, content] of [["data.json", expected.data], ["manifest.json", expected.manifest]]) {
    if (await readFile(`${PUBLIC_DIRECTORY}/${file}`, "utf8") !== content) throw new Error(`Initial public ${file} differs from accepted inputs`);
  }
  return fixtureCounts((await loadPublicRelease()).fixture);
}
