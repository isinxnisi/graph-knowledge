import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import catalog from "../../vocabulary/contribution-roles/catalog.json";
import baseline from "../../vocabulary/contribution-roles/baseline-v1.json";
import reviews from "../../vocabulary/contribution-roles/reviews.json";
import { fixtureV4Schema } from "../domain/fixture";
import { checkRoleVocabulary } from "../domain/role-vocabulary";
import { CONTRIBUTION_ROLE_COMPATIBILITY as generated } from "../generated/contribution-roles";
import { validatePublicRelease } from "./public-dataset";

export const SERIALIZATION = "fixture-v4-schema-json-2lf-v1";
export const hashBytes = (text: string) => createHash("sha256").update(text).digest("hex");
export function serializePublicationFixture(input: unknown) {
 const fixture = fixtureV4Schema.parse(input);
 if (!isDeepStrictEqual(input, fixture)) throw Error("Schema parsing changed JSON values or fields");
 const data = JSON.stringify(fixture, null, 2) + "\n";
 return { data, dataSha256: hashBytes(data), serialization: SERIALIZATION, valuesUnchanged: true };
}
export function publicationCapabilities() {
 const check = checkRoleVocabulary(catalog, baseline, reviews);
 return { ...generated, nodeVersion: process.version, catalogValid: check.errors.length === 0,
  // Recognition does not prove adoption. Publication still validates catalog/baseline/reviews.
  adoptedDefinitionHashes: check.errors.length ? {} : generated.definitionHashes };
}
export type PublicationCapabilities = ReturnType<typeof publicationCapabilities>;
export function publicationContract(data: string, manifest: string) {
 const fixture = fixtureV4Schema.parse(JSON.parse(data));
 validatePublicRelease({ fixture, manifest: JSON.parse(manifest) });
 const caps = publicationCapabilities();
 if (!caps.catalogValid) throw Error("Invalid formally adopted Role catalog");
 const serialized = serializePublicationFixture(JSON.parse(data));
 if (serialized.data !== data) throw Error("Candidate serialization is not sealed schema order");
 const requiredRoleHashes: Record<string, string> = {};
 for (const claim of fixture.claims) if (claim.contribution?.roleId) {
  const id = claim.contribution.roleId;
  const definition = (caps.adoptedDefinitionHashes as Record<string, string>)[id];
  if (!definition) throw Error("Recognized but not formally adopted Role: " + id);
  requiredRoleHashes[id] = definition;
 }
 return { schemaVersion: 1, fixtureSchemaVersion: 4, serialization: SERIALIZATION,
  dataSha256: hashBytes(data), manifestSha256: hashBytes(manifest),
  catalogSha256: String(caps.catalogSha256), reviewsSha256: String(caps.reviewsSha256),
  codegenSha256: String(caps.codegenSha256), labelsSha256: String(caps.labelsSha256),
  requiredRoleHashes, scopeFormats: [...new Set(fixture.claims.filter(c => c.contribution).map(c => c.contribution?.scope ? "publication-isbn13-v1" : "null"))].sort(),
  savedWorkspaceVersions: [1, 2, 3], relationRevisions: [1, 2, 3] };
}
export type PublicationContract = ReturnType<typeof publicationContract>;
export function assertPublicationCompatibility(contract: PublicationContract, caps: PublicationCapabilities) {
 if (contract.schemaVersion !== 1 || !(caps.fixtureSchemaVersions as readonly number[]).includes(contract.fixtureSchemaVersion)) throw Error("Unsupported fixture schema");
 if (!(caps.serialization as readonly string[]).includes(contract.serialization)) throw Error("Unsupported serialization");
 if (!caps.catalogValid || ["catalogSha256", "reviewsSha256", "codegenSha256", "labelsSha256"].some(key => caps[key as "catalogSha256"] !== contract[key as "catalogSha256"])) throw Error("Catalog/reviews/labels do not match the fixed candidate");
 for (const [id, definition] of Object.entries(contract.requiredRoleHashes)) {
  if (!(caps.recognizedRoleIds as readonly string[]).includes(id)) throw Error("Unrecognized Role: " + id);
  if ((caps.adoptedDefinitionHashes as Record<string, string>)[id] !== definition) throw Error("Role not formally adopted at the required definition: " + id);
 }
 for (const scope of contract.scopeFormats) if (!(caps.scopeFormats as readonly string[]).includes(scope)) throw Error("Unsupported scope: " + scope);
 for (const version of contract.savedWorkspaceVersions) if (!(caps.savedWorkspaceVersions as readonly number[]).includes(version)) throw Error("Unsupported saved workspace");
 for (const revision of contract.relationRevisions) if (!(caps.relationRevisions as readonly number[]).includes(revision)) throw Error("Unsupported relation revision");
}
