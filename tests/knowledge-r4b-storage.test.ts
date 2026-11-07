import {randomUUID} from "node:crypto";
import {beforeAll,afterAll,describe,it,expect} from "vitest";
import {Pool} from "pg";
import type {Driver} from "neo4j-driver";
import {createKnowledgeFoundationService} from "../lib/server/knowledge-foundation";
import {createKnowledgePublicationService,ensureKnowledgePublicationSchema} from "../lib/server/knowledge-publication";
import {migrateKnowledgeTranslations} from "../lib/server/knowledge-translation-migrate";
import {captureKnowledgeCapsule} from "../lib/client/capsule-knowledge";
import {prepareLegacyEntityTranslation} from "../lib/server/knowledge-legacy-translation";
import {legacyDigest} from "../lib/domain/knowledge-legacy";
import type {readSubmissionLegacyReferences} from "../lib/server/knowledge-submission-legacy";
const url=process.env.KNOWLEDGE_R4B_TEST_DATABASE_URL;
describe.skipIf(!url)("R4b isolated PostgreSQL fixed originals and translation updates",()=>{
 const pool=new Pool({connectionString:url,max:3}),foundation=createKnowledgeFoundationService(pool);
 // These read paths use only the immutable PostgreSQL store, never Neo4j.
 const publicRead=createKnowledgePublicationService(pool,{} as Driver);
 const actor={kind:"operator" as const,id:"r4b-storage-test"};
 const run=(action:string,body:Record<string,unknown>)=>foundation.execute(actor,{action,...body,requestId:randomUUID(),reason:"R4b境界検証"});
 beforeAll(async()=>{expect((await pool.query("SELECT current_database() n")).rows[0].n).toMatch(/^plunode_knowledge75_test_r4b_/);await ensureKnowledgePublicationSchema(pool);await migrateKnowledgeTranslations(pool);},30000);
 afterAll(()=>pool.end());
 it("returns current Theme translations, validates fixed snapshots canonically and respects withdrawal",async()=>{
  const id="r4b-"+randomUUID();await run("create-bundle",{entities:[],sources:[{id:id+":s",content:{title:"資料",bibliography:"固定版"}}],records:[{id:id+":r",content:{kind:"note",assertion:"テーマの説明",times:[{id:"clock",time:{kind:"calendar",from:"2021-12-25T12:20Z",meaning:"point",label:"打上げ"}}],evidence:[{id:"e",source:{id:id+":s",revision:1},locator:"本文"}]}}]});
  await run("create-theme",{id:id+":theme",title:"時刻のテーマ",recordPins:[{id:id+":r",revision:1}],initialView:"timeline"});const theme=await foundation.resolveTheme(actor,id+":theme");const target={kind:"theme" as const,id:theme.theme.id,revision:1,field:"title" as const};const original=await publicRead.textOriginal(target);
  await run("accept-translation",{target,language:"en",text:"Clock theme",originalHash:original.hash,expectedRevision:0});
  const response=await publicRead.capsuleUpdates({recordIds:[],entityIds:[],theme:{id:target.id,revision:1},includeTheme:true,translations:[{target,language:"en"}]});expect(response.snapshot.theme?.content.title).toBe("時刻のテーマ");expect(response.snapshot.translations?.[0].text).toBe("Clock theme");
  const saved=captureKnowledgeCapsule({snapshot:response.snapshot,theme:response.theme,title:"固定した訳文"}).document!.knowledge!;expect(await publicRead.validateCapsuleKnowledge(saved)).toBe(true);
  const changed=structuredClone(saved);changed.snapshot.theme!.content.title="捏造";await expect(publicRead.validateCapsuleKnowledge(changed)).rejects.toThrow();
  const translation=response.snapshot.translations![0];await run("accept-translation",{target,language:"en",text:"Revised clock theme",originalHash:original.hash,expectedRevision:translation.revision});const latest=await publicRead.capsuleUpdates({recordIds:[],entityIds:[],theme:{id:target.id,revision:1},includeTheme:true,translations:[{target,language:"en"}]});expect(latest.snapshot.translations![0].revision).toBe(2);expect(saved.snapshot.translations![0].text).toBe("Clock theme");
  await run("set-visibility",{kind:"theme",id:target.id,expectedStatusRevision:1,visibility:"hidden"});await expect(publicRead.capsuleUpdates({recordIds:[],entityIds:[],theme:{id:target.id,revision:1},includeTheme:true,translations:[{target,language:"en"}]})).rejects.toMatchObject({status:404});
 });
 it("prepares a legacy translation from the server original and rejects a changed source before writing",async()=>{
  const id=randomUUID(),entity={id,revision:1 as const,content:{name:"原本",aliases:[],kind:"person",description:"公開済み",language:"und"}},payload={schemaVersion:1,revision:"test-release",entity:entity.content};
  const captured={revision:"test-release",entities:[entity],sources:[],records:[],legacy:{entities:[{id,revision:"test-release",payload,sha256:legacyDigest(payload)}],records:[]}} as unknown as Awaited<ReturnType<typeof readSubmissionLegacyReferences>>;
  const result=await prepareLegacyEntityTranslation({kind:"entity",id,requestId:randomUUID()},{pool,capture:async()=>captured});expect(result.entity?.content.name).toBe("原本");
  const next=structuredClone(captured);next.entities[0].content.name="変更";let reads=0;await expect(prepareLegacyEntityTranslation({kind:"entity",id,requestId:randomUUID()},{pool,capture:async()=>++reads===1?captured:next})).rejects.toMatchObject({code:"TARGET_CHANGED"});
 });
});
