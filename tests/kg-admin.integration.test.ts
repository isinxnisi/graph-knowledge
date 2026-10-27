import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import neo4j from "neo4j-driver";
vi.mock("server-only", () => ({}));
import { adminSnapshot } from "../lib/server/kg-admin";
import { adminInput, adminPage } from "../lib/domain/kg-admin";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const driver = neo4j.driver("bolt://graph-neo4j:7687",neo4j.auth.basic("neo4j",process.env.NEO4J_PASSWORD!));
async function write(query:string, params={}) { const s=driver.session(); try { return await s.executeWrite(tx=>tx.run(query,params)); } finally { await s.close(); } }
beforeAll(async()=>{
  // This suite may only run inside its disposable Docker network; never a host DB.
  if(process.env.KG_ADMIN_ISOLATED_TEST!=="issue52" || process.env.GRAPH_DEPLOYMENT!=="production") throw Error("Isolated suite only");
  for(let i=0;i<60;i++) { try { await driver.verifyConnectivity(); break; } catch { await new Promise(r=>setTimeout(r,1000)); } }
  await write("CREATE (:DatasetState {id:'public-kg',release:'test',revision:'r1'})");
  await write("UNWIND $rows AS row CREATE (e:Entity) SET e=row",{rows:Array.from({length:325},(_,i)=>({id:id(i),name:`Entity ${String(i).padStart(3,"0")}`,kind:i%2?"person":"work",aliases:[]}))});
  await write("CREATE (:Source {id:'source',isDemo:false})");
  await write(`UNWIND $rows AS row MATCH (s:Entity {id:row.subject}), (o:Entity {id:row.object}), (source:Source {id:'source'})
    CREATE (c:Claim {id:row.id,visibility:row.visibility,polarity:row.polarity})-[:SUBJECT]->(s)
    CREATE (c)-[:OBJECT]->(o)
    CREATE (c)-[:HAS_CITATION]->(:Citation {stance:'support'})-[:CITES]->(source)`,{rows:[...Array.from({length:219},(_,i)=>({id:id(1000+i),subject:id(i),object:id(i+1),visibility:"published",polarity:"affirmed"})),{id:id(2000),subject:id(0),object:id(1),visibility:"published",polarity:"affirmed"},{id:id(2001),subject:id(219),object:id(220),visibility:"published",polarity:"denied"},{id:id(2002),subject:id(220),object:id(221),visibility:"hidden",polarity:"affirmed"}]});
},90_000);
afterAll(async()=>{await driver.close();});
describe("real isolated Neo4j",()=>{
  it("reads every Entity/Island and all paginated rows; no writes by management reads",async()=>{
    const start=performance.now(), before=(await write("MATCH (n) RETURN count(n) AS n")).records[0].get("n").toNumber();
    const snapshots=await Promise.all(Array.from({length:8},()=>adminSnapshot())); const r=snapshots[0];
    expect(r.entities).toHaveLength(325); expect(r.islands).toHaveLength(106); expect(r.claimCount).toBe(220); expect(r.distribution[0]).toBe(105);
    expect(r.excluded).toEqual({unpublished:1,denied:1,unsupported:0}); expect(new Set(snapshots).size).toBe(1);
    const all=[]; for(let offset=0;offset<325;offset+=40) all.push(...adminPage(r,adminInput(new URLSearchParams(`view=entities&sort=islandSize&second=degree&direction=desc&revision=r1&offset=${offset}`))).items);
    expect(new Set(all.map(e=>e.id)).size).toBe(325);
    expect((await write("MATCH (n) RETURN count(n) AS n")).records[0].get("n").toNumber()).toBe(before);
    console.log(JSON.stringify({measurement:"isolated snapshot",ms:Math.round(performance.now()-start),rssMiB:Math.round(process.memoryUsage().rss/1048576),entities:325,islands:106}));
  }, 30_000);
  it("invalidates cached components when the real revision changes",async()=>{
    const before=await adminSnapshot(); await write("MATCH (s:DatasetState {id:'public-kg'}) SET s.revision='r2'");
    const after=await adminSnapshot(); expect(after.revision).toBe("r2"); expect(after.islands[0].id).not.toBe(before.islands[0].id);
    expect(()=>adminPage(after,adminInput(new URLSearchParams("revision=r1")))).toThrow("DATASET_CHANGED");
  }, 30_000);
});
