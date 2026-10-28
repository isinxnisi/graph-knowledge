import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { publicationCapabilities, publicationContract, assertPublicationCompatibility, serializePublicationFixture } from "../lib/server/publication-compatibility";
import { CONTRIBUTION_ROLE_IDS, CONTRIBUTION_ROLE_LABELS } from "../lib/generated/contribution-roles";
import { contributionSchema } from "../lib/domain/contribution";

const input = JSON.parse(readFileSync("datasets/public-kg/releases/20261011-001/data.json", "utf8"));
const data = serializePublicationFixture(input).data;
const manifest = JSON.parse(readFileSync("datasets/public-kg/releases/20261011-001/manifest.json", "utf8"));
manifest.dataSha256 = serializePublicationFixture(input).dataSha256;
const contract = () => publicationContract(data, JSON.stringify(manifest) + "\n");
describe("static Role generation and publication compatibility", () => {
 test("preserves the ten IDs and old eight display values", () => {
  expect(CONTRIBUTION_ROLE_IDS).toEqual(["SCRIPT_WRITING", "SUPERVISION", "PRODUCING", "STORY_CO_CREATION", "AUTHORSHIP", "CREATION", "DRAWING", "ORIGINAL_STORY", "DIRECTING", "ACTING"]);
  expect(CONTRIBUTION_ROLE_LABELS.en).toMatchObject({ SCRIPT_WRITING: "Script writing", PRODUCING: "Producing", CREATION: "Creation credit (作)", DRAWING: "Manga artwork", ORIGINAL_STORY: "Original story credit (manga production)" });
  expect(CONTRIBUTION_ROLE_LABELS.ja).toMatchObject({ PRODUCING: "プロデュース", CREATION: "作", DRAWING: "作画", ORIGINAL_STORY: "原作（漫画制作）" });
 });
 test("keeps formal adoption separate from recognition", () => {
  const caps = structuredClone(publicationCapabilities());
  const c = contract(); const role = Object.keys(c.requiredRoleHashes)[0];
  delete (caps.adoptedDefinitionHashes as Record<string, string>)[role];
  expect(caps.recognizedRoleIds).toContain(role);
  expect(() => assertPublicationCompatibility(c, caps)).toThrow(/not formally adopted/);
 });
 test("seals identical values to identical schema-order bytes", () => {
  const reordered = JSON.parse(JSON.stringify(input, (_, value) => value && !Array.isArray(value) && typeof value === "object" ? Object.fromEntries(Object.entries(value).reverse()) : value));
  expect(serializePublicationFixture(reordered)).toEqual(serializePublicationFixture(input));
  expect(JSON.parse(data)).toEqual(input);
  expect(data.endsWith("\n")).toBe(true);
 });
 test("rejects unknown fields, Role IDs and scope structures", () => {
  expect(() => serializePublicationFixture({ ...input, extra: "discard me" })).toThrow();
  expect(() => contributionSchema.parse({ roleId: "UNKNOWN_ROLE", scope: null })).toThrow();
  expect(() => contributionSchema.parse({ roleId: "ACTING", scope: { kind: "film-cut", cut: "anything" } })).toThrow();
 });
 test("accepts unchanged catalog/reviews and rejects definition, schema or serialization drift", () => {
  const caps = publicationCapabilities();
  expect(caps.catalogValid).toBe(true);
  assertPublicationCompatibility(contract(), caps);
  expect(() => assertPublicationCompatibility({ ...contract(), fixtureSchemaVersion: 99 }, caps)).toThrow(/schema/);
  expect(() => assertPublicationCompatibility({ ...contract(), serialization: "sorted-json" }, caps)).toThrow(/serialization/);
  expect(() => assertPublicationCompatibility({ ...contract(), catalogSha256: "0".repeat(64) }, caps)).toThrow(/Catalog/);
  const c = contract(); c.requiredRoleHashes[Object.keys(c.requiredRoleHashes)[0]] = "0".repeat(64);
  expect(() => assertPublicationCompatibility(c, caps)).toThrow(/definition/);
 });
});
