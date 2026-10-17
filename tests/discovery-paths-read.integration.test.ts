import { beforeAll, afterAll, expect, it, vi } from "vitest";
import neo4j from "neo4j-driver";
vi.mock("server-only",()=>({}));
import { PATH_CLAIM_FILTER, PATH_NEIGHBORS } from "../lib/server/discovery-paths";
import { readPublicRevision } from "../lib/server/public-revision";
const live=process.env.PATHS_READ_TEST==="1";
let driver:ReturnType<typeof neo4j.driver>;
beforeAll(()=>{if(!live)return;process.loadEnvFile(".env.public");const uri=process.env.NEO4J_URI!;expect(new URL(uri).hostname).toBe("127.0.0.1");expect(["7694","7695"]).toContain(new URL(uri).port);driver=neo4j.driver(uri,neo4j.auth.basic(process.env.NEO4J_USER!,process.env.NEO4J_PASSWORD!));});
afterAll(async()=>{if(driver)await driver.close();});
it.skipIf(!live)("read-only実Cypher：公開・Roleを上限前に照合し、否定を落とさず、各対象を別々に制限する",async()=>{
 const rows=Array.from({length:25},(_,n)=>({id:String(n).padStart(3,"0"),visibility:"published",predicate:"CONTRIBUTED_TO",contributionRoleId:"AUTHORSHIP",polarity:"affirmed"}));
 rows.push({id:"025",visibility:"hidden",predicate:"CONTRIBUTED_TO",contributionRoleId:"DRAWING",polarity:"affirmed"},{id:"026",visibility:"published",predicate:"CONTRIBUTED_TO",contributionRoleId:"DRAWING",polarity:"denied"});
 const session=driver.session({database:process.env.NEO4J_DATABASE,defaultAccessMode:"READ"});
 try{await session.executeRead(async tx=>{
  const revision=await readPublicRevision(tx,null);
  const fixture=await tx.run(`UNWIND $rows AS c WITH c WHERE ${PATH_CLAIM_FILTER} RETURN c.id AS id, c.polarity AS polarity ORDER BY id LIMIT $take`,{rows,predicates:["CONTRIBUTED_TO"],roles:["DRAWING"],take:neo4j.int(1)});
  expect(fixture.records.map(r=>[r.get("id"),r.get("polarity")])).toEqual([["026","denied"]]);
  const pluto="2b7c6289-d050-4dc0-93e3-9307681253cc",princeton="0820c3e8-7219-4e57-abb0-7d04e253fd4a";
  const actual=await tx.run(PATH_NEIGHBORS,{ids:[pluto,princeton],predicates:null,roles:null,take:neo4j.int(5)});
  const a=actual.records.filter(r=>r.get("anchorId")===pluto),b=actual.records.filter(r=>r.get("anchorId")===princeton);
  expect(a).toHaveLength(5);expect(b).toHaveLength(5);expect(new Set(actual.records.map(r=>r.get("claim").id)).size).toBe(10);
  expect(actual.records.every(r=>r.get("claim").visibility==="published")).toBe(true);
  const role=await tx.run(PATH_NEIGHBORS,{ids:[pluto],predicates:["CONTRIBUTED_TO"],roles:["AUTHORSHIP"],take:neo4j.int(21)});
  expect(role.records).toHaveLength(1);expect(role.records[0].get("claim").contributionRoleId).toBe("AUTHORSHIP");
  await readPublicRevision(tx,revision);
 },{timeout:10000});}finally{await session.close();}
},30000);
