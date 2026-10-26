import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { registerFilmRoles, prepareFilmRoleDecision } from "../lib/domain/film-role-registration";
import { checkRoleVocabulary } from "../lib/domain/role-vocabulary";
import { vocabularyHash } from "../lib/domain/vocabulary";
import { isFilmTrialClaim, FILM_TRIAL_CLAIM_IDS } from "../lib/domain/film-trial";
const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const dir = "vocabulary/contribution-roles/";
const catalog = read(dir + "catalog.json"), baseline = read(dir + "baseline-v1.json"), reviews = read(dir + "reviews.json");
const pending = read(dir + "film-pending.json"), drafts = read("docs/research/film-beta-issue43/role-review-drafts.json");
const packet = () => prepareFilmRoleDecision(catalog, reviews, pending, drafts);
const testDecision = () => ({ ...packet(), status: "approved",
  humanDecision: { actorType: "human", reviewer: "ISOLATED TEST ONLY", decidedAt: "2026-10-26T00:00:00Z", statement: "Synthetic unit fixture; never a real approval" } });
describe("fixed film Role registration", () => {
 it("rejects draft, missing person/time, altered definition/hash and review template", () => {
  expect(() => registerFilmRoles(packet(), catalog, baseline, reviews, pending, drafts)).toThrow(/human Role decision/);
  for (const edit of [
   (d: ReturnType<typeof testDecision>) => { d.humanDecision.reviewer = ""; },
   (d: ReturnType<typeof testDecision>) => { d.humanDecision.decidedAt = "2999-01-01T00:00:00Z"; },
   (d: ReturnType<typeof testDecision>) => { d.roles[0].afterHash = "0".repeat(64); },
  ]) { const d = testDecision(); edit(d); expect(() => registerFilmRoles(d, catalog, baseline, reviews, pending, drafts)).toThrow(); }
  const changed = structuredClone(pending); changed.entries[0].meaning.definition += " altered";
  expect(() => registerFilmRoles(testDecision(), catalog, baseline, reviews, changed, drafts)).toThrow(/binding/);
  expect(() => registerFilmRoles(testDecision(), catalog, baseline, reviews, pending, drafts.slice(0, 1))).toThrow(/binding/);
 });
 it("extends to ten only with exact synthetic packet, keeping every old definition and approval byte value", () => {
  const before = vocabularyHash({ catalog, reviews });
  const next = registerFilmRoles(testDecision(), catalog, baseline, reviews, pending, drafts);
  expect(next.catalog.entries).toHaveLength(10);
  expect(next.catalog.entries.slice(0, 8)).toEqual(catalog.entries);
  expect(next.reviews.slice(0, reviews.length)).toEqual(reviews);
  expect(checkRoleVocabulary(next.catalog, baseline, next.reviews).errors).toEqual([]);
  expect(checkRoleVocabulary(next.catalog, catalog, next.reviews).errors).toEqual([]);
  expect(checkRoleVocabulary(next.catalog, baseline, reviews).errors.length).toBeGreaterThan(0);
  expect(vocabularyHash({ catalog, reviews })).toBe(before);
  expect(() => registerFilmRoles(testDecision(), next.catalog, baseline, next.reviews, pending, drafts)).toThrow();
 });
 it("labels only the two isolated trial IDs when the server verified trial mode", () => {
  for (const id of FILM_TRIAL_CLAIM_IDS) {
   expect(isFilmTrialClaim(true, id)).toBe(true);
   expect(isFilmTrialClaim(false, id)).toBe(false);
  }
  expect(isFilmTrialClaim(true, "unrelated-manga-claim")).toBe(false);
 });
});
