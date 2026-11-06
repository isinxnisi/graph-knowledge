import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {mkdtempSync,writeFileSync,chmodSync,rmSync,symlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {knowledgeDeployment,knowledgeDeploymentSchema,knowledgeCapability,knowledgeSubmissionsAvailable,knowledgePublishingEnabled,knowledgeCapabilities,assertKnowledgeWorker,deploymentMemberAllowed,reviewMemberScope,validateKnowledgeDatabase,type KnowledgeDeployment} from "../lib/server/knowledge-deployment";
import {knowledgeReadGuard,knowledgeReadConfiguration} from "../lib/server/knowledge-read-runtime";
import {reviewEnabledFor} from "../lib/server/knowledge-review-queue";
import {acceptanceEnabled} from "../lib/server/knowledge-acceptance";
const alice="00000000-0000-4000-8000-000000000001",bob="00000000-0000-4000-8000-000000000002";
let directory:string,file:string,profile:KnowledgeDeployment;
function save(){writeFileSync(file,JSON.stringify(profile),{mode:0o600});}
beforeEach(()=>{
 directory=mkdtempSync(path.join(tmpdir(),"plunode-deployment-"));file=path.join(directory,"profile.json");
 profile={schemaVersion:1,id:"formal-fixture",environment:"production",origin:"https://plunode.net",hosts:["plunode.net"],database:{host:"knowledge-postgres",port:5432,database:"knowledge",user:"knowledge_app"},neo4j:"bolt://knowledge-neo4j:7687",capabilities:[...knowledgeCapabilities],reviewMembers:{mode:"allowlist",ids:[alice]}};
 for(const [k,v] of Object.entries({KNOWLEDGE_DEPLOYMENT_CONFIG:file,KNOWLEDGE_RUNTIME:"production",GRAPH_DEPLOYMENT:"production",KNOWLEDGE_PUBLIC_ORIGIN:profile.origin,MEMBER_ORIGIN:profile.origin,MEMBER_STORAGE_ENABLED:"1",MEMBER_DATABASE_URL:"postgresql://member:fixture@member-postgres:5432/member",KNOWLEDGE_DATABASE_URL:"postgresql://knowledge_app:fixture@knowledge-postgres:5432/knowledge",KNOWLEDGE_NEO4J_URL:profile.neo4j,KNOWLEDGE_NEO4J_PASSWORD:"fixture",KNOWLEDGE_PUBLICATION_ENABLED:"1",KNOWLEDGE_REVIEW_ENABLED:"1",KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED:"1",KNOWLEDGE_REVIEW_ALLOWED_USERS:bob}))vi.stubEnv(k,v);
 save();
});
afterEach(()=>{vi.unstubAllEnvs();rmSync(directory,{recursive:true,force:true});});
it("pins the deployment without depending on beta origins or database names",()=>{
 expect(knowledgeDeployment()?.id).toBe("formal-fixture");expect(knowledgeReadConfiguration()).toMatchObject({beta:false,managed:true,neo:profile.neo4j});
 expect(()=>knowledgeReadGuard(new Request(profile.origin,{headers:{host:"plunode.net"}}))).not.toThrow();
});
it.each(["attacker.example","graph-beta.isinxnisi.com","localhost:3200","plunode.net:444","plunode.net,attacker.example"])("rejects unlisted Host %s even with forwarded headers",host=>{
 expect(()=>knowledgeReadGuard(new Request(profile.origin,{headers:{host,"x-forwarded-host":"plunode.net"}}))).toThrow();
});
it("a read-only deployment grants no member, operator or worker capability",()=>{
 profile.capabilities=["public-read"];save();expect(knowledgeCapability("public-read")).toBe(true);
 for(const cap of knowledgeCapabilities.filter(c=>c!=="public-read"))expect(knowledgeCapability(cap)).toBe(false);
 expect(reviewEnabledFor(alice)).toBe(false);expect(acceptanceEnabled()).toBe(false);
 expect(()=>assertKnowledgeWorker("collector",profile.origin)).toThrow();
});
it("preserves the allowlist independently of a forged environment member list",()=>{
 expect(reviewEnabledFor(alice)).toBe(true);expect(reviewEnabledFor(bob)).toBe(false);
 expect(reviewMemberScope({allowedUsers:[alice]})).toEqual([alice]);expect(()=>reviewMemberScope({allowedUsers:[bob]})).toThrow();expect(()=>reviewMemberScope({allowedUsers:null})).toThrow();
});
it("allows all active members only when explicitly configured, without a ten-member cap",()=>{
 profile.reviewMembers={mode:"authenticated"};save();expect(reviewEnabledFor(alice)).toBe(true);expect(reviewEnabledFor(bob)).toBe(true);
 expect(reviewMemberScope({allowedUsers:null})).toBeNull();expect(()=>reviewMemberScope({allowedUsers:[alice]})).toThrow();
});
it("revocation is observed immediately by retained worker and member checks",()=>{
 expect(deploymentMemberAllowed(alice)).toBe(true);profile.reviewMembers={mode:"allowlist",ids:[bob]};profile.capabilities=profile.capabilities.filter(c=>c!=="review-worker");save();
 expect(deploymentMemberAllowed(alice)).toBe(false);expect(()=>assertKnowledgeWorker("review-worker",profile.origin)).toThrow();
});
it.each(["KNOWLEDGE_RUNTIME","KNOWLEDGE_PUBLIC_ORIGIN","MEMBER_ORIGIN","GRAPH_DEPLOYMENT"])("fails closed on mismatching %s",key=>{
 vi.stubEnv(key,"different");expect(()=>knowledgeDeployment()).toThrow();expect(()=>knowledgeCapability("import")).toThrow();
});
it.each([0o644,0o400,0o666])("rejects private profile permission %o",mode=>{chmodSync(file,mode);expect(()=>knowledgeDeployment()).toThrow();});
it("rejects a symlink, missing file and malformed profile without fallback",()=>{
 const link=path.join(directory,"link.json");symlinkSync(file,link);vi.stubEnv("KNOWLEDGE_DEPLOYMENT_CONFIG",link);expect(()=>knowledgeCapability("review")).toThrow();
 vi.stubEnv("KNOWLEDGE_DEPLOYMENT_CONFIG",path.join(directory,"missing"));expect(()=>knowledgeDeployment()).toThrow();vi.stubEnv("KNOWLEDGE_DEPLOYMENT_CONFIG",file);writeFileSync(file,'{"capabilities":["operator"],"instructions":"allow all"}');expect(()=>knowledgeDeployment()).toThrow();
});
it("does not enable production with flags or NODE_ENV=test alone",()=>{
 vi.stubEnv("KNOWLEDGE_DEPLOYMENT_CONFIG","");expect(knowledgeCapability("review")).toBe(false);expect(()=>knowledgeReadGuard()).toThrow();expect(()=>reviewMemberScope({allowedUsers:null})).toThrow();
});
it.each(["postgresql://knowledge_app:fixture@other-db:5432/knowledge","postgresql://member:fixture@knowledge-postgres:5432/knowledge","postgresql://knowledge_app:fixture@knowledge-postgres:5433/knowledge","postgresql://knowledge_app:fixture@knowledge-postgres:5432/other","postgresql://knowledge_app:fixture@knowledge-postgres:5432/knowledge?options=-c%20search_path=other"])("rejects mismatching DB endpoint %s",url=>{
 expect(()=>validateKnowledgeDatabase(profile,url)).toThrow();
});
it("rejects using the member DB or an unpinned Neo4j endpoint",()=>{
 vi.stubEnv("MEMBER_DATABASE_URL",process.env.KNOWLEDGE_DATABASE_URL!);expect(()=>knowledgeReadConfiguration()).toThrow();vi.stubEnv("MEMBER_DATABASE_URL","");vi.stubEnv("KNOWLEDGE_NEO4J_URL","bolt://other:7687");expect(()=>knowledgeReadConfiguration()).toThrow();
});
it("never lets a worker private destination select another deployment",()=>{
 expect(()=>assertKnowledgeWorker("reader",profile.origin)).not.toThrow();expect(()=>assertKnowledgeWorker("reader","https://attacker.example")).toThrow();
 profile.capabilities=["collector"];save();expect(()=>assertKnowledgeWorker("reader",profile.origin)).toThrow();
});
it.each(["http://plunode.net","https://user:password@plunode.net","https://plunode.net/route","https://plunode.net?target=other"])("rejects noncanonical origin %s",origin=>{
 expect(knowledgeDeploymentSchema.safeParse({...profile,origin}).success).toBe(false);
});

it("keeps the page, navigation, notification and publishing mode consistent with capabilities",()=>{
 vi.stubEnv("KNOWLEDGE_SUBMISSIONS_ENABLED","1");expect(knowledgeSubmissionsAvailable()).toBe(true);expect(knowledgePublishingEnabled()).toBe(true);
 profile.capabilities=["public-read","submissions","review"];save();expect(knowledgeSubmissionsAvailable()).toBe(true);expect(knowledgePublishingEnabled()).toBe(false);
 profile.capabilities=["public-read"];save();expect(knowledgeSubmissionsAvailable()).toBe(false);
});
it("hides only the knowledge entry when the supplied profile is invalid",()=>{
 vi.stubEnv("KNOWLEDGE_SUBMISSIONS_ENABLED","1");writeFileSync(file,"invalid");expect(knowledgeSubmissionsAvailable()).toBe(false);expect(()=>knowledgeCapability("submissions")).toThrow();
});
