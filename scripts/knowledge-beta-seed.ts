/** Explicit, bounded copy of three authorised public Theme editions into the beta knowledge DB. */
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { isDeepStrictEqual } from "node:util";
import { capsuleKnowledgeSnapshotSchema } from "../lib/domain/capsule-knowledge";
import { knowledgeThemeContentSchema, type KnowledgeKind } from "../lib/domain/knowledge-foundation";
import { ensureKnowledgePublicationSchema } from "../lib/server/knowledge-publication";
const [file,expected]=process.argv.slice(2);
if(!file||!expected||process.argv.length!==4)throw Error('Use FILE SHA256');
const data=await readFile(file),digest=createHash('sha256').update(data).digest('hex');if(digest!==expected)throw Error('Source digest mismatch');
const config=new URL(process.env.KNOWLEDGE_DATABASE_URL??'');if(config.hostname!=='127.0.0.1'||config.port!=='55476'||config.pathname!=='/plunode_knowledge75_beta')throw Error('Dedicated beta DB required');
const pool=new Pool({connectionString:config.toString(),max:2});
try {
 await ensureKnowledgePublicationSchema(pool);
 const input=JSON.parse(data.toString()) as {themes:{theme:{id:string;revision:number;content:unknown;createdAt:string;reason:string};snapshot:unknown}[];legacyLinks:{dataset:string;legacy_claim_id:string;record_id:string;imported_revision:number;payload:unknown;sha256:string}[]};
 const allowed=new Set(['u3:fbaa9ee12f288cfa:theme','u3:a508eb51cfd248dd:theme','u3:real-manga:theme']);
 if(input.themes.length!==3||input.themes.some(t=>!allowed.delete(t.theme.id))||allowed.size)throw Error('Only the reviewed real Themes may be copied');
 type Row={kind:KnowledgeKind;id:string;revision:number;content:unknown;createdAt:string;reason:string};const rows=new Map<string,Row>();
 const add=(kind:KnowledgeKind,r:Omit<Row,'kind'>)=>{const key=JSON.stringify([kind,r.id,r.revision]),old=rows.get(key);if(old&&!isDeepStrictEqual(old.content,r.content))throw Error('Contradicting source editions');rows.set(key,{...r,kind});};
 for(const item of input.themes){const s=capsuleKnowledgeSnapshotSchema.parse(item.snapshot),t=knowledgeThemeContentSchema.parse(item.theme.content);
  for(const [kind,items] of [['entity',s.entities],['record',s.records],['source',s.sources],['mapping',s.mappings]] as const)for(const row of items)add(kind,row);
  for(const [kind,pins] of [['record',t.recordPins],['entity',t.entityPins],['source',t.sourcePins],['mapping',t.mappingPins]] as const)for(const pin of pins)if(!rows.has(JSON.stringify([kind,pin.id,pin.revision])))throw Error('Missing Theme dependency');
  add('theme',{...item.theme,content:t});
 }
 const c=await pool.connect();try{
  await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(7500001)');
  const previous=(await c.query("SELECT digest FROM knowledge75.operations WHERE actor_id='beta-public-seed' LIMIT 1")).rows[0];
  if(previous){if(previous.digest!==digest)throw Error('A different beta seed already exists');await c.query('ROLLBACK');console.log(JSON.stringify({replayed:true,digest}));}
  else{
   if(Number((await c.query('SELECT count(*) FROM knowledge75.objects')).rows[0].count)!==0)throw Error('Target is not empty');
   const heads=new Map<string,Row>();for(const row of rows.values()){const key=JSON.stringify([row.kind,row.id]),old=heads.get(key);if(!old||old.revision<row.revision)heads.set(key,row);}
   for(const row of heads.values())await c.query("INSERT INTO knowledge75.objects(kind,id,current_revision,visibility,created_at,updated_at) VALUES($1,$2,$3,'public',$4,$4)",[row.kind,row.id,row.revision,row.createdAt]);
   for(const row of rows.values()){
    await c.query("INSERT INTO knowledge75.revisions(kind,id,revision,content,reason,actor_id,actor_kind,created_at) VALUES($1,$2,$3,$4,$5,'beta-public-seed','operator',$6)",[row.kind,row.id,row.revision,JSON.stringify(row.content),'3276の公開読取で観測した版をβへ複写：'+row.reason,row.createdAt]);
    await c.query('INSERT INTO knowledge75.published_revisions(kind,id,revision) VALUES($1,$2,$3)',[row.kind,row.id,row.revision]);
   }
   for(const link of input.legacyLinks){if(!heads.has(JSON.stringify(['record',link.record_id])))throw Error('Unexpected legacy link');await c.query('INSERT INTO knowledge75.legacy_links(dataset,legacy_claim_id,record_id,imported_revision,payload,sha256) VALUES($1,$2,$3,$4,$5,$6)',[link.dataset,link.legacy_claim_id,link.record_id,link.imported_revision,JSON.stringify(link.payload),link.sha256]);}
   const requestId=randomUUID();for(const row of heads.values())await c.query("INSERT INTO knowledge75.changes(kind,id,content_revision,status_revision,operation,actor_id,request_id) VALUES($1,$2,$3,1,'beta-public-seed','beta-public-seed',$4)",[row.kind,row.id,row.revision,requestId]);
   const counts={objects:heads.size,revisions:rows.size,themes:3,legacyLinks:input.legacyLinks.length};await c.query("INSERT INTO knowledge75.operations(actor_id,request_id,actor_kind,digest,input,result) VALUES('beta-public-seed',$1,'operator',$2,$3,$4)",[requestId,digest,JSON.stringify(input),JSON.stringify(counts)]);
   await c.query('COMMIT');console.log(JSON.stringify({seeded:true,digest,...counts}));
  }
 }catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
}finally{await pool.end();}
