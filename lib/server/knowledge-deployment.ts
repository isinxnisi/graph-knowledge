import {closeSync,constants,fstatSync,openSync,readFileSync,realpathSync} from "node:fs";
import path from "node:path";
import {z} from "zod";
import {KnowledgeError} from "./knowledge-foundation";

export const knowledgeCapabilities = ["public-read","submissions","review","publish","translation","import","operator","collection","collection-reading","review-worker","publisher","collector","reader"] as const;
export type KnowledgeCapability = typeof knowledgeCapabilities[number];
export const knowledgeHttpsOrigin = z.string().refine(value => {
  try { const u=new URL(value); return u.protocol==="https:" && u.origin===value && !u.username && !u.password; } catch { return false; }
}, "An exact HTTPS origin is required");
const endpoint=z.strictObject({host:z.string().min(1).max(253),port:z.number().int().min(1).max(65535),database:z.string().min(1).max(128),user:z.string().min(1).max(128)});
export const knowledgeDeploymentSchema=z.strictObject({
  schemaVersion:z.literal(1),id:z.string().regex(/^[a-z0-9-]{1,80}$/),environment:z.enum(["beta","production"]),origin:knowledgeHttpsOrigin,
  hosts:z.array(z.string().regex(/^[a-z0-9.-]+(?::[0-9]{1,5})?$/)).min(1).max(20),
  database:endpoint,neo4j:z.string().refine(value=>{try{const u=new URL(value);return ["bolt:","bolt+s:","neo4j:","neo4j+s:"].includes(u.protocol)&&!!u.hostname&&!u.username&&!u.password&&!u.search&&!u.hash&&["","/"].includes(u.pathname);}catch{return false;}}),
  capabilities:z.array(z.enum(knowledgeCapabilities)).max(knowledgeCapabilities.length),
  reviewMembers:z.discriminatedUnion("mode",[
    z.strictObject({mode:z.literal("allowlist"),ids:z.array(z.uuidv4()).min(1).max(10000)}),
    z.strictObject({mode:z.literal("authenticated")}),
  ]),
}).refine(v=>v.hosts.includes(new URL(v.origin).host),"The canonical host must be allowed");
export type KnowledgeDeployment=z.infer<typeof knowledgeDeploymentSchema>;
const unavailable=()=>new KnowledgeError("知識サービスの配置設定を確認してください",503,"DEPLOYMENT_UNAVAILABLE");

/** Only an owner-controlled local file can grant a capability. Never read it from HTTP/AI data.
 * Re-read at each boundary so removal/invalid configuration cannot revive a queued permission.
 */
export function knowledgeDeployment():KnowledgeDeployment|null {
  const file=process.env.KNOWLEDGE_DEPLOYMENT_CONFIG;
  if(!file)return null;
  let fd:number|undefined;
  try{
    if(!path.isAbsolute(file)||realpathSync(file)!==path.resolve(file))throw unavailable();
    fd=openSync(file,constants.O_RDONLY|constants.O_NOFOLLOW);
    const stat=fstatSync(fd);
    if(!stat.isFile()||stat.uid!==process.getuid?.()||(stat.mode&0o777)!==0o600||stat.size>32000)throw unavailable();
    const profile=knowledgeDeploymentSchema.parse(JSON.parse(readFileSync(fd,"utf8")));
    if(profile.environment!==process.env.KNOWLEDGE_RUNTIME || (profile.environment==="production")!==(process.env.GRAPH_DEPLOYMENT==="production") || profile.origin!==process.env.KNOWLEDGE_PUBLIC_ORIGIN || process.env.MEMBER_STORAGE_ENABLED==="1"&&profile.origin!==process.env.MEMBER_ORIGIN)throw unavailable();
    return profile;
  }catch{throw unavailable();}finally{if(fd!==undefined)closeSync(fd);}
}
export function knowledgeCapability(capability:KnowledgeCapability,origin?:string):boolean {
  const profile=knowledgeDeployment();
  if(profile)return (!origin||origin===profile.origin)&&profile.capabilities.includes(capability);
  // Compatibility for the existing beta and isolated fixtures; never enable a formal deployment by flags alone.
  return process.env.GRAPH_DEPLOYMENT!=="production" && (process.env.NODE_ENV==="test" || (origin??process.env.MEMBER_ORIGIN??process.env.KNOWLEDGE_PUBLIC_ORIGIN)==="https://graph-beta.isinxnisi.com");
}
export function assertKnowledgeCapability(capability:KnowledgeCapability,origin?:string){
  if(!knowledgeCapability(capability,origin))throw new KnowledgeError("この機能は利用できません",404,"NOT_FOUND");
}
export function deploymentMemberAllowed(id:string):boolean {
  const profile=knowledgeDeployment();
  return !profile || profile.capabilities.includes("review") && (profile.reviewMembers.mode==="authenticated"||profile.reviewMembers.ids.includes(id));
}
/** Null means all active members, and is legal only with an explicit authenticated profile. */
export function reviewMemberScope(config:{allowedUsers:string[]|null}):string[]|null {
  const profile=knowledgeDeployment();
  if(!profile){if(!config.allowedUsers)throw unavailable();return config.allowedUsers;}
  const expected=profile.reviewMembers.mode==="allowlist"?profile.reviewMembers.ids:null;
  if(JSON.stringify(config.allowedUsers===null?null:[...config.allowedUsers].sort())!==JSON.stringify(expected===null?null:[...expected].sort()))throw unavailable();
  return expected;
}
export function validateKnowledgeDatabase(profile:KnowledgeDeployment,connectionString:string){
  try{
    const u=new URL(connectionString),pin=profile.database;
    if(!["postgres:","postgresql:"].includes(u.protocol)||u.hostname!==pin.host||Number(u.port||5432)!==pin.port||decodeURIComponent(u.pathname.slice(1))!==pin.database||decodeURIComponent(u.username)!==pin.user||!u.password||u.search||u.hash)throw unavailable();
    const member=process.env.MEMBER_DATABASE_URL?new URL(process.env.MEMBER_DATABASE_URL):null;
    if(member&&member.hostname===u.hostname&&Number(member.port||5432)===Number(u.port||5432)&&member.pathname===u.pathname)throw unavailable();
    return u.toString();
  }catch{throw unavailable();}
}
export function assertKnowledgeWorker(capability:"review-worker"|"publisher"|"collector"|"reader",origin:string){
  assertKnowledgeCapability(capability,origin);
}

export const knowledgePublishingEnabled=()=>process.env.KNOWLEDGE_SUBMISSIONS_PUBLISH_ENABLED==="1"&&knowledgeCapability("publish");
/** A disabled/misconfigured knowledge feature must not break the ordinary KG shell. */
export function knowledgeSubmissionsAvailable(){try{return process.env.KNOWLEDGE_SUBMISSIONS_ENABLED==="1"&&knowledgeCapability("submissions");}catch{return false;}}
