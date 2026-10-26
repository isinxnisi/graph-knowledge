import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { roleIdSchema, ADOPTED_CONTRIBUTION_ROLE_IDS } from "../lib/domain/contribution";
import { assertDatasetTarget } from "../lib/domain/dataset";
import { filmBetaEnabled } from "../lib/server/film-beta";
import { checkPendingFilmRoles } from "../lib/domain/pending-film-roles";
import { validatePublicRelease } from "../lib/server/public-dataset";
const pending = JSON.parse(readFileSync("vocabulary/contribution-roles/film-pending.json", "utf8"));
describe("film beta isolation and honest role registration", () => {
 it("recognizes pending IDs without approving the old eight or changing evidence", () => {
  expect(ADOPTED_CONTRIBUTION_ROLE_IDS).toHaveLength(8);
  expect(roleIdSchema.parse("ACTING")).toBe("ACTING");
  expect(roleIdSchema.parse("DIRECTING")).toBe("DIRECTING");
  expect(checkPendingFilmRoles(pending)).toHaveLength(2);
  expect(() => checkPendingFilmRoles({...pending,status:"approved",reviewer:"invented"})).toThrow();
 });
 it("requires the dedicated port and refuses production/shared or frozen targets", () => {
  const env = { GRAPH_FILM_BETA:"1", GRAPH_DATASET:"public-kg", NEO4J_URI:"bolt://127.0.0.1:7696" };
  expect(filmBetaEnabled(env)).toBe(true);
  for (const uri of ["bolt://127.0.0.1:7694","bolt://127.0.0.1:7695","bolt://graph-neo4j:7687","bolt://remote:7696"]) expect(() => filmBetaEnabled({...env,NEO4J_URI:uri})).toThrow();
  expect(() => filmBetaEnabled({...env,GRAPH_DEPLOYMENT:"production"})).toThrow();
  expect(() => assertDatasetTarget("public-kg",env.NEO4J_URI,undefined,"0")).toThrow();
  expect(() => assertDatasetTarget("demo",env.NEO4J_URI,undefined,"1")).toThrow();
 });
 it("cannot turn unaccepted beta Claims into a public release even with an otherwise valid fixture", () => {
  const records = JSON.parse(readFileSync("datasets/film-collection/v1/trial/review/proposed-records.json","utf8")).records;
  const fixture = {schemaVersion:4,...records,claims:records.claims.map((c: object)=>({...c,visibility:"published"}))};
  expect(() => validatePublicRelease({ fixture, manifest: {dataset:"public-kg",release:"film-test",baseRelease:null,reason:"test",
    dataSha256:"a".repeat(64),inputs:[{dataset:"trial",file:"trial.json",sha256:"a".repeat(64)}],claimOrigins:records.claims.map((c: {id:string})=>({claimId:c.id,dataset:"trial",sourceClaimId:c.id}))} })).toThrow(/Pending film Roles/);
 });
});
