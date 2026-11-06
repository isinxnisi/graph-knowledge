import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient,QueryResultRow} from 'pg';
import {organizationInputSchema,organizationMaterialSchema,organizationRecord,ORGANIZATION_POLICY,type OrganizationInput,type OrganizationMaterial} from '../domain/knowledge-organization-job';
import {knowledgeDigest,KnowledgeError} from './knowledge-foundation';
import {assertOrganizationSchema} from './knowledge-organization-schema';
import {createOrganizationMaterialReader,organizationNames,organizationName,organizationMeaningKey} from './knowledge-organization-material';

type Reader=ReturnType<typeof createOrganizationMaterialReader>;
export function createOrganizationCandidates(pool:Pool,reader:Reader,authorize:()=>void){
 async function tx<T>(run:(c:PoolClient)=>Promise<T>){const c=await pool.connect();try{await c.query('BEGIN');const r=await run(c);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 async function candidate(c:PoolClient,task:string,input:OrganizationInput){
  const parsed=organizationInputSchema.parse(input),inputHash=knowledgeDigest(parsed),id=knowledgeDigest([ORGANIZATION_POLICY,inputHash]);
  if(input.kind==='meaning')await c.query(`UPDATE knowledge75.organization_candidates SET state='superseded',reason='現在の確認済み分類を使って候補を更新します',updated_at=clock_timestamp()
   WHERE task_id=$1 AND kind='meaning' AND stage='propose' AND state IN('queued','retry','quota') AND input_hash<>$2`,[task,inputHash]);
  await c.query(`INSERT INTO knowledge75.organization_candidates(id,task_id,kind,policy,input,input_hash,state,request_id,decision)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING`,[id,task,input.kind,ORGANIZATION_POLICY,parsed,inputHash,input.kind==='meaning'&&input.reuse?'verified':'queued',randomUUID(),input.kind==='meaning'&&input.reuse?{kind:'reuse',meaningKey:organizationMeaningKey(input.record)}:null]);
 }
 async function planMeaning(c:PoolClient,t:QueryResultRow,m:OrganizationMaterial){
  m=await reader.one(m);const record=organizationRecord(m);
  const map=(await c.query(`SELECT v.revision,v.content FROM knowledge75.objects o JOIN knowledge75.revisions v ON v.kind=o.kind AND v.id=o.id AND v.revision=o.current_revision WHERE o.kind='mapping' AND o.id=$1`,[m.id])).rows[0];
  if(map?.content.recordRevision===Number(m.revision))return '現在版の意味対応または明示的な解除を保持しました';
  const previous=(await c.query(`SELECT i.material,mv.revision,mv.content->'concept' AS concept FROM knowledge75.organization_index i
   JOIN knowledge75.objects r ON r.kind='record' AND r.id=i.id AND r.current_revision::text=i.material->>'revision' AND r.visibility='public'
   JOIN knowledge75.objects mh ON mh.kind='mapping' AND mh.id=r.id JOIN knowledge75.revisions mv ON mv.kind=mh.kind AND mv.id=mh.id AND mv.revision=mh.current_revision
   WHERE i.origin='common' AND i.kind='record' AND i.id<>$1 AND mv.content->>'recordRevision'=r.current_revision::text
   AND mv.content->'concept' IS NOT NULL AND mv.content->'concept'<>'null'::jsonb
   AND i.meaning_key=$2 ORDER BY i.id LIMIT 8`,[m.id,organizationMeaningKey(m)])).rows;
  for(const r of previous){
   let current:OrganizationMaterial;try{current=await reader.one(organizationMaterialSchema.parse(r.material));}catch{continue;}
   if(organizationMeaningKey(current)===organizationMeaningKey(m)){
    await candidate(c,t.id,{kind:'meaning',record:m,mappingRevision:map?.revision??0,concepts:[r.concept],reuse:{record:current,mappingRevision:r.revision,concept:r.concept}});
    return '同じ文脈形の意味対応を再利用します（事実の同一視ではありません）';
   }
  }
  const relation=organizationName(record.relation),word=relation.replace(/[\\%_]/g,'\\$&');
  const concepts=(await c.query(`SELECT body FROM knowledge75.concepts c ORDER BY
   EXISTS(SELECT 1 FROM knowledge75.objects o JOIN knowledge75.revisions r ON r.kind=o.kind AND r.id=o.id AND r.revision=o.current_revision
    JOIN knowledge75.objects mh ON mh.kind='mapping' AND mh.id=o.id JOIN knowledge75.revisions mv ON mv.kind=mh.kind AND mv.id=mh.id AND mv.revision=mh.current_revision
    WHERE o.kind='record' AND o.visibility='public' AND lower(normalize(r.content->>'relation',NFKC))=$1 AND mv.content->'concept'->>'id'=c.id) DESC,
   (body->>'label' ILIKE $2 OR body->>'definition' ILIKE $2) DESC,id,revision DESC LIMIT 12`,[relation,'%'+word+'%'])).rows.map(r=>r.body);
  await candidate(c,t.id,{kind:'meaning',record:m,mappingRevision:map?.revision??0,concepts});return '意味対応の候補確認へ送りました';
 }
 async function planIdentity(c:PoolClient,t:QueryResultRow,m:OrganizationMaterial){
  m=await reader.one(m);
  const peers=(await c.query(`SELECT i.*,i.origin||':'||i.id AS cursor FROM knowledge75.organization_index i
   JOIN knowledge75.patrol_targets p ON p.origin=i.origin AND p.kind=i.kind AND p.id=i.id AND p.generation=i.target_generation
   WHERE i.kind='entity' AND p.present AND p.eligible AND i.id<>$1 AND i.names && $2::text[]
   AND ($3::text IS NULL OR (i.origin||':'||i.id) COLLATE "C">$3) ORDER BY (i.origin||':'||i.id) COLLATE "C" LIMIT 21`,[m.id,organizationNames(m),t.comparison_cursor])).rows;
  for(const p of peers.slice(0,20)){
   let peer:OrganizationMaterial;try{peer=await reader.one(organizationMaterialSchema.parse(p.material));}catch{continue;}
   if(m.id===peer.id)continue;
   const [left,right]=[m,peer].sort((a,b)=>a.id<b.id?-1:1);
   const link=(await c.query(`SELECT r.* FROM knowledge75.entity_identity_links l JOIN knowledge75.entity_identity_revisions r ON r.link_id=l.id AND r.revision=l.current_revision WHERE l.left_id=$1 AND l.right_id=$2`,[left.id,right.id])).rows[0];
   if(link?.state==='same'&&link.left_revision===Number(left.revision)&&link.right_revision===Number(right.revision))continue;
   // A human withdrawal is not a request for the same automatic decision again.
   if(link?.state==='withdrawn'&&link.left_revision===Number(left.revision)&&link.right_revision===Number(right.revision)){
    const newProof=(await c.query(`SELECT 1 FROM knowledge75.revisions v JOIN knowledge75.objects o ON o.kind=v.kind AND o.id=v.id AND o.current_revision=v.revision
     WHERE v.kind='record' AND o.visibility='public' AND v.created_at>$2 AND (v.content->>'subjectId'=ANY($1::text[]) OR v.content->>'objectId'=ANY($1::text[])) LIMIT 1`,[[left.id,right.id],link.created_at])).rowCount;
    if(!newProof)continue;
   }
   const rows=(await c.query(`SELECT i.id,i.material FROM knowledge75.organization_index i
    JOIN knowledge75.patrol_targets p ON p.origin=i.origin AND p.kind=i.kind AND p.id=i.id AND p.generation=i.target_generation
    WHERE i.kind='record' AND p.present AND p.eligible AND
    (i.material->'content'->>'subjectId'=ANY($1::text[]) OR i.material->'content'->>'objectId'=ANY($1::text[]))
    ORDER BY EXISTS(SELECT 1 FROM jsonb_array_elements(i.material->'content'->'evidence') ev
     WHERE EXISTS(SELECT 1 FROM unnest($2::text[]) n WHERE strpos(lower(normalize(ev->>'excerpt',NFKC)),n)>0)
     AND EXISTS(SELECT 1 FROM unnest($3::text[]) n WHERE strpos(lower(normalize(ev->>'excerpt',NFKC)),n)>0)) DESC,
    i.indexed_at DESC,i.id,i.origin LIMIT 8`,[[left.id,right.id],organizationNames(left),organizationNames(right)])).rows;
   const records:OrganizationMaterial[]=[];
   for(const r of rows){try{records.push(await reader.one(organizationMaterialSchema.parse(r.material)));}catch{/* A stopped proof is not evidence. */}}
   if(!records.some(r=>organizationRecord(r).evidence.some(e=>e.excerpt)))continue;
   await candidate(c,t.id,{kind:'identity',left,right,records,identityRevision:link?.revision??0});
  }
  return {next:peers.length>20?String(peers[19].cursor):null,reason:'同名・別名・公開訳名の候補を確認しました'};
 }
 return {
  async indexPage(limit=40){
   authorize();await assertOrganizationSchema(pool);
   // Published name translations can change without rewriting the original.
   const translations=(await pool.query(`SELECT i.id,i.material->>'translationStamp' AS previous,
    COALESCE((SELECT jsonb_agg(jsonb_build_array(h.id,h.current_revision,h.status_revision,h.visibility) ORDER BY h.id)
     FROM knowledge75.text_translation_heads h WHERE h.target->>'kind'='entity' AND h.target->>'id'=i.id
     AND h.target->>'revision'=i.material->>'revision' AND h.target->>'field' IN('name','aliases')),'[]'::jsonb) AS stamp
    FROM knowledge75.organization_index i WHERE i.origin='common' AND i.kind='entity'`)).rows;
   for(const t of translations)if(t.previous!==knowledgeDigest(t.stamp))await pool.query(`UPDATE knowledge75.patrol_tasks SET state='pending',next_attempt=clock_timestamp(),comparison_cursor=NULL WHERE origin='common' AND kind='entity' AND target_id=$1 AND state='planned'`,[t.id]);
   // Revisit unresolved inputs on a bounded schedule; other work keeps moving.
   const rows=(await pool.query(`SELECT t.*,p.revision,p.status_revision,p.digest FROM knowledge75.patrol_tasks t
    JOIN knowledge75.patrol_targets p ON p.origin=t.origin AND p.kind=t.kind AND p.id=t.target_id AND p.generation=t.target_generation
    WHERE t.state IN('pending','unresolved') AND t.next_attempt<=clock_timestamp() AND p.present AND p.eligible ORDER BY t.created_at,t.id LIMIT $1`,[Math.min(40,Math.max(1,limit))])).rows;
   if(!rows.length)return false;
   let loaded:OrganizationMaterial[]=[];
   try{loaded=await reader.many(rows.map(t=>({origin:t.origin,kind:t.kind,id:t.target_id})));}catch{/* A bad target must not strand the remainder of a batch. */}
   for(const t of rows){
    try{
     const m=loaded.find(m=>m.origin===t.origin&&m.kind===t.kind&&m.id===t.target_id)??(await reader.many([{origin:t.origin,kind:t.kind,id:t.target_id}]))[0];
     if(!m)throw new KnowledgeError('現在公開されている対象を確認できません',409,'TARGET_CHANGED');
     if(m.origin!==t.origin||m.digest!==t.digest||m.revision!==t.revision||m.statusRevision!==t.status_revision){
      await pool.query("UPDATE knowledge75.patrol_cycles SET next_scan_at=clock_timestamp(),retry_at=NULL WHERE origin=$1",[t.origin]);
      // Canonical common overrides are still indexed by their own common task.
      throw new KnowledgeError('対象台帳の更新を待っています',409,'TARGET_CHANGED');
     }
     await tx(async c=>{
      authorize();const current=(await c.query("SELECT t.id FROM knowledge75.patrol_tasks t JOIN knowledge75.patrol_targets p ON p.origin=t.origin AND p.kind=t.kind AND p.id=t.target_id AND p.generation=t.target_generation WHERE t.id=$1 AND p.present AND p.eligible AND t.state IN('pending','unresolved') FOR UPDATE OF t",[t.id])).rows[0];if(!current)return;
      const deps=[...new Set([...m.references.map(r=>r.origin+':'+r.kind+':'+r.id),...(m.kind==='record'?['common:mapping:'+m.id]:[])])];
      const old=(await c.query('SELECT material FROM knowledge75.organization_index WHERE origin=$1 AND kind=$2 AND id=$3',[t.origin,t.kind,t.target_id])).rows[0];
      await c.query(`INSERT INTO knowledge75.organization_index(origin,kind,id,target_generation,material,names,dependencies,meaning_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT(origin,kind,id) DO UPDATE SET target_generation=EXCLUDED.target_generation,material=EXCLUDED.material,names=EXCLUDED.names,dependencies=EXCLUDED.dependencies,meaning_key=EXCLUDED.meaning_key,indexed_at=clock_timestamp()`,[t.origin,t.kind,t.target_id,t.target_generation,m,organizationNames(m),deps,m.kind==='record'?organizationMeaningKey(m):null]);
      await c.query("UPDATE knowledge75.patrol_tasks SET state='indexed',comparison_cursor=NULL,reason='公開文脈の索引を更新しました',updated_at=clock_timestamp() WHERE id=$1",[t.id]);
      if(old&&knowledgeDigest(old.material)!==knowledgeDigest(m))await c.query(`UPDATE knowledge75.patrol_tasks t SET state='pending',next_attempt=clock_timestamp(),comparison_cursor=NULL
       FROM knowledge75.organization_index i WHERE t.origin=i.origin AND t.kind=i.kind AND t.target_id=i.id AND t.target_generation=i.target_generation
       AND t.state='planned' AND i.dependencies @> ARRAY[$1]::text[] AND t.id<>$2`,[m.origin+':'+m.kind+':'+m.id,t.id]);
      if(m.kind==='record'){
       const record=organizationRecord(m);
       await c.query(`UPDATE knowledge75.patrol_tasks SET state='indexed',comparison_cursor=NULL WHERE kind='entity' AND target_id=ANY($1::text[]) AND state='planned'`,[[record.subjectId,record.objectId].filter(Boolean)]);
      }
      if(m.kind==='mapping')await c.query(`UPDATE knowledge75.patrol_tasks t SET state='indexed',comparison_cursor=NULL
       FROM knowledge75.organization_index i WHERE t.kind='record' AND t.origin=i.origin AND t.target_id=i.id AND t.target_generation=i.target_generation AND i.kind='record' AND t.state='planned'
       AND i.meaning_key IN(SELECT meaning_key FROM knowledge75.organization_index WHERE kind='record' AND id=$1 AND meaning_key IS NOT NULL)`,[m.id]);
     });
    }catch(e){
     authorize();
     await pool.query(`UPDATE knowledge75.patrol_tasks SET state='unresolved',reason=$2,next_attempt=clock_timestamp()+interval '1 hour',updated_at=clock_timestamp() WHERE id=$1 AND state IN('pending','unresolved')`,[t.id,e instanceof KnowledgeError?e.message:'公開文脈を取得できません。自動で再試行します']);
    }
   }
   return true;
  },
  async planPage(limit=20){
   authorize();await assertOrganizationSchema(pool);
   // Index first so an entity is not permanently judged without its records.
   if((await pool.query("SELECT 1 FROM knowledge75.patrol_tasks WHERE state='pending' AND next_attempt<=clock_timestamp() LIMIT 1")).rowCount)return false;
   const rows=(await pool.query(`SELECT t.*,i.material FROM knowledge75.patrol_tasks t JOIN knowledge75.organization_index i ON i.origin=t.origin AND i.kind=t.kind AND i.id=t.target_id AND i.target_generation=t.target_generation
    WHERE t.state='indexed' ORDER BY t.created_at,t.id LIMIT $1`,[Math.min(40,Math.max(1,limit))])).rows;
   for(const t of rows){try{await tx(async c=>{
    authorize();await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['organization-plan:'+t.id]);
    if((await c.query("SELECT 1 FROM knowledge75.patrol_tasks WHERE id=$1 AND state='indexed' FOR UPDATE",[t.id])).rowCount!==1)return;
    const m=organizationMaterialSchema.parse(t.material);
    const result=m.kind==='entity'?await planIdentity(c,t,m):m.kind==='record'?{next:null,reason:await planMeaning(c,t,m)}:{next:null,reason:'資料・テーマ・意味対応の参照更新を記録しました'};
    await c.query('UPDATE knowledge75.patrol_tasks SET state=$2,comparison_cursor=$3,reason=$4,updated_at=clock_timestamp() WHERE id=$1',[t.id,result.next?'indexed':'planned',result.next,result.reason]);
   });}catch{authorize();await pool.query("UPDATE knowledge75.patrol_tasks SET state='unresolved',reason='候補の文脈が更新されています。自動で再確認します',next_attempt=clock_timestamp()+interval '1 hour' WHERE id=$1 AND state='indexed'",[t.id]);}}
   return rows.length>0;
  },
 };
}
