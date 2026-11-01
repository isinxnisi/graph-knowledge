import { createHash } from "node:crypto";
import { validateFixture, type Fixture } from "./fixture";
import type { ThemeTime } from "./theme-workbench";
import { knowledgeCommandSchema } from "./knowledge-foundation";
import { PREDICATES } from "./predicates";
import { contributionLabels } from "../i18n/contribution";
import { organizationParticipationLabels } from "../i18n/organization-participation";
import { eventParticipationLabels } from "../i18n/event-participation";

export type LegacyProvenance = {
  dataset: string; release: string; sourceDataSha256: string; sourceManifestSha256: string;
  publishedRevision: string;
};

/** Hash the immutable source values, independently of JSON property order. */
export function legacyStableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(legacyStableJson).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${legacyStableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("Legacy payload must contain JSON values");
  return encoded;
}
export function legacyDigest(value: unknown): string {
  return createHash("sha256").update(legacyStableJson(value)).digest("hex");
}

function relationLabel(claim: Fixture["claims"][number]): string {
  if (claim.contribution?.roleId) return contributionLabels().roles[claim.contribution.roleId];
  if (claim.organizationParticipation) return `${PREDICATES[claim.predicate].label} · ${organizationParticipationLabels().positions[claim.organizationParticipation.positionId]}`;
  if (claim.eventParticipation) return `${PREDICATES[claim.predicate].label} · ${eventParticipationLabels().roles[claim.eventParticipation.roleId]}`;
  return PREDICATES[claim.predicate].label;
}

/** This adapter does not decide identity, publish candidates, or infer new facts. */
export function adaptLegacyKnowledge(input: unknown, provenance: LegacyProvenance) {
  const fixture = validateFixture(input);
  if (!provenance.dataset || !provenance.release || !provenance.publishedRevision ||
      !/^[a-f0-9]{64}$/.test(provenance.sourceDataSha256) || !/^[a-f0-9]{64}$/.test(provenance.sourceManifestSha256)) {
    throw new Error("Legacy import requires a fixed source and publication provenance");
  }
  // A hidden acceptance draft is not evidence of publication. Use the actual release.
  if (fixture.claims.some(claim => claim.visibility !== "published")) throw new Error("Only published legacy records may use this import path");
  if (fixture.sources.some(source => source.isDemo)) throw new Error("Demo records are not a published legacy sample");
  const names = new Map(fixture.entities.map(entity => [entity.id, entity.name]));
  const warnings: { legacyClaimId: string; code: string }[] = [];
  const entities = fixture.entities.map(entity => ({ id: entity.id, content: {
    name: entity.name, aliases: entity.aliases, kind: entity.kind,
    description: entity.description ?? "", language: "und",
  } }));
  const sources = fixture.sources.map(source => ({ id: source.id, content: {
    title: source.title, url: source.url, language: "und",
    bibliography: [source.authors.join("・"), source.publisher, source.publishedAt?.value, source.edition, source.note].filter(Boolean).join(" / "),
  } }));
  const records = fixture.claims.map(claim => {
    const relation = relationLabel(claim);
    const scope = claim.contribution?.scope;
    const scopeLabel = scope ? [`適用刊行物：ISBN ${scope.isbn13}`, scope.volumeLabel, scope.editionLabel, scope.language,
      "この指定刊行物で確認されたクレジット。全巻・全版への適用や、この巻だけの担当を意味しません。"].filter(Boolean).join(" · ") : "";
    const times: { id: string; time: ThemeTime }[] = [];
    let boundary = "";
    if (claim.period.from && claim.period.to) {
      // The old pair did not distinguish duration from occurrence uncertainty.
      times.push({ id: `${claim.id}-period`, time: { kind: "calendar", from: claim.period.from.value, to: claim.period.to.value, label: "旧Claimの期間指定（意味未区別）" } });
    } else if (claim.period.from || claim.period.to) {
      boundary = claim.period.from ? `開始境界 ${claim.period.from.value}（終了未記載）` : `終了境界 ${claim.period.to!.value}（開始未記載）`;
      warnings.push({ legacyClaimId: claim.id, code: "open-boundary-kept-in-scope-and-immutable-source" });
    }
    return { id: claim.id, content: {
      kind: "relation" as const, subjectId: claim.subjectId, objectId: claim.objectId,
      assertion: `${names.get(claim.subjectId)} → ${names.get(claim.objectId)}：${relation}${claim.polarity === "denied" ? "（否定の主張）" : ""}`,
      relation, polarity: claim.polarity, scope: [scopeLabel, boundary].filter(Boolean).join(" · "), times,
      evidence: fixture.citations.filter(citation => citation.claimId === claim.id).map(citation => ({
        id: citation.id, source: { id: citation.sourceId, revision: 1 }, locator: citation.locator,
        // Source metadata and notes are not a verbatim passage of the source.
        excerpt: "", stance: citation.stance,
      })),
    } };
  });
  const legacyLinks = fixture.claims.map(claim => {
    const citations = fixture.citations.filter(citation => citation.claimId === claim.id);
    const sourceIds = new Set(citations.map(citation => citation.sourceId));
    const payload = {
      schemaVersion: 1, fixtureSchemaVersion: fixture.schemaVersion, provenance,
      claim, entities: fixture.entities.filter(entity => entity.id === claim.subjectId || entity.id === claim.objectId),
      sources: fixture.sources.filter(source => sourceIds.has(source.id)), citations,
    };
    return { dataset: provenance.dataset, legacyClaimId: claim.id, recordId: claim.id, importedRevision: 1 as const, payload, sha256: legacyDigest(payload) };
  });
  // Validate the common contract before callers can persist any adapted values.
  const checked = knowledgeCommandSchema.parse({ requestId: "baf8237e-9b11-46ef-b3f0-d0dc44843058", action: "create-bundle", entities, sources, records, legacyLinks, reason: "公開済み旧KGの固定版取込" });
  if (checked.action !== "create-bundle") throw new Error("Unexpected import command");
  return { entities: checked.entities, sources: checked.sources, records: checked.records, legacyLinks, warnings };
}
